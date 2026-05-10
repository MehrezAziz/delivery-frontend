/**
 * Local pickup: driver brings goods to customer (medicine, food, etc.).
 * Single address only; priced as ≤2 km within delegation (backend).
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Modal,
  FlatList,
  Switch,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { api } from '../../services/api/client';
import { orderService } from '../../services/api/order.service';
import { requestNotificationBadgeRefresh, startOrderTracking } from '../../services/notifications';
import { useTheme } from '../../contexts/ThemeContext';
import { appAlert } from '../../utils/appAlert';
import { clampMinSchedule, mergePublishDatePart, mergePublishTimePart } from '../../utils/schedPublishHelpers';
import { getLocalAuthentication } from '../../utils/editProfileBiometricGate';
import {
  isOrderConfirmIdentityVerified,
  setOrderConfirmIdentityVerified,
} from '../../utils/createOrderStepUpSession';
import { EditProfileBiometricVerifyButton } from '../../components/EditProfileBiometricVerifyButton';
import { PasswordTextField } from '../../components/PasswordTextField';

interface SavedAddress {
  addressId: string;
  label: string;
  sublabel: string;
  lat: number;
  lng: number;
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

const RECENT_LOCAL_ADDR_KEY = 'recent_local_pickup_addresses';
const MAX_CUSTOMER_EXTRA = 10000;
const LOCAL_PICKUP_MIN_CANCEL_MINUTES = 5;
const LOCAL_PICKUP_MAX_CANCEL_MINUTES = 240;
const ORDER_BIO_ROUND_LIMIT = 5;

type OrderIdentityGateUi = 'hidden' | 'bio_retry_hint' | 'choice_panel' | 'password_mode';

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
    <View style={ps.priceRow}>
      <Text style={[ps.priceLabel, labelColor ? { color: labelColor } : undefined]}>{label}</Text>
      <Text style={[ps.priceValue, valueColor ? { color: valueColor } : undefined]}>
        {value.toFixed(2)} {unit}
      </Text>
    </View>
  );
}

export default function LocalPickupOrderScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const backToNewOrder = '/(customer)/create-order';
  const surfaceSoft = isDark ? '#1f2937' : '#f9fafb';
  const surfaceMuted = isDark ? '#111827' : '#f3f4f6';
  const borderSoft = isDark ? '#374151' : '#e5e7eb';
  const selectedBg = isDark ? 'rgba(16,185,129,0.16)' : '#ecfdf5';
  const selectedText = isDark ? '#a7f3d0' : '#166534';
  const successBg = isDark ? 'rgba(34,197,94,0.16)' : '#dcfce7';
  const successText = isDark ? '#86efac' : '#166534';
  const infoBg = isDark ? 'rgba(59,130,246,0.18)' : '#dbeafe';
  const infoText = isDark ? '#93c5fd' : '#1e40af';

  const [step, setStep] = useState<'form' | 'preview'>('form');
  const [source, setSource] = useState<SavedAddress | null>(null);
  const [paymentType, setPaymentType] = useState<'COD' | 'WALLET'>('COD');
  const [weight, setWeight] = useState('1');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [savedList, setSavedList] = useState<SavedAddress[]>([]);
  const [savedPickerVisible, setSavedPickerVisible] = useState(false);
  const [savedSearch, setSavedSearch] = useState('');
  const [recentAddressIds, setRecentAddressIds] = useState<string[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [cancelAfterMinutes, setCancelAfterMinutes] = useState(LOCAL_PICKUP_MIN_CANCEL_MINUTES);
  const [customerExtraAmount, setCustomerExtraAmount] = useState('0');
  const [scheduleLater, setScheduleLater] = useState(false);
  const [publishAt, setPublishAt] = useState(() => new Date(Date.now() + 15 * 60 * 1000));
  const [androidPublishStep, setAndroidPublishStep] = useState<'idle' | 'date' | 'time'>('idle');
  const [preview, setPreview] = useState<PricePreview | null>(null);
  /** Shown when user taps Calculate price without address or description — drives red frames + copy. */
  const [priceGateHighlight, setPriceGateHighlight] = useState<'none' | 'address' | 'description'>('none');
  const [customerStatus, setCustomerStatus] = useState<string>('ACTIVE');
  const [orderBiometricAvailable, setOrderBiometricAvailable] = useState(false);
  const [userHasPassword, setUserHasPassword] = useState(true);
  const [orderGateUi, setOrderGateUi] = useState<OrderIdentityGateUi>('hidden');
  const [orderVerifyPassword, setOrderVerifyPassword] = useState('');
  const [orderVerifyBusy, setOrderVerifyBusy] = useState(false);
  const orderBioFailsRoundRef = useRef(0);

  const fetchWallet = useCallback(async () => {
    try {
      const w = await api.get<{ balance: number }>('/wallet/me');
      setWalletBalance(w.balance ?? 0);
    } catch {
      setWalletBalance(0);
    }
  }, []);
  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);
  useFocusEffect(
    useCallback(() => {
      fetchWallet();
      void (async () => {
        try {
          const me = await api.get<{ customerStatus?: string; user?: { hasPassword?: boolean } }>('/customers/me');
          setCustomerStatus(me?.customerStatus || 'ACTIVE');
          setUserHasPassword(!!me?.user?.hasPassword);
        } catch {
          /* ignore */
        }
      })();
    }, [fetchWallet]),
  );

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

  useEffect(() => {
    if (!scheduleLater) setAndroidPublishStep('idle');
  }, [scheduleLater]);

  useEffect(() => {
    if (source && priceGateHighlight === 'address') setPriceGateHighlight('none');
  }, [source, priceGateHighlight]);

  const priceFormReady = Boolean(source) && description.trim().length > 0;

  const loadSaved = useCallback(async () => {
    try {
      const rows = await api.get<
        {
          id: string;
          latitude: number | null;
          longitude: number | null;
          street: string | null;
          nickname: string | null;
          delegation: { nameDelegation: string; governorate: { nameGovernorate: string } };
        }[]
      >('/addresses');
      const list: SavedAddress[] = [];
      for (const a of rows) {
        if (a.latitude == null || a.longitude == null) continue;
        list.push({
          addressId: a.id,
          label: a.nickname || a.street || `${a.latitude.toFixed(4)}, ${a.longitude.toFixed(4)}`,
          sublabel: `${a.delegation.nameDelegation}, ${a.delegation.governorate.nameGovernorate}`,
          lat: a.latitude,
          lng: a.longitude,
        });
      }
      setSavedList(list);
    } catch {
      setSavedList([]);
    }
  }, []);
  useEffect(() => {
    loadSaved();
  }, [loadSaved]);
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(RECENT_LOCAL_ADDR_KEY);
        if (raw) setRecentAddressIds(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const resolveFromCoords = async (lat: number, lng: number, label: string) => {
    setResolving(true);
    try {
      const delegation = await api.get<{ id: string; nameDelegation: string; governorate: { nameGovernorate: string } }>(
        `/geography/delegations/by-coordinates?lat=${lat}&lng=${lng}`,
      );
      const address = await api.post<{ id: string }>('/addresses/order', {
        latitude: lat,
        longitude: lng,
        street: label,
        delegationId: delegation.id,
      });
      setSource({
        addressId: address.id,
        label: label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        sublabel: `${delegation.nameDelegation}, ${delegation.governorate.nameGovernorate}`,
        lat,
        lng,
      });
    } catch (e: any) {
      appAlert('Error', e.message || 'Failed to save address');
    } finally {
      setResolving(false);
    }
  };

  const useCurrent = async () => {
    setResolving(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        appAlert('Location', 'Permission is required to use your current position.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      await resolveFromCoords(pos.coords.latitude, pos.coords.longitude, 'Current location');
    } finally {
      setResolving(false);
    }
  };

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const raw = await AsyncStorage.getItem('picked_pickup');
        if (raw) {
          const p = JSON.parse(raw);
          await AsyncStorage.removeItem('picked_pickup');
          await resolveFromCoords(p.lat, p.lng, p.address || '');
        }
      } catch {
        /* ignore */
      }
    }, 500);
    return () => clearInterval(t);
  }, []);

  const validateFormForPreview = (): boolean => {
    if (!source) {
      appAlert('Address', 'Select where the driver should meet you.');
      return false;
    }
    const w = parseFloat(weight);
    if (isNaN(w) || w <= 0) {
      appAlert('Weight', 'Enter a valid weight.');
      return false;
    }
    if (!description.trim()) {
      appAlert('Required', 'Please describe what you need.');
      return false;
    }
    const ex = parseFloat((customerExtraAmount || '0').replace(',', '.'));
    if (Number.isNaN(ex) || ex < 0) {
      appAlert('Amount', 'Enter a valid optional extra amount (0 or more).');
      return false;
    }
    if (ex > MAX_CUSTOMER_EXTRA) {
      appAlert('Amount', `Optional extra cannot exceed ${MAX_CUSTOMER_EXTRA}.`);
      return false;
    }
    if (cancelAfterMinutes > LOCAL_PICKUP_MAX_CANCEL_MINUTES) {
      appAlert('Invalid Timer', `Auto-cancel time must be ${LOCAL_PICKUP_MAX_CANCEL_MINUTES} minutes or less.`);
      return false;
    }
    if (scheduleLater) {
      if (publishAt.getTime() < Date.now() + 60 * 1000) {
        appAlert('Time', 'Publish time must be at least 1 minute from now.');
        return false;
      }
      if (publishAt.getTime() > Date.now() + 30 * 24 * 60 * 60 * 1000) {
        appAlert('Time', 'Publish time cannot be more than 30 days ahead.');
        return false;
      }
    }
    return true;
  };

  const handleCalculatePrice = async () => {
    if (!validateFormForPreview() || !source) return;
    const w = parseFloat(weight);
    const ex = parseFloat((customerExtraAmount || '0').replace(',', '.'));
    setLoading(true);
    try {
      const result = await orderService.previewOrder({
        pickupAddressId: source.addressId,
        localPickupOnly: true,
        paymentType,
        weight: w,
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

  const tryCalculatePrice = () => {
    if (loading) return;
    if (!source) {
      setPriceGateHighlight('address');
      appAlert(
        'Select an address first',
        'Choose where the driver should meet you: use your current position, pick on the map, or select a saved address.',
      );
      return;
    }
    if (!description.trim()) {
      setPriceGateHighlight('description');
      appAlert(
        'Add a description first',
        'Describe what you need (e.g. medicine from a pharmacy) so we can price your local pickup correctly.',
      );
      return;
    }
    setPriceGateHighlight('none');
    void handleCalculatePrice();
  };

  const handleUpdatePreviewExtra = async (overrideExtraAmount?: number) => {
    if (!source) return;
    const ex =
      typeof overrideExtraAmount === 'number'
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
        pickupAddressId: source.addressId,
        localPickupOnly: true,
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

  const handleSwitchToCash = async () => {
    if (!source) return;
    setPaymentType('COD');
    try {
      const ex = parseFloat((customerExtraAmount || '0').replace(',', '.'));
      const extraOk = !Number.isNaN(ex) && ex >= 0 && ex <= MAX_CUSTOMER_EXTRA ? ex : 0;
      const w = parseFloat(weight);
      const result = await orderService.previewOrder({
        pickupAddressId: source.addressId,
        localPickupOnly: true,
        paymentType: 'COD',
        weight: w,
        customerExtraAmount: extraOk,
        scheduledPublishAt: scheduleLater ? publishAt.toISOString() : undefined,
      });
      setPreview(result);
      setCustomerExtraAmount(String(result.customerExtraAmount ?? extraOk));
    } catch (e: any) {
      appAlert('Error', e.message || 'Failed to recalculate price');
    }
  };

  const runCreateOrder = async () => {
    if (!source || !preview) return;
    const w = parseFloat(weight);
    const ex = parseFloat((customerExtraAmount || '0').replace(',', '.'));
    if (Number.isNaN(ex) || ex < 0 || ex > MAX_CUSTOMER_EXTRA) {
      appAlert('Amount', `Enter a valid optional extra (0–${MAX_CUSTOMER_EXTRA}).`);
      return;
    }
    setSubmitting(true);
    try {
      const order = await orderService.createOrder({
        pickupAddressId: source.addressId,
        localPickupOnly: true,
        paymentType,
        weight: w,
        description: description.trim(),
        cancelAfterMinutes,
        customerExtraAmount: ex,
        scheduledPublishAt: scheduleLater ? publishAt.toISOString() : undefined,
      });
      const scheduled = order.status === 'PENDING_PUBLISH';
      try {
        await startOrderTracking(
          order.id,
          scheduled ? '📅 Local pickup — scheduled' : '📦 Local pickup — searching for a driver...',
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
        console.warn('startOrderTracking after local pickup create:', e);
      }
      requestNotificationBadgeRefresh();
      setSource(null);
      setPaymentType('COD');
      setWeight('1');
      setDescription('');
      setCustomerExtraAmount('0');
      setCancelAfterMinutes(LOCAL_PICKUP_MIN_CANCEL_MINUTES);
      setScheduleLater(false);
      setPublishAt(new Date(Date.now() + 15 * 60 * 1000));
      setPreview(null);
      setStep('form');
      router.replace(`/(customer)/order-detail?orderId=${order.id}`);
    } catch (e: any) {
      appAlert('Error', e.message || 'Failed');
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

  const handleConfirmLocalOrder = async () => {
    if (!source || !preview) return;
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

  const filteredSaved = savedList.filter((a) => {
    const q = savedSearch.trim().toLowerCase();
    if (!q) return true;
    const hay = `${a.label} ${a.sublabel}`.toLowerCase();
    return hay.includes(q);
  });
  const recentAddresses = recentAddressIds
    .map((id) => savedList.find((a) => a.addressId === id))
    .filter((a): a is SavedAddress => !!a);
  const markRecentAddress = async (addressId: string) => {
    const next = [addressId, ...recentAddressIds.filter((id) => id !== addressId)].slice(0, 6);
    setRecentAddressIds(next);
    try {
      await AsyncStorage.setItem(RECENT_LOCAL_ADDR_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  // ── Preview step ─────────────────────────────────────────
  if (step === 'preview' && preview && source) {
    const isCash = preview.paymentType === 'COD';
    const unit = isCash ? preview.currencySymbol : 'coins';
    const insufficientWallet = !isCash && preview.walletBalance !== null && preview.walletBalance < preview.totalPrice;

    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <TouchableOpacity
            style={[ps.previewEditRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              orderBioFailsRoundRef.current = 0;
              setOrderGateUi('hidden');
              setOrderVerifyPassword('');
              setStep('form');
            }}
            activeOpacity={0.75}
          >
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
            <Text style={[ps.previewEditText, { color: colors.primary }]}>Edit order details</Text>
          </TouchableOpacity>

          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Meet driver here</Text>
            <Text style={[ps.routeAddress, { color: colors.text }]}>{source.label}</Text>
            <Text style={[ps.routeSub, { color: colors.textSecondary }]}>{source.sublabel}</Text>
          </View>

          <View style={[ps.chipsRow, { marginBottom: 16 }]}>
            <View style={[ps.chip, { backgroundColor: isCash ? successBg : infoBg }]}>
              <Text style={[ps.chipText, { color: isCash ? successText : infoText }]}>{isCash ? 'Cash' : 'Wallet'}</Text>
            </View>
            <View style={[ps.chip, { backgroundColor: surfaceMuted }]}>
              <Text style={[ps.chipText, { color: colors.text }]}>{weight} kg</Text>
            </View>
            <View style={[ps.chip, { backgroundColor: surfaceMuted }]}>
              <Text style={[ps.chipText, { color: colors.text }]}>{preview.distanceKm.toFixed(1)} km</Text>
            </View>
            {preview.isNightDelivery && (
              <View style={[ps.chip, { backgroundColor: isDark ? 'rgba(129,140,248,0.22)' : '#e0e7ff' }]}>
                <Text style={[ps.chipText, { color: isDark ? '#c4b5fd' : '#3730a3' }]}>Night</Text>
              </View>
            )}
            {scheduleLater && (
              <View style={[ps.chip, { backgroundColor: isDark ? 'rgba(14,165,233,0.2)' : '#e0f2fe' }]}>
                <Text style={[ps.chipText, { color: colors.primary }]}>
                  Live {publishAt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                </Text>
              </View>
            )}
          </View>

          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>What you need</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>{description.trim()}</Text>
          </View>

          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Driver time / errand (optional)</Text>
            <Text style={[ps.inputLabel, { color: colors.textSecondary, marginBottom: 8 }]}>
              Add an amount for long waits or services (e.g. paying a bill at an office). Max {MAX_CUSTOMER_EXTRA} {unit}.
            </Text>
            <View style={ps.extraStepperRow}>
              <TouchableOpacity
                style={[
                  ps.extraStepperBtn,
                  { backgroundColor: colors.inputBg, borderColor: colors.border },
                  parseFloat((customerExtraAmount || '0').replace(',', '.')) <= 0 && ps.extraStepperBtnDisabled,
                ]}
                onPress={() => adjustPreviewExtraByStep(-1)}
                disabled={loading || parseFloat((customerExtraAmount || '0').replace(',', '.')) <= 0}
                activeOpacity={0.7}
              >
                <Text style={[ps.extraStepperBtnText, { color: colors.text }]}>-</Text>
              </TouchableOpacity>
              <View style={[ps.extraStepperValueBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Text style={[ps.extraStepperValueText, { color: colors.text }]}>
                  {Math.max(0, parseFloat((customerExtraAmount || '0').replace(',', '.')) || 0).toFixed(0)}
                </Text>
              </View>
              <TouchableOpacity
                style={[ps.extraStepperBtn, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
                onPress={() => adjustPreviewExtraByStep(1)}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={[ps.extraStepperBtnText, { color: colors.text }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Price breakdown</Text>
            <PriceRow label="Base fee" value={preview.baseFee} unit={unit} labelColor={colors.textSecondary} valueColor={colors.text} />
            <PriceRow label="Distance fee" value={preview.distanceFee} unit={unit} labelColor={colors.textSecondary} valueColor={colors.text} />
            {preview.extraWeightFee > 0 && (
              <PriceRow label="Extra weight" value={preview.extraWeightFee} unit={unit} labelColor={colors.textSecondary} valueColor={colors.text} />
            )}
            {preview.nightFee > 0 && (
              <PriceRow label="Night fee" value={preview.nightFee} unit={unit} labelColor={colors.textSecondary} valueColor={colors.text} />
            )}
            <View style={[ps.divider, { backgroundColor: colors.border }]} />
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
            <View style={[ps.divider, { backgroundColor: colors.border }]} />
            <View style={ps.priceRow}>
              <Text style={[ps.totalLabel, { color: colors.text }]}>Total</Text>
              <Text style={[ps.totalValue, { color: colors.primary }]}>
                {preview.totalPrice.toFixed(2)} {unit}
              </Text>
            </View>
          </View>

          {!isCash && preview.walletBalance !== null && (
            <View
              style={[
                ps.walletBanner,
                {
                  backgroundColor: insufficientWallet
                    ? isDark
                      ? 'rgba(239,68,68,0.16)'
                      : '#fef2f2'
                    : isDark
                      ? 'rgba(34,197,94,0.16)'
                      : '#f0fdf4',
                },
              ]}
            >
              <Ionicons name="wallet-outline" size={18} color={insufficientWallet ? colors.danger : colors.success} />
              <Text style={[ps.walletText, { color: insufficientWallet ? colors.danger : colors.success }]}>
                Balance: {preview.walletBalance.toFixed(2)} coins
                {insufficientWallet ? ' — Insufficient funds' : ''}
              </Text>
            </View>
          )}

          {insufficientWallet && (
            <View style={ps.insufficientActions}>
              <TouchableOpacity
                style={[ps.insufficientBtn, { backgroundColor: isDark ? 'rgba(59,130,246,0.2)' : '#dbeafe' }]}
                onPress={() => appAlert('Coming Soon', 'The Add Coins feature will be available soon.')}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={18} color={isDark ? '#93c5fd' : '#1e40af'} />
                <Text style={[ps.insufficientBtnText, { color: isDark ? '#93c5fd' : '#1e40af' }]}>Add coins</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ps.insufficientBtn, { backgroundColor: isDark ? 'rgba(34,197,94,0.2)' : '#dcfce7' }]}
                onPress={handleSwitchToCash}
                activeOpacity={0.7}
              >
                <Ionicons name="cash-outline" size={18} color={isDark ? '#86efac' : '#166534'} />
                <Text style={[ps.insufficientBtnText, { color: isDark ? '#86efac' : '#166534' }]}>Switch to cash</Text>
              </TouchableOpacity>
            </View>
          )}

          {orderGateUi === 'bio_retry_hint' && orderBiometricAvailable && !isOrderConfirmIdentityVerified() && (
            <View
              style={[
                s.orderBioHintBanner,
                { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
              ]}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
                Biometric verification did not complete. Tap Create order to try again
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

          <TouchableOpacity
            style={[
              s.primaryBtn,
              { backgroundColor: colors.success },
              (loading || submitting || insufficientWallet) && s.primaryBtnDisabled,
            ]}
            onPress={handleConfirmLocalOrder}
            disabled={loading || submitting || insufficientWallet}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Create order</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Form step ────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <TouchableOpacity
            style={[s.backInline, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.replace(backToNewOrder as never)}
            activeOpacity={0.75}
          >
            <Ionicons name="chevron-back" size={18} color={colors.primary} />
            <Text style={[s.backInlineText, { color: colors.primary }]}>Go back to New Order</Text>
          </TouchableOpacity>

          <Text style={[s.hint, { color: colors.textSecondary }]}>
            Driver brings items to you (within your delegation). No separate delivery address.
          </Text>

          <View
            style={[
              s.card,
              { backgroundColor: colors.card },
              priceGateHighlight === 'address' && {
                borderWidth: 2,
                borderColor: colors.danger,
                backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2',
              },
            ]}
          >
            <Text style={[s.cardTitle, { color: colors.text }]}>Your location</Text>
            <TouchableOpacity style={[s.row, { borderBottomColor: colors.border }]} onPress={useCurrent} disabled={resolving}>
              <Ionicons name="navigate" size={20} color="#2563eb" />
              <Text style={{ color: colors.text, marginLeft: 8, flex: 1 }}>Use my current position</Text>
              {resolving ? <ActivityIndicator /> : null}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.row, { borderBottomColor: colors.border }]}
              onPress={() =>
                router.push(`/(customer)/pick-location?type=pickup&returnTo=${encodeURIComponent('/(customer)/local-pickup-order')}`)
              }
            >
              <Ionicons name="map" size={20} color="#16a34a" />
              <Text style={{ color: colors.text, marginLeft: 8 }}>Choose on map</Text>
            </TouchableOpacity>
            {savedList.length > 0 && (
              <>
                <Text style={[s.sub, { color: colors.textSecondary, marginTop: 12 }]}>Saved addresses</Text>
                <TouchableOpacity
                  style={[s.savedPickerBtn, { backgroundColor: isDark ? 'rgba(34,197,94,0.18)' : '#dcfce7' }]}
                  onPress={() => {
                    setSavedSearch('');
                    setSavedPickerVisible(true);
                  }}
                >
                  <Ionicons name="search-outline" size={16} color="#166534" />
                  <Text style={[s.savedPickerBtnText, { color: isDark ? '#86efac' : '#166534' }]}>Search in saved addresses</Text>
                </TouchableOpacity>
              </>
            )}
            {source && (
              <View style={{ marginTop: 12, padding: 12, backgroundColor: selectedBg, borderRadius: 8 }}>
                <Text style={{ color: selectedText, fontWeight: '700' }}>Selected</Text>
                <Text style={{ color: selectedText }}>{source.label}</Text>
                <Text style={{ color: selectedText, fontSize: 12, opacity: 0.9 }}>{source.sublabel}</Text>
              </View>
            )}
          </View>

          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Payment</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                style={[s.pay, { backgroundColor: surfaceSoft, borderColor: borderSoft }, paymentType === 'COD' && s.payOn]}
                onPress={() => setPaymentType('COD')}
              >
                <Text style={{ color: paymentType === 'COD' ? '#fff' : colors.text }}>Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.pay, { backgroundColor: surfaceSoft, borderColor: borderSoft }, paymentType === 'WALLET' && s.payOn]}
                onPress={() => setPaymentType('WALLET')}
              >
                <Text style={{ color: paymentType === 'WALLET' ? '#fff' : colors.text }}>Wallet ({walletBalance})</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Details</Text>
            <Text style={[s.lab, { color: colors.textSecondary }]}>Weight (kg)</Text>
            <TextInput
              style={[s.inp, { color: colors.text, borderColor: borderSoft, backgroundColor: surfaceSoft }]}
              value={weight}
              onChangeText={setWeight}
              keyboardType="numeric"
            />
            <Text
              style={[
                s.lab,
                {
                  marginTop: 12,
                  color: priceGateHighlight === 'description' ? colors.danger : colors.textSecondary,
                  fontWeight: priceGateHighlight === 'description' ? '700' : '400',
                },
              ]}
            >
              What you need *
            </Text>
            <TextInput
              style={[
                s.inp,
                {
                  minHeight: 72,
                  textAlignVertical: 'top',
                  color: colors.text,
                  borderWidth: priceGateHighlight === 'description' ? 2 : 1,
                  borderColor: priceGateHighlight === 'description' ? colors.danger : borderSoft,
                  backgroundColor:
                    priceGateHighlight === 'description'
                      ? isDark
                        ? 'rgba(239,68,68,0.14)'
                        : '#fff1f2'
                      : surfaceSoft,
                },
              ]}
              value={description}
              onChangeText={(t) => {
                setDescription(t);
                if (priceGateHighlight === 'description' && t.trim()) setPriceGateHighlight('none');
              }}
              multiline
              placeholder="e.g. fever medicine from pharmacy"
              placeholderTextColor={colors.textTertiary}
            />
          </View>

          <View style={[s.card, { backgroundColor: colors.card }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[s.cardTitle, { color: colors.text }]}>Publish time</Text>
                <Text style={[s.lab, { color: colors.textSecondary }]}>
                  Drivers see this order at this time (notifications go out then too).
                </Text>
              </View>
              <Switch
                value={scheduleLater}
                onValueChange={setScheduleLater}
                trackColor={{ false: colors.border, true: colors.primaryLight ?? 'rgba(14,165,233,0.35)' }}
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
                {Platform.OS === 'ios' && (
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
                {Platform.OS === 'android' && androidPublishStep === 'date' && (
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
                {Platform.OS === 'android' && androidPublishStep === 'time' && (
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

          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Auto-Cancel Timer</Text>
            <Text style={[s.lab, { color: colors.textSecondary }]}>Cancel if no driver responds (minutes)</Text>
            <View style={s.timerRow}>
              <TouchableOpacity
                style={[s.timerBtn, { backgroundColor: surfaceMuted }]}
                onPress={() => setCancelAfterMinutes((prev) => Math.max(LOCAL_PICKUP_MIN_CANCEL_MINUTES, prev - 1))}
              >
                <Ionicons name="remove" size={20} color={colors.text} />
              </TouchableOpacity>
              <TextInput
                style={[s.timerInput, { color: colors.text, borderColor: borderSoft, backgroundColor: surfaceSoft }]}
                value={String(cancelAfterMinutes)}
                onChangeText={(text) => {
                  const num = parseInt(text, 10);
                  setCancelAfterMinutes(Number.isNaN(num) ? 0 : num);
                }}
                keyboardType="numeric"
                textAlign="center"
              />
              <TouchableOpacity
                style={[s.timerBtn, { backgroundColor: surfaceMuted }]}
                onPress={() => setCancelAfterMinutes((prev) => Math.min(LOCAL_PICKUP_MAX_CANCEL_MINUTES, prev + 1))}
              >
                <Ionicons name="add" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            {cancelAfterMinutes > LOCAL_PICKUP_MAX_CANCEL_MINUTES && (
              <Text style={{ color: colors.danger, marginTop: 8, fontSize: 12 }}>
                Must be {LOCAL_PICKUP_MAX_CANCEL_MINUTES} minutes (4h) or less
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={[
              s.cta,
              { backgroundColor: colors.primary },
              loading && { opacity: 0.6 },
              !loading && !priceFormReady && { opacity: 0.45 },
            ]}
            onPress={tryCalculatePrice}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>Calculate price</Text>}
          </TouchableOpacity>
        </ScrollView>

        <Modal visible={savedPickerVisible} transparent animationType="slide" onRequestClose={() => setSavedPickerVisible(false)}>
          <View style={s.modalOverlay}>
            <View style={[s.modalCard, { backgroundColor: colors.card }]}>
              <View style={s.modalHead}>
                <Text style={[s.modalTitle, { color: colors.text }]}>Select saved address</Text>
                <TouchableOpacity onPress={() => setSavedPickerVisible(false)}>
                  <Ionicons name="close-circle" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={[s.modalSearch, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
                <Ionicons name="search" size={16} color={colors.textTertiary} />
                <TextInput
                  style={[s.modalSearchInput, { color: colors.text }]}
                  placeholder="Search nickname, street, area..."
                  placeholderTextColor={colors.textTertiary}
                  value={savedSearch}
                  onChangeText={setSavedSearch}
                />
              </View>
              <FlatList
                data={filteredSaved}
                keyExtractor={(item) => item.addressId}
                style={{ maxHeight: 340 }}
                keyboardShouldPersistTaps="handled"
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
                              setSource(r);
                              markRecentAddress(r.addressId);
                              setSavedPickerVisible(false);
                            }}
                          >
                            <Text style={[s.recentChipText, { color: colors.text }]} numberOfLines={1}>
                              {r.label}
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
                      setSource(item);
                      markRecentAddress(item.addressId);
                      setSavedPickerVisible(false);
                    }}
                  >
                    <Text style={[s.modalItemTitle, { color: colors.text }]}>{item.label}</Text>
                    <Text style={[s.modalItemSub, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.sublabel}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={[s.modalEmpty, { color: colors.textTertiary }]}>No matching addresses</Text>}
              />
            </View>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  backInline: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  backInlineText: { fontSize: 13, fontWeight: '700' },
  hint: { marginBottom: 16, fontSize: 14, lineHeight: 20 },
  card: { borderRadius: 12, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb' },
  sub: { fontSize: 13, marginBottom: 6 },
  savedPickerBtn: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#dcfce7',
    borderRadius: 10,
    paddingVertical: 10,
  },
  savedPickerBtnText: { color: '#166534', fontSize: 12, fontWeight: '700' },
  pay: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center' },
  payOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  lab: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timerBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: '700',
    backgroundColor: '#f9fafb',
  },
  inp: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 16 },
  cta: { backgroundColor: '#16a34a', padding: 16, borderRadius: 12, alignItems: 'center' },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 16 },
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
  primaryBtn: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryBtnDisabled: { opacity: 0.55 },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 20 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  modalSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, marginBottom: 10 },
  modalSearchInput: { flex: 1, height: 42, fontSize: 14 },
  modalItem: { paddingVertical: 10, borderBottomWidth: 1 },
  modalItemTitle: { fontSize: 14, fontWeight: '700' },
  modalItemSub: { fontSize: 12, marginTop: 2 },
  modalEmpty: { textAlign: 'center', paddingVertical: 22, fontSize: 13 },
  recentTitle: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  recentChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 180 },
  recentChipText: { fontSize: 12, fontWeight: '600' },
  schedulePickBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  schedulePickText: { flex: 1, fontSize: 14, fontWeight: '600' },
});

const ps = StyleSheet.create({
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
  routeAddress: { fontSize: 15, fontWeight: '600' },
  routeSub: { fontSize: 12, marginTop: 4 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 5 },
  chipText: { fontSize: 13, fontWeight: '600' },
  inputLabel: { fontSize: 13, fontWeight: '600' },
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
  extraStepperBtnDisabled: { opacity: 0.45 },
  extraStepperBtnText: { fontSize: 26, fontWeight: '700', lineHeight: 28 },
  extraStepperValueBox: {
    minWidth: 92,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  extraStepperValueText: { fontSize: 20, fontWeight: '700' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  priceLabel: { fontSize: 14, color: '#6b7280' },
  priceValue: { fontSize: 14, fontWeight: '600', color: '#374151' },
  divider: { height: 1, marginVertical: 6 },
  totalLabel: { fontSize: 18, fontWeight: '800' },
  totalValue: { fontSize: 20, fontWeight: '800' },
  walletBanner: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, gap: 10, marginBottom: 16 },
  walletText: { fontSize: 14, fontWeight: '600', flex: 1 },
  insufficientActions: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  insufficientBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
  insufficientBtnText: { fontSize: 14, fontWeight: '700' },
});
