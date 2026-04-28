import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl, StyleSheet, Modal, TextInput, FlatList,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { orderService, AvailableOrders, FilteredOrders, Order, computeOrderCancelRemainingSec } from '../../services/api/order.service';
import { startDriverLocationTracking } from '../../services/driverLocationTracking';
import { ensureDriverPushNotificationSetup } from '../../services/driverPushSetup';
import { api } from '../../services/api/client';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppNavigation } from '../../contexts/AppNavigationContext';
import { scheduleWhenIdle } from '../../utils/scheduleIdle';
import * as Location from 'expo-location';

const ZONE_META: Record<string, { icon: string; color: string; bg: string }> = {
  'Same Delegation':        { icon: 'location',      color: '#16a34a', bg: '#dcfce7' },
  'Same Governorate':       { icon: 'map',           color: '#2563eb', bg: '#dbeafe' },
  'Different Governorate':  { icon: 'globe-outline',  color: '#7c3aed', bg: '#ede9fe' },
  'Different Country':      { icon: 'airplane-outline', color: '#dc2626', bg: '#fee2e2' },
};

type QuickFilterLevel = 'delegation' | 'governorate' | 'country' | null;

/** Driver-facing address line: street/plus-code + area (nickname excluded — never shown to drivers). */
function formatDriverAddressLine(addr: Order['pickupAddress'] | Order['dropoffAddress'] | null | undefined): string {
  if (!addr) return '';
  let street = (addr.street || '').trim();
  const nick = (addr.nickname || '').trim();
  if (nick && street === nick) street = '';
  const del = addr.delegation?.nameDelegation || '';
  const gov = addr.delegation?.governorate?.nameGovernorate || '';
  const country = addr.delegation?.governorate?.country?.name || '';
  const tail = [del, gov, country].filter(Boolean).join(', ');
  if (street && tail) return `${street}, ${tail}`;
  return tail || street || 'Address';
}

const STORAGE_KEY_FILTER_LEVEL = 'avail_quick_filter_level';
const STORAGE_KEY_SELECTED_DELEGATIONS = 'avail_selected_delegations';
const STORAGE_KEY_SELECTED_GOVERNORATES = 'avail_selected_governorates';
const STORAGE_KEY_SELECTED_COUNTRIES = 'avail_selected_countries';

interface GeoCountry { id: string; name: string; isoCode?: string; currencyCode?: string; }
interface GeoGovernorate { id: string; nameGovernorate: string; }
interface GeoDelegation { id: string; nameDelegation: string; }
interface DriverGeoData {
  isAvailable: boolean;
  addresses: { id: string; street: string | null; delegation: GeoDelegation; governorate: GeoGovernorate; country: GeoCountry }[];
  delegations: GeoDelegation[];
  governorates: GeoGovernorate[];
  countries: GeoCountry[];
}

function SearchPicker({ visible, title, data, onSelect, onClose, search, setSearch, labelKey }: any) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.modalContainer}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
        </View>
        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color="#9ca3af" />
          <TextInput style={s.searchInput} placeholder="Search..." placeholderTextColor="#9ca3af"
            value={search} onChangeText={setSearch} autoFocus />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}><Text style={s.clearIcon}>✕</Text></TouchableOpacity>
          )}
        </View>
        <FlatList data={data} keyExtractor={(item: any) => item.id} keyboardShouldPersistTaps="handled"
          renderItem={({ item }: any) => (
            <TouchableOpacity style={s.pickerItem} onPress={() => onSelect(item)}>
              <Text style={s.pickerItemText}>{item[labelKey]}</Text>
              {item.isoCode && <Text style={s.pickerItemSub}>{item.isoCode} · {item.currencyCode}</Text>}
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={s.emptyPickerText}>No results</Text>}
        />
      </View>
    </Modal>
  );
}

function OrderDescriptionCard({ description }: { description: string | null | undefined }) {
  const { colors, isDark } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const text = (description || '').trim();
  if (!text) return null;
  const showToggle = text.length > 160 || (text.match(/\n/g) || []).length >= 2;

  return (
    <View
      style={[
        s.orderDescBox,
        {
          backgroundColor: isDark ? 'rgba(14, 165, 233, 0.09)' : '#f0f9ff',
          borderColor: isDark ? 'rgba(56, 189, 248, 0.4)' : '#bae6fd',
        },
      ]}
    >
      <View style={s.orderDescHead}>
        <View style={[s.orderDescIconWrap, { backgroundColor: isDark ? 'rgba(2, 132, 199, 0.35)' : '#e0f2fe' }]}>
          <Ionicons name="reader-outline" size={17} color={colors.primary} />
        </View>
        <Text style={[s.orderDescTitle, { color: colors.textSecondary }]}>Package description</Text>
      </View>
      <Text
        style={[s.orderDescBody, { color: colors.text }]}
        numberOfLines={expanded || !showToggle ? undefined : 4}
      >
        {text}
      </Text>
      {showToggle ? (
        <TouchableOpacity
          onPress={() => setExpanded((e) => !e)}
          style={s.orderDescToggle}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        >
          <Text style={[s.orderDescToggleText, { color: colors.primary }]}>
            {expanded ? 'Show less' : 'Show more'}
          </Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={colors.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function AvailableOrdersScreen() {
  const router = useRouter();
  const { push } = useAppNavigation();
  const { urgentOrderId, declinedFlash } = useLocalSearchParams<{
    urgentOrderId?: string;
    declinedFlash?: string | string[];
  }>();
  const { colors, isDark } = useTheme();
  const [data, setData] = useState<AvailableOrders | null>(null);
  const [filteredData, setFilteredData] = useState<FilteredOrders | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [initDone, setInitDone] = useState(false);
  const [rejectedOrders, setRejectedOrders] = useState<any[]>([]);
  const [rejectionDrafts, setRejectionDrafts] = useState<Record<string, string>>({});
  const [rejectionSubmitting, setRejectionSubmitting] = useState<string | null>(null);
  const [showDeclinedFlash, setShowDeclinedFlash] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [driverPosition, setDriverPosition] = useState<{ latitude: number; longitude: number } | null>(null);

  // "I'm available now" state — default TRUE
  const [availableNow, setAvailableNow] = useState(true);

  // Driver geography data
  const [driverGeo, setDriverGeo] = useState<DriverGeoData | null>(null);

  // Quick filter: which level is active (null = none, show all driver delegations)
  const [quickFilterLevel, setQuickFilterLevel] = useState<QuickFilterLevel>(null);
  // Multi-select sets for each level
  const [selectedDelegationIds, setSelectedDelegationIds] = useState<Set<string>>(new Set());
  const [selectedGovernorateIds, setSelectedGovernorateIds] = useState<Set<string>>(new Set());
  const [selectedCountryIds, setSelectedCountryIds] = useState<Set<string>>(new Set());

  // Advanced filter state
  const [showFilter, setShowFilter] = useState(false);
  const [allCountries, setAllCountries] = useState<(GeoCountry & { isoCode: string; currencyCode: string })[]>([]);
  const [advGovernorates, setAdvGovernorates] = useState<GeoGovernorate[]>([]);
  const [advDelegations, setAdvDelegations] = useState<GeoDelegation[]>([]);
  const [advSelectedCountry, setAdvSelectedCountry] = useState<GeoCountry | null>(null);
  const [advSelectedGovernorate, setAdvSelectedGovernorate] = useState<GeoGovernorate | null>(null);
  const [advSelectedDelegation, setAdvSelectedDelegation] = useState<GeoDelegation | null>(null);
  const [filterActive, setFilterActive] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);

  // Picker sub-modals for advanced filter
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showGovPicker, setShowGovPicker] = useState(false);
  const [showDelPicker, setShowDelPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [govSearch, setGovSearch] = useState('');
  const [delSearch, setDelSearch] = useState('');

  const filteredCountries = useMemo(() =>
    allCountries.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
      (c.isoCode || '').toLowerCase().includes(countrySearch.toLowerCase())),
    [allCountries, countrySearch]);
  const filteredGov = useMemo(() =>
    advGovernorates.filter(g => g.nameGovernorate.toLowerCase().includes(govSearch.toLowerCase())),
    [advGovernorates, govSearch]);
  const filteredDel = useMemo(() =>
    advDelegations.filter(d => d.nameDelegation.toLowerCase().includes(delSearch.toLowerCase())),
    [advDelegations, delSearch]);

  const getCurrentDriverPosition = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setDriverPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      setDriverPosition(null);
    }
  }, []);

  useEffect(() => {
    const { cancel } = scheduleWhenIdle(() => {
      void getCurrentDriverPosition();
    }, { timeout: 2000 });
    return () => cancel();
  }, [getCurrentDriverPosition]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Persist & restore quick filter selections ──
  const saveSelections = useCallback(async (
    level: QuickFilterLevel,
    delIds: Set<string>,
    govIds: Set<string>,
    cIds: Set<string>,
  ) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_FILTER_LEVEL, level || '');
      await AsyncStorage.setItem(STORAGE_KEY_SELECTED_DELEGATIONS, JSON.stringify([...delIds]));
      await AsyncStorage.setItem(STORAGE_KEY_SELECTED_GOVERNORATES, JSON.stringify([...govIds]));
      await AsyncStorage.setItem(STORAGE_KEY_SELECTED_COUNTRIES, JSON.stringify([...cIds]));
    } catch {}
  }, []);

  const restoreSelections = useCallback(async () => {
    try {
      const level = await AsyncStorage.getItem(STORAGE_KEY_FILTER_LEVEL);
      const delIds = await AsyncStorage.getItem(STORAGE_KEY_SELECTED_DELEGATIONS);
      const govIds = await AsyncStorage.getItem(STORAGE_KEY_SELECTED_GOVERNORATES);
      const cIds = await AsyncStorage.getItem(STORAGE_KEY_SELECTED_COUNTRIES);
      if (level) setQuickFilterLevel(level as QuickFilterLevel);
      if (delIds) setSelectedDelegationIds(new Set(JSON.parse(delIds)));
      if (govIds) setSelectedGovernorateIds(new Set(JSON.parse(govIds)));
      if (cIds) setSelectedCountryIds(new Set(JSON.parse(cIds)));
    } catch {}
  }, []);

  // ── Load driver geography + restore persisted selections ──
  useEffect(() => {
    (async () => {
      const restoredLevel = await AsyncStorage.getItem(STORAGE_KEY_FILTER_LEVEL).catch(() => null);
      if (restoredLevel) {
        // Restore persisted selections
        await restoreSelections();
      }
      try {
        const geo = await api.get<DriverGeoData>('/drivers/me/geography');
        setDriverGeo(geo);
        // If no persisted level, default to delegation with all delegations selected
        if (!restoredLevel) {
          setQuickFilterLevel('delegation');
          setSelectedDelegationIds(new Set(geo.delegations.map(d => d.id)));
        }
      } catch (e) { console.error('Failed to load driver geography:', e); }
      setInitDone(true);
    })();
  }, []);

  // Save whenever selections change (after init)
  useEffect(() => {
    if (!initDone) return;
    saveSelections(quickFilterLevel, selectedDelegationIds, selectedGovernorateIds, selectedCountryIds);
  }, [quickFilterLevel, selectedDelegationIds, selectedGovernorateIds, selectedCountryIds, initDone]);

  // ── Advanced filter helpers ──
  const loadCountries = useCallback(async () => {
    try {
      const data = await api.get<(GeoCountry & { isoCode: string; currencyCode: string })[]>('/geography/countries');
      setAllCountries(Array.isArray(data) ? data : []);
    } catch { setAllCountries([]); }
  }, []);

  const handleAdvSelectCountry = async (c: GeoCountry & { isoCode: string }) => {
    setAdvSelectedCountry(c); setAdvSelectedGovernorate(null); setAdvSelectedDelegation(null);
    setAdvGovernorates([]); setAdvDelegations([]); setShowCountryPicker(false); setGeoLoading(true);
    try {
      const data = await api.get<GeoGovernorate[]>(`/geography/countries/${c.id}/governorates`);
      setAdvGovernorates(Array.isArray(data) ? data : []);
    } catch {} finally { setGeoLoading(false); }
  };
  const handleAdvSelectGovernorate = async (g: GeoGovernorate) => {
    setAdvSelectedGovernorate(g); setAdvSelectedDelegation(null); setAdvDelegations([]);
    setShowGovPicker(false); setGeoLoading(true);
    try {
      const data = await api.get<GeoDelegation[]>(`/geography/governorates/${g.id}/delegations`);
      setAdvDelegations(Array.isArray(data) ? data : []);
    } catch {} finally { setGeoLoading(false); }
  };
  const handleAdvSelectDelegation = (d: GeoDelegation) => { setAdvSelectedDelegation(d); setShowDelPicker(false); };

  const applyAdvFilter = () => {
    if (!advSelectedCountry) { Alert.alert('Select Location', 'Please select at least a country.'); return; }
    setShowFilter(false); setFilterActive(true); setLoading(true);
  };
  const clearAdvFilter = () => {
    setFilterActive(false); setAdvSelectedCountry(null); setAdvSelectedGovernorate(null);
    setAdvSelectedDelegation(null); setAdvGovernorates([]); setAdvDelegations([]); setLoading(true);
  };

  // ── Quick filter toggle helpers ──
  const toggleQuickLevel = (level: QuickFilterLevel) => {
    if (quickFilterLevel === level) {
      // Deselect → back to default (all driver delegations)
      setQuickFilterLevel(null);
    } else {
      setQuickFilterLevel(level);
    }
    setLoading(true);
  };

  const toggleItem = (level: QuickFilterLevel, id: string) => {
    if (level === 'delegation') {
      setSelectedDelegationIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    } else if (level === 'governorate') {
      setSelectedGovernorateIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    } else if (level === 'country') {
      setSelectedCountryIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    }
    setLoading(true);
  };

  // ── Load orders ──
  const load = useCallback(async () => {
    try {
      if (filterActive) {
        // Advanced filter
        const filters: any = {};
        if (advSelectedDelegation) filters.delegationId = advSelectedDelegation.id;
        else if (advSelectedGovernorate) filters.governorateId = advSelectedGovernorate.id;
        else if (advSelectedCountry) filters.countryId = advSelectedCountry.id;
        const result = await orderService.getAvailableOrders(filters);
        setFilteredData(result as FilteredOrders); setData(null);
      } else if (quickFilterLevel && driverGeo) {
        // Quick filter active — send selected IDs (or all if none selected)
        const filters: any = { availableNow: availableNow || undefined };
        if (quickFilterLevel === 'delegation') {
          const ids = selectedDelegationIds.size > 0
            ? [...selectedDelegationIds]
            : driverGeo.delegations.map(d => d.id);
          filters.delegationIds = ids;
        } else if (quickFilterLevel === 'governorate') {
          const ids = selectedGovernorateIds.size > 0
            ? [...selectedGovernorateIds]
            : driverGeo.governorates.map(g => g.id);
          filters.governorateIds = ids;
        } else if (quickFilterLevel === 'country') {
          const ids = selectedCountryIds.size > 0
            ? [...selectedCountryIds]
            : driverGeo.countries.map(c => c.id);
          filters.countryIds = ids;
        }
        const result = await orderService.getAvailableOrders(filters);
        setFilteredData(result as FilteredOrders); setData(null);
      } else {
        // Default: all orders for driver's delegations (normal endpoint)
        const result = await orderService.getAvailableOrders(
          availableNow ? { availableNow: true } : undefined,
        );
        setData(result as AvailableOrders); setFilteredData(null);
      }
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filterActive, advSelectedCountry, advSelectedGovernorate, advSelectedDelegation,
      quickFilterLevel, selectedDelegationIds, selectedGovernorateIds, selectedCountryIds,
      availableNow, driverGeo]);

  // Load rejected orders once
  useEffect(() => {
    orderService.getDriverRejectedOrders()
      .then(data => setRejectedOrders(data || []))
      .catch(() => {});
  }, []);

  /** Red banner after tap from "Removed from company order" (pre-arrival) notification. */
  useEffect(() => {
    const raw = declinedFlash;
    const on =
      raw === '1' ||
      raw === 'true' ||
      (Array.isArray(raw) && (raw[0] === '1' || raw[0] === 'true'));
    if (!on) return;
    setShowDeclinedFlash(true);
    try {
      router.setParams({ declinedFlash: undefined });
    } catch {
      /* ignore */
    }
  }, [declinedFlash, router]);

  /** Separate effect so clearing `declinedFlash` does not cancel the 3s timer (cleanup would clear it). */
  useEffect(() => {
    if (!showDeclinedFlash) return;
    const t = setTimeout(() => setShowDeclinedFlash(false), 3000);
    return () => clearTimeout(t);
  }, [showDeclinedFlash]);

  useEffect(() => { if (initDone) load(); }, [load, initDone]);
  useEffect(() => { if (!initDone) return; const i = setInterval(load, 10000); return () => clearInterval(i); }, [load, initDone]);

  const toggleAvailableNow = () => { setAvailableNow(prev => !prev); setLoading(true); };

  const handleAccept = async (orderId: string) => {
    const ca = filterActive || quickFilterLevel ? filteredData?.canAccept : data?.canAccept;
    if (!ca) { Alert.alert('Not Verified', 'Your account must be verified before you can accept orders.'); return; }
    Alert.alert('Accept Order', 'Take this delivery?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Accept', onPress: async () => {
        setAccepting(orderId);
        try {
          await orderService.acceptOrder(orderId);
          router.replace(`/(driver)/order-detail?orderId=${orderId}`);
          void startDriverLocationTracking(orderId).then((locOk) => {
            if (!locOk) {
              Alert.alert(
                'Location permission',
                'Please allow location access so the customer can see your position on the map during delivery. You can enable it in Settings.',
              );
            }
          });
          void ensureDriverPushNotificationSetup();
        }
        catch (e: any) {
          const msg = e.message || '';
          if (msg.toLowerCase().includes('phone number')) {
            Alert.alert(
              'Phone Number Required',
              'You must add a phone number to your profile before accepting orders. Customers need to be able to contact you.',
              [
                { text: 'Later', style: 'cancel' },
                { text: 'Add Phone Number', onPress: () => push('/(driver)/edit-profile') },
              ],
            );
          } else {
            Alert.alert('Error', msg);
          }
        }
        finally { setAccepting(null); }
      }},
    ]);
  };

  const canAccept = (filterActive || quickFilterLevel) ? filteredData?.canAccept : data?.canAccept;

  const openAddressOnMap = (
    lat: number | null | undefined,
    lng: number | null | undefined,
    kind: 'pickup' | 'dropoff',
    mapTitle: string,
  ) => {
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      Alert.alert('Location unavailable', 'Map coordinates are not available for this address.');
      return;
    }
    push(
      `/(driver)/address-map?lat=${lat}&lng=${lng}&kind=${kind}&title=${encodeURIComponent(mapTitle)}`,
    );
  };

  // ── Render helpers ──
  const renderOrderCard = (order: Order) => {
    const isAccepting = accepting === order.id;
    const isUrgentHighlighted = !!urgentOrderId && order.id === urgentOrderId;
    const customerName = [order.customer?.firstName, order.customer?.secondName].filter(Boolean).join(' ').trim() || 'Customer';
    const customerInitials = customerName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0]?.toUpperCase() || '')
      .join('') || 'C';
    const countdownSec =
      order.status !== 'SEARCHING_DRIVER' ? null : computeOrderCancelRemainingSec(order, nowMs);
    const countdownLabel = countdownSec == null
      ? null
      : `${String(Math.floor(countdownSec / 60)).padStart(2, '0')}:${String(countdownSec % 60).padStart(2, '0')}`;
    const distanceToPickup = (() => {
      if (!driverPosition || !order.pickupAddress?.latitude || !order.pickupAddress?.longitude) return null;
      const toRad = (v: number) => (v * Math.PI) / 180;
      const earthRadiusKm = 6371;
      const dLat = toRad(order.pickupAddress.latitude - driverPosition.latitude);
      const dLng = toRad(order.pickupAddress.longitude - driverPosition.longitude);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(driverPosition.latitude)) *
          Math.cos(toRad(order.pickupAddress.latitude)) *
          Math.sin(dLng / 2) *
          Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return earthRadiusKm * c;
    })();
    const pickupLat = order.pickupAddress?.latitude;
    const pickupLng = order.pickupAddress?.longitude;
    const pickupHasCoords =
      pickupLat != null &&
      pickupLng != null &&
      Number.isFinite(pickupLat) &&
      Number.isFinite(pickupLng);
    const dropLat = order.dropoffAddress?.latitude;
    const dropLng = order.dropoffAddress?.longitude;
    const dropoffHasCoords =
      !order.localPickupOnly &&
      dropLat != null &&
      dropLng != null &&
      Number.isFinite(dropLat) &&
      Number.isFinite(dropLng);
    const pickupMapTitle =
      [order.pickupAddress?.street, order.pickupAddress?.delegation?.nameDelegation].filter(Boolean).join(', ') ||
      'Pickup';
    const dropoffMapTitle =
      [order.dropoffAddress?.street, order.dropoffAddress?.delegation?.nameDelegation].filter(Boolean).join(', ') ||
      'Delivery';
    const pickupLine = formatDriverAddressLine(order.pickupAddress);
    const dropoffLine = formatDriverAddressLine(order.dropoffAddress);
    return (
      <View
        key={order.id}
        style={[
          s.card,
          { backgroundColor: colors.card },
          isUrgentHighlighted && { borderWidth: 2, borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
        ]}
      >
        {isUrgentHighlighted && (
          <View style={{ alignSelf: 'flex-start', marginBottom: 8, backgroundColor: '#f59e0b', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>URGENT</Text>
          </View>
        )}
        <View style={s.cardTop}>
          <Text style={[s.orderId, { color: colors.text }]} numberOfLines={1}>
            #{order.id.slice(0, 8)}
            {order.sourceType === 'DELIVERY_COMPANY' && order.deliveryCompanyName
              ? ` (${order.deliveryCompanyName})`
              : ''}
          </Text>
          <View style={s.priceTag}>
            <Text style={[s.priceText, { color: colors.primary }]}>{order.price.toFixed(2)}</Text>
            <Text style={[s.priceCurrency, { color: colors.textSecondary }]}>TND</Text>
          </View>
        </View>
        <View style={s.customerRow}>
          <View style={s.customerAvatarCircle}>
            <Text style={s.customerAvatarText}>{customerInitials}</Text>
          </View>
          <Text style={[s.customerName, { color: colors.text }]} numberOfLines={1}>
            {customerName}
          </Text>
        </View>
        <View style={s.routeSection}>
          <View style={s.routeIconCol}>
            <View style={{ marginBottom: 8, alignSelf: 'flex-start' }}>
              {order.sourceType === 'DELIVERY_COMPANY' ? (
                <View style={[s.chip, { backgroundColor: '#e0e7ff' }]}>
                  <Text style={[s.chipText, { color: '#1d4ed8', fontWeight: '800' }]}>C</Text>
                </View>
              ) : (
                <View />
              )}
            </View>
            <View style={[s.routeDot, { backgroundColor: '#22c55e' }]} />
            <View style={[s.routeLine, { backgroundColor: colors.border }]} />
            <View style={[s.routeDot, { backgroundColor: '#ef4444' }]} />
          </View>
          <View style={{ flex: 1 }}>
            <TouchableOpacity
              style={s.addressTapRow}
              onPress={() => openAddressOnMap(pickupLat, pickupLng, 'pickup', pickupMapTitle)}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  s.routeText,
                  {
                    flex: 1,
                    color: pickupHasCoords ? colors.primary : colors.text,
                    fontWeight: pickupHasCoords ? '600' : '500',
                  },
                ]}
                numberOfLines={2}
              >
                {pickupLine || 'Pickup'}
              </Text>
              {pickupHasCoords ? (
                <Ionicons name="map-outline" size={20} color={colors.primary} />
              ) : null}
            </TouchableOpacity>
            {order.sourceType === 'DELIVERY_COMPANY' &&
              typeof order.pickupAddress?.latitude === 'number' &&
              typeof order.pickupAddress?.longitude === 'number' && (
                <Text style={[s.chipText, { color: colors.textSecondary, marginTop: 2 }]}>
                  Exact source: {order.pickupAddress.latitude.toFixed(5)}, {order.pickupAddress.longitude.toFixed(5)}
                </Text>
              )}
            {distanceToPickup !== null && (
              <View style={[s.distanceToPickupCard, { borderColor: colors.border, backgroundColor: colors.surfaceVariant }]}>
                <View style={[s.distanceToPickupIconWrap, { backgroundColor: isDark ? '#0c4a6e' : '#e0f2fe' }]}>
                  <Ionicons name="navigate" size={16} color={isDark ? '#7dd3fc' : '#0369a1'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.distanceToPickupLabel, { color: colors.textSecondary }]}>Distance to pickup</Text>
                  <Text style={[s.distanceToPickupValue, { color: colors.text }]}>
                    {distanceToPickup < 1
                      ? `${Math.round(distanceToPickup * 1000)} m`
                      : `${distanceToPickup.toFixed(1)} km`}
                  </Text>
                </View>
              </View>
            )}
            <View style={{ height: 14 }} />
            {order.localPickupOnly ? (
              <Text style={[s.routeText, { color: colors.textSecondary, fontWeight: '500' }]} numberOfLines={3}>
                Local pickup only — bring items to the pickup address (no separate drop-off).
              </Text>
            ) : (
              <TouchableOpacity
                style={s.addressTapRow}
                onPress={() => openAddressOnMap(dropLat, dropLng, 'dropoff', dropoffMapTitle)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    s.routeText,
                    {
                      flex: 1,
                      color: dropoffHasCoords ? colors.primary : colors.text,
                      fontWeight: dropoffHasCoords ? '600' : '500',
                    },
                  ]}
                  numberOfLines={2}
                >
                  {dropoffLine || 'Dropoff'}
                </Text>
                {dropoffHasCoords ? (
                  <Ionicons name="map-outline" size={20} color={colors.primary} />
                ) : null}
              </TouchableOpacity>
            )}
          </View>
        </View>
        <OrderDescriptionCard description={order.description} />
        <View style={s.chipsRow}>
          <View style={[s.chip, { backgroundColor: colors.surfaceVariant }]}>
            <Ionicons name="resize-outline" size={12} color={colors.textSecondary} />
            <Text style={[s.chipText, { color: colors.textSecondary }]}>{order.distanceKm.toFixed(1)} km</Text>
          </View>
          {countdownLabel && (
            <View style={[s.chip, { backgroundColor: countdownSec === 0 ? '#fee2e2' : '#fef9c3' }]}>
              <Ionicons name="time-outline" size={12} color={countdownSec === 0 ? '#b91c1c' : '#92400e'} />
              <Text style={[s.chipText, { color: countdownSec === 0 ? '#b91c1c' : '#92400e' }]}>
                {countdownLabel}
              </Text>
            </View>
          )}
          <View style={[s.chip, { backgroundColor: colors.surfaceVariant }]}>
            <Ionicons name="cube-outline" size={12} color={colors.textSecondary} />
            <Text style={[s.chipText, { color: colors.textSecondary }]}>{order.weight} kg</Text>
          </View>
          <View style={[s.chip, { backgroundColor: order.paymentType === 'COD' ? '#dcfce7' : '#dbeafe' }]}>
            <Text style={{ fontSize: 11 }}>{order.paymentType === 'COD' ? '💵' : '💰'}</Text>
            <Text style={[s.chipText, { color: order.paymentType === 'COD' ? '#166534' : '#1e40af' }]}>
              {order.paymentType === 'COD' ? 'Cash' : 'Wallet'}
            </Text>
          </View>
          {order.isNightDelivery && (
            <View style={[s.chip, { backgroundColor: '#e0e7ff' }]}>
              <Text style={{ fontSize: 11 }}>🌙</Text>
              <Text style={[s.chipText, { color: '#3730a3' }]}>Night</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={[s.acceptBtn, !canAccept && s.acceptBtnDisabled]}
          onPress={() => handleAccept(order.id)}
          disabled={isAccepting}
          activeOpacity={0.8}
        >
          {isAccepting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name={canAccept ? 'checkmark-circle' : 'eye-outline'} size={18} color="#fff" />
              <Text style={s.acceptBtnText}>{canAccept ? 'Accept Order' : 'View Only'}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderSection = (title: string, orders: Order[]) => {
    if (orders.length === 0) return null;
    const meta = ZONE_META[title] || ZONE_META['Same Delegation'];
    return (
      <View style={{ marginBottom: 20 }}>
        <View style={s.sectionHeader}>
          <View style={[s.sectionIcon, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon as any} size={14} color={meta.color} />
          </View>
          <Text style={[s.sectionTitle, { color: colors.text }]}>{title}</Text>
          <View style={[s.sectionBadge, { backgroundColor: colors.border }]}><Text style={[s.sectionBadgeText, { color: colors.textSecondary }]}>{orders.length}</Text></View>
        </View>
        {orders.map(renderOrderCard)}
      </View>
    );
  };

  // ── Quick filter chip items for the active level ──
  const quickChipItems = useMemo(() => {
    if (!driverGeo || !quickFilterLevel) return [];
    if (quickFilterLevel === 'delegation')
      return driverGeo.delegations.map(d => ({ id: d.id, label: d.nameDelegation }));
    if (quickFilterLevel === 'governorate')
      return driverGeo.governorates.map(g => ({ id: g.id, label: g.nameGovernorate }));
    return driverGeo.countries.map(c => ({ id: c.id, label: c.name }));
  }, [driverGeo, quickFilterLevel]);

  const activeIds = quickFilterLevel === 'delegation' ? selectedDelegationIds
    : quickFilterLevel === 'governorate' ? selectedGovernorateIds
    : selectedCountryIds;

  if (loading || !initDone) {
    return <View style={[s.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  // Compute total
  const isFlat = filterActive || !!quickFilterLevel;
  const totalOrders = isFlat
    ? (filteredData?.orders.length || 0)
    : (data?.sameDelegation.length || 0) + (data?.sameGovernorate.length || 0) +
      (data?.differentGovernorate.length || 0) + (data?.differentCountry.length || 0);

  const advFilterLabel = advSelectedDelegation?.nameDelegation
    || advSelectedGovernorate?.nameGovernorate || advSelectedCountry?.name || '';

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.subHeaderBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.headerSub, { color: colors.textSecondary }]} numberOfLines={2}>
          {filterActive
            ? `${totalOrders} order${totalOrders !== 1 ? 's' : ''} in ${advFilterLabel}`
            : `${totalOrders} order${totalOrders !== 1 ? 's' : ''} near you`}
        </Text>
        <TouchableOpacity
          style={[s.filterChipBtn, { backgroundColor: colors.surfaceVariant }, filterActive && { backgroundColor: colors.primary }]}
          onPress={() => { if (allCountries.length === 0) loadCountries(); setShowFilter(true); }}
          activeOpacity={0.75}
        >
          <Ionicons name="filter" size={18} color={filterActive ? '#fff' : colors.text} />
        </TouchableOpacity>
      </View>

      {showDeclinedFlash && (
        <View style={s.declinedFlashOverlay} pointerEvents="none" accessibilityRole="alert">
          <Text style={s.declinedFlashCenterText}>declined</Text>
        </View>
      )}

      {/* "I'm available now" toggle — only shown when driver is outside their schedule */}
      {driverGeo && !driverGeo.isAvailable && (
        <TouchableOpacity
          style={[s.availableToggle, availableNow ? s.availableToggleOn : s.availableToggleOff]}
          onPress={toggleAvailableNow} activeOpacity={0.8}
        >
          <Ionicons name={availableNow ? 'radio-button-on' : 'radio-button-off'} size={20}
            color={availableNow ? '#16a34a' : '#9ca3af'} />
          <Text style={[s.availableToggleText, { color: availableNow ? '#16a34a' : '#6b7280' }]}>
            {availableNow ? "I'm available now" : "I'm not available"}
          </Text>
          <View style={[s.availableDot, { backgroundColor: availableNow ? '#16a34a' : '#d1d5db' }]} />
        </TouchableOpacity>
      )}

      {/* Quick filter level buttons */}
      {!filterActive && (
        <View style={s.quickFilterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickFilterRow}>
            {(['delegation', 'governorate', 'country'] as ('delegation' | 'governorate' | 'country')[]).map((level) => {
              const isActive = quickFilterLevel === level;
              const label = level === 'delegation' ? 'Delegation' : level === 'governorate' ? 'Governorate' : 'Country';
              const icon = level === 'delegation' ? 'location' : level === 'governorate' ? 'map' : 'globe-outline';
              return (
                <TouchableOpacity key={level}
                  style={[s.quickFilterBtn, isActive && s.quickFilterBtnActive]}
                  onPress={() => toggleQuickLevel(level)} activeOpacity={0.7}
                >
                  <Ionicons name={icon as any} size={14} color={isActive ? '#fff' : '#6b7280'} />
                  <Text style={[s.quickFilterBtnText, isActive && s.quickFilterBtnTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Multi-select chips for the active level */}
          {quickFilterLevel && quickChipItems.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chipSelectRow}>
              {quickChipItems.map(item => {
                const selected = activeIds.has(item.id);
                return (
                  <TouchableOpacity key={item.id}
                    style={[s.chipSelect, selected && s.chipSelectActive]}
                    onPress={() => toggleItem(quickFilterLevel, item.id)} activeOpacity={0.7}
                  >
                    <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={14}
                      color={selected ? '#fff' : '#6b7280'} />
                    <Text style={[s.chipSelectText, selected && s.chipSelectTextActive]}
                      numberOfLines={1}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* Verification warning */}
      {!canAccept && (
        <View style={s.warningBanner}>
          <Ionicons name="alert-circle" size={18} color="#92400e" />
          <Text style={s.warningText}>Your account is not verified yet. You can browse orders but cannot accept them.</Text>
        </View>
      )}

      {/* Advanced filter active chip */}
      {filterActive && (
        <View style={s.filterChipRow}>
          <View style={s.filterChip}>
            <Ionicons name="funnel" size={14} color="#0284c7" />
            <Text style={s.filterChipText}>{advFilterLabel}</Text>
            <TouchableOpacity onPress={clearAdvFilter} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Orders list */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); getCurrentDriverPosition(); load(); }} />}>
        {totalOrders === 0 ? (
          <View style={s.empty}>
            <Ionicons name="cube-outline" size={56} color={colors.textTertiary} />
            <Text style={[s.emptyTitle, { color: colors.textTertiary }]}>{filterActive ? 'No orders in this area' : 'No orders available'}</Text>
            <Text style={s.emptySub}>{filterActive ? 'Try a different location' : 'Pull down to refresh'}</Text>
          </View>
        ) : isFlat ? (
          <>
            {[...(filteredData?.orders || [])]
              .sort((a, b) => {
                if (!urgentOrderId) return 0;
                if (a.id === urgentOrderId) return -1;
                if (b.id === urgentOrderId) return 1;
                return 0;
              })
              .map(renderOrderCard)}
          </>
        ) : (
          <>
            {urgentOrderId && (() => {
              const all = [
                ...(data?.sameDelegation || []),
                ...(data?.sameGovernorate || []),
                ...(data?.differentGovernorate || []),
                ...(data?.differentCountry || []),
              ];
              const urgent = all.find((o) => o.id === urgentOrderId);
              if (!urgent) return null;
              return (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ color: '#b45309', fontWeight: '800', marginBottom: 8 }}>Urgent order on top</Text>
                  {renderOrderCard(urgent)}
                </View>
              );
            })()}
            {renderSection('Same Delegation', data?.sameDelegation || [])}
            {renderSection('Same Governorate', data?.sameGovernorate || [])}
            {renderSection('Different Governorate', data?.differentGovernorate || [])}
            {renderSection('Different Country', data?.differentCountry || [])}
          </>
        )}

        {/* Rejected orders section */}
        {rejectedOrders.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <View style={s.sectionHeader}>
              <View style={[s.sectionIcon, { backgroundColor: '#fee2e2' }]}>
                <Ionicons name="ban" size={14} color="#dc2626" />
              </View>
              <Text style={[s.sectionTitle, { color: '#dc2626' }]}>No longer assigned</Text>
              <View style={[s.sectionBadge, { backgroundColor: '#fee2e2' }]}>
                <Text style={[s.sectionBadgeText, { color: '#dc2626' }]}>{rejectedOrders.length}</Text>
              </View>
            </View>
            {rejectedOrders.map((r: any) => {
              const ro = r.order as Order;
              const rPickupLat = ro.pickupAddress?.latitude;
              const rPickupLng = ro.pickupAddress?.longitude;
              const rPickupHas =
                rPickupLat != null &&
                rPickupLng != null &&
                Number.isFinite(rPickupLat) &&
                Number.isFinite(rPickupLng);
              const rDropLat = ro.dropoffAddress?.latitude;
              const rDropLng = ro.dropoffAddress?.longitude;
              const rDropHas =
                !ro.localPickupOnly &&
                rDropLat != null &&
                rDropLng != null &&
                Number.isFinite(rDropLat) &&
                Number.isFinite(rDropLng);
              const rPickupTitle =
                [ro.pickupAddress?.street, ro.pickupAddress?.delegation?.nameDelegation].filter(Boolean).join(', ') ||
                'Pickup';
              const rDropTitle =
                [ro.dropoffAddress?.street, ro.dropoffAddress?.delegation?.nameDelegation].filter(Boolean).join(', ') ||
                'Delivery';
              return (
              <View key={r.rejectionId} style={[s.card, { borderLeftWidth: 4, borderLeftColor: '#dc2626', opacity: 0.7 }]}>
                <View style={s.cardTop}>
                  <Text style={s.orderId}>#{r.order.id.slice(0, 8)}</Text>
                  <View style={[s.priceTag, { backgroundColor: '#fee2e2' }]}>
                    <Text style={[s.priceText, { color: '#dc2626', fontSize: 14 }]}>Rejected</Text>
                  </View>
                </View>
                <View style={s.routeSection}>
                  <View style={s.routeIconCol}>
                    <View style={[s.routeDot, { backgroundColor: '#22c55e' }]} />
                    <View style={s.routeLine} />
                    <View style={[s.routeDot, { backgroundColor: '#ef4444' }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TouchableOpacity
                      style={s.addressTapRow}
                      onPress={() => openAddressOnMap(rPickupLat, rPickupLng, 'pickup', rPickupTitle)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          s.routeText,
                          {
                            flex: 1,
                            color: rPickupHas ? colors.primary : colors.text,
                            fontWeight: rPickupHas ? '600' : '500',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {ro.pickupAddress?.street || ro.pickupAddress?.delegation?.nameDelegation || 'Pickup'}
                      </Text>
                      {rPickupHas ? <Ionicons name="map-outline" size={20} color={colors.primary} /> : null}
                    </TouchableOpacity>
                    <View style={{ height: 14 }} />
                    {ro.localPickupOnly ? (
                      <Text style={[s.routeText, { color: colors.textSecondary, fontWeight: '500' }]} numberOfLines={3}>
                        Local pickup only — bring items to the pickup address (no separate drop-off).
                      </Text>
                    ) : (
                      <TouchableOpacity
                        style={s.addressTapRow}
                        onPress={() => openAddressOnMap(rDropLat, rDropLng, 'dropoff', rDropTitle)}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            s.routeText,
                            {
                              flex: 1,
                              color: rDropHas ? colors.primary : colors.text,
                              fontWeight: rDropHas ? '600' : '500',
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {ro.dropoffAddress?.street || ro.dropoffAddress?.delegation?.nameDelegation || 'Dropoff'}
                        </Text>
                        {rDropHas ? <Ionicons name="map-outline" size={20} color={colors.primary} /> : null}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Ionicons name="information-circle-outline" size={16} color="#dc2626" />
                  <Text style={{ fontSize: 13, color: '#dc2626', fontWeight: '500', flex: 1 }}>
                    {r.order?.sourceType === 'DELIVERY_COMPANY'
                      ? 'The company / department removed you from this order.'
                      : 'The customer declined working with you on this order.'}
                  </Text>
                </View>
                {r.reason ? (
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 6 }}>
                    Reason: {r.reason}
                  </Text>
                ) : null}
                {r.driverResponse ? (
                  <Text style={{ fontSize: 12, color: colors.text, marginTop: 8 }}>
                    Your response: {r.driverResponse}
                  </Text>
                ) : (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    <TextInput
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 10,
                        padding: 10,
                        minHeight: 72,
                        color: colors.text,
                        backgroundColor: colors.background,
                      }}
                      placeholder="Your response (min. 5 characters, optional)"
                      placeholderTextColor={colors.textTertiary}
                      value={rejectionDrafts[r.rejectionId] ?? ''}
                      onChangeText={(t) => setRejectionDrafts((prev) => ({ ...prev, [r.rejectionId]: t }))}
                      multiline
                      textAlignVertical="top"
                    />
                    <TouchableOpacity
                      style={{
                        alignSelf: 'flex-start',
                        backgroundColor: colors.primary,
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 10,
                        opacity: rejectionSubmitting === r.rejectionId ? 0.6 : 1,
                      }}
                      disabled={rejectionSubmitting === r.rejectionId}
                      onPress={async () => {
                        const text = (rejectionDrafts[r.rejectionId] ?? '').trim();
                        if (text.length < 5) {
                          Alert.alert('Too short', 'Please write at least 5 characters.');
                          return;
                        }
                        try {
                          setRejectionSubmitting(r.rejectionId);
                          await orderService.respondToOrderDriverRejection(r.order.id, text);
                          setRejectionDrafts((prev) => {
                            const n = { ...prev };
                            delete n[r.rejectionId];
                            return n;
                          });
                          const list = await orderService.getDriverRejectedOrders();
                          setRejectedOrders(list || []);
                        } catch (e: any) {
                          Alert.alert('Error', e?.message || 'Could not save');
                        } finally {
                          setRejectionSubmitting(null);
                        }
                      }}
                    >
                      {rejectionSubmitting === r.rejectionId ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Submit response</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
                <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                  {new Date(r.rejectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Advanced Filter Modal */}
      <Modal visible={showFilter} animationType="slide" onRequestClose={() => setShowFilter(false)}>
        <View style={[s.filterModal, { backgroundColor: colors.background }]}>
          <View style={[s.filterModalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[s.filterModalTitle, { color: colors.text }]}>Filter Orders</Text>
            <TouchableOpacity onPress={() => setShowFilter(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
            <Text style={[s.filterHint, { color: colors.textSecondary }]}>
              Search for orders in a specific location. This ignores your availability and address — useful when traveling or on break.
            </Text>
            <Text style={s.filterLabel}>Country</Text>
            <TouchableOpacity style={s.filterPicker} onPress={() => setShowCountryPicker(true)}>
              <Text style={advSelectedCountry ? s.filterPickerText : s.filterPickerPlaceholder}>
                {advSelectedCountry ? advSelectedCountry.name : 'Select Country'}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#9ca3af" />
            </TouchableOpacity>
            {advSelectedCountry && (
              <>
                <Text style={s.filterLabel}>Governorate (optional)</Text>
                <TouchableOpacity style={s.filterPicker} onPress={() => setShowGovPicker(true)} disabled={geoLoading}>
                  {geoLoading && !advSelectedGovernorate
                    ? <ActivityIndicator size="small" color="#0284c7" />
                    : <Text style={advSelectedGovernorate ? s.filterPickerText : s.filterPickerPlaceholder}>
                        {advSelectedGovernorate ? advSelectedGovernorate.nameGovernorate : 'All Governorates'}
                      </Text>}
                  <Ionicons name="chevron-down" size={18} color="#9ca3af" />
                </TouchableOpacity>
              </>
            )}
            {advSelectedGovernorate && (
              <>
                <Text style={s.filterLabel}>Delegation (optional)</Text>
                <TouchableOpacity style={s.filterPicker} onPress={() => setShowDelPicker(true)} disabled={geoLoading}>
                  {geoLoading && !advSelectedDelegation
                    ? <ActivityIndicator size="small" color="#0284c7" />
                    : <Text style={advSelectedDelegation ? s.filterPickerText : s.filterPickerPlaceholder}>
                        {advSelectedDelegation ? advSelectedDelegation.nameDelegation : 'All Delegations'}
                      </Text>}
                  <Ionicons name="chevron-down" size={18} color="#9ca3af" />
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
          <View style={s.filterActions}>
            {filterActive && (
              <TouchableOpacity style={s.filterClearBtn} onPress={() => { clearAdvFilter(); setShowFilter(false); }}>
                <Text style={s.filterClearBtnText}>Clear Filter</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.filterApplyBtn, !advSelectedCountry && { opacity: 0.5 }]}
              onPress={applyAdvFilter} disabled={!advSelectedCountry}>
              <Ionicons name="search" size={18} color="#fff" />
              <Text style={s.filterApplyBtnText}>Search Orders</Text>
            </TouchableOpacity>
          </View>
        </View>
        <SearchPicker visible={showCountryPicker} title="Select Country" data={filteredCountries}
          onSelect={handleAdvSelectCountry} onClose={() => setShowCountryPicker(false)}
          search={countrySearch} setSearch={setCountrySearch} labelKey="name" />
        <SearchPicker visible={showGovPicker} title="Select Governorate" data={filteredGov}
          onSelect={handleAdvSelectGovernorate} onClose={() => setShowGovPicker(false)}
          search={govSearch} setSearch={setGovSearch} labelKey="nameGovernorate" />
        <SearchPicker visible={showDelPicker} title="Select Delegation" data={filteredDel}
          onSelect={handleAdvSelectDelegation} onClose={() => setShowDelPicker(false)}
          search={delSearch} setSearch={setDelSearch} labelKey="nameDelegation" />
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  subHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  headerSub: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  filterChipBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Full-screen centered flash when company declines driver before arrival */
  declinedFlashOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    backgroundColor: 'rgba(15, 23, 42, 0.25)',
  },
  declinedFlashCenterText: {
    color: '#dc2626',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Available toggle
  availableToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 14, borderWidth: 1.5,
  },
  availableToggleOn: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  availableToggleOff: { backgroundColor: '#f9fafb', borderColor: '#e5e7eb' },
  availableToggleText: { flex: 1, fontSize: 15, fontWeight: '700' },
  availableDot: { width: 10, height: 10, borderRadius: 5 },

  // Quick filter
  quickFilterContainer: { paddingTop: 10, paddingBottom: 4 },
  quickFilterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  quickFilterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb',
  },
  quickFilterBtnActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  quickFilterBtnText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  quickFilterBtnTextActive: { color: '#fff' },

  // Multi-select chips
  chipSelectRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  chipSelect: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 18,
    backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb',
  },
  chipSelectActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  chipSelectText: { fontSize: 13, fontWeight: '600', color: '#6b7280', maxWidth: 140 },
  chipSelectTextActive: { color: '#fff' },

  // Banners
  unavailBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff7ed', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#fed7aa',
  },
  unavailText: { flex: 1, fontSize: 13, color: '#7c2d12', lineHeight: 18 },
  warningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fffbeb', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#fde68a',
  },
  warningText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18 },
  filterChipRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#e0f2fe', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
  },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#0284c7' },

  // Section
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#374151' },
  sectionBadge: { backgroundColor: '#e5e7eb', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  sectionBadgeText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  orderId: { fontSize: 15, fontWeight: '700', color: '#111827' },
  priceTag: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  priceText: { fontSize: 20, fontWeight: '800', color: '#0284c7' },
  priceCurrency: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  customerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  customerAvatarCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: { fontSize: 12, fontWeight: '800', color: '#334155' },
  customerName: { fontSize: 13, fontWeight: '700' },
  routeSection: { flexDirection: 'row', marginBottom: 14 },
  routeIconCol: { alignItems: 'center', marginRight: 12, paddingTop: 3 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeLine: { width: 2, flex: 1, backgroundColor: '#e5e7eb', marginVertical: 3 },
  routeText: { fontSize: 14, color: '#374151', fontWeight: '500' },
  addressTapRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  distanceToPickupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  distanceToPickupIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  distanceToPickupLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },
  distanceToPickupValue: { fontSize: 17, fontWeight: '800', marginTop: 2 },
  orderDescBox: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 14,
  },
  orderDescHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  orderDescIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderDescTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  orderDescBody: { fontSize: 14, lineHeight: 21, fontWeight: '500' },
  orderDescToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start' },
  orderDescToggleText: { fontSize: 13, fontWeight: '700' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  acceptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#22c55e', height: 46, borderRadius: 14,
    shadowColor: '#22c55e', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  acceptBtnDisabled: { backgroundColor: '#94a3b8', shadowOpacity: 0 },
  acceptBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#9ca3af', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#d1d5db', marginTop: 4 },

  // Filter Modal
  filterModal: { flex: 1, backgroundColor: '#fff', paddingTop: 56 },
  filterModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  filterModalTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  filterHint: { fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 24 },
  filterLabel: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 16 },
  filterPicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, backgroundColor: '#f9fafb',
  },
  filterPickerText: { fontSize: 15, color: '#111827', flex: 1 },
  filterPickerPlaceholder: { fontSize: 15, color: '#9ca3af', flex: 1 },
  filterActions: { padding: 20, gap: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  filterClearBtn: {
    alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#e5e7eb',
  },
  filterClearBtnText: { fontSize: 15, fontWeight: '600', color: '#6b7280' },
  filterApplyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 50, borderRadius: 12, backgroundColor: '#0284c7',
  },
  filterApplyBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // SearchPicker modal
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
  modalClose: { fontSize: 20, color: '#9ca3af', padding: 4 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', margin: 16,
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111', padding: 0 },
  clearIcon: { fontSize: 14, color: '#9ca3af', paddingHorizontal: 4 },
  pickerItem: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  pickerItemText: { fontSize: 16, color: '#111', fontWeight: '500' },
  pickerItemSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  emptyPickerText: { textAlign: 'center', color: '#9ca3af', padding: 40, fontSize: 15 },
});
