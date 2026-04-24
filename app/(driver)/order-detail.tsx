import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet, TextInput, Alert, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { orderService, Order } from '../../services/api/order.service';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppNavigation } from '../../contexts/AppNavigationContext';
import {
  bustDriverOrderTrackingDedupe,
  restoreOrderTrackingForDriver,
  stopOrderTrackingSilently,
  subscribeOrderDetailRefresh,
  syncDriverTrackingNotificationWithOrder,
} from '../../services/notifications';
import { useOrderChatUnread } from '../../hooks/useOrderChatUnread';
import { ChatUnreadBadge } from '../../components/ChatUnreadBadge';

const STATUS_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  DRAFT:            { icon: 'document-outline',    color: '#6b7280', bg: '#f3f4f6', label: 'Draft' },
  SEARCHING_DRIVER: { icon: 'search-outline',      color: '#ca8a04', bg: '#fef9c3', label: 'Searching' },
  PENDING_CUSTOMER_APPROVAL: { icon: 'hourglass-outline', color: '#ea580c', bg: '#ffedd5', label: 'Waiting for Customer' },
  DRIVER_ASSIGNED:  { icon: 'person-outline',      color: '#2563eb', bg: '#dbeafe', label: 'Assigned' },
  DRIVER_ARRIVED:   { icon: 'flag-outline',        color: '#7c3aed', bg: '#ede9fe', label: 'Arrived' },
  PICKED_UP:        { icon: 'cube-outline',        color: '#ea580c', bg: '#ffedd5', label: 'Picked Up' },
  DELIVERING:       { icon: 'bicycle-outline',     color: '#4f46e5', bg: '#e0e7ff', label: 'Delivering' },
  RETURNED:         { icon: 'return-up-back-outline', color: '#b45309', bg: '#fef3c7', label: 'Returned' },
  RETURN_DEPOSIT:   { icon: 'archive-outline',     color: '#0f766e', bg: '#ccfbf1', label: 'Return Deposited' },
  DELIVERED:        { icon: 'checkmark-circle',    color: '#16a34a', bg: '#dcfce7', label: 'Delivered' },
  CANCELLED:        { icon: 'close-circle',        color: '#dc2626', bg: '#fee2e2', label: 'Cancelled' },
  DISPUTED:         { icon: 'warning-outline',     color: '#dc2626', bg: '#fee2e2', label: 'Disputed' },
  REFUNDED:         { icon: 'arrow-undo-outline',  color: '#6b7280', bg: '#f3f4f6', label: 'Refunded' },
};

const STAR_LABELS = ['Terrible','Very Bad','Bad','Poor','Below Avg','Average','Above Avg','Good','Very Good','Excellent','Perfect'];

export default function DriverOrderDetailScreen() {
  const router = useRouter();
  const { push } = useAppNavigation();
  const { orderId: orderIdParam, scrollTo: scrollToParam } = useLocalSearchParams<{ orderId: string; scrollTo?: string }>();
  const orderId = Array.isArray(orderIdParam) ? orderIdParam[0] : orderIdParam;
  const scrollTo = Array.isArray(scrollToParam) ? scrollToParam[0] : scrollToParam;
  const { unread: chatUnread } = useOrderChatUnread(orderId);
  const { colors, isDark } = useTheme();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [conflictFeedback, setConflictFeedback] = useState('');
  const [conflictSubmitting, setConflictSubmitting] = useState(false);
  const [returnCallCount, setReturnCallCount] = useState('');
  const [returnEvidenceUrl, setReturnEvidenceUrl] = useState('');
  const [companyRejectionDraft, setCompanyRejectionDraft] = useState('');
  const [companyRejectionSubmitting, setCompanyRejectionSubmitting] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try {
      const o = await orderService.getOrder(orderId);
      setOrder(o);
      await syncDriverTrackingNotificationWithOrder(o);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 403 || status === 404) {
        router.replace('/(driver)/available-orders?declinedFlash=1');
        return;
      }
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId, router]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!orderId) return;
    return subscribeOrderDetailRefresh(orderId, () => {
      void load();
    });
  }, [orderId, load]);

  /** Customer approval updates the order on the server before FCM may arrive; poll briefly so status & UI stay in sync. */
  useEffect(() => {
    if (!orderId || order?.status !== 'PENDING_CUSTOMER_APPROVAL') return;
    const t = setInterval(() => {
      void load();
    }, 3500);
    return () => clearInterval(t);
  }, [orderId, order?.status, load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const applyNextStatus = async () => {
    if (!order || statusUpdating) return;
    const nextByStatus: Record<string, string> = {
      DRIVER_ASSIGNED: 'DRIVER_ARRIVED',
      DRIVER_ARRIVED: 'PICKED_UP',
      PICKED_UP: 'DELIVERING',
    };
    const next = nextByStatus[order.status];
    if (!next) return;
    try {
      setStatusUpdating(true);
      await orderService.updateOrderStatus(order.id, next);
      await load();
      await restoreOrderTrackingForDriver();
    } catch (e) {
      console.error(e);
    } finally {
      setStatusUpdating(false);
    }
  };

  const revertStatus = async () => {
    if (!order || statusUpdating) return;
    try {
      setStatusUpdating(true);
      await orderService.revertOrderStatus(order.id);
      await load();
      await restoreOrderTrackingForDriver();
    } catch (e) {
      console.error(e);
    } finally {
      setStatusUpdating(false);
    }
  };

  const pickReturnEvidenceImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to attach a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.65,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    const uri = a.base64 ? `data:image/jpeg;base64,${a.base64}` : (a.uri || '');
    if (uri) setReturnEvidenceUrl(uri);
  };

  const submitCompanyRejectionResponse = async () => {
    if (!order) return;
    const t = companyRejectionDraft.trim();
    if (t.length < 5) {
      Alert.alert('Too short', 'Please write at least 5 characters.');
      return;
    }
    try {
      setCompanyRejectionSubmitting(true);
      await orderService.respondToOrderDriverRejection(order.id, t);
      setCompanyRejectionDraft('');
      await load();
      Alert.alert('Sent', 'Your response was saved.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save response');
    } finally {
      setCompanyRejectionSubmitting(false);
    }
  };

  const cancelAssignment = () => {
    if (!order) return;
    Alert.alert('Cancel', 'Cancel your assignment for this order?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        style: 'destructive',
        onPress: async () => {
          try {
            await orderService.cancelAssignment(order.id, 'Driver cancelled');
            await stopOrderTrackingSilently();
            router.replace('/(driver)/available-orders');
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Could not cancel');
          }
        },
      },
    ]);
  };

  const submitConflictFeedback = async () => {
    if (!order) return;
    const t = conflictFeedback.trim();
    if (t.length < 5) {
      Alert.alert('Too short', 'Please write at least 5 characters.');
      return;
    }
    try {
      setConflictSubmitting(true);
      await orderService.submitArrivalConflictFeedback(order.id, t);
      setConflictFeedback('');
      await load();
      Alert.alert('Sent', 'Your response was saved. Customer service will review if needed.');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not submit feedback');
    } finally {
      setConflictSubmitting(false);
    }
  };

  const handleDelivered = async () => {
    if (!order || statusUpdating) return;
    const hasProof1 = Boolean(order.driverAssignment?.image1Proof);
    if (!hasProof1) {
      push(`/(driver)/upload-proofs?orderId=${order.id}&afterProof=delivered`);
      return;
    }
    try {
      setStatusUpdating(true);
      await orderService.updateOrderStatus(order.id, 'DELIVERED');
      await load();
      await restoreOrderTrackingForDriver();
    } catch (e) {
      console.error(e);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleReturned = async () => {
    if (!order || statusUpdating) return;
    const hasProof1 = Boolean(order.driverAssignment?.image1Proof);
    if (!hasProof1) {
      push(`/(driver)/upload-proofs?orderId=${order.id}&afterProof=returned`);
      return;
    }
    try {
      setStatusUpdating(true);
      await orderService.updateOrderStatus(order.id, 'RETURNED');
      await load();
      await restoreOrderTrackingForDriver();
    } catch (e) {
      console.error(e);
    } finally {
      setStatusUpdating(false);
    }
  };

  const confirmReturnDeposit = async () => {
    if (!order || statusUpdating) return;
    const n = parseInt(returnCallCount.trim(), 10);
    const extra: { customerCallCountBeforeReturn?: number; returnEvidenceImageUrl?: string } = {};
    if (returnCallCount.trim() !== '' && !Number.isNaN(n) && n >= 0) {
      extra.customerCallCountBeforeReturn = n;
    }
    if (returnEvidenceUrl.trim()) {
      extra.returnEvidenceImageUrl = returnEvidenceUrl.trim();
    }
    try {
      setStatusUpdating(true);
      await orderService.updateOrderStatus(order.id, 'RETURN_DEPOSIT', extra);
      await load();
      await restoreOrderTrackingForDriver();
    } catch (e) {
      console.error(e);
    } finally {
      setStatusUpdating(false);
    }
  };

  if (loading || !order) {
    return <View style={[s.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const meta = STATUS_META[order.status] || STATUS_META.DELIVERED;
  const da = order.driverAssignment;
  const showProofSection = ['DRIVER_ARRIVED', 'PICKED_UP', 'DELIVERING', 'RETURNED', 'RETURN_DEPOSIT', 'DELIVERED'].includes(order.status);
  const canRevert = ['DRIVER_ARRIVED', 'PICKED_UP', 'DELIVERING', 'RETURNED'].includes(order.status);
  const canCancelAssignment =
    (order.status === 'PENDING_CUSTOMER_APPROVAL' || order.status === 'DRIVER_ASSIGNED') && !order.driverArrivedOnce;
  const chatFriendlyClosedStatuses = ['DELIVERED', 'RETURN_DEPOSIT', 'REFUNDED', 'FAILED', 'DISPUTED', 'CANCELLED'];
  const canOpenChat = !!order.chatRoom || chatFriendlyClosedStatuses.includes(order.status);
  const nextActionLabel: Record<string, string> = {
    DRIVER_ASSIGNED: "I've arrived",
    DRIVER_ARRIVED: 'Package picked up',
    PICKED_UP: 'Start delivering now',
  };
  const canGoNext = Boolean(nextActionLabel[order.status]);

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
    push(`/(driver)/address-map?lat=${lat}&lng=${lng}&kind=${kind}&title=${encodeURIComponent(mapTitle)}`);
  };

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

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: meta.color }]}>
        <View style={s.statusHero}>
          <View style={s.statusIconCircle}>
            <Ionicons name={meta.icon as any} size={32} color="#fff" />
          </View>
          <Text style={s.statusLabel}>{meta.label}</Text>
          <Text style={s.statusOrderId}>#{order.id.slice(0, 8)}</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >

        {/* Route */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.cardTitle, { color: colors.text }]}>Route</Text>
          <View style={s.routeRow}>
            <View style={s.routeIconCol}>
              <View style={[s.routeDot, { backgroundColor: '#22c55e' }]} />
              <View style={[s.routeLine, { backgroundColor: colors.border }]} />
              <View style={[s.routeDot, { backgroundColor: '#ef4444' }]} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ marginBottom: 22 }}>
                <Text style={[s.routeLabel, { color: colors.textTertiary }]}>PICKUP</Text>
                <TouchableOpacity
                  style={s.addressTapRow}
                  onPress={() => openAddressOnMap(pickupLat, pickupLng, 'pickup', pickupMapTitle)}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        s.routeAddress,
                        { color: pickupHasCoords ? colors.primary : colors.text },
                      ]}
                      numberOfLines={2}
                    >
                      {order.pickupAddress?.street || 'Pickup'}
                    </Text>
                    <Text style={[s.routeSub, { color: colors.textSecondary }]}>
                      {order.pickupAddress?.delegation?.nameDelegation}, {order.pickupAddress?.delegation?.governorate?.nameGovernorate}
                    </Text>
                  </View>
                  {pickupHasCoords ? (
                    <Ionicons name="map-outline" size={22} color={colors.primary} style={{ marginTop: 2 }} />
                  ) : null}
                </TouchableOpacity>
              </View>
              <View>
                <Text style={[s.routeLabel, { color: colors.textTertiary }]}>DELIVERY</Text>
                {order.localPickupOnly ? (
                  <Text style={[s.routeAddress, { color: colors.textSecondary }]}>
                    Local pickup only — bring items to the pickup address (no separate drop-off).
                  </Text>
                ) : (
                  <TouchableOpacity
                    style={s.addressTapRow}
                    onPress={() => openAddressOnMap(dropLat, dropLng, 'dropoff', dropoffMapTitle)}
                    activeOpacity={0.75}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          s.routeAddress,
                          { color: dropoffHasCoords ? colors.primary : colors.text },
                        ]}
                        numberOfLines={2}
                      >
                        {order.dropoffAddress?.street || 'Dropoff'}
                      </Text>
                      <Text style={[s.routeSub, { color: colors.textSecondary }]}>
                        {order.dropoffAddress?.delegation?.nameDelegation}, {order.dropoffAddress?.delegation?.governorate?.nameGovernorate}
                      </Text>
                    </View>
                    {dropoffHasCoords ? (
                      <Ionicons name="map-outline" size={22} color={colors.primary} style={{ marginTop: 2 }} />
                    ) : null}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>

        {order.myOrderDriverRejection && !order.arrivalConflict && (
          <View style={[s.card, { backgroundColor: colors.card, borderLeftWidth: 4, borderLeftColor: '#ea580c' }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Feedback on your assignment</Text>
            {order.myOrderDriverRejection.reason ? (
              <>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 6 }}>
                  {order.sourceType === 'DELIVERY_COMPANY'
                    ? 'The company / department indicated:'
                    : 'The customer indicated:'}
                </Text>
                <Text style={{ color: colors.text, lineHeight: 20 }}>{order.myOrderDriverRejection.reason}</Text>
              </>
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>You were unassigned from this order.</Text>
            )}
            {order.myOrderDriverRejection.driverResponse ? (
              <View style={{ marginTop: 12 }}>
                <Text style={[s.routeLabel, { color: colors.textTertiary, marginBottom: 4 }]}>Your response</Text>
                <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>{order.myOrderDriverRejection.driverResponse}</Text>
              </View>
            ) : (
              <View style={{ gap: 10, marginTop: 12 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  Optional: add your side (min. 5 characters).
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    padding: 12,
                    minHeight: 88,
                    color: colors.text,
                    backgroundColor: colors.background,
                  }}
                  placeholder="Your response…"
                  placeholderTextColor={colors.textTertiary}
                  value={companyRejectionDraft}
                  onChangeText={setCompanyRejectionDraft}
                  multiline
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={[s.nextBtn, { backgroundColor: colors.primary }, companyRejectionSubmitting && { opacity: 0.6 }]}
                  onPress={submitCompanyRejectionResponse}
                  disabled={companyRejectionSubmitting}
                >
                  {companyRejectionSubmitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={s.nextBtnText}>Submit response</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {order.arrivalConflict && (
          <View style={[s.card, { backgroundColor: colors.card, borderLeftWidth: 4, borderLeftColor: '#dc2626' }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Customer declined after arrival</Text>
            <Text style={[s.routeLabel, { color: colors.textTertiary, marginBottom: 4 }]}>Reason given by customer</Text>
            <Text style={{ color: colors.text, marginBottom: 14, lineHeight: 20 }}>{order.arrivalConflict.customerReason}</Text>
            {order.arrivalConflict.driverFeedback ? (
              <View>
                <Text style={[s.routeLabel, { color: colors.textTertiary, marginBottom: 4 }]}>Your response</Text>
                <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>{order.arrivalConflict.driverFeedback}</Text>
              </View>
            ) : order.arrivalConflict.status === 'PENDING' ? (
              <View style={{ gap: 10 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                  Share your side of the story. This is sent to customer service only.
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    padding: 12,
                    minHeight: 100,
                    color: colors.text,
                    backgroundColor: colors.background,
                  }}
                  placeholder="Your feedback (min. 5 characters)"
                  placeholderTextColor={colors.textTertiary}
                  value={conflictFeedback}
                  onChangeText={setConflictFeedback}
                  multiline
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={[s.nextBtn, { backgroundColor: colors.primary }, conflictSubmitting && { opacity: 0.6 }]}
                  onPress={submitConflictFeedback}
                  disabled={conflictSubmitting}
                >
                  {conflictSubmitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={s.nextBtnText}>Submit response</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>This incident was closed by support.</Text>
            )}
          </View>
        )}

        {/* Info chips */}
        <View style={s.chipsRow}>
          <View style={[s.chip, { backgroundColor: order.paymentType === 'COD' ? '#dcfce7' : '#dbeafe' }]}>
            <Text style={{ fontSize: 14 }}>{order.paymentType === 'COD' ? '💵' : '💰'}</Text>
            <Text style={[s.chipText, { color: order.paymentType === 'COD' ? '#166534' : '#1e40af' }]}>
              {order.paymentType === 'COD' ? 'Cash' : 'Wallet'}
            </Text>
          </View>
          <View style={[s.chip, { backgroundColor: colors.surfaceVariant }]}><Text style={{ fontSize: 14 }}>📦</Text><Text style={[s.chipText, { color: colors.text }]}>{order.weight} kg</Text></View>
          <View style={[s.chip, { backgroundColor: colors.surfaceVariant }]}><Text style={{ fontSize: 14 }}>📏</Text><Text style={[s.chipText, { color: colors.text }]}>{order.distanceKm.toFixed(1)} km</Text></View>
          {order.isNightDelivery && (
            <View style={[s.chip, { backgroundColor: '#e0e7ff' }]}><Text style={{ fontSize: 14 }}>🌙</Text><Text style={[s.chipText, { color: '#3730a3' }]}>Night</Text></View>
          )}
          {order.pickupAt ? (
            <View style={[s.chip, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="time-outline" size={14} color="#92400e" />
              <Text style={[s.chipText, { color: '#92400e' }]}>
                {new Date(order.pickupAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          ) : null}
        </View>

        {order.pickupAt && (
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Pickup schedule</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>
              Pickup at: {new Date(order.pickupAt).toLocaleString()}
            </Text>
            {order.canDriverControlPickupPersistent ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[s.nextBtn, { backgroundColor: colors.primary }]}
                  onPress={async () => {
                    try {
                      await orderService.driverControlPickupPersistent(order.id, 'show');
                      bustDriverOrderTrackingDedupe(order.id);
                      const o = await orderService.getOrder(order.id);
                      setOrder(o);
                      await syncDriverTrackingNotificationWithOrder(o);
                      await restoreOrderTrackingForDriver(order.id);
                    } catch (e: any) {
                      Alert.alert('Error', e.message || 'Unable to show notification');
                    }
                  }}
                >
                  <Text style={s.nextBtnText}>Show persistent now</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.revertBtn, { flex: 1 }]}
                  onPress={async () => {
                    try {
                      await orderService.driverControlPickupPersistent(order.id, 'ignore');
                      bustDriverOrderTrackingDedupe(order.id);
                      const o = await orderService.getOrder(order.id);
                      setOrder(o);
                      await syncDriverTrackingNotificationWithOrder(o);
                      await restoreOrderTrackingForDriver(order.id);
                    } catch (e: any) {
                      Alert.alert('Error', e.message || 'Unable to ignore notification');
                    }
                  }}
                >
                  <Text style={s.revertBtnText}>Ignore until original</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={{ color: colors.textTertiary, fontSize: 12 }}>
                Persistent pickup notification is now system-controlled.
              </Text>
            )}
          </View>
        )}

        {/* Price */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.cardTitle, { color: colors.text }]}>Price</Text>
          <View style={s.priceRow}><Text style={[s.priceLabel, { color: colors.textSecondary }]}>Total</Text><Text style={[s.totalValue, { color: colors.primary }]}>{order.price.toFixed(2)} TND</Text></View>
          {order.extraWeightFee > 0 && <View style={s.priceRow}><Text style={[s.priceLabel, { color: colors.textSecondary }]}>Extra Weight</Text><Text style={[s.priceValue, { color: colors.text }]}>{order.extraWeightFee.toFixed(2)} TND</Text></View>}
          {order.nightFee > 0 && <View style={s.priceRow}><Text style={[s.priceLabel, { color: colors.textSecondary }]}>Night Fee</Text><Text style={[s.priceValue, { color: colors.text }]}>{order.nightFee.toFixed(2)} TND</Text></View>}
          {order.deliveryZoneType && <View style={s.priceRow}><Text style={[s.priceLabel, { color: colors.textSecondary }]}>Zone</Text><Text style={[s.priceValue, { color: colors.text }]}>{order.deliveryZoneType.replace(/_/g, ' ')}</Text></View>}
        </View>

        {/* Timeline */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.cardTitle, { color: colors.text }]}>Timeline</Text>
          <TimelineItem label="Order Created" time={order.createdAt} color="#6b7280" />
          {da?.acceptedAt && <TimelineItem label="Accepted" time={da.acceptedAt} color="#2563eb" />}
          {da?.arrivedAt && <TimelineItem label="Arrived at Pickup" time={da.arrivedAt} color="#7c3aed" />}
          {da?.pickedUpAt && <TimelineItem label="Package Picked Up" time={da.pickedUpAt} color="#ea580c" />}
          {da?.deliveredAt && <TimelineItem label="Delivered" time={da.deliveredAt} color="#16a34a" />}
        </View>

        {canOpenChat && (
          <View style={{ position: 'relative', alignSelf: 'stretch' }}>
            <TouchableOpacity
              style={[s.card, { backgroundColor: '#16a34a', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]}
              onPress={() => push(`/(driver)/order-chat?orderId=${order.id}`)}
              activeOpacity={0.85}
            >
              <Ionicons name="chatbubbles" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Chat</Text>
            </TouchableOpacity>
            <ChatUnreadBadge count={chatUnread} />
          </View>
        )}

        {order.status === 'RETURNED' && (
          <View
            style={[s.card, { backgroundColor: colors.card }]}
            onLayout={(e) => {
              if (scrollTo !== 'return_deposit') return;
              const y = e.nativeEvent.layout.y;
              requestAnimationFrame(() => {
                scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
              });
            }}
          >
            <Text style={[s.cardTitle, { color: colors.text }]}>Return details (optional)</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
              Before confirming deposit: how many times you called the customer, and an optional photo from your gallery.
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                padding: 10,
                marginBottom: 10,
                color: colors.text,
                backgroundColor: colors.background,
              }}
              placeholder="Number of calls (optional)"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              value={returnCallCount}
              onChangeText={setReturnCallCount}
            />
            <TouchableOpacity
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                padding: 12,
                marginBottom: 10,
                backgroundColor: colors.surfaceVariant,
              }}
              onPress={pickReturnEvidenceImage}
            >
              <Text style={{ color: colors.primary, fontWeight: '600', textAlign: 'center' }}>
                Choose photo from gallery
              </Text>
            </TouchableOpacity>
            {returnEvidenceUrl ? (
              <View style={{ gap: 8 }}>
                {returnEvidenceUrl.startsWith('data:') || returnEvidenceUrl.startsWith('file') || returnEvidenceUrl.startsWith('http') ? (
                  <Image
                    source={{ uri: returnEvidenceUrl }}
                    style={{ width: '100%', height: 160, borderRadius: 10, backgroundColor: '#f3f4f6' }}
                    resizeMode="contain"
                  />
                ) : null}
                <TouchableOpacity onPress={() => setReturnEvidenceUrl('')}>
                  <Text style={{ color: '#dc2626', fontSize: 13, textAlign: 'center' }}>Remove image</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )}

        {(canGoNext || order.status === 'DELIVERING' || order.status === 'RETURNED') && (
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Delivery Actions</Text>
            <View style={s.stepActionsRow}>
              {canRevert && (
                <TouchableOpacity
                  style={[s.revertBtn, statusUpdating && { opacity: 0.6 }]}
                  onPress={revertStatus}
                  disabled={statusUpdating}
                >
                  <Ionicons name="return-up-back-outline" size={16} color="#6b7280" />
                  <Text style={s.revertBtnText}>Go back</Text>
                </TouchableOpacity>
              )}
              {canGoNext && (
                <TouchableOpacity
                  style={[s.nextBtn, { backgroundColor: colors.primary }, statusUpdating && { opacity: 0.6 }]}
                  onPress={applyNextStatus}
                  disabled={statusUpdating}
                >
                  <Text style={s.nextBtnText}>{nextActionLabel[order.status]}</Text>
                </TouchableOpacity>
              )}
              {order.status === 'DELIVERING' && (
                <>
                  <TouchableOpacity
                    style={[s.nextBtn, { backgroundColor: '#16a34a' }, statusUpdating && { opacity: 0.6 }]}
                    onPress={handleDelivered}
                    disabled={statusUpdating}
                  >
                    <Text style={s.nextBtnText}>Delivered</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.nextBtn, { backgroundColor: '#b45309' }, statusUpdating && { opacity: 0.6 }]}
                    onPress={handleReturned}
                    disabled={statusUpdating}
                  >
                    <Text style={s.nextBtnText}>Returned</Text>
                  </TouchableOpacity>
                </>
              )}
              {order.status === 'RETURNED' && (
                <TouchableOpacity
                  style={[s.nextBtn, { backgroundColor: colors.primary }, statusUpdating && { opacity: 0.6 }]}
                  onPress={confirmReturnDeposit}
                  disabled={statusUpdating}
                >
                  <Text style={s.nextBtnText}>Confirm return deposit</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.cardTitle, { color: colors.text }]}>Package description</Text>
          <Text
            style={[
              s.descText,
              { color: (order.description ?? '').trim() ? colors.text : colors.textSecondary },
            ]}
          >
            {(order.description ?? '').trim() || 'No description provided.'}
          </Text>
        </View>

        {/* Rating received */}
        {order.rating && (
          <View style={[s.card, { borderLeftWidth: 4, borderLeftColor: '#f59e0b', backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Customer Rating</Text>
            <View style={{ alignItems: 'center', gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {Array.from({ length: 10 }, (_, i) => (
                  <Ionicons key={i} name={i < order.rating!.score ? 'star' : 'star-outline'} size={20}
                    color={i < order.rating!.score ? '#f59e0b' : '#d1d5db'} />
                ))}
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                {order.rating.score}/10 — {STAR_LABELS[order.rating.score]}
              </Text>
              {order.rating.comment && (
                <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center' }}>"{order.rating.comment}"</Text>
              )}
            </View>
          </View>
        )}

        {/* Proof status */}
        {da && showProofSection && (
          <View
            style={[s.card, { backgroundColor: colors.card }]}
            onLayout={(e) => {
              const y = e.nativeEvent.layout.y;
              if (scrollTo === 'proof') {
                requestAnimationFrame(() => {
                  scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
                });
              }
            }}
          >
            <Text style={[s.cardTitle, { color: colors.text }]}>Proof Images</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={[s.proofStatus, da.image1Proof ? { backgroundColor: '#dcfce7' } : { backgroundColor: '#fef2f2' }]}>
                <Ionicons name={da.image1Proof ? 'checkmark-circle' : 'close-circle'} size={16}
                  color={da.image1Proof ? '#16a34a' : '#dc2626'} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: da.image1Proof ? '#16a34a' : '#dc2626' }}>
                  Image 1 {da.image1Proof ? 'Uploaded' : 'Missing'}
                </Text>
              </View>
              <View style={[s.proofStatus, da.image2Proof ? { backgroundColor: '#dcfce7' } : { backgroundColor: '#f3f4f6' }]}>
                <Ionicons name={da.image2Proof ? 'checkmark-circle' : 'remove-circle-outline'} size={16}
                  color={da.image2Proof ? '#16a34a' : '#9ca3af'} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: da.image2Proof ? '#16a34a' : '#9ca3af' }}>
                  Image 2 {da.image2Proof ? 'Uploaded' : 'None'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[s.proofActionBtn, { backgroundColor: colors.primary }]}
              onPress={() => push(`/(driver)/upload-proofs?orderId=${order.id}`)}
              activeOpacity={0.85}
            >
              <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
              <Text style={s.proofActionText}>
                {da.image1Proof ? 'Update proof images' : 'Add proof images'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {(canRevert || canCancelAssignment) && (
          <View style={s.footerActionsRow}>
            {canRevert && (
              <TouchableOpacity
                style={[s.footerMiniBtn, statusUpdating && { opacity: 0.6 }]}
                onPress={revertStatus}
                disabled={statusUpdating}
                activeOpacity={0.85}
              >
                <Ionicons name="return-up-back-outline" size={14} color="#6b7280" />
                <Text style={s.footerMiniBtnText}>Back</Text>
              </TouchableOpacity>
            )}
            {canCancelAssignment && (
              <TouchableOpacity style={s.footerMiniBtnDanger} onPress={cancelAssignment} activeOpacity={0.85}>
                <Text style={s.footerMiniBtnDangerText}>Cancel assignment</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function TimelineItem({ label, time, color }: { label: string; time: string; color: string }) {
  const t = new Date(time);
  const dateStr = t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeStr = t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={s.timelineItem}>
      <View style={[s.timelineDot, { backgroundColor: color }]} />
      <Text style={s.timelineLabel}>{label}</Text>
      <Text style={s.timelineTime}>{dateStr} {timeStr}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  header: { paddingTop: 16, paddingBottom: 24, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  statusHero: { alignItems: 'center' },
  statusIconCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  statusLabel: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  statusOrderId: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '500' },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 14 },
  routeRow: { flexDirection: 'row' },
  routeIconCol: { alignItems: 'center', marginRight: 14, paddingTop: 2 },
  routeDot: { width: 14, height: 14, borderRadius: 7 },
  routeLine: { width: 2, flex: 1, backgroundColor: '#e5e7eb', marginVertical: 4 },
  routeLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 2 },
  routeAddress: { fontSize: 14, fontWeight: '600', color: '#111827', lineHeight: 20 },
  addressTapRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  routeSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, gap: 5, backgroundColor: '#f3f4f6',
  },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  priceLabel: { fontSize: 14, color: '#6b7280' },
  priceValue: { fontSize: 14, fontWeight: '600', color: '#374151' },
  totalValue: { fontSize: 20, fontWeight: '800', color: '#0284c7' },
  descText: { fontSize: 14, color: '#374151', lineHeight: 20 },
  timelineItem: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  timelineDot: { width: 10, height: 10, borderRadius: 5 },
  timelineLabel: { flex: 1, fontSize: 13, color: '#374151', fontWeight: '500' },
  timelineTime: { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  proofStatus: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
  },
  proofActionBtn: {
    marginTop: 12,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  proofActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  stepActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  revertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  revertBtnText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '700',
  },
  nextBtn: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  footerActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 28,
  },
  footerMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  footerMiniBtnText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  footerMiniBtnDanger: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  footerMiniBtnDangerText: { fontSize: 12, fontWeight: '600', color: '#b91c1c' },
});
