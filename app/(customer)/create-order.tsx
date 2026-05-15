import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
  TextInput, KeyboardAvoidingView, Platform, StyleSheet, Modal, FlatList, Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { api } from '../../services/api/client';
import { orderService, Order } from '../../services/api/order.service';
import { requestNotificationBadgeRefresh, startOrderTracking } from '../../services/notifications';
import { useTheme } from '../../contexts/ThemeContext';
import { appAlert } from '../../utils/appAlert';
import { clampMinSchedule, mergePublishDatePart, mergePublishTimePart } from '../../utils/schedPublishHelpers';
import { EditProfileBiometricVerifyButton } from '../../components/EditProfileBiometricVerifyButton';
import { PasswordTextField } from '../../components/PasswordTextField';
import { getLocalAuthentication } from '../../utils/editProfileBiometricGate';
import {
  isOrderConfirmIdentityVerified,
  setOrderConfirmIdentityVerified,
} from '../../utils/createOrderStepUpSession';

const ORDER_BIO_ROUND_LIMIT = 5;

type OrderIdentityGateUi = 'hidden' | 'bio_retry_hint' | 'choice_panel' | 'password_mode';

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
  const surfaceSoft = isDark ? '#1f2937' : '#f9fafb';
  const surfaceMuted = isDark ? '#111827' : '#f3f4f6';
  const borderSoft = isDark ? '#374151' : '#e5e7eb';
  const successBg = isDark ? 'rgba(34,197,94,0.16)' : '#dcfce7';
  const successText = isDark ? '#86efac' : '#166534';
  const infoBg = isDark ? 'rgba(59,130,246,0.18)' : '#dbeafe';
  const infoText = isDark ? '#93c5fd' : '#1e40af';
  /** Selected pickup — dim green tint */
  const pickupSelectedBg = isDark ? 'rgba(34,197,94,0.14)' : '#f0fdf4';
  const pickupSelectedBorder = isDark ? 'rgba(74,222,128,0.45)' : '#86efac';
  /** Selected delivery (destination) — dim green, harmonious with dark bg */
  const dropoffSelectedBg = isDark ? 'rgba(16,185,129,0.16)' : '#ecfdf5';
  const dropoffSelectedBorder = isDark ? 'rgba(52,211,153,0.42)' : '#6ee7b7';

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
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [hasMainAddress, setHasMainAddress] = useState(false);
  const [savedPickerVisible, setSavedPickerVisible] = useState(false);
  const [savedPickerTarget, setSavedPickerTarget] = useState<'pickup' | 'dropoff'>('pickup');
  const [savedSearch, setSavedSearch] = useState('');
  const [recentAddressIds, setRecentAddressIds] = useState<string[]>([]);
  const [customerStatus, setCustomerStatus] = useState<string>('ACTIVE');
  const [scheduleLater, setScheduleLater] = useState(false);
  const [publishAt, setPublishAt] = useState(() => new Date(Date.now() + 15 * 60 * 1000));
  /** Android: `datetime` mode is invalid — use date then time (see @react-native-community/datetimepicker). */
  const [androidPublishStep, setAndroidPublishStep] = useState<'idle' | 'date' | 'time'>('idle');

  /** Face ID / fingerprint available — required before placing order (same session skip after first success). */
  const [orderBiometricAvailable, setOrderBiometricAvailable] = useState(false);
  const [userHasPassword, setUserHasPassword] = useState(true);
  const [orderGateUi, setOrderGateUi] = useState<OrderIdentityGateUi>('hidden');
  const [orderVerifyPassword, setOrderVerifyPassword] = useState('');
  const [orderVerifyBusy, setOrderVerifyBusy] = useState(false);
  const orderBioFailsRoundRef = useRef(0);

  const ACTIVE_STATUSES = ['PENDING_PUBLISH', 'SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PICKED_UP', 'DELIVERING'];

  useEffect(() => {
    if (!scheduleLater) setAndroidPublishStep('idle');
  }, [scheduleLater]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const LA = await getLocalAuthentication();
      if (!LA) {
        if (!cancelled) setOrderBiometricAvailable(false);
        return;
      }
      try {
        const hw = await LA.hasHardwareAsync();
        const enrolled = await LA.isEnrolledAsync();
        if (!cancelled) setOrderBiometricAvailable(!!(hw && enrolled));
      } catch {
        if (!cancelled) setOrderBiometricAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      const wallet = await api.get<{
        id: string;
        balance: number;
        spendable?: number;
        currency: string;
        discount: number;
      }>('/wallet/me');
      setWalletBalance(wallet.spendable ?? wallet.balance ?? 0);
    } catch {
      setWalletBalance(0);
    }
  }, []);

  // Fetch wallet balance on mount and when screen regains focus
  useEffect(() => { fetchWalletBalance(); }, [fetchWalletBalance]);
  useFocusEffect(useCallback(() => { fetchWalletBalance(); }, [fetchWalletBalance]));
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const me = await api.get<{
            customerStatus?: string;
            id: string;
            userId: string;
            completedOrders: number;
            user?: { hasPassword?: boolean };
          }>('/customers/me');
          const nextStatus = me?.customerStatus || 'ACTIVE';
          setCustomerStatus(nextStatus);
          setUserHasPassword(!!me?.user?.hasPassword);
          const raw = await AsyncStorage.getItem('customer');
          if (raw) {
            const customer = JSON.parse(raw);
            await AsyncStorage.setItem('customer', JSON.stringify({ ...customer, customerStatus: nextStatus }));
          }
        } catch {
          setCustomerStatus('ACTIVE');
        }
      })();
    }, []),
  );

  const loadSavedAddresses = useCallback(async () => {
    try {
      const rows = await api.get<
        { id: string; latitude: number | null; longitude: number | null; street: string | null; nickname: string | null; delegation: { nameDelegation: string; governorate: { nameGovernorate: string } } }[]
      >('/addresses');
      setHasMainAddress(rows.some((a) => String(a.nickname || '').toUpperCase() === 'MAIN'));
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
  useFocusEffect(
    useCallback(() => {
      void loadSavedAddresses();
    }, [loadSavedAddresses]),
  );
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
      appAlert('Error', e.message || 'Failed to save address');
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
        appAlert('Location', 'We need your permission to use the current position.');
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
    if (customerStatus === 'CREATED' && !hasMainAddress) {
      appAlert(
        'Address verification required',
        'Please add MAIN address to be verified before creating orders.',
        [
          {
            text: 'OK',
            onPress: () => router.push(`/(customer)/addresses?add=${Date.now()}` as never),
          },
        ],
      );
      return;
    }
    if (!pickupAddress || !dropoffAddress) {
      appAlert('Missing Address', 'Please select both pickup and delivery locations on the map.');
      return;
    }
    if (pickupAddress.addressId === dropoffAddress.addressId) {
      appAlert('Same Location', 'Pickup and delivery must be different locations.');
      return;
    }
    const w = parseFloat(weight);
    if (isNaN(w) || w <= 0) {
      appAlert('Invalid Weight', 'Please enter a valid package weight.');
      return;
    }
    if (cancelAfterMinutes > 1440) {
      appAlert('Invalid Timer', 'Auto-cancel time must be 24 hours or less.');
      return;
    }
    if (scheduleLater && publishAt.getTime() < Date.now() + 60 * 1000) {
      appAlert('Schedule', 'Publish time must be at least one minute from now.');
      return;
    }
    const ex = parseFloat((customerExtraAmount || '0').replace(',', '.'));
    if (Number.isNaN(ex) || ex < 0) {
      appAlert('Amount', 'Enter a valid optional extra amount (0 or more).');
      return;
    }
    if (ex > MAX_CUSTOMER_EXTRA) {
      appAlert('Amount', `Optional extra cannot exceed ${MAX_CUSTOMER_EXTRA}.`);
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
        scheduledPublishAt: scheduleLater ? publishAt.toISOString() : undefined,
      });
      setPreview(result);
      setCustomerExtraAmount(String(result.customerExtraAmount ?? ex));
      setStep('preview');
    } catch (e: any) {
      appAlert('Error', e.message || 'Failed to calculate price');
    } finally {
      setLoading(false);
    }
  };

  const runCreateOrder = async () => {
    if (!pickupAddress || !dropoffAddress || !preview) return;
    const ex = parseFloat((customerExtraAmount || '0').replace(',', '.'));
    if (Number.isNaN(ex) || ex < 0 || ex > MAX_CUSTOMER_EXTRA) {
      appAlert('Amount', `Enter a valid optional extra (0–${MAX_CUSTOMER_EXTRA}).`);
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
        scheduledPublishAt: scheduleLater ? publishAt.toISOString() : undefined,
      });
      orderBioFailsRoundRef.current = 0;
      setOrderGateUi('hidden');
      setOrderVerifyPassword('');
      const scheduled = order.status === 'PENDING_PUBLISH';
      try {
        await startOrderTracking(
          order.id,
          scheduled
            ? '📅 Order scheduled — waiting to go live'
            : '📦 Order Confirmed — Searching for a driver...',
          scheduled ? '◉———⌖———⌖———⌖———⌖———⌖———⌖' : '⛟———⌖———⌖———⌖———⌖———⌖———⌖',
          {
            orderId: order.id,
            orderStatus: scheduled ? 'PENDING_PUBLISH' : 'SEARCHING_DRIVER',
            groupKey: `order:${order.id}`,
            relatedEntityType: 'Order',
            relatedEntityId: order.id,
            ongoing: 'true',
          },
        );
      } catch (e) {
        console.warn('startOrderTracking after create:', e);
      }
      requestNotificationBadgeRefresh();

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
      setScheduleLater(false);
      setPublishAt(new Date(Date.now() + 15 * 60 * 1000));
      setPreview(null);
      setStep('form');
      try {
        const all = await orderService.getMyOrders();
        setActiveOrders(all.filter(o => ACTIVE_STATUSES.includes(o.status)));
      } catch {}
      router.replace(`/(customer)/order-detail?orderId=${order.id}`);
    } catch (e: any) {
      appAlert('Error', e.message || 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  const recordBiometricFailure = () => {
    orderBioFailsRoundRef.current += 1;
    if (orderBioFailsRoundRef.current >= ORDER_BIO_ROUND_LIMIT) {
      setOrderGateUi('choice_panel');
      orderBioFailsRoundRef.current = 0;
    } else {
      setOrderGateUi('bio_retry_hint');
    }
  };

  /** System Face ID / fingerprint prompt (no separate “tap to open” step on first confirm). */
  const attemptBiometricForOrder = async () => {
    setOrderVerifyBusy(true);
    try {
      const LA = await getLocalAuthentication();
      if (!LA) {
        appAlert('Unavailable', 'Biometric verification is not available. Rebuild the app or use password.');
        setOrderGateUi('bio_retry_hint');
        return;
      }
      const hw = await LA.hasHardwareAsync();
      const enrolled = await LA.isEnrolledAsync();
      if (!hw || !enrolled) {
        appAlert('Biometrics', 'Set up Face ID or fingerprint on your device first.');
        setOrderGateUi('bio_retry_hint');
        return;
      }
      const auth = await LA.authenticateAsync({
        promptMessage: 'Confirm to place this order',
        cancelLabel: 'Cancel',
        disableDeviceFallback: true,
      });
      if (auth.success) {
        setOrderConfirmIdentityVerified(true);
        orderBioFailsRoundRef.current = 0;
        setOrderGateUi('hidden');
        setOrderVerifyPassword('');
        await runCreateOrder();
        return;
      }
      if (auth.error === 'user_cancel' || auth.error === 'system_cancel') {
        setOrderGateUi('bio_retry_hint');
        return;
      }
      recordBiometricFailure();
    } catch (e: any) {
      appAlert('Error', e?.message || 'Verification failed.');
      recordBiometricFailure();
    } finally {
      setOrderVerifyBusy(false);
    }
  };

  const handleOrderVerifyPassword = async () => {
    if (!orderVerifyPassword.trim()) return;
    setOrderVerifyBusy(true);
    try {
      await api.post('/auth/verify-password', { password: orderVerifyPassword.trim() });
      setOrderConfirmIdentityVerified(true);
      orderBioFailsRoundRef.current = 0;
      setOrderGateUi('hidden');
      setOrderVerifyPassword('');
      await runCreateOrder();
    } catch (e: any) {
      appAlert('Verification failed', e?.message || 'Invalid password.');
    } finally {
      setOrderVerifyBusy(false);
    }
  };

  const handleConfirmOrder = async () => {
    if (!pickupAddress || !dropoffAddress || !preview) return;
    const ex = parseFloat((customerExtraAmount || '0').replace(',', '.'));
    if (Number.isNaN(ex) || ex < 0 || ex > MAX_CUSTOMER_EXTRA) {
      appAlert('Amount', `Enter a valid optional extra (0–${MAX_CUSTOMER_EXTRA}).`);
      return;
    }

    if (customerStatus === 'CREATED') {
      Alert.alert(
        'Sorry',
        'Only ACTIVE customers can create orders.\n\nAdd an address to become ACTIVE.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add address to become ACTIVE',
            onPress: () => {
              router.push(`/(customer)/addresses?add=${Date.now()}` as never);
            },
          },
        ],
      );
      return;
    }

    const needsBiometricGate = orderBiometricAvailable;
    const sessionOk = isOrderConfirmIdentityVerified();

    if (!needsBiometricGate || sessionOk) {
      await runCreateOrder();
      return;
    }

    if (orderGateUi === 'choice_panel') {
      appAlert('Choose an option', 'Use Face ID — Fingerprint or your password above.');
      return;
    }
    if (orderGateUi === 'password_mode') {
      appAlert('Password', 'Enter your password and tap Verify password.');
      return;
    }

    await attemptBiometricForOrder();
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
        scheduledPublishAt: scheduleLater ? publishAt.toISOString() : undefined,
      });
      setPreview(result);
      setCustomerExtraAmount(String(result.customerExtraAmount ?? extraOk));
    } catch (e: any) {
      appAlert('Error', e.message || 'Failed to recalculate price');
    }
  };

  /** Re-run preview after customer changes optional extra on the summary screen. */
  const handleUpdatePreviewExtra = async (overrideExtraAmount?: number) => {
    if (!pickupAddress || !dropoffAddress) return;
    const ex = typeof overrideExtraAmount === 'number'
      ? overrideExtraAmount
      : parseFloat((customerExtraAmount || '0').replace(',', '.'));
    if (Number.isNaN(ex) || ex < 0) {
      appAlert('Amount', 'Enter a valid optional extra amount (0 or more).');
      return;
    }
    if (ex > MAX_CUSTOMER_EXTRA) {
      appAlert('Amount', `Optional extra cannot exceed ${MAX_CUSTOMER_EXTRA}.`);
      return;
    }
    const w = parseFloat(weight);
    if (Number.isNaN(w) || w <= 0) {
      appAlert('Weight', 'Go back and enter a valid weight.');
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
        scheduledPublishAt: scheduleLater ? publishAt.toISOString() : undefined,
      });
      setPreview(result);
      setCustomerExtraAmount(String(result.customerExtraAmount ?? ex));
    } catch (e: any) {
      appAlert('Error', e.message || 'Failed to update price');
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
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <TouchableOpacity
            style={[s.previewEditRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              orderBioFailsRoundRef.current = 0;
              setOrderGateUi('hidden');
              setOrderVerifyPassword('');
              setStep('form');
            }}
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
                <View style={[s.routeLine, { backgroundColor: colors.border }]} />
                <View style={[s.routeDot, { backgroundColor: '#ef4444' }]} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ marginBottom: 20 }}>
                  <Text style={[s.routeLabel, { color: colors.textTertiary }]}>PICKUP</Text>
                  <Text style={[s.routeAddress, { color: colors.text }]}>{pickupAddress?.label}</Text>
                  <Text style={[s.routeSub, { color: colors.textSecondary }]}>{pickupAddress?.sublabel}</Text>
                </View>
                <View>
                  <Text style={[s.routeLabel, { color: colors.textTertiary }]}>DELIVERY</Text>
                  <Text style={[s.routeAddress, { color: colors.text }]}>{dropoffAddress?.label}</Text>
                  <Text style={[s.routeSub, { color: colors.textSecondary }]}>{dropoffAddress?.sublabel}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Info chips */}
          <View style={s.chipsRow}>
            <View style={[s.chip, { backgroundColor: isCash ? successBg : infoBg }]}>
              <Text style={{ fontSize: 14 }}>{isCash ? '💵' : '💰'}</Text>
              <Text style={[s.chipText, { color: isCash ? successText : infoText }]}>
                {isCash ? 'Cash' : 'Wallet'}
              </Text>
            </View>
            <View style={[s.chip, { backgroundColor: surfaceMuted }]}>
              <Text style={{ fontSize: 14 }}>📦</Text>
              <Text style={[s.chipText, { color: colors.text }]}>{weight} kg</Text>
            </View>
            <View style={[s.chip, { backgroundColor: surfaceMuted }]}>
              <Text style={{ fontSize: 14 }}>📏</Text>
              <Text style={[s.chipText, { color: colors.text }]}>{preview.distanceKm.toFixed(1)} km</Text>
            </View>
            {preview.isNightDelivery && (
              <View style={[s.chip, { backgroundColor: isDark ? 'rgba(129,140,248,0.22)' : '#e0e7ff' }]}>
                <Text style={{ fontSize: 14 }}>🌙</Text>
                <Text style={[s.chipText, { color: isDark ? '#c4b5fd' : '#3730a3' }]}>Night</Text>
              </View>
            )}
            {scheduleLater && (
              <View style={[s.chip, { backgroundColor: isDark ? 'rgba(14,165,233,0.2)' : '#e0f2fe' }]}>
                <Text style={{ fontSize: 14 }}>📅</Text>
                <Text style={[s.chipText, { color: colors.primary }]}>
                  Live {publishAt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                </Text>
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
                <Text style={[s.extraStepperBtnText, { color: colors.text }]}>-</Text>
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
                <Text style={[s.extraStepperBtnText, { color: colors.text }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Price breakdown */}
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Price Breakdown</Text>
            <PriceRow label="Base Fee" value={preview.baseFee} unit={unit} labelColor={colors.textSecondary} valueColor={colors.text} />
            <PriceRow label="Distance Fee" value={preview.distanceFee} unit={unit} labelColor={colors.textSecondary} valueColor={colors.text} />
            {preview.extraWeightFee > 0 && (
              <PriceRow label="Extra Weight" value={preview.extraWeightFee} unit={unit} labelColor={colors.textSecondary} valueColor={colors.text} />
            )}
            {preview.nightFee > 0 && (
              <PriceRow label="Night Fee 🌙" value={preview.nightFee} unit={unit} labelColor={colors.textSecondary} valueColor={colors.text} />
            )}
            <View style={[s.divider, { backgroundColor: colors.border }]} />
            <PriceRow
              label="Delivery (calculated)"
              value={preview.calculatedPrice}
              unit={unit}
              labelColor={colors.textSecondary}
              valueColor={colors.text}
            />
            {preview.customerExtraAmount > 0 && (
              <PriceRow
                label="Your extra (driver time / errand)"
                value={preview.customerExtraAmount}
                unit={unit}
                labelColor={colors.textSecondary}
                valueColor={colors.text}
              />
            )}
            <View style={[s.divider, { backgroundColor: colors.border }]} />
            <View style={s.priceRow}>
              <Text style={[s.totalLabel, { color: colors.text }]}>Total</Text>
              <Text style={[s.totalValue, { color: colors.primary }]}>{preview.totalPrice.toFixed(2)} {unit}</Text>
            </View>
          </View>

          {/* Wallet balance warning / Insufficient balance prompt */}
          {!isCash && preview.walletBalance !== null && (
            <View style={[s.walletBanner, { backgroundColor: insufficientWallet ? (isDark ? 'rgba(239,68,68,0.16)' : '#fef2f2') : (isDark ? 'rgba(34,197,94,0.16)' : '#f0fdf4') }]}>
              <Ionicons name="wallet-outline" size={18} color={insufficientWallet ? colors.danger : colors.success} />
              <Text style={[s.walletText, { color: insufficientWallet ? colors.danger : colors.success }]}>
                Balance: {preview.walletBalance.toFixed(2)} coins
                {insufficientWallet ? ' — Insufficient funds' : ''}
              </Text>
            </View>
          )}

          {/* Insufficient balance action buttons */}
          {insufficientWallet && (
            <View style={s.insufficientActions}>
              <TouchableOpacity
                style={[s.insufficientBtn, { backgroundColor: isDark ? 'rgba(59,130,246,0.2)' : '#dbeafe' }]}
                onPress={() => router.push('/(customer)/buy-coins')}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={18} color={isDark ? '#93c5fd' : '#1e40af'} />
                <Text style={[s.insufficientBtnText, { color: isDark ? '#93c5fd' : '#1e40af' }]}>Add Coins</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.insufficientBtn, { backgroundColor: isDark ? 'rgba(34,197,94,0.2)' : '#dcfce7' }]}
                onPress={handleSwitchToCash}
                activeOpacity={0.7}
              >
                <Ionicons name="cash-outline" size={18} color={isDark ? '#86efac' : '#166534'} />
                <Text style={[s.insufficientBtnText, { color: isDark ? '#86efac' : '#166534' }]}>Switch to Cash</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Step-up: first Confirm opens system biometrics; after fail → hint or password; 5 fails/round → choice panel */}
          {orderGateUi === 'bio_retry_hint' && orderBiometricAvailable && !isOrderConfirmIdentityVerified() && (
            <View
              style={[
                s.orderBioHintBanner,
                { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
              ]}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
                Biometric verification did not complete. Tap Confirm Order to try again
                {userHasPassword ? ', or use your password below.' : '.'}
              </Text>
              {userHasPassword ? (
                <TouchableOpacity
                  onPress={() => setOrderGateUi('password_mode')}
                  disabled={orderVerifyBusy}
                  style={s.orderVerifyHintWrap}
                >
                  <Text style={[s.orderVerifyHint, { color: colors.primary }]}>Use password instead</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {orderGateUi === 'choice_panel' && orderBiometricAvailable && !isOrderConfirmIdentityVerified() && (
            <View
              style={[
                s.orderVerifyCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[s.orderVerifyTitle, { color: colors.text }]}>How would you like to confirm?</Text>
              <Text style={[s.orderVerifySub, { color: colors.textSecondary }]}>
                Choose Face ID / fingerprint or your account password.
              </Text>
              <EditProfileBiometricVerifyButton
                onPress={() => {
                  orderBioFailsRoundRef.current = 0;
                  void attemptBiometricForOrder();
                }}
                verifying={orderVerifyBusy}
                disabled={orderVerifyBusy}
                colors={colors}
              />
              {userHasPassword ? (
                <TouchableOpacity
                  onPress={() => setOrderGateUi('password_mode')}
                  disabled={orderVerifyBusy}
                  style={s.orderVerifyHintWrap}
                >
                  <Text style={[s.orderVerifyHint, { color: colors.primary }]}>Use password instead</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {orderGateUi === 'password_mode' && orderBiometricAvailable && !isOrderConfirmIdentityVerified() && userHasPassword && (
            <View
              style={[
                s.orderVerifyCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[s.orderVerifyTitle, { color: colors.text }]}>Password</Text>
              <PasswordTextField
                value={orderVerifyPassword}
                onChangeText={setOrderVerifyPassword}
                colors={colors}
                placeholder="Account password"
                editable={!orderVerifyBusy}
                containerStyle={{ marginBottom: 12 }}
              />
              <TouchableOpacity
                style={[
                  s.secondaryVerifyBtn,
                  { backgroundColor: colors.primary },
                  (!orderVerifyPassword.trim() || orderVerifyBusy) && { opacity: 0.5 },
                ]}
                onPress={handleOrderVerifyPassword}
                disabled={!orderVerifyPassword.trim() || orderVerifyBusy}
                activeOpacity={0.85}
              >
                {orderVerifyBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.secondaryVerifyBtnText}>Verify password</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  orderBioFailsRoundRef.current = 0;
                  setOrderGateUi('hidden');
                  setOrderVerifyPassword('');
                }}
                disabled={orderVerifyBusy}
                style={s.orderVerifyHintWrap}
              >
                <Text style={[s.orderVerifyHint, { color: colors.primary }]}>
                  Use Face ID / fingerprint
                </Text>
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
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
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
            <View style={[s.activeOrdersCard, { backgroundColor: isDark ? 'rgba(180,83,9,0.18)' : '#fffbeb', borderColor: isDark ? '#92400e' : '#fde68a' }]}>
              <Text style={[s.activeOrdersTitle, { color: isDark ? '#fcd34d' : '#92400e' }]}>📦 Active Orders ({activeOrders.length})</Text>
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
                    <Text style={[s.activeOrderText, { color: isDark ? '#fde68a' : '#78350f' }]}>#{o.id.slice(0, 8)} — {o.status.replace(/_/g, ' ')}</Text>
                  </View>
                  <Text style={[s.activeOrderPrice, { color: isDark ? '#f59e0b' : '#92400e' }]}>{o.price.toFixed(2)}</Text>
                  <Ionicons name="chevron-forward" size={14} color={isDark ? '#d1d5db' : '#9ca3af'} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* ── Addresses ── */}
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Route</Text>

            {/* Pickup */}
            <View
              style={[
                s.addressBtn,
                { backgroundColor: surfaceSoft, borderColor: borderSoft },
                pickupAddress && {
                  borderColor: pickupSelectedBorder,
                  borderStyle: 'solid',
                  backgroundColor: pickupSelectedBg,
                },
              ]}
            >
              <View style={[s.addressDot, { backgroundColor: pickupAddress ? '#22c55e' : colors.border }]} />
              <View style={{ flex: 1 }}>
                {resolvingPickup ? (
                  <Text style={[s.addressFetching, { color: colors.primary }]}>Fetching your current position...</Text>
                ) : pickupAddress ? (
                  <>
                    <Text style={[s.addressMainText, { color: colors.text }]}>{pickupAddress.label}</Text>
                    <Text style={[s.addressSubText, { color: colors.textSecondary }]}>{pickupAddress.sublabel}</Text>
                  </>
                ) : (
                  <Text style={[s.addressPlaceholder, { color: colors.textTertiary }]}>Tap to select pickup location</Text>
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity style={[s.inlineActionBtn, { backgroundColor: surfaceMuted }]} onPress={() => openMapPicker('pickup')} activeOpacity={0.7}>
                    <Ionicons name="map-outline" size={16} color="#16a34a" />
                    <Text style={[s.inlineActionTxt, { color: colors.text }]}>Map</Text>
                  </TouchableOpacity>
                  {savedAddresses.length > 0 && (
                    <TouchableOpacity style={[s.inlineActionBtn, { backgroundColor: surfaceMuted }]} onPress={() => openSavedPicker('pickup')} activeOpacity={0.7}>
                      <Ionicons name="list-outline" size={16} color="#166534" />
                      <Text style={[s.inlineActionTxt, { color: colors.text }]}>List</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[s.inlineActionBtn, { backgroundColor: surfaceMuted }]} onPress={() => useMyLocation('pickup')} disabled={resolvingPickup} activeOpacity={0.7}>
                    <Ionicons name="locate" size={16} color="#2563eb" />
                    <Text style={[s.inlineActionTxt, { color: colors.text }]}>My Position</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Connector line */}
            <View style={[s.connectorLine, { backgroundColor: colors.border }]} />

            {/* Dropoff */}
            <View
              style={[
                s.addressBtn,
                { backgroundColor: surfaceSoft, borderColor: borderSoft },
                dropoffAddress && {
                  borderColor: dropoffSelectedBorder,
                  borderStyle: 'solid',
                  backgroundColor: dropoffSelectedBg,
                },
              ]}
            >
              <View style={[s.addressDot, { backgroundColor: dropoffAddress ? '#ef4444' : colors.border }]} />
              <View style={{ flex: 1 }}>
                {resolvingDropoff ? (
                  <Text style={[s.addressFetching, { color: colors.primary }]}>Fetching your current position...</Text>
                ) : dropoffAddress ? (
                  <>
                    <Text style={[s.addressMainText, { color: colors.text }]}>{dropoffAddress.label}</Text>
                    <Text style={[s.addressSubText, { color: colors.textSecondary }]}>{dropoffAddress.sublabel}</Text>
                  </>
                ) : (
                  <Text style={[s.addressPlaceholder, { color: colors.textTertiary }]}>Tap to select delivery location</Text>
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity style={[s.inlineActionBtn, { backgroundColor: surfaceMuted }]} onPress={() => openMapPicker('dropoff')} activeOpacity={0.7}>
                    <Ionicons name="map-outline" size={16} color="#ef4444" />
                    <Text style={[s.inlineActionTxt, { color: colors.text }]}>Map</Text>
                  </TouchableOpacity>
                  {savedAddresses.length > 0 && (
                    <TouchableOpacity style={[s.inlineActionBtn, { backgroundColor: surfaceMuted }]} onPress={() => openSavedPicker('dropoff')} activeOpacity={0.7}>
                      <Ionicons name="list-outline" size={16} color="#b91c1c" />
                      <Text style={[s.inlineActionTxt, { color: colors.text }]}>List</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[s.inlineActionBtn, { backgroundColor: surfaceMuted }]} onPress={() => useMyLocation('dropoff')} disabled={resolvingDropoff} activeOpacity={0.7}>
                    <Ionicons name="locate" size={16} color="#2563eb" />
                    <Text style={[s.inlineActionTxt, { color: colors.text }]}>My Position</Text>
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
                    style={[s.descInput, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
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
                    style={[s.descInput, { color: colors.text, borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}
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
                style={[
                  s.paymentOption,
                  { backgroundColor: surfaceSoft, borderColor: borderSoft },
                  paymentType === 'COD' && s.paymentOptionActiveCash,
                ]}
                onPress={() => setPaymentType('COD')}
                activeOpacity={0.7}
              >
                <Text style={s.paymentEmoji}>💵</Text>
                <Text style={[s.paymentLabel, { color: colors.text }, paymentType === 'COD' && { color: '#fff' }]}>Cash</Text>
                <Text style={[s.paymentSub, { color: colors.textSecondary }, paymentType === 'COD' && { color: 'rgba(255,255,255,0.8)' }]}>Pay on delivery</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  s.paymentOption,
                  { backgroundColor: surfaceSoft, borderColor: borderSoft },
                  paymentType === 'WALLET' && s.paymentOptionActiveWallet,
                ]}
                onPress={() => setPaymentType('WALLET')}
                activeOpacity={0.7}
              >
                <Text style={s.paymentEmoji}>💰</Text>
                <Text style={[s.paymentLabel, { color: colors.text }, paymentType === 'WALLET' && { color: '#fff' }]}>Wallet</Text>
                <Text style={[s.paymentSub, { color: colors.textSecondary }, paymentType === 'WALLET' && { color: 'rgba(255,255,255,0.8)' }]}>Use coins</Text>
                <Text style={[s.paymentSub, { color: colors.textSecondary }, paymentType === 'WALLET' && { color: 'rgba(255,255,255,0.8)' }]}>{walletBalance} coins</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Package Details ── */}
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Package Details</Text>

            <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Weight (kg)</Text>
            <View style={s.weightRow}>
              <TouchableOpacity style={[s.weightBtn, { backgroundColor: surfaceMuted }]} onPress={() => {
                const w = Math.max(0.5, parseFloat(weight || '1') - 0.5);
                setWeight(String(w));
              }}>
                <Ionicons name="remove" size={20} color={colors.text} />
              </TouchableOpacity>
              <TextInput
                style={[s.weightInput, { backgroundColor: surfaceSoft, borderColor: borderSoft, color: colors.text }]}
                value={weight}
                onChangeText={setWeight}
                keyboardType="numeric"
                textAlign="center"
              />
              <TouchableOpacity style={[s.weightBtn, { backgroundColor: surfaceMuted }]} onPress={() => {
                const w = parseFloat(weight || '1') + 0.5;
                setWeight(String(w));
              }}>
                <Ionicons name="add" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={[s.inputLabel, { marginTop: 16 }]}>Description (optional)</Text>
            <TextInput
              style={[s.descInput, { backgroundColor: surfaceSoft, borderColor: borderSoft, color: colors.text }]}
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
            <Text style={[s.inputLabel, { color: colors.textSecondary }]}>Cancel if no driver responds (minutes)</Text>
            <View style={s.weightRow}>
              <TouchableOpacity style={[s.weightBtn, { backgroundColor: surfaceMuted }]} onPress={() => {
                setCancelAfterMinutes(prev => Math.max(15, prev - 1));
              }}>
                <Ionicons name="remove" size={20} color={colors.text} />
              </TouchableOpacity>
              <TextInput
                style={[s.weightInput, { backgroundColor: surfaceSoft, borderColor: borderSoft, color: colors.text }]}
                value={String(cancelAfterMinutes)}
                onChangeText={(text) => {
                  const num = parseInt(text, 10);
                  setCancelAfterMinutes(isNaN(num) ? 0 : num);
                }}
                keyboardType="numeric"
                textAlign="center"
              />
              <TouchableOpacity style={[s.weightBtn, { backgroundColor: surfaceMuted }]} onPress={() => {
                setCancelAfterMinutes(prev => Math.min(1440, prev + 1));
              }}>
                <Ionicons name="add" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            {cancelAfterMinutes > 1440 && (
              <Text style={[s.validationError, { color: colors.danger }]}>Must be 1440 minutes (24h) or less</Text>
            )}
          </View>

          {/* ── Publish to drivers later ── */}
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[s.cardTitle, { color: colors.text }]}>Publish time</Text>
                <Text style={[s.inputLabel, { color: colors.textSecondary }]}>
                  Drivers only see your order at this time (notifications go out then too).
                </Text>
              </View>
              <Switch
                value={scheduleLater}
                onValueChange={setScheduleLater}
                trackColor={{ false: colors.border, true: colors.primaryLight }}
                thumbColor={scheduleLater ? colors.primary : colors.surfaceVariant}
              />
            </View>
            {scheduleLater && (
              <>
                {Platform.OS === 'android' ? (
                  <TouchableOpacity
                    style={[s.schedulePickBtn, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                    onPress={() => setAndroidPublishStep('date')}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                    <Text style={[s.schedulePickText, { color: colors.text }]}>
                      {publishAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[s.schedulePickBtn, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
                    <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                    <Text style={[s.schedulePickText, { color: colors.text }]}>
                      {publishAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </Text>
                  </View>
                )}
                {scheduleLater && Platform.OS === 'ios' && (
                  <DateTimePicker
                    value={publishAt}
                    mode="datetime"
                    display="compact"
                    minimumDate={new Date(Date.now() + 60 * 1000)}
                    themeVariant={isDark ? 'dark' : 'light'}
                    onValueChange={(_, d) => {
                      setPublishAt(d);
                    }}
                  />
                )}
                {scheduleLater && Platform.OS === 'android' && androidPublishStep === 'date' && (
                  <DateTimePicker
                    value={publishAt}
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    onDismiss={() => setAndroidPublishStep('idle')}
                    onValueChange={(_, d) => {
                      setPublishAt((prev) => clampMinSchedule(mergePublishDatePart(prev, d)));
                      setAndroidPublishStep('time');
                    }}
                  />
                )}
                {scheduleLater && Platform.OS === 'android' && androidPublishStep === 'time' && (
                  <DateTimePicker
                    value={publishAt}
                    mode="time"
                    display="default"
                    onDismiss={() => setAndroidPublishStep('idle')}
                    onValueChange={(_, d) => {
                      setPublishAt((prev) => clampMinSchedule(mergePublishTimePart(prev, d)));
                      setAndroidPublishStep('idle');
                    }}
                  />
                )}
              </>
            )}
          </View>

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
function PriceRow({
  label,
  value,
  unit,
  labelColor,
  valueColor,
}: {
  label: string;
  value: number;
  unit: string;
  labelColor?: string;
  valueColor?: string;
}) {
  return (
    <View style={s.priceRow}>
      <Text style={[s.priceLabel, labelColor ? { color: labelColor } : undefined]}>{label}</Text>
      <Text style={[s.priceValue, valueColor ? { color: valueColor } : undefined]}>{value.toFixed(2)} {unit}</Text>
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

  orderBioHintBanner: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  orderVerifyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  orderVerifyTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  orderVerifySub: { fontSize: 12, fontWeight: '500', marginBottom: 14 },
  orderVerifyHintWrap: { marginTop: 12, alignItems: 'center' },
  orderVerifyHint: { fontSize: 12, fontWeight: '600' },
  secondaryVerifyBtn: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryVerifyBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

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
  schedulePickBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  schedulePickText: { fontSize: 15, fontWeight: '700', flex: 1 },
});
