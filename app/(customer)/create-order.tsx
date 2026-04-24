import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, KeyboardAvoidingView, Platform, StyleSheet, Modal, FlatList, Pressable,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { api } from '../../services/api/client';
import { orderService, Order } from '../../services/api/order.service';
import { startOrderTracking } from '../../services/notifications';
import { useTheme } from '../../contexts/ThemeContext';
import { useCustomerTabBarInset } from '../../contexts/CustomerTabBarInsetContext';
import {
  mergeDatePart,
  mergeTimePart,
  enforcePickupAfterPublish,
} from '../../utils/customerScheduleDatetime';

interface SavedAddress {
  addressId: string;
  label: string;
  street?: string;
  nickname?: string | null;
  sublabel: string;
  lat: number;
  lng: number;
}

const COORD_MATCH_EPSILON = 0.00015;
const RECENT_ADDR_KEY = 'recent_customer_addresses';
const MAX_CUSTOMER_EXTRA = 10000;

function roundUpToNextQuarter(from: Date): Date {
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  d.setMinutes(Math.ceil(m / 15) * 15);
  if (d.getTime() <= Date.now()) d.setMinutes(d.getMinutes() + 15);
  return d;
}

function defaultPickupDate(): Date {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(0);
  d.setHours(d.getHours() + 1);
  if (d.getTime() <= Date.now()) d.setHours(d.getHours() + 1);
  return d;
}

function formatScheduleHero(d: Date) {
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return { time, date };
}

interface PricePreview {
  isNightDelivery: boolean;
  distanceKm: number;
  deliveryZoneType: string;
  baseFee: number;
  distanceFee: number;
  extraWeightFee: number;
  nightFee: number;
  calculatedPrice: number;
  customerExtraAmount: number;
  totalPrice: number;
  currency: string;
  currencySymbol: string;
  walletBalance: number | null;
  paymentType: 'COD' | 'WALLET';
}

export default function CreateOrderScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const tabBarPad = useCustomerTabBarInset();
  /** Local draft until Android/iOS picker confirms — avoids clock snapping back to parent state. */
  type SchedulePickerSession = { field: 'publish' | 'pickup'; step: 'date' | 'time'; draft: Date };

  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [pickupAddress, setPickupAddress] = useState<SavedAddress | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState<SavedAddress | null>(null);
  const [paymentType, setPaymentType] = useState<'COD' | 'WALLET'>('COD');
  const [weight, setWeight] = useState('1');
  const [description, setDescription] = useState('');
  const [preview, setPreview] = useState<PricePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resolvingPickup, setResolvingPickup] = useState(false);
  const [resolvingDropoff, setResolvingDropoff] = useState(false);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [cancelAfterMinutes, setCancelAfterMinutes] = useState(15);
  /** Optional extra (same currency as delivery) for long errands / driver time; added to calculated delivery price. */
  const [customerExtraAmount, setCustomerExtraAmount] = useState('0');
  const [walletBalance, setWalletBalance] = useState(0);
  const [pickupNickSave, setPickupNickSave] = useState('');
  const [dropoffNickSave, setDropoffNickSave] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [publishMode, setPublishMode] = useState<'now' | 'later'>('now');
  const [publishLaterAt, setPublishLaterAt] = useState(() => roundUpToNextQuarter(new Date()));
  const [pickupEnabled, setPickupEnabled] = useState(false);
  const [pickupAtDate, setPickupAtDate] = useState(() => defaultPickupDate());
  const [iosScheduleSession, setIosScheduleSession] = useState<null | SchedulePickerSession>(null);
  const [androidScheduleSession, setAndroidScheduleSession] = useState<null | SchedulePickerSession>(null);

  const publishLaterRef = React.useRef(publishLaterAt);
  const pickupAtRef = React.useRef(pickupAtDate);
  const iosScheduleSessionRef = React.useRef(iosScheduleSession);
  const androidScheduleSessionRef = React.useRef(androidScheduleSession);
  publishLaterRef.current = publishLaterAt;
  pickupAtRef.current = pickupAtDate;
  iosScheduleSessionRef.current = iosScheduleSession;
  androidScheduleSessionRef.current = androidScheduleSession;

  const applyScheduleDates = React.useCallback((nextPublish: Date, nextPickup: Date) => {
    const { publish, pickup } = enforcePickupAfterPublish(nextPublish, nextPickup, pickupEnabled);
    setPublishLaterAt(publish);
    setPickupAtDate(pickup);
  }, [pickupEnabled]);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [savedPickerVisible, setSavedPickerVisible] = useState(false);
  const [savedPickerTarget, setSavedPickerTarget] = useState<'pickup' | 'dropoff'>('pickup');
  const [savedSearch, setSavedSearch] = useState('');
  const [recentAddressIds, setRecentAddressIds] = useState<string[]>([]);

  const ACTIVE_STATUSES = ['SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PICKED_UP', 'DELIVERING'];

  // Load active orders
  useEffect(() => {
    const loadActiveOrders = async () => {
      try {
        const all = await orderService.getMyOrders();
        setActiveOrders(all.filter(o => ACTIVE_STATUSES.includes(o.status)));
      } catch {}
    };
    loadActiveOrders();
    const interval = setInterval(loadActiveOrders, 15000);
    return () => clearInterval(interval);
  }, []);

  // Fetch wallet balance
  const fetchWalletBalance = useCallback(async () => {
    try {
      const wallet = await api.get<{ id: string; balance: number; currency: string; discount: number }>('/wallet/me');
      setWalletBalance(wallet.balance ?? 0);
    } catch {
      setWalletBalance(0);
    }
  }, []);

  // Fetch wallet balance on mount and when screen regains focus
  useEffect(() => { fetchWalletBalance(); }, [fetchWalletBalance]);
  useFocusEffect(useCallback(() => { fetchWalletBalance(); }, [fetchWalletBalance]));

  const loadSavedAddresses = useCallback(async () => {
    try {
      const rows = await api.get<
        { id: string; latitude: number | null; longitude: number | null; street: string | null; nickname: string | null; delegation: { nameDelegation: string; governorate: { nameGovernorate: string } } }[]
      >('/addresses');
      setSavedAddresses(
        rows
          .filter((a) => a.latitude != null && a.longitude != null)
          .map((a) => ({
            addressId: a.id,
            label: a.nickname || a.street || 'Saved address',
            street: a.street || undefined,
            nickname: a.nickname,
            sublabel: `${a.delegation.nameDelegation}, ${a.delegation.governorate.nameGovernorate}`,
            lat: a.latitude as number,
            lng: a.longitude as number,
          })),
      );
    } catch {
      setSavedAddresses([]);
    }
  }, []);
  useEffect(() => { loadSavedAddresses(); }, [loadSavedAddresses]);
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(RECENT_ADDR_KEY);
        if (raw) setRecentAddressIds(JSON.parse(raw));
      } catch {}
    })();
  }, []);

  // Resolve address from map picker params
  const resolveAddress = useCallback(async (
    lat: number, lng: number, label: string,
    setter: (a: SavedAddress) => void,
    setResolving: (b: boolean) => void,
  ) => {
    setResolving(true);
    try {
      // Find nearest delegation
      const delegation = await api.get<{
        id: string; nameDelegation: string;
        governorate: { id: string; nameGovernorate: string; country: { id: string; name: string } };
      }>(`/geography/delegations/by-coordinates?lat=${lat}&lng=${lng}`);

      // Create address record (order address — no userId)
      const address = await api.post<{ id: string }>('/addresses/order', {
        latitude: lat, longitude: lng,
        street: label,
        delegationId: delegation.id,
      });

      setter({
        addressId: address.id,
        label: label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        sublabel: `${delegation.nameDelegation}, ${delegation.governorate.nameGovernorate}`,
        lat, lng,
      });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save address');
    } finally {
      setResolving(false);
    }
  }, []);

  // Clean up stale picker data on mount
  useEffect(() => {
    AsyncStorage.removeItem('picked_pickup');
    AsyncStorage.removeItem('picked_dropoff');
  }, []);

  // Listen for map picker results via AsyncStorage
  // We check on an interval because the user returns from the map picker screen
  const pickupTimestamp = React.useRef(0);
  const dropoffTimestamp = React.useRef(0);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const pickupData = await AsyncStorage.getItem('picked_pickup');
        if (pickupData) {
          const parsed = JSON.parse(pickupData);
          if (parsed.timestamp > pickupTimestamp.current) {
            pickupTimestamp.current = parsed.timestamp;
            await AsyncStorage.removeItem('picked_pickup');
            resolveAddress(parsed.lat, parsed.lng, parsed.address, setPickupAddress, setResolvingPickup);
          }
        }
        const dropoffData = await AsyncStorage.getItem('picked_dropoff');
        if (dropoffData) {
          const parsed = JSON.parse(dropoffData);
          if (parsed.timestamp > dropoffTimestamp.current) {
            dropoffTimestamp.current = parsed.timestamp;
            await AsyncStorage.removeItem('picked_dropoff');
            resolveAddress(parsed.lat, parsed.lng, parsed.address, setDropoffAddress, setResolvingDropoff);
          }
        }
      } catch {}
    }, 500);
    return () => clearInterval(interval);
  }, [resolveAddress]);

  const openMapPicker = (type: 'pickup' | 'dropoff') => {
    router.push(`/(customer)/pick-location?type=${type}&returnTo=${encodeURIComponent('/(customer)/create-order')}`);
  };

  const openSavedPicker = (target: 'pickup' | 'dropoff') => {
    setSavedPickerTarget(target);
    setSavedSearch('');
    setSavedPickerVisible(true);
  };

  const filteredSavedAddresses = savedAddresses.filter((a) => {
    const q = savedSearch.trim().toLowerCase();
    if (!q) return true;
    const hay = `${a.nickname || ''} ${a.street || ''} ${a.label || ''} ${a.sublabel || ''}`.toLowerCase();
    return hay.includes(q);
  });
  const recentAddresses = recentAddressIds
    .map((id) => savedAddresses.find((a) => a.addressId === id))
    .filter((a): a is SavedAddress => !!a);
  const isAlreadySavedAddress = (addr: SavedAddress | null) => {
    if (!addr) return false;
    return savedAddresses.some((s) =>
      Math.abs(s.lat - addr.lat) <= COORD_MATCH_EPSILON &&
      Math.abs(s.lng - addr.lng) <= COORD_MATCH_EPSILON,
    );
  };
  const getSavedAddressByCoords = (addr: SavedAddress | null) => {
    if (!addr) return null;
    return savedAddresses.find((s) =>
      Math.abs(s.lat - addr.lat) <= COORD_MATCH_EPSILON &&
      Math.abs(s.lng - addr.lng) <= COORD_MATCH_EPSILON,
    ) || null;
  };

  const markRecentAddress = async (addressId: string) => {
    const next = [addressId, ...recentAddressIds.filter((id) => id !== addressId)].slice(0, 6);
    setRecentAddressIds(next);
    try { await AsyncStorage.setItem(RECENT_ADDR_KEY, JSON.stringify(next)); } catch {}
  };

  const useMyLocation = async (which: 'pickup' | 'dropoff') => {
    const setResolving = which === 'pickup' ? setResolvingPickup : setResolvingDropoff;
    setResolving(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location', 'We need your permission to use the current position.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      await resolveAddress(
        pos.coords.latitude,
        pos.coords.longitude,
        'Current location',
        which === 'pickup' ? setPickupAddress : setDropoffAddress,
        which === 'pickup' ? setResolvingPickup : setResolvingDropoff,
      );
    } finally {
      setResolving(false);
    }
  };

  const autoSaveAddressForLater = async (
    addr: SavedAddress | null,
    nickname: string,
    fallbackLabel: string,
  ): Promise<string | null> => {
    if (!addr) return null;
    const trimmedNickname = nickname.trim();
    const existing = getSavedAddressByCoords(addr);
    const fallbackNickname = (addr.street || addr.label || fallbackLabel).slice(0, 60);
    const desiredNickname =
      trimmedNickname.length >= 2
        ? trimmedNickname
        : (existing?.nickname || existing?.label || fallbackNickname);
    try {
      const delegation = await api.get<{ id: string }>(
        `/geography/delegations/by-coordinates?lat=${addr.lat}&lng=${addr.lng}`,
      );
      if (existing) {
        const shouldUpdateNickname =
          trimmedNickname.length >= 2 && trimmedNickname !== (existing.nickname || existing.label);
        const shouldUpdateStreet = (addr.label || '').trim() !== ((existing.street || '').trim());
        if (shouldUpdateNickname || shouldUpdateStreet) {
          await api.patch(`/addresses/${existing.addressId}`, {
            street: addr.label,
            delegationId: delegation.id,
            nickname: shouldUpdateNickname ? trimmedNickname : (existing.nickname ?? null),
          });
        }
      } else {
        await api.post('/addresses', {
          latitude: addr.lat,
          longitude: addr.lng,
          street: addr.label,
          delegationId: delegation.id,
          nickname: desiredNickname,
        });
      }
      await loadSavedAddresses();
      return desiredNickname;
    } catch {
      // Do not block price preview when auto-save fails.
      return null;
    }
  };

  // Calculate price
  const handleCalculatePrice = async () => {
    if (!pickupAddress || !dropoffAddress) {
      Alert.alert('Missing Address', 'Please select both pickup and delivery locations on the map.');
      return;
    }
    if (pickupAddress.addressId === dropoffAddress.addressId) {
      Alert.alert('Same Location', 'Pickup and delivery must be different locations.');
      return;
    }
    const w = parseFloat(weight);
    if (isNaN(w) || w <= 0) {
      Alert.alert('Invalid Weight', 'Please enter a valid package weight.');
      return;
    }
    if (cancelAfterMinutes > 1440) {
      Alert.alert('Invalid Timer', 'Auto-cancel time must be 24 hours or less.');
      return;
    }
    const ex = parseFloat((customerExtraAmount || '0').replace(',', '.'));
    if (Number.isNaN(ex) || ex < 0) {
      Alert.alert('Amount', 'Enter a valid optional extra amount (0 or more).');
      return;
    }
    if (ex > MAX_CUSTOMER_EXTRA) {
      Alert.alert('Amount', `Optional extra cannot exceed ${MAX_CUSTOMER_EXTRA}.`);
      return;
    }
    if (publishMode === 'later' && publishLaterAt.getTime() <= Date.now() + 45_000) {
      Alert.alert('Publish time', 'Choose a publish time at least one minute ahead, or keep “Publish now”.');
      return;
    }
    if (pickupEnabled && pickupAtDate.getTime() <= Date.now()) {
      Alert.alert('Pickup time', 'Choose a pickup time in the future.');
      return;
    }
    if (publishMode === 'later' && pickupEnabled && pickupAtDate.getTime() <= publishLaterAt.getTime()) {
      Alert.alert('Schedule', 'Pickup date and time must be strictly after publish date and time.');
      return;
    }
    setLoading(true);
    try {
      const [savedPickupNickname, savedDropoffNickname] = await Promise.all([
        autoSaveAddressForLater(pickupAddress, pickupNickSave, 'Pickup'),
        autoSaveAddressForLater(dropoffAddress, dropoffNickSave, 'Delivery'),
      ]);
      if (savedPickupNickname) {
        setPickupAddress((prev) => (prev ? { ...prev, nickname: savedPickupNickname, label: savedPickupNickname } : prev));
      }
      if (savedDropoffNickname) {
        setDropoffAddress((prev) => (prev ? { ...prev, nickname: savedDropoffNickname, label: savedDropoffNickname } : prev));
      }
      const result = await orderService.previewOrder({
        pickupAddressId: pickupAddress.addressId,
        dropoffAddressId: dropoffAddress.addressId,
        paymentType, weight: w,
        customerExtraAmount: ex,
      });
      setPreview(result);
      setCustomerExtraAmount(String(result.customerExtraAmount ?? ex));
      setStep('preview');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to calculate price');
    } finally {
      setLoading(false);
    }
  };

  // Confirm order
  const handleConfirmOrder = async () => {
    if (!pickupAddress || !dropoffAddress || !preview) return;
    const ex = parseFloat((customerExtraAmount || '0').replace(',', '.'));
    if (Number.isNaN(ex) || ex < 0 || ex > MAX_CUSTOMER_EXTRA) {
      Alert.alert('Amount', `Enter a valid optional extra (0–${MAX_CUSTOMER_EXTRA}).`);
      return;
    }
    if (publishMode === 'later' && pickupEnabled && pickupAtDate.getTime() <= publishLaterAt.getTime()) {
      Alert.alert('Schedule', 'Pickup date and time must be strictly after publish date and time.');
      return;
    }
    setSubmitting(true);
    try {
      const order = await orderService.createOrder({
        pickupAddressId: pickupAddress.addressId,
        dropoffAddressId: dropoffAddress.addressId,
        paymentType, weight: parseFloat(weight),
        description: description || undefined,
        cancelAfterMinutes,
        customerExtraAmount: ex,
        ...(publishMode === 'later' ? { publishAt: publishLaterAt.toISOString() } : {}),
        ...(pickupEnabled ? { pickupAt: pickupAtDate.toISOString() } : {}),
      });
      // Reset form for next order
      setPickupAddress(null);
      setDropoffAddress(null);
      setPaymentType('COD');
      setWeight('1');
      setDescription('');
      setCancelAfterMinutes(15);
      setCustomerExtraAmount('0');
      setPickupNickSave('');
      setDropoffNickSave('');
      setPublishMode('now');
      setPublishLaterAt(roundUpToNextQuarter(new Date()));
      setPickupEnabled(false);
      setPickupAtDate(defaultPickupDate());
      setScheduleOpen(false);
      setIosScheduleSession(null);
      setAndroidScheduleSession(null);
      setPreview(null);
      setStep('form');
      // Refresh active orders
      try {
        const all = await orderService.getMyOrders();
        setActiveOrders(all.filter(o => ACTIVE_STATUSES.includes(o.status)));
      } catch {}
      const isLiveToDrivers = order.status === 'SEARCHING_DRIVER';
      const draftBody =
        order.publishAt != null
          ? `Your order is saved as a draft. Drivers will be notified starting ${new Date(order.publishAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`
          : 'Your order is saved as a draft. Drivers will be notified when it is published.';
      Alert.alert(
        isLiveToDrivers ? 'Order Created!' : 'Order scheduled',
        isLiveToDrivers ? 'We are searching for a driver near you.' : draftBody,
        [
          { text: 'View Order', onPress: () => router.push(`/(customer)/order-detail?orderId=${order.id}`) },
          { text: 'New Order', style: 'cancel' },
        ],
      );

      if (isLiveToDrivers) {
        startOrderTracking(
          order.id,
          '📦 Order Confirmed — Searching for a driver...',
          '⛟———⌖———⌖———⌖———⌖———⌖———⌖',
          {
            orderId: order.id,
            orderStatus: 'SEARCHING_DRIVER',
            groupKey: `order:${order.id}`,
            relatedEntityType: 'Order',
            relatedEntityId: order.id,
            ongoing: 'true',
          },
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  // Switch to Cash handler for insufficient wallet balance
  const handleSwitchToCash = async () => {
    if (!pickupAddress || !dropoffAddress) return;
    setPaymentType('COD');
    try {
      const ex = parseFloat((customerExtraAmount || '0').replace(',', '.'));
      const extraOk = !Number.isNaN(ex) && ex >= 0 && ex <= MAX_CUSTOMER_EXTRA ? ex : 0;
      const result = await orderService.previewOrder({
        pickupAddressId: pickupAddress.addressId,
        dropoffAddressId: dropoffAddress.addressId,
        paymentType: 'COD',
        weight: parseFloat(weight),
        customerExtraAmount: extraOk,
      });
      setPreview(result);
      setCustomerExtraAmount(String(result.customerExtraAmount ?? extraOk));
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to recalculate price');
    }
  };

  /** Re-run preview after customer changes optional extra on the summary screen. */
  const handleUpdatePreviewExtra = async (overrideExtraAmount?: number) => {
    if (!pickupAddress || !dropoffAddress) return;
    const ex = typeof overrideExtraAmount === 'number'
      ? overrideExtraAmount
      : parseFloat((customerExtraAmount || '0').replace(',', '.'));
    if (Number.isNaN(ex) || ex < 0) {
      Alert.alert('Amount', 'Enter a valid optional extra amount (0 or more).');
      return;
    }
    if (ex > MAX_CUSTOMER_EXTRA) {
      Alert.alert('Amount', `Optional extra cannot exceed ${MAX_CUSTOMER_EXTRA}.`);
      return;
    }
    const w = parseFloat(weight);
    if (Number.isNaN(w) || w <= 0) {
      Alert.alert('Weight', 'Go back and enter a valid weight.');
      return;
    }
    setLoading(true);
    try {
      const result = await orderService.previewOrder({
        pickupAddressId: pickupAddress.addressId,
        dropoffAddressId: dropoffAddress.addressId,
        paymentType,
        weight: w,
        customerExtraAmount: ex,
      });
      setPreview(result);
      setCustomerExtraAmount(String(result.customerExtraAmount ?? ex));
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update price');
    } finally {
      setLoading(false);
    }
  };

  const adjustPreviewExtraByStep = async (delta: number) => {
    const current = parseFloat((customerExtraAmount || '0').replace(',', '.'));
    const safeCurrent = Number.isNaN(current) || current < 0 ? 0 : current;
    const next = Math.max(0, Math.min(MAX_CUSTOMER_EXTRA, safeCurrent + delta));
    setCustomerExtraAmount(String(next));
    await handleUpdatePreviewExtra(next);
  };

  // ═══════════════════════════════════════════
  // STEP 2: PRICE PREVIEW
  // ═══════════════════════════════════════════
  if (step === 'preview' && preview) {
    const isCash = preview.paymentType === 'COD';
    const unit = isCash ? preview.currencySymbol : 'coins';
    const insufficientWallet = !isCash && preview.walletBalance !== null && preview.walletBalance < preview.totalPrice;

    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 + tabBarPad }}>
          <TouchableOpacity
            style={[s.previewEditRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => setStep('form')}
            activeOpacity={0.75}
          >
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
            <Text style={[s.previewEditText, { color: colors.primary }]}>Edit order details</Text>
          </TouchableOpacity>

          {/* Route card */}
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <View style={s.routeRow}>
              <View style={s.routeIconCol}>
                <View style={[s.routeDot, { backgroundColor: '#22c55e' }]} />
                <View style={s.routeLine} />
                <View style={[s.routeDot, { backgroundColor: '#ef4444' }]} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ marginBottom: 20 }}>
                  <Text style={s.routeLabel}>PICKUP</Text>
                  <Text style={s.routeAddress}>{pickupAddress?.label}</Text>
                  <Text style={s.routeSub}>{pickupAddress?.sublabel}</Text>
                </View>
                <View>
                  <Text style={s.routeLabel}>DELIVERY</Text>
                  <Text style={s.routeAddress}>{dropoffAddress?.label}</Text>
                  <Text style={s.routeSub}>{dropoffAddress?.sublabel}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Info chips */}
          <View style={s.chipsRow}>
            <View style={[s.chip, { backgroundColor: isCash ? '#dcfce7' : '#dbeafe' }]}>
              <Text style={{ fontSize: 14 }}>{isCash ? '💵' : '💰'}</Text>
              <Text style={[s.chipText, { color: isCash ? '#166534' : '#1e40af' }]}>
                {isCash ? 'Cash' : 'Wallet'}
              </Text>
            </View>
            <View style={[s.chip, { backgroundColor: '#f3f4f6' }]}>
              <Text style={{ fontSize: 14 }}>📦</Text>
              <Text style={[s.chipText, { color: '#374151' }]}>{weight} kg</Text>
            </View>
            <View style={[s.chip, { backgroundColor: '#f3f4f6' }]}>
              <Text style={{ fontSize: 14 }}>📏</Text>
              <Text style={[s.chipText, { color: '#374151' }]}>{preview.distanceKm.toFixed(1)} km</Text>
            </View>
            {preview.isNightDelivery && (
              <View style={[s.chip, { backgroundColor: '#e0e7ff' }]}>
                <Text style={{ fontSize: 14 }}>🌙</Text>
                <Text style={[s.chipText, { color: '#3730a3' }]}>Night</Text>
              </View>
            )}
          </View>

          {/* Optional extra for long errands / driver time (added to calculated delivery price) */}
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Driver time / errand (optional)</Text>
            <Text style={[s.inputLabel, { color: colors.textSecondary, marginBottom: 8 }]}>
              Add an amount for long waits or services (e.g. paying a bill at an office). Max {MAX_CUSTOMER_EXTRA} {unit}.
            </Text>
            <View style={s.extraStepperRow}>
              <TouchableOpacity
                style={[
                  s.extraStepperBtn,
                  { backgroundColor: colors.inputBg, borderColor: colors.border },
                  parseFloat((customerExtraAmount || '0').replace(',', '.')) <= 0 && s.extraStepperBtnDisabled,
                ]}
                onPress={() => adjustPreviewExtraByStep(-1)}
                disabled={loading || parseFloat((customerExtraAmount || '0').replace(',', '.')) <= 0}
                activeOpacity={0.7}
              >
                <Text style={s.extraStepperBtnText}>-</Text>
              </TouchableOpacity>
              <View style={[s.extraStepperValueBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Text style={[s.extraStepperValueText, { color: colors.text }]}>
                  {Math.max(0, parseFloat((customerExtraAmount || '0').replace(',', '.')) || 0).toFixed(0)}
                </Text>
              </View>
              <TouchableOpacity
                style={[s.extraStepperBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                onPress={() => adjustPreviewExtraByStep(1)}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={s.extraStepperBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Price breakdown */}
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Price Breakdown</Text>
            <PriceRow label="Base Fee" value={preview.baseFee} unit={unit} />
            <PriceRow label="Distance Fee" value={preview.distanceFee} unit={unit} />
            {preview.extraWeightFee > 0 && <PriceRow label="Extra Weight" value={preview.extraWeightFee} unit={unit} />}
            {preview.nightFee > 0 && <PriceRow label="Night Fee 🌙" value={preview.nightFee} unit={unit} />}
            <View style={[s.divider, { backgroundColor: colors.border }]} />
            <PriceRow label="Delivery (calculated)" value={preview.calculatedPrice} unit={unit} />
            {preview.customerExtraAmount > 0 && (
              <PriceRow label="Your extra (driver time / errand)" value={preview.customerExtraAmount} unit={unit} />
            )}
            <View style={[s.divider, { backgroundColor: colors.border }]} />
            <View style={s.priceRow}>
              <Text style={[s.totalLabel, { color: colors.text }]}>Total</Text>
              <Text style={[s.totalValue, { color: colors.primary }]}>{preview.totalPrice.toFixed(2)} {unit}</Text>
            </View>
          </View>

          {/* Wallet balance warning / Insufficient balance prompt */}
          {!isCash && preview.walletBalance !== null && (
            <View style={[s.walletBanner, insufficientWallet ? s.walletBannerDanger : s.walletBannerOk]}>
              <Ionicons name="wallet-outline" size={18} color={insufficientWallet ? '#dc2626' : '#16a34a'} />
              <Text style={[s.walletText, { color: insufficientWallet ? '#dc2626' : '#16a34a' }]}>
                Balance: {preview.walletBalance.toFixed(2)} coins
                {insufficientWallet ? ' — Insufficient funds' : ''}
              </Text>
            </View>
          )}

          {/* Insufficient balance action buttons */}
          {insufficientWallet && (
            <View style={s.insufficientActions}>
              <TouchableOpacity
                style={[s.insufficientBtn, { backgroundColor: '#dbeafe' }]}
                onPress={() => Alert.alert('Coming Soon', 'The Add Coins feature will be available soon.')}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={18} color="#1e40af" />
                <Text style={[s.insufficientBtnText, { color: '#1e40af' }]}>Add Coins</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.insufficientBtn, { backgroundColor: '#dcfce7' }]}
                onPress={handleSwitchToCash}
                activeOpacity={0.7}
              >
                <Ionicons name="cash-outline" size={18} color="#166534" />
                <Text style={[s.insufficientBtnText, { color: '#166534' }]}>Switch to Cash</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Confirm */}
          <TouchableOpacity
            style={[s.primaryBtn, insufficientWallet && s.primaryBtnDisabled]}
            onPress={handleConfirmOrder}
            disabled={submitting || insufficientWallet}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={22} color="white" style={{ marginRight: 8 }} />
                <Text style={s.primaryBtnText}>Confirm Order</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ═══════════════════════════════════════════
  // STEP 1: ORDER FORM
  // ═══════════════════════════════════════════
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 + tabBarPad }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            style={[s.localPickupCta, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() =>
              router.push(`/(customer)/local-pickup-order?returnTo=${encodeURIComponent('/(customer)/create-order')}`)
            }
            activeOpacity={0.8}
          >
            <View style={[s.localPickupIconWrap, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="cube-outline" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.localPickupCtaTitle, { color: colors.text }]}>Create local pickup</Text>
              <Text style={[s.localPickupCtaSub, { color: colors.textSecondary }]}>
                Same-location pickup — quick flow for shop and carry orders
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          {/* ── Active Orders ── */}
          {activeOrders.length > 0 && (
            <View style={s.activeOrdersCard}>
              <Text style={s.activeOrdersTitle}>📦 Active Orders ({activeOrders.length})</Text>
              {activeOrders.map(o => (
                <TouchableOpacity
                  key={o.id}
                  style={s.activeOrderItem}
                  onPress={() => router.push(`/(customer)/order-detail?orderId=${o.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={[s.activeOrderDot, {
                    backgroundColor: o.status === 'SEARCHING_DRIVER' ? '#eab308' :
                      o.status === 'DELIVERING' ? '#6366f1' : '#3b82f6'
                  }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.activeOrderText}>#{o.id.slice(0, 8)} — {o.status.replace(/_/g, ' ')}</Text>
                  </View>
                  <Text style={s.activeOrderPrice}>{o.price.toFixed(2)}</Text>
                  <Ionicons name="chevron-forward" size={14} color="#9ca3af" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── Addresses ── */}
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Route</Text>

            {/* Pickup */}
            <View style={[s.addressBtn, pickupAddress && s.addressBtnActive]}>
              <View style={[s.addressDot, { backgroundColor: pickupAddress ? '#22c55e' : '#d1d5db' }]} />
              <View style={{ flex: 1 }}>
                {resolvingPickup ? (
                  <Text style={s.addressFetching}>Fetching your current position...</Text>
                ) : pickupAddress ? (
                  <>
                    <Text style={s.addressMainText}>{pickupAddress.label}</Text>
                    <Text style={s.addressSubText}>{pickupAddress.sublabel}</Text>
                  </>
                ) : (
                  <Text style={s.addressPlaceholder}>Tap to select pickup location</Text>
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity style={s.inlineActionBtn} onPress={() => openMapPicker('pickup')} activeOpacity={0.7}>
                    <Ionicons name="map-outline" size={16} color="#16a34a" />
                    <Text style={s.inlineActionTxt}>Map</Text>
                  </TouchableOpacity>
                  {savedAddresses.length > 0 && (
                    <TouchableOpacity style={s.inlineActionBtn} onPress={() => openSavedPicker('pickup')} activeOpacity={0.7}>
                      <Ionicons name="list-outline" size={16} color="#166534" />
                      <Text style={s.inlineActionTxt}>List</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={s.inlineActionBtn} onPress={() => useMyLocation('pickup')} disabled={resolvingPickup} activeOpacity={0.7}>
                    <Ionicons name="locate" size={16} color="#2563eb" />
                    <Text style={s.inlineActionTxt}>My Position</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Connector line */}
            <View style={s.connectorLine} />

            {/* Dropoff */}
            <View style={[s.addressBtn, dropoffAddress && { borderColor: '#fecaca', backgroundColor: '#fff7f7' }]}>
              <View style={[s.addressDot, { backgroundColor: dropoffAddress ? '#ef4444' : '#d1d5db' }]} />
              <View style={{ flex: 1 }}>
                {resolvingDropoff ? (
                  <Text style={s.addressFetching}>Fetching your current position...</Text>
                ) : dropoffAddress ? (
                  <>
                    <Text style={s.addressMainText}>{dropoffAddress.label}</Text>
                    <Text style={s.addressSubText}>{dropoffAddress.sublabel}</Text>
                  </>
                ) : (
                  <Text style={s.addressPlaceholder}>Tap to select delivery location</Text>
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity style={s.inlineActionBtn} onPress={() => openMapPicker('dropoff')} activeOpacity={0.7}>
                    <Ionicons name="map-outline" size={16} color="#ef4444" />
                    <Text style={s.inlineActionTxt}>Map</Text>
                  </TouchableOpacity>
                  {savedAddresses.length > 0 && (
                    <TouchableOpacity style={s.inlineActionBtn} onPress={() => openSavedPicker('dropoff')} activeOpacity={0.7}>
                      <Ionicons name="list-outline" size={16} color="#b91c1c" />
                      <Text style={s.inlineActionTxt}>List</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={s.inlineActionBtn} onPress={() => useMyLocation('dropoff')} disabled={resolvingDropoff} activeOpacity={0.7}>
                    <Ionicons name="locate" size={16} color="#2563eb" />
                    <Text style={s.inlineActionTxt}>My Position</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

          </View>

          {(pickupAddress || dropoffAddress) && (
            <View style={[s.card, { backgroundColor: colors.card }]}>
              <Text style={[s.cardTitle, { color: colors.text }]}>Address nickname</Text>
              <Text style={[s.inputLabel, { color: colors.textSecondary, marginBottom: 8 }]}>
                {(pickupAddress && !isAlreadySavedAddress(pickupAddress)) || (dropoffAddress && !isAlreadySavedAddress(dropoffAddress))
                  ? 'Add a short nickname. New addresses are saved automatically when you press Calculate Price.'
                  : 'These addresses are already saved.'}
              </Text>
              {pickupAddress && !isAlreadySavedAddress(pickupAddress) && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={[s.inputLabel, { color: colors.text }]}>Pickup (new)</Text>
                  <TextInput
                    style={[s.descInput, { color: colors.text, borderColor: colors.inputBorder }]}
                    placeholder="e.g. Home, Office…"
                    placeholderTextColor={colors.textTertiary}
                    value={pickupNickSave}
                    onChangeText={setPickupNickSave}
                  />
                </View>
              )}
              {dropoffAddress && !isAlreadySavedAddress(dropoffAddress) && (
                <View>
                  <Text style={[s.inputLabel, { color: colors.text }]}>Delivery (new)</Text>
                  <TextInput
                    style={[s.descInput, { color: colors.text, borderColor: colors.inputBorder }]}
                    placeholder="e.g. Father's house…"
                    placeholderTextColor={colors.textTertiary}
                    value={dropoffNickSave}
                    onChangeText={setDropoffNickSave}
                  />
                </View>
              )}
            </View>
          )}

          {/* ── Payment Method ── */}
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Payment</Text>
            <View style={s.paymentRow}>
              <TouchableOpacity
                style={[s.paymentOption, paymentType === 'COD' && s.paymentOptionActiveCash]}
                onPress={() => setPaymentType('COD')}
                activeOpacity={0.7}
              >
                <Text style={s.paymentEmoji}>💵</Text>
                <Text style={[s.paymentLabel, paymentType === 'COD' && { color: '#fff' }]}>Cash</Text>
                <Text style={[s.paymentSub, paymentType === 'COD' && { color: 'rgba(255,255,255,0.8)' }]}>Pay on delivery</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.paymentOption, paymentType === 'WALLET' && s.paymentOptionActiveWallet]}
                onPress={() => setPaymentType('WALLET')}
                activeOpacity={0.7}
              >
                <Text style={s.paymentEmoji}>💰</Text>
                <Text style={[s.paymentLabel, paymentType === 'WALLET' && { color: '#fff' }]}>Wallet</Text>
                <Text style={[s.paymentSub, paymentType === 'WALLET' && { color: 'rgba(255,255,255,0.8)' }]}>Use coins</Text>
                <Text style={[s.paymentSub, paymentType === 'WALLET' && { color: 'rgba(255,255,255,0.8)' }]}>{walletBalance} coins</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Package Details ── */}
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Package Details</Text>

            <Text style={s.inputLabel}>Weight (kg)</Text>
            <View style={s.weightRow}>
              <TouchableOpacity style={s.weightBtn} onPress={() => {
                const w = Math.max(0.5, parseFloat(weight || '1') - 0.5);
                setWeight(String(w));
              }}>
                <Ionicons name="remove" size={20} color="#374151" />
              </TouchableOpacity>
              <TextInput
                style={s.weightInput}
                value={weight}
                onChangeText={setWeight}
                keyboardType="numeric"
                textAlign="center"
              />
              <TouchableOpacity style={s.weightBtn} onPress={() => {
                const w = parseFloat(weight || '1') + 0.5;
                setWeight(String(w));
              }}>
                <Ionicons name="add" size={20} color="#374151" />
              </TouchableOpacity>
            </View>

            <Text style={[s.inputLabel, { marginTop: 16 }]}>Description (optional)</Text>
            <TextInput
              style={s.descInput}
              value={description}
              onChangeText={setDescription}
              placeholder="What are you sending?"
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* ── Auto-Cancel Timer ── */}
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Auto-Cancel Timer</Text>
            <Text style={s.inputLabel}>Cancel if no driver responds (minutes)</Text>
            <View style={s.weightRow}>
              <TouchableOpacity style={s.weightBtn} onPress={() => {
                setCancelAfterMinutes(prev => Math.max(15, prev - 1));
              }}>
                <Ionicons name="remove" size={20} color="#374151" />
              </TouchableOpacity>
              <TextInput
                style={s.weightInput}
                value={String(cancelAfterMinutes)}
                onChangeText={(text) => {
                  const num = parseInt(text, 10);
                  setCancelAfterMinutes(isNaN(num) ? 0 : num);
                }}
                keyboardType="numeric"
                textAlign="center"
              />
              <TouchableOpacity style={s.weightBtn} onPress={() => {
                setCancelAfterMinutes(prev => Math.min(1440, prev + 1));
              }}>
                <Ionicons name="add" size={20} color="#374151" />
              </TouchableOpacity>
            </View>
            {cancelAfterMinutes > 1440 && (
              <Text style={s.validationError}>Must be 1440 minutes (24h) or less</Text>
            )}
          </View>

          {/* ── Schedule (tap icon to expand; default publish = now) ── */}
          <TouchableOpacity
            style={[
              s.scheduleToggleRow,
              { backgroundColor: colors.card, borderColor: colors.border },
              scheduleOpen && { borderColor: colors.primary },
            ]}
            onPress={() => setScheduleOpen((o) => !o)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={scheduleOpen ? 'Hide schedule' : 'Show schedule'}
          >
            <View style={[s.scheduleToggleIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="calendar-outline" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.scheduleToggleTitle, { color: colors.text }]}>Schedule</Text>
              <Text style={[s.scheduleToggleSub, { color: colors.textSecondary }]} numberOfLines={1}>
                {publishMode === 'now' && !pickupEnabled
                  ? 'Publish now — optional pickup time'
                  : [
                      publishMode === 'later' ? `Publish ${formatScheduleHero(publishLaterAt).date}` : 'Publish now',
                      pickupEnabled ? ` · Pickup ${formatScheduleHero(pickupAtDate).time}` : '',
                    ].join('')}
              </Text>
            </View>
            {(publishMode === 'later' || pickupEnabled) && (
              <View style={[s.scheduleBadge, { backgroundColor: colors.primary }]} />
            )}
            <Ionicons name={scheduleOpen ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textTertiary} />
          </TouchableOpacity>

          {scheduleOpen && (
            <View style={[s.schedulePanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.schedulePanelLead, { color: colors.textSecondary }]}>
                Drivers see your order when it is published. Pickup time helps the driver arrive on time.
              </Text>

              <Text style={[s.scheduleSectionLabel, { color: colors.text }]}>When to publish</Text>
              <View style={s.segmentRow}>
                <TouchableOpacity
                  style={[
                    s.segmentBtn,
                    { borderColor: colors.border, backgroundColor: colors.inputBg },
                    publishMode === 'now' && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setPublishMode('now')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="flash-outline" size={18} color={publishMode === 'now' ? '#fff' : colors.text} />
                  <Text style={[s.segmentBtnText, { color: publishMode === 'now' ? '#fff' : colors.text }]}>Now</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    s.segmentBtn,
                    { borderColor: colors.border, backgroundColor: colors.inputBg },
                    publishMode === 'later' && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => setPublishMode('later')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="time-outline" size={18} color={publishMode === 'later' ? '#fff' : colors.text} />
                  <Text style={[s.segmentBtnText, { color: publishMode === 'later' ? '#fff' : colors.text }]}>Later</Text>
                </TouchableOpacity>
              </View>

              {publishMode === 'later' && (() => {
                const hero = formatScheduleHero(publishLaterAt);
                return (
                  <View style={[s.scheduleHeroBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    <View style={s.scheduleHeroTopRow}>
                      <Pressable
                        style={s.scheduleHeroTimePress}
                        onPress={() => {
                          if (Platform.OS === 'ios') {
                            setIosScheduleSession({
                              field: 'publish',
                              step: 'time',
                              draft: new Date(publishLaterAt),
                            });
                          }
                          else
                            setAndroidScheduleSession({
                              field: 'publish',
                              step: 'time',
                              draft: new Date(publishLaterAt),
                            });
                        }}
                      >
                        <Text style={[s.datetimeHeroTime, { color: colors.text }]}>{hero.time}</Text>
                        <Text style={[s.scheduleHeroMicroHint, { color: colors.textTertiary }]}>Tap time</Text>
                      </Pressable>
                      <TouchableOpacity
                        style={[s.scheduleEditIconBtn, { borderColor: colors.border }]}
                        onPress={() => {
                          if (Platform.OS === 'ios') {
                            setIosScheduleSession({
                              field: 'publish',
                              step: 'date',
                              draft: new Date(publishLaterAt),
                            });
                          }
                          else
                            setAndroidScheduleSession({
                              field: 'publish',
                              step: 'date',
                              draft: new Date(publishLaterAt),
                            });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Edit publish date and time"
                      >
                        <Ionicons name="create-outline" size={22} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                    <Pressable
                      style={s.scheduleHeroDatePress}
                      onPress={() => {
                        if (Platform.OS === 'ios') {
                          setIosScheduleSession({
                            field: 'publish',
                            step: 'date',
                            draft: new Date(publishLaterAt),
                          });
                        }
                        else
                          setAndroidScheduleSession({
                            field: 'publish',
                            step: 'date',
                            draft: new Date(publishLaterAt),
                          });
                      }}
                    >
                      <Text style={[s.datetimeHeroDate, { color: colors.textSecondary }]}>{hero.date}</Text>
                      <Text style={[s.scheduleHeroMicroHint, { color: colors.textTertiary }]}>Tap date — then time</Text>
                    </Pressable>
                  </View>
                );
              })()}

              <View style={[s.scheduleDivider, { backgroundColor: colors.border }]} />

              <View style={s.pickupHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.scheduleSectionLabel, { color: colors.text, marginBottom: 4 }]}>Pickup time</Text>
                  <Text style={[s.scheduleHint, { color: colors.textSecondary }]}>Optional — for driver reminders</Text>
                </View>
                <TouchableOpacity
                  style={[s.switchTrack, { backgroundColor: pickupEnabled ? colors.primary : colors.border }]}
                  onPress={() => setPickupEnabled((e) => !e)}
                  activeOpacity={0.85}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: pickupEnabled }}
                >
                  <View style={[s.switchThumb, { marginLeft: pickupEnabled ? 24 : 2 }]} />
                </TouchableOpacity>
              </View>

              {pickupEnabled && (() => {
                const hero = formatScheduleHero(pickupAtDate);
                return (
                  <View style={[s.scheduleHeroBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    <View style={s.scheduleHeroTopRow}>
                      <Pressable
                        style={s.scheduleHeroTimePress}
                        onPress={() => {
                          if (Platform.OS === 'ios') {
                            setIosScheduleSession({
                              field: 'pickup',
                              step: 'time',
                              draft: new Date(pickupAtDate),
                            });
                          }
                          else
                            setAndroidScheduleSession({
                              field: 'pickup',
                              step: 'time',
                              draft: new Date(pickupAtDate),
                            });
                        }}
                      >
                        <Text style={[s.datetimeHeroTime, { color: colors.text }]}>{hero.time}</Text>
                        <Text style={[s.scheduleHeroMicroHint, { color: colors.textTertiary }]}>Tap time</Text>
                      </Pressable>
                      <TouchableOpacity
                        style={[s.scheduleEditIconBtn, { borderColor: colors.border }]}
                        onPress={() => {
                          if (Platform.OS === 'ios') {
                            setIosScheduleSession({
                              field: 'pickup',
                              step: 'date',
                              draft: new Date(pickupAtDate),
                            });
                          }
                          else
                            setAndroidScheduleSession({
                              field: 'pickup',
                              step: 'date',
                              draft: new Date(pickupAtDate),
                            });
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Edit pickup date and time"
                      >
                        <Ionicons name="create-outline" size={22} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                    <Pressable
                      style={s.scheduleHeroDatePress}
                      onPress={() => {
                        if (Platform.OS === 'ios') {
                          setIosScheduleSession({
                            field: 'pickup',
                            step: 'date',
                            draft: new Date(pickupAtDate),
                          });
                        }
                        else
                          setAndroidScheduleSession({
                            field: 'pickup',
                            step: 'date',
                            draft: new Date(pickupAtDate),
                          });
                      }}
                    >
                      <Text style={[s.datetimeHeroDate, { color: colors.textSecondary }]}>{hero.date}</Text>
                      <Text style={[s.scheduleHeroMicroHint, { color: colors.textTertiary }]}>Tap date — then time</Text>
                    </Pressable>
                  </View>
                );
              })()}
            </View>
          )}

          {/* ── Calculate Price Button ── */}
          <TouchableOpacity
            style={[s.primaryBtn, (!pickupAddress || !dropoffAddress) && s.primaryBtnDisabled]}
            onPress={handleCalculatePrice}
            disabled={loading || !pickupAddress || !dropoffAddress}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <>
                <Ionicons name="calculator-outline" size={22} color="white" style={{ marginRight: 8 }} />
                <Text style={s.primaryBtnText}>Calculate Price</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>

      {Platform.OS === 'ios' && (
        <Modal visible={iosScheduleSession !== null} transparent animationType="fade" onRequestClose={() => setIosScheduleSession(null)}>
          <Pressable style={s.pickerOverlay} onPress={() => setIosScheduleSession(null)}>
            <View style={[s.pickerSheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
              {iosScheduleSession !== null && (
                <>
                  <Text style={[s.pickerSheetTitle, { color: colors.text }]}>
                    {iosScheduleSession.field === 'publish' ? 'When to publish' : 'Pickup time'}
                    {iosScheduleSession.step === 'date' ? ' — date' : ' — time'}
                  </Text>
                  <DateTimePicker
                    value={iosScheduleSession.draft}
                    mode={iosScheduleSession.step === 'date' ? 'date' : 'time'}
                    display="spinner"
                    themeVariant={isDark ? 'dark' : 'light'}
                    onChange={(_, date) => {
                      if (!date) return;
                      setIosScheduleSession((sess) => {
                        if (!sess) return sess;
                        const merged =
                          sess.step === 'date' ? mergeDatePart(sess.draft, date) : mergeTimePart(sess.draft, date);
                        return { ...sess, draft: merged };
                      });
                    }}
                  />
                  {iosScheduleSession.step === 'date' ? (
                    <>
                      <TouchableOpacity
                        style={[s.pickerDoneBtn, { backgroundColor: colors.primary, marginTop: 4 }]}
                        onPress={() =>
                          setIosScheduleSession((sess) => (sess ? { ...sess, step: 'time' } : sess))
                        }
                      >
                        <Text style={s.pickerDoneBtnText}>Continue to time</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.pickerCancelBtn, { marginTop: 8 }]} onPress={() => setIosScheduleSession(null)}>
                        <Text style={[s.pickerCancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      style={[s.pickerDoneBtn, { backgroundColor: colors.primary, marginTop: 8 }]}
                      onPress={() => {
                        const sess = iosScheduleSessionRef.current;
                        if (!sess) return;
                        if (sess.field === 'publish') {
                          applyScheduleDates(sess.draft, pickupAtRef.current);
                        } else {
                          applyScheduleDates(publishLaterRef.current, sess.draft);
                        }
                        setIosScheduleSession(null);
                      }}
                    >
                      <Text style={s.pickerDoneBtnText}>Done</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </Pressable>
        </Modal>
      )}
      {Platform.OS === 'android' && androidScheduleSession && (
        <DateTimePicker
          key={`${androidScheduleSession.field}-${androidScheduleSession.step}`}
          value={androidScheduleSession.draft}
          mode={androidScheduleSession.step === 'date' ? 'date' : 'time'}
          display="default"
          onChange={(ev, date) => {
            const sess = androidScheduleSessionRef.current;
            if (!sess) return;
            if (ev?.type === 'dismissed') {
              setAndroidScheduleSession(null);
              return;
            }
            if (!date) return;
            const pub = publishLaterRef.current;
            const pick = pickupAtRef.current;
            if (sess.step === 'date') {
              if (ev?.type !== 'set') return;
              const mergedDate = mergeDatePart(sess.draft, date);
              setAndroidScheduleSession({ ...sess, step: 'time', draft: mergedDate });
              return;
            }
            if (ev?.type !== 'set') return;
            const mergedTime = mergeTimePart(sess.draft, date);
            if (sess.field === 'publish') {
              applyScheduleDates(mergedTime, pick);
            } else {
              applyScheduleDates(pub, mergedTime);
            }
            setAndroidScheduleSession(null);
          }}
        />
      )}

      <Modal visible={savedPickerVisible} transparent animationType="slide" onRequestClose={() => setSavedPickerVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: colors.card }]}>
            <View style={s.modalHeadRow}>
              <Text style={[s.modalTitle, { color: colors.text }]}>
                Select saved address for {savedPickerTarget === 'pickup' ? 'pickup' : 'delivery'}
              </Text>
              <TouchableOpacity onPress={() => setSavedPickerVisible(false)}>
                <Ionicons name="close-circle" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={[s.modalSearchBox, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
              <Ionicons name="search" size={16} color={colors.textTertiary} />
              <TextInput
                style={[s.modalSearchInput, { color: colors.text }]}
                placeholder="Search by nickname, street, area..."
                placeholderTextColor={colors.textTertiary}
                value={savedSearch}
                onChangeText={setSavedSearch}
              />
            </View>
            <FlatList
              data={filteredSavedAddresses}
              keyExtractor={(item) => item.addressId}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 340 }}
              ListHeaderComponent={
                recentAddresses.length > 0 ? (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={[s.recentTitle, { color: colors.textSecondary }]}>Recently used</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
                      {recentAddresses.map((r) => (
                        <TouchableOpacity
                          key={r.addressId}
                          style={[s.recentChip, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
                          onPress={() => {
                            if (savedPickerTarget === 'pickup') setPickupAddress(r);
                            else setDropoffAddress(r);
                            markRecentAddress(r.addressId);
                            setSavedPickerVisible(false);
                          }}
                        >
                          <Text style={[s.recentChipText, { color: colors.text }]} numberOfLines={1}>
                            {r.nickname || r.street || r.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                ) : null
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.modalItem, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    if (savedPickerTarget === 'pickup') setPickupAddress(item);
                    else setDropoffAddress(item);
                    markRecentAddress(item.addressId);
                    setSavedPickerVisible(false);
                  }}
                >
                  <Text style={[s.modalItemTitle, { color: colors.text }]}>{item.nickname || item.street || item.label}</Text>
                  <Text style={[s.modalItemSub, { color: colors.textSecondary }]} numberOfLines={1}>{item.sublabel}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={[s.modalEmpty, { color: colors.textTertiary }]}>No matching addresses</Text>}
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── Helper component ──
function PriceRow({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <View style={s.priceRow}>
      <Text style={s.priceLabel}>{label}</Text>
      <Text style={s.priceValue}>{value.toFixed(2)} {unit}</Text>
    </View>
  );
}

// ── Styles ──
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  localPickupCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  localPickupIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  localPickupCtaTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  localPickupCtaSub: { fontSize: 12, fontWeight: '500', marginTop: 3, lineHeight: 16 },
  previewEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  previewEditText: { fontSize: 15, fontWeight: '700' },

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 14 },

  // Address buttons
  addressBtn: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#e5e7eb', borderStyle: 'dashed', gap: 12,
  },
  addressBtnActive: { borderColor: '#bbf7d0', borderStyle: 'solid', backgroundColor: '#f0fdf4' },
  addressDot: { width: 12, height: 12, borderRadius: 6 },
  addressMainText: { fontSize: 14, fontWeight: '600', color: '#111827' },
  addressSubText: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  addressPlaceholder: { fontSize: 14, color: '#9ca3af' },
  addressFetching: { fontSize: 14, color: '#2563eb', fontWeight: '600' },
  inlineActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, backgroundColor: '#f3f4f6',
  },
  inlineActionTxt: { fontSize: 12, fontWeight: '700', color: '#374151' },
  smallSelectBtn: {
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#dcfce7', alignSelf: 'center',
  },
  smallSelectTxt: { color: '#166534', fontSize: 12, fontWeight: '700' },
  savedPickerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#dcfce7',
  },
  savedPickerBtnTxt: { fontSize: 12, fontWeight: '700' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 20,
  },
  modalHeadRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  modalSearchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, marginBottom: 10,
  },
  modalSearchInput: { flex: 1, height: 42, fontSize: 14 },
  modalItem: { paddingVertical: 10, borderBottomWidth: 1 },
  modalItemTitle: { fontSize: 14, fontWeight: '700' },
  modalItemSub: { fontSize: 12, marginTop: 2 },
  modalEmpty: { textAlign: 'center', paddingVertical: 22, fontSize: 13 },
  recentTitle: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  recentChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 180 },
  recentChipText: { fontSize: 12, fontWeight: '600' },
  connectorLine: {
    width: 2, height: 20, backgroundColor: '#e5e7eb', marginLeft: 19, marginVertical: 2,
  },

  // Payment
  paymentRow: { flexDirection: 'row', gap: 12 },
  paymentOption: {
    flex: 1, padding: 16, borderRadius: 14, alignItems: 'center',
    backgroundColor: '#f9fafb', borderWidth: 1.5, borderColor: '#e5e7eb',
  },
  paymentOptionActiveCash: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  paymentOptionActiveWallet: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  paymentEmoji: { fontSize: 28, marginBottom: 6 },
  paymentLabel: { fontSize: 15, fontWeight: '700', color: '#374151' },
  paymentSub: { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  // Weight
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 8 },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  weightBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
  weightInput: {
    flex: 1, height: 44, borderRadius: 12, backgroundColor: '#f9fafb',
    borderWidth: 1, borderColor: '#e5e7eb', fontSize: 18, fontWeight: '700', color: '#111',
  },
  descInput: {
    borderRadius: 12, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb',
    padding: 12, fontSize: 14, color: '#111', minHeight: 80,
  },
  extraStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 6,
  },
  extraStepperBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraStepperBtnDisabled: {
    opacity: 0.45,
  },
  extraStepperBtnText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#334155',
    lineHeight: 28,
  },
  extraStepperValueBox: {
    minWidth: 92,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  extraStepperValueText: {
    fontSize: 20,
    fontWeight: '700',
  },

  // Primary button
  primaryBtn: {
    flexDirection: 'row', height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0284c7', marginTop: 4,
    shadowColor: '#0284c7', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  primaryBtnDisabled: { backgroundColor: '#94a3b8', shadowOpacity: 0 },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  // Price preview
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  priceLabel: { fontSize: 14, color: '#6b7280' },
  priceValue: { fontSize: 14, fontWeight: '600', color: '#374151' },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 6 },
  totalLabel: { fontSize: 18, fontWeight: '800', color: '#111827' },
  totalValue: { fontSize: 20, fontWeight: '800', color: '#0284c7' },

  // Chips
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 5 },
  chipText: { fontSize: 13, fontWeight: '600' },

  // Route in preview
  routeRow: { flexDirection: 'row' },
  routeIconCol: { alignItems: 'center', marginRight: 14, paddingTop: 2 },
  routeDot: { width: 14, height: 14, borderRadius: 7 },
  routeLine: { width: 2, flex: 1, backgroundColor: '#e5e7eb', marginVertical: 4 },
  routeLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 2 },
  routeAddress: { fontSize: 15, fontWeight: '600', color: '#111827' },
  routeSub: { fontSize: 12, color: '#6b7280', marginTop: 1 },

  // Wallet banner
  walletBanner: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, gap: 10, marginBottom: 16 },
  walletBannerOk: { backgroundColor: '#f0fdf4' },
  walletBannerDanger: { backgroundColor: '#fef2f2' },
  walletText: { fontSize: 14, fontWeight: '600' },

  // Insufficient balance actions
  insufficientActions: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  insufficientBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
  insufficientBtnText: { fontSize: 14, fontWeight: '700' },

  // Active orders
  activeOrdersCard: {
    backgroundColor: '#fffbeb', borderRadius: 14, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#fde68a',
  },
  activeOrdersTitle: { fontSize: 13, fontWeight: '700', color: '#92400e', marginBottom: 8 },
  activeOrderItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#fde68a',
  },
  activeOrderDot: { width: 8, height: 8, borderRadius: 4 },
  activeOrderText: { fontSize: 13, color: '#78350f', fontWeight: '500' },
  activeOrderPrice: { fontSize: 13, fontWeight: '700', color: '#92400e' },

  // Validation
  validationError: { color: '#dc2626', fontSize: 12, fontWeight: '600', marginTop: 6 },

  scheduleToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  scheduleToggleIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleToggleTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  scheduleToggleSub: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  scheduleBadge: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },

  schedulePanel: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  schedulePanelLead: { fontSize: 13, lineHeight: 19, marginBottom: 18, fontWeight: '500' },
  scheduleSectionLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 10 },
  scheduleHint: { fontSize: 12, fontWeight: '500' },
  segmentRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segmentBtnText: { fontSize: 15, fontWeight: '800' },
  scheduleHeroBox: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  scheduleHeroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  scheduleHeroTimePress: { flex: 1, paddingVertical: 4 },
  scheduleHeroDatePress: { paddingVertical: 8, marginTop: 4 },
  scheduleEditIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleHeroMicroHint: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  datetimeHeroTime: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  datetimeHeroDate: { fontSize: 14, fontWeight: '600', marginTop: 4 },
  scheduleDivider: { height: StyleSheet.hairlineWidth, marginVertical: 16 },
  pickupHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  switchTrack: {
    width: 50,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },

  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  pickerSheet: {
    borderRadius: 18,
    padding: 16,
    paddingBottom: 12,
  },
  pickerSheetTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  pickerDoneBtn: {
    marginTop: 8,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerDoneBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  pickerCancelBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  pickerCancelBtnText: { fontSize: 15, fontWeight: '700' },
});
