import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, TextInput, KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../../services/api/client';
import { orderService, Order } from '../../services/api/order.service';
import { startOrderTracking } from '../../services/notifications';
import { useTheme } from '../../contexts/ThemeContext';

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
  totalPrice: number;
  currency: string;
  currencySymbol: string;
  walletBalance: number | null;
  paymentType: 'COD' | 'WALLET';
}

export default function CreateOrderScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

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
  const [walletBalance, setWalletBalance] = useState(0);

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
    router.push(`/(customer)/pick-location?type=${type}`);
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
    if (cancelAfterMinutes < 5 || cancelAfterMinutes > 60) {
      Alert.alert('Invalid Timer', 'Auto-cancel time must be between 5 and 60 minutes.');
      return;
    }
    setLoading(true);
    try {
      const result = await orderService.previewOrder({
        pickupAddressId: pickupAddress.addressId,
        dropoffAddressId: dropoffAddress.addressId,
        paymentType, weight: w,
      });
      setPreview(result);
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
    setSubmitting(true);
    try {
      const order = await orderService.createOrder({
        pickupAddressId: pickupAddress.addressId,
        dropoffAddressId: dropoffAddress.addressId,
        paymentType, weight: parseFloat(weight),
        description: description || undefined,
        cancelAfterMinutes,
      });
      // Reset form for next order
      setPickupAddress(null);
      setDropoffAddress(null);
      setPaymentType('COD');
      setWeight('1');
      setDescription('');
      setCancelAfterMinutes(15);
      setPreview(null);
      setStep('form');
      // Refresh active orders
      try {
        const all = await orderService.getMyOrders();
        setActiveOrders(all.filter(o => ACTIVE_STATUSES.includes(o.status)));
      } catch {}
      Alert.alert('Order Created!', 'We are searching for a driver near you.', [
        { text: 'View Order', onPress: () => router.push(`/(customer)/order-detail?orderId=${order.id}`) },
        { text: 'New Order', style: 'cancel' },
      ]);

      // Start the foreground service for order tracking
      startOrderTracking(order.id, '📦 Order Confirmed', 'Searching for a driver near you...');
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
      const result = await orderService.previewOrder({
        pickupAddressId: pickupAddress.addressId,
        dropoffAddressId: dropoffAddress.addressId,
        paymentType: 'COD',
        weight: parseFloat(weight),
      });
      setPreview(result);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to recalculate price');
    }
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
        {/* Header */}
        <View style={[s.header, { backgroundColor: colors.headerBg }]}>
          <TouchableOpacity onPress={() => setStep('form')} style={s.headerBackBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Order Summary</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
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

          {/* Price breakdown */}
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Price Breakdown</Text>
            <PriceRow label="Base Fee" value={preview.baseFee} unit={unit} />
            <PriceRow label="Distance Fee" value={preview.distanceFee} unit={unit} />
            {preview.extraWeightFee > 0 && <PriceRow label="Extra Weight" value={preview.extraWeightFee} unit={unit} />}
            {preview.nightFee > 0 && <PriceRow label="Night Fee 🌙" value={preview.nightFee} unit={unit} />}
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
        {/* Header */}
        <View style={[s.header, { backgroundColor: colors.headerBg }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBackBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>New Order</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

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
            <TouchableOpacity
              style={[s.addressBtn, pickupAddress && s.addressBtnActive]}
              onPress={() => openMapPicker('pickup')}
              activeOpacity={0.7}
            >
              <View style={[s.addressDot, { backgroundColor: pickupAddress ? '#22c55e' : '#d1d5db' }]} />
              <View style={{ flex: 1 }}>
                {resolvingPickup ? (
                  <ActivityIndicator size="small" color="#22c55e" />
                ) : pickupAddress ? (
                  <>
                    <Text style={s.addressMainText}>{pickupAddress.label}</Text>
                    <Text style={s.addressSubText}>{pickupAddress.sublabel}</Text>
                  </>
                ) : (
                  <Text style={s.addressPlaceholder}>Tap to select pickup location</Text>
                )}
              </View>
              <Ionicons name="map-outline" size={20} color={pickupAddress ? '#22c55e' : '#9ca3af'} />
            </TouchableOpacity>

            {/* Connector line */}
            <View style={s.connectorLine} />

            {/* Dropoff */}
            <TouchableOpacity
              style={[s.addressBtn, dropoffAddress && { borderColor: '#fecaca' }]}
              onPress={() => openMapPicker('dropoff')}
              activeOpacity={0.7}
            >
              <View style={[s.addressDot, { backgroundColor: dropoffAddress ? '#ef4444' : '#d1d5db' }]} />
              <View style={{ flex: 1 }}>
                {resolvingDropoff ? (
                  <ActivityIndicator size="small" color="#ef4444" />
                ) : dropoffAddress ? (
                  <>
                    <Text style={s.addressMainText}>{dropoffAddress.label}</Text>
                    <Text style={s.addressSubText}>{dropoffAddress.sublabel}</Text>
                  </>
                ) : (
                  <Text style={s.addressPlaceholder}>Tap to select delivery location</Text>
                )}
              </View>
              <Ionicons name="map-outline" size={20} color={dropoffAddress ? '#ef4444' : '#9ca3af'} />
            </TouchableOpacity>
          </View>

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
                setCancelAfterMinutes(prev => Math.max(5, prev - 1));
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
                setCancelAfterMinutes(prev => Math.min(60, prev + 1));
              }}>
                <Ionicons name="add" size={20} color="#374151" />
              </TouchableOpacity>
            </View>
            {(cancelAfterMinutes < 5 || cancelAfterMinutes > 60) && (
              <Text style={s.validationError}>Must be between 5 and 60 minutes</Text>
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

  // Header
  header: {
    backgroundColor: '#0284c7', paddingTop: 54, paddingBottom: 18, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  headerBackBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },

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
});
