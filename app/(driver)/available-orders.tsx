import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl, StyleSheet, Modal, TextInput, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderService, AvailableOrders, FilteredOrders, Order } from '../../services/api/order.service';
import { api } from '../../services/api/client';

const ZONE_META: Record<string, { icon: string; color: string; bg: string }> = {
  'Same Delegation':        { icon: 'location',      color: '#16a34a', bg: '#dcfce7' },
  'Same Governorate':       { icon: 'map',           color: '#2563eb', bg: '#dbeafe' },
  'Different Governorate':  { icon: 'globe-outline',  color: '#7c3aed', bg: '#ede9fe' },
  'Different Country':      { icon: 'airplane-outline', color: '#dc2626', bg: '#fee2e2' },
};

interface GeoCountry { id: string; name: string; isoCode: string; currencyCode: string; }
interface GeoGovernorate { id: string; nameGovernorate: string; }
interface GeoDelegation { id: string; nameDelegation: string; }

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
        <FlatList
          data={data}
          keyExtractor={(item: any) => item.id}
          keyboardShouldPersistTaps="handled"
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

export default function AvailableOrdersScreen() {
  const router = useRouter();
  const [data, setData] = useState<AvailableOrders | null>(null);
  const [filteredData, setFilteredData] = useState<FilteredOrders | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);

  // Filter state
  const [showFilter, setShowFilter] = useState(false);
  const [countries, setCountries] = useState<GeoCountry[]>([]);
  const [governorates, setGovernorates] = useState<GeoGovernorate[]>([]);
  const [delegations, setDelegations] = useState<GeoDelegation[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<GeoCountry | null>(null);
  const [selectedGovernorate, setSelectedGovernorate] = useState<GeoGovernorate | null>(null);
  const [selectedDelegation, setSelectedDelegation] = useState<GeoDelegation | null>(null);
  const [filterActive, setFilterActive] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);

  // Picker sub-modals
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showGovPicker, setShowGovPicker] = useState(false);
  const [showDelPicker, setShowDelPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [govSearch, setGovSearch] = useState('');
  const [delSearch, setDelSearch] = useState('');

  const filteredCountries = useMemo(() =>
    countries.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
      c.isoCode.toLowerCase().includes(countrySearch.toLowerCase())),
    [countries, countrySearch]);

  const filteredGov = useMemo(() =>
    governorates.filter(g => g.nameGovernorate.toLowerCase().includes(govSearch.toLowerCase())),
    [governorates, govSearch]);

  const filteredDel = useMemo(() =>
    delegations.filter(d => d.nameDelegation.toLowerCase().includes(delSearch.toLowerCase())),
    [delegations, delSearch]);

  // Load geography data
  const loadCountries = useCallback(async () => {
    try {
      const data = await api.get<GeoCountry[]>('/geography/countries');
      setCountries(Array.isArray(data) ? data : []);
    } catch { setCountries([]); }
  }, []);

  const handleSelectCountry = async (c: GeoCountry) => {
    setSelectedCountry(c);
    setSelectedGovernorate(null);
    setSelectedDelegation(null);
    setGovernorates([]); setDelegations([]);
    setShowCountryPicker(false);
    setGeoLoading(true);
    try {
      const data = await api.get<GeoGovernorate[]>(`/geography/countries/${c.id}/governorates`);
      setGovernorates(Array.isArray(data) ? data : []);
    } catch {} finally { setGeoLoading(false); }
  };

  const handleSelectGovernorate = async (g: GeoGovernorate) => {
    setSelectedGovernorate(g);
    setSelectedDelegation(null);
    setDelegations([]);
    setShowGovPicker(false);
    setGeoLoading(true);
    try {
      const data = await api.get<GeoDelegation[]>(`/geography/governorates/${g.id}/delegations`);
      setDelegations(Array.isArray(data) ? data : []);
    } catch {} finally { setGeoLoading(false); }
  };

  const handleSelectDelegation = (d: GeoDelegation) => {
    setSelectedDelegation(d);
    setShowDelPicker(false);
  };

  // Load orders
  const load = useCallback(async () => {
    try {
      if (filterActive) {
        const filters: any = {};
        if (selectedDelegation) filters.delegationId = selectedDelegation.id;
        else if (selectedGovernorate) filters.governorateId = selectedGovernorate.id;
        else if (selectedCountry) filters.countryId = selectedCountry.id;
        const result = await orderService.getAvailableOrders(filters);
        setFilteredData(result as FilteredOrders);
        setData(null);
      } else {
        const result = await orderService.getAvailableOrders();
        setData(result as AvailableOrders);
        setFilteredData(null);
      }
    } catch (e: any) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filterActive, selectedCountry, selectedGovernorate, selectedDelegation]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const i = setInterval(load, 10000); return () => clearInterval(i); }, [load]);

  // Apply filter
  const applyFilter = () => {
    if (!selectedCountry) {
      Alert.alert('Select Location', 'Please select at least a country to filter.');
      return;
    }
    setShowFilter(false);
    setFilterActive(true);
    setLoading(true);
  };

  // Clear filter
  const clearFilter = () => {
    setFilterActive(false);
    setSelectedCountry(null);
    setSelectedGovernorate(null);
    setSelectedDelegation(null);
    setGovernorates([]); setDelegations([]);
    setLoading(true);
  };

  const handleAccept = async (orderId: string) => {
    const canAccept = filterActive ? filteredData?.canAccept : data?.canAccept;
    if (!canAccept) {
      Alert.alert('Not Verified', 'Your account must be verified before you can accept orders.');
      return;
    }
    Alert.alert('Accept Order', 'Take this delivery?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Accept', onPress: async () => {
        setAccepting(orderId);
        try { await orderService.acceptOrder(orderId); Alert.alert('Success', 'Order accepted!'); router.replace('/(driver)/my-orders'); }
        catch (e: any) { Alert.alert('Error', e.message); }
        finally { setAccepting(null); }
      }},
    ]);
  };

  const canAccept = filterActive ? filteredData?.canAccept : data?.canAccept;

  const renderOrderCard = (order: Order) => {
    const isAccepting = accepting === order.id;
    return (
      <View key={order.id} style={s.card}>
        <View style={s.cardTop}>
          <Text style={s.orderId}>#{order.id.slice(0, 8)}</Text>
          <View style={s.priceTag}>
            <Text style={s.priceText}>{order.price.toFixed(2)}</Text>
            <Text style={s.priceCurrency}>TND</Text>
          </View>
        </View>
        <View style={s.routeSection}>
          <View style={s.routeIconCol}>
            <View style={[s.routeDot, { backgroundColor: '#22c55e' }]} />
            <View style={s.routeLine} />
            <View style={[s.routeDot, { backgroundColor: '#ef4444' }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.routeText} numberOfLines={1}>
              {order.pickupAddress?.street || order.pickupAddress?.delegation?.nameDelegation || 'Pickup'}
            </Text>
            <View style={{ height: 14 }} />
            <Text style={s.routeText} numberOfLines={1}>
              {order.dropoffAddress?.street || order.dropoffAddress?.delegation?.nameDelegation || 'Dropoff'}
            </Text>
          </View>
        </View>
        <View style={s.chipsRow}>
          <View style={s.chip}>
            <Ionicons name="resize-outline" size={12} color="#6b7280" />
            <Text style={s.chipText}>{order.distanceKm.toFixed(1)} km</Text>
          </View>
          <View style={s.chip}>
            <Ionicons name="cube-outline" size={12} color="#6b7280" />
            <Text style={s.chipText}>{order.weight} kg</Text>
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
          <Text style={s.sectionTitle}>{title}</Text>
          <View style={s.sectionBadge}>
            <Text style={s.sectionBadgeText}>{orders.length}</Text>
          </View>
        </View>
        {orders.map(renderOrderCard)}
      </View>
    );
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#0284c7" /></View>;
  }

  const totalOrders = filterActive
    ? (filteredData?.orders.length || 0)
    : (data?.sameDelegation.length || 0) + (data?.sameGovernorate.length || 0) +
      (data?.differentGovernorate.length || 0) + (data?.differentCountry.length || 0);

  // Build filter label
  const filterLabel = selectedDelegation?.nameDelegation
    || selectedGovernorate?.nameGovernorate
    || selectedCountry?.name || '';

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Available Orders</Text>
          <TouchableOpacity
            style={[s.headerBtn, filterActive && { backgroundColor: '#fff' }]}
            onPress={() => { if (countries.length === 0) loadCountries(); setShowFilter(true); }}
          >
            <Ionicons name="filter" size={20} color={filterActive ? '#0284c7' : '#fff'} />
          </TouchableOpacity>
        </View>
        <Text style={s.headerSub}>
          {filterActive ? `${totalOrders} order${totalOrders !== 1 ? 's' : ''} in ${filterLabel}` : `${totalOrders} order${totalOrders !== 1 ? 's' : ''} near you`}
        </Text>
      </View>

      {/* Unavailability banner */}
      {!filterActive && data?.isAvailable === false && (
        <View style={s.unavailBanner}>
          <Ionicons name="time-outline" size={18} color="#7c2d12" />
          <Text style={s.unavailText}>You are currently outside your availability schedule. Orders are hidden.</Text>
        </View>
      )}

      {/* Verification warning */}
      {!canAccept && (
        <View style={s.warningBanner}>
          <Ionicons name="alert-circle" size={18} color="#92400e" />
          <Text style={s.warningText}>Your account is not verified yet. You can browse orders but cannot accept them.</Text>
        </View>
      )}

      {/* Filter active chip */}
      {filterActive && (
        <View style={s.filterChipRow}>
          <View style={s.filterChip}>
            <Ionicons name="funnel" size={14} color="#0284c7" />
            <Text style={s.filterChipText}>{filterLabel}</Text>
            <TouchableOpacity onPress={clearFilter} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color="#6b7280" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        {totalOrders === 0 ? (
          <View style={s.empty}>
            <Ionicons name="cube-outline" size={56} color="#d1d5db" />
            <Text style={s.emptyTitle}>{filterActive ? 'No orders in this area' : 'No orders available'}</Text>
            <Text style={s.emptySub}>{filterActive ? 'Try a different location' : 'Pull down to refresh'}</Text>
          </View>
        ) : filterActive ? (
          /* Flat list for filtered results */
          <>
            {filteredData?.orders.map(renderOrderCard)}
          </>
        ) : (
          <>
            {renderSection('Same Delegation', data?.sameDelegation || [])}
            {renderSection('Same Governorate', data?.sameGovernorate || [])}
            {renderSection('Different Governorate', data?.differentGovernorate || [])}
            {renderSection('Different Country', data?.differentCountry || [])}
          </>
        )}
      </ScrollView>

      {/* Filter Modal */}
      <Modal visible={showFilter} animationType="slide" onRequestClose={() => setShowFilter(false)}>
        <View style={s.filterModal}>
          <View style={s.filterModalHeader}>
            <Text style={s.filterModalTitle}>Filter Orders</Text>
            <TouchableOpacity onPress={() => setShowFilter(false)}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
            <Text style={s.filterHint}>
              Search for orders in a specific location. This ignores your availability and address — useful when traveling or on break.
            </Text>

            {/* Country */}
            <Text style={s.filterLabel}>Country</Text>
            <TouchableOpacity style={s.filterPicker} onPress={() => setShowCountryPicker(true)}>
              <Text style={selectedCountry ? s.filterPickerText : s.filterPickerPlaceholder}>
                {selectedCountry ? `${selectedCountry.name} (${selectedCountry.isoCode})` : 'Select Country'}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#9ca3af" />
            </TouchableOpacity>

            {/* Governorate */}
            {selectedCountry && (
              <>
                <Text style={s.filterLabel}>Governorate (optional)</Text>
                <TouchableOpacity style={s.filterPicker} onPress={() => setShowGovPicker(true)} disabled={geoLoading}>
                  {geoLoading && !selectedGovernorate
                    ? <ActivityIndicator size="small" color="#0284c7" />
                    : <Text style={selectedGovernorate ? s.filterPickerText : s.filterPickerPlaceholder}>
                        {selectedGovernorate ? selectedGovernorate.nameGovernorate : 'All Governorates'}
                      </Text>}
                  <Ionicons name="chevron-down" size={18} color="#9ca3af" />
                </TouchableOpacity>
              </>
            )}

            {/* Delegation */}
            {selectedGovernorate && (
              <>
                <Text style={s.filterLabel}>Delegation (optional)</Text>
                <TouchableOpacity style={s.filterPicker} onPress={() => setShowDelPicker(true)} disabled={geoLoading}>
                  {geoLoading && !selectedDelegation
                    ? <ActivityIndicator size="small" color="#0284c7" />
                    : <Text style={selectedDelegation ? s.filterPickerText : s.filterPickerPlaceholder}>
                        {selectedDelegation ? selectedDelegation.nameDelegation : 'All Delegations'}
                      </Text>}
                  <Ionicons name="chevron-down" size={18} color="#9ca3af" />
                </TouchableOpacity>
              </>
            )}
          </ScrollView>

          <View style={s.filterActions}>
            {filterActive && (
              <TouchableOpacity style={s.filterClearBtn} onPress={() => { clearFilter(); setShowFilter(false); }}>
                <Text style={s.filterClearBtnText}>Clear Filter</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.filterApplyBtn, !selectedCountry && { opacity: 0.5 }]} onPress={applyFilter} disabled={!selectedCountry}>
              <Ionicons name="search" size={18} color="#fff" />
              <Text style={s.filterApplyBtnText}>Search Orders</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Sub-pickers */}
        <SearchPicker visible={showCountryPicker} title="Select Country" data={filteredCountries}
          onSelect={handleSelectCountry} onClose={() => setShowCountryPicker(false)}
          search={countrySearch} setSearch={setCountrySearch} labelKey="name" />
        <SearchPicker visible={showGovPicker} title="Select Governorate" data={filteredGov}
          onSelect={handleSelectGovernorate} onClose={() => setShowGovPicker(false)}
          search={govSearch} setSearch={setGovSearch} labelKey="nameGovernorate" />
        <SearchPicker visible={showDelPicker} title="Select Delegation" data={filteredDel}
          onSelect={handleSelectDelegation} onClose={() => setShowDelPicker(false)}
          search={delSearch} setSearch={setDelSearch} labelKey="nameDelegation" />
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },

  // Header
  header: {
    backgroundColor: '#0284c7', paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 14, textAlign: 'center' },

  // Unavailability banner
  unavailBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff7ed', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#fed7aa',
  },
  unavailText: { flex: 1, fontSize: 13, color: '#7c2d12', lineHeight: 18 },

  // Warning
  warningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fffbeb', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#fde68a',
  },
  warningText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18 },

  // Filter chip
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

  // Route
  routeSection: { flexDirection: 'row', marginBottom: 14 },
  routeIconCol: { alignItems: 'center', marginRight: 12, paddingTop: 3 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeLine: { width: 2, flex: 1, backgroundColor: '#e5e7eb', marginVertical: 3 },
  routeText: { fontSize: 14, color: '#374151', fontWeight: '500' },

  // Chips
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },

  // Accept button
  acceptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#22c55e', height: 46, borderRadius: 14,
    shadowColor: '#22c55e', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  acceptBtnDisabled: { backgroundColor: '#94a3b8', shadowOpacity: 0 },
  acceptBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Empty
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
