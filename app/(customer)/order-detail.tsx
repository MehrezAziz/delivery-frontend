import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl, StyleSheet, TextInput, Modal, Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderService, Order, computeOrderCancelRemainingSec } from '../../services/api/order.service';
import { useTheme } from '../../contexts/ThemeContext';
import { useOrderChatUnread } from '../../hooks/useOrderChatUnread';
import { ChatUnreadBadge } from '../../components/ChatUnreadBadge';
import {
  restoreOrderTrackingForCustomer,
  syncCustomerOrderTrackingFromOrder,
} from '../../services/notifications';

/** Customer-facing delivery steps (no company return / deposit steps). */
const STATUS_FLOW = [
  'SEARCHING_DRIVER', 'PENDING_CUSTOMER_APPROVAL', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PICKED_UP', 'DELIVERING', 'DELIVERED',
];

const STATUS_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  DRAFT:            { icon: 'document-outline',   color: '#6b7280', bg: '#f3f4f6', label: 'Draft' },
  SEARCHING_DRIVER: { icon: 'search-outline',     color: '#ca8a04', bg: '#fef9c3', label: 'Searching Driver' },
  PENDING_CUSTOMER_APPROVAL: { icon: 'hourglass-outline', color: '#ea580c', bg: '#ffedd5', label: 'Awaiting Your Approval' },
  DRIVER_ASSIGNED:  { icon: 'person-outline',     color: '#2563eb', bg: '#dbeafe', label: 'Driver Assigned' },
  DRIVER_ARRIVED:   { icon: 'flag-outline',       color: '#7c3aed', bg: '#ede9fe', label: 'Driver Arrived' },
  PICKED_UP:        { icon: 'cube-outline',       color: '#ea580c', bg: '#ffedd5', label: 'Picked Up' },
  DELIVERING:       { icon: 'bicycle-outline',    color: '#4f46e5', bg: '#e0e7ff', label: 'On the Way' },
  RETURNED:         { icon: 'return-up-back-outline', color: '#b45309', bg: '#fef3c7', label: 'Returned' },
  RETURN_DEPOSIT:   { icon: 'archive-outline', color: '#0f766e', bg: '#ccfbf1', label: 'Return Deposited' },
  DELIVERED:        { icon: 'checkmark-circle',    color: '#16a34a', bg: '#dcfce7', label: 'Delivered' },
  AUTO_CANCELLED:   { icon: 'timer-outline',       color: '#b91c1c', bg: '#fee2e2', label: 'Auto-cancelled' },
  CANCELLED:        { icon: 'close-circle',        color: '#dc2626', bg: '#fee2e2', label: 'Cancelled' },
  DISPUTED:         { icon: 'warning-outline',     color: '#dc2626', bg: '#fee2e2', label: 'Disputed' },
  REFUNDED:         { icon: 'arrow-undo-outline',  color: '#6b7280', bg: '#f3f4f6', label: 'Refunded' },
  FAILED:           { icon: 'alert-circle-outline', color: '#dc2626', bg: '#fee2e2', label: 'Failed' },
};

const STAR_LABELS = ['Terrible', 'Very Bad', 'Bad', 'Poor', 'Below Average', 'Average', 'Above Average', 'Good', 'Very Good', 'Excellent', 'Perfect'];

export default function OrderDetailScreen() {
  const router = useRouter();
  const { orderId: orderIdParam, scrollTo } = useLocalSearchParams<{ orderId: string; scrollTo?: string }>();
  const orderId = Array.isArray(orderIdParam) ? orderIdParam[0] : orderIdParam;
  const { unread: chatUnread } = useOrderChatUnread(orderId);
  const { colors, isDark } = useTheme();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disputeModalVisible, setDisputeModalVisible] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [ratingScore, setRatingScore] = useState<number | null>(null);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [reviewsModalVisible, setReviewsModalVisible] = useState(false);
  const [driverReviews, setDriverReviews] = useState<{ id: string; score: number; comment: string | null; createdAt: string; customerName: string }[]>([]);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());

  const scrollViewRef = useRef<ScrollView>(null);
  const [driverCardY, setDriverCardY] = useState<number | null>(null);
  const hasAutoScrolledRef = useRef(false);

  const loadOrder = useCallback(async () => {
    try {
      const data = await orderService.getOrder(orderId);
      setOrder(data);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load order');
    } finally { setLoading(false); setRefreshing(false); }
  }, [orderId]);

  useEffect(() => { loadOrder(); }, [loadOrder]);

  // Keep Android persistent order tracking notification synchronized from this exact order payload
  // while user is on order details (even if push arrives late/missed).
  useEffect(() => {
    if (!order) return;
    void syncCustomerOrderTrackingFromOrder(order);
  }, [order]);

  // Safety reconciliation with global tracker map (covers app reopen / stale map cases).
  useEffect(() => {
    if (!order?.id) return;
    void restoreOrderTrackingForCustomer();
  }, [order?.id, order?.status]);
  useEffect(() => {
    if (!orderId) return;
    const pollMs = order?.status === 'SEARCHING_DRIVER' ? 3000 : 5000;
    const interval = setInterval(loadOrder, pollMs);
    return () => clearInterval(interval);
  }, [orderId, order?.status, loadOrder]);

  const prevCancelRemRef = useRef<number | null>(null);
  useEffect(() => {
    if (!order || order.status !== 'SEARCHING_DRIVER') {
      prevCancelRemRef.current = null;
      return;
    }
    const rem = computeOrderCancelRemainingSec(order, nowTs);
    const prev = prevCancelRemRef.current;
    prevCancelRemRef.current = rem;
    if (prev != null && prev > 0 && rem === 0) void loadOrder();
  }, [order, nowTs, loadOrder]);
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Deep-link support from notification actions
  useEffect(() => {
    if (!order) return;
    if (scrollTo !== 'driver') {
      hasAutoScrolledRef.current = false;
      return;
    }
    if (hasAutoScrolledRef.current) return;

    const scrollView = scrollViewRef.current;
    if (driverCardY === null) return;

    // Wait a bit to ensure layout is measured correctly
    setTimeout(() => {
      hasAutoScrolledRef.current = true;
      scrollView?.scrollTo({ y: driverCardY, animated: true });
    }, 150);
  }, [order, scrollTo, driverCardY]);

  const handleCancel = () => {
    Alert.alert('Cancel Order', 'Are you sure you want to cancel this order?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
        try {
          await orderService.cancelOrder(orderId, 'Customer cancelled');
          loadOrder();
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const handleChangePayment = (type: 'COD' | 'WALLET') => {
    Alert.alert('Change Payment', `Switch to ${type === 'COD' ? 'Cash on Delivery' : 'Wallet'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: async () => {
        try {
          const updated = await orderService.changePaymentMethod(orderId, type);
          setOrder(updated);
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const handleAssistance = async () => {
    try {
      const ticket = await orderService.requestAssistance(orderId, 'I need help with this order');
      // Navigate directly to the support chat for this ticket
      router.push(`/(customer)/support-chat?ticketId=${(ticket as any).id}`);
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleDispute = () => {
    setDisputeReason('');
    setDisputeModalVisible(true);
  };

  const submitDispute = async () => {
    if (!disputeReason.trim()) {
      Alert.alert('Error', 'Please provide a reason for the dispute');
      return;
    }
    setDisputeModalVisible(false);
    try {
      await orderService.createDispute(orderId, disputeReason.trim());
      Alert.alert('Dispute Created', 'A customer service agent will review your case.');
      loadOrder();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const submitRating = async () => {
    if (ratingScore === null) {
      Alert.alert('Error', 'Please select a score');
      return;
    }
    setRatingSubmitting(true);
    try {
      await orderService.rateOrder(orderId, ratingScore, ratingComment.trim() || undefined);
      Alert.alert('Thank you!', 'Your rating has been submitted.');
      loadOrder();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit rating');
    } finally {
      setRatingSubmitting(false);
    }
  };

  const handleCancelDispute = () => {
    Alert.alert('Cancel Dispute', 'Are you sure you want to cancel this dispute?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
        try {
          await orderService.cancelDispute(orderId);
          loadOrder();
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  const submitRejectDriver = async (reason?: string) => {
    try {
      await orderService.rejectDriver(orderId, reason);
      setRejectModalVisible(false);
      setRejectReason('');
      loadOrder();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleRejectDriver = () => {
    if (order?.status === 'DRIVER_ARRIVED') {
      setRejectReason('');
      setRejectModalVisible(true);
      return;
    }
    Alert.alert(
      'Reject Driver',
      'Are you sure? The order will go back to searching. This driver cannot accept this order again.',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, Reject', style: 'destructive', onPress: () => submitRejectDriver(undefined) },
      ],
    );
  };

  const confirmRejectArrived = () => {
    const r = rejectReason.trim();
    if (r.length < 10) {
      Alert.alert('Reason required', 'Please explain in at least 10 characters. Support may review this.');
      return;
    }
    submitRejectDriver(r);
  };

  const handleNotifyDrivers = async () => {
    setNotifyLoading(true);
    try {
      const res = await orderService.notifyDriversUrgent(orderId);
      Alert.alert('Sent', res.message || `We notified ${res.notifiedDrivers} drivers for you.`);
      loadOrder();
    } catch (e: any) {
      Alert.alert('Cannot notify', e.message || 'Try again later');
    } finally {
      setNotifyLoading(false);
    }
  };

  const handleApproveDriver = async () => {
    try {
      await orderService.approveDriver(orderId);
      loadOrder();
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleShowReviews = async () => {
    try {
      const data = await orderService.getDriverReviews(orderId);
      setDriverReviews(data.reviews);
      setReviewsModalVisible(true);
    } catch (e: any) { Alert.alert('Error', e.message || 'Failed to load reviews'); }
  };

  if (loading || !order) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const meta = STATUS_META[order.status] || STATUS_META.DRAFT;
  const canCancel = ['SEARCHING_DRIVER', 'DRAFT'].includes(order.status);
  const canReactivate = ['CANCELLED', 'AUTO_CANCELLED'].includes(order.status);
  const canChangePayment = ['SEARCHING_DRIVER', 'PENDING_CUSTOMER_APPROVAL', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED'].includes(order.status);
  const chatFriendlyClosedStatuses = ['DELIVERED', 'REFUNDED', 'FAILED', 'DISPUTED', 'CANCELLED', 'AUTO_CANCELLED'];
  const canOpenChat = !!order.chatRoom || chatFriendlyClosedStatuses.includes(order.status);
  const canTrack = ['PICKED_UP', 'DELIVERING'].includes(order.status);
  const isActive = STATUS_FLOW.includes(order.status) && order.status !== 'DELIVERED';
  const currentStepIndex = STATUS_FLOW.indexOf(order.status);
  const createdDate = new Date(order.createdAt);
  const dateStr = createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = createdDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const currentCancelMinutes = order.cancelAfterMinutes || 15;
  const cancelRemainingSec = computeOrderCancelRemainingSec(order, nowTs);
  const cancelRemainingText = `${Math.floor(cancelRemainingSec / 60)}:${String(cancelRemainingSec % 60).padStart(2, '0')}`;
  const cancelTimerAccentColor =
    cancelRemainingSec < 300 ? '#dc2626'
    : cancelRemainingSec < 600 ? '#ea580c'
      : cancelRemainingSec < 900 ? '#16a34a'
        : colors.textSecondary;
  const urgentRemainingSec = order.urgentNotify?.nextButtonEnabledAt
    ? Math.max(0, Math.floor((new Date(order.urgentNotify.nextButtonEnabledAt).getTime() - nowTs) / 1000))
    : 0;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: meta.color }]}>
        <View style={s.headerAssistRow}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={handleAssistance} style={s.headerBtn} accessibilityLabel="Help and support">
            <Ionicons name="headset-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={s.statusHero}>
          <View style={[s.statusIconCircle, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name={meta.icon as any} size={32} color="#fff" />
          </View>
          <Text style={s.statusLabel}>{meta.label}</Text>
          <Text style={s.statusOrderId}>#{order.id.slice(0, 8)}</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrder(); }} />}>

        {/* ── Progress Steps (only for active orders) ── */}
        {isActive && currentStepIndex >= 0 && (
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Delivery progress</Text>
            <View style={s.progressOneLine}>
              {STATUS_FLOW.map((step, i) => {
                const stepMeta = STATUS_META[step];
                const done = i < currentStepIndex;
                const isCurrent = i === currentStepIndex;
                const n = STATUS_FLOW.length;
                const lineMuted = isDark ? '#334155' : '#e2e8f0';
                const lineDone = meta.color;
                return (
                  <View key={step} style={s.progressOneLineCell}>
                    <View style={s.progressOneLineDotsRow}>
                      {i > 0 && (
                        <View
                          style={[
                            s.progressOneLineBar,
                            { backgroundColor: i - 1 < currentStepIndex ? lineDone : lineMuted },
                          ]}
                        />
                      )}
                      <View
                        style={[
                          s.progressHDot,
                          done && { backgroundColor: '#22c55e' },
                          isCurrent && { backgroundColor: meta.color, borderWidth: 2, borderColor: '#fff' },
                          !done && !isCurrent && { backgroundColor: isDark ? '#475569' : '#e2e8f0' },
                        ]}
                      >
                        {done && <Ionicons name="checkmark" size={11} color="#fff" />}
                      </View>
                      {i < n - 1 && (
                        <View
                          style={[
                            s.progressOneLineBar,
                            { backgroundColor: i < currentStepIndex ? lineDone : lineMuted },
                          ]}
                        />
                      )}
                    </View>
                    <Text
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                      style={[
                        s.progressOneLineLabel,
                        { color: colors.textSecondary },
                        isCurrent && { color: meta.color, fontWeight: '800' },
                        done && !isCurrent && { color: colors.text },
                      ]}
                    >
                      {stepMeta.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {order.status === 'SEARCHING_DRIVER' && order.driverAvailability && (
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Drivers nearby</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>
              Available in your delegation:{' '}
              <Text style={{ fontWeight: '800', color: colors.text }}>{order.driverAvailability.availableInDelegation}</Text>
            </Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>
              Approx. in same governorate (other delegations):{' '}
              <Text style={{ fontWeight: '800', color: colors.text }}>{order.driverAvailability.availableNearDelegationApprox}</Text>
            </Text>
            {order.urgentNotify && (
              <>
                <TouchableOpacity
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    backgroundColor: order.urgentNotify.canStartNewCycle && !order.urgentNotify.cycleInProgress ? '#f59e0b' : '#e5e7eb',
                    alignItems: 'center',
                  }}
                  disabled={!order.urgentNotify.canStartNewCycle || !!order.urgentNotify.cycleInProgress || notifyLoading}
                  onPress={handleNotifyDrivers}
                >
                  {notifyLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{
                      color: order.urgentNotify.canStartNewCycle && !order.urgentNotify.cycleInProgress ? '#fff' : '#9ca3af',
                      fontWeight: '700',
                    }}>
                      Notify drivers (urgent)
                    </Text>
                  )}
                </TouchableOpacity>
                {order.urgentNotify.nextButtonEnabledAt && (
                  <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 8 }}>
                    {urgentRemainingSec > 0
                      ? `Enabled in ${Math.floor(urgentRemainingSec / 60)}:${String(urgentRemainingSec % 60).padStart(2, '0')}`
                      : `Next action: ${new Date(order.urgentNotify.nextButtonEnabledAt).toLocaleString()}`}
                  </Text>
                )}
              </>
            )}
          </View>
        )}

        {order.status === 'SEARCHING_DRIVER' && (
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Auto-cancel timer</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 10 }}>
              Remaining:{' '}
              <Text style={{ fontWeight: '800', color: cancelTimerAccentColor, fontVariant: ['tabular-nums'] }}>
                {cancelRemainingText}
              </Text>
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[15, 30, 60, 120, 360, 720, 1440].map((m) => (
                (() => {
                  const deltaMinutes = m - currentCancelMinutes;
                  const nextRemainingSec = cancelRemainingSec + (deltaMinutes * 60);
                  const disabledByNegativeTimer = order.status === 'SEARCHING_DRIVER' && nextRemainingSec < 0;
                  const isSelected = currentCancelMinutes === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        borderRadius: 999,
                        backgroundColor: isSelected ? '#0ea5e9' : '#f3f4f6',
                        opacity: disabledByNegativeTimer ? 0.45 : 1,
                      }}
                      disabled={disabledByNegativeTimer}
                      onPress={async () => {
                        if (disabledByNegativeTimer) return;
                        try {
                          await orderService.updateCancelAfter(order.id, m);
                          await loadOrder();
                        } catch (e: any) {
                          Alert.alert('Error', e.message || 'Unable to update timer');
                        }
                      }}
                    >
                      <Text style={{ color: isSelected ? '#fff' : '#374151', fontWeight: '700', fontSize: 12 }}>
                        {m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`}
                      </Text>
                    </TouchableOpacity>
                  );
                })()
              ))}
            </View>
          </View>
        )}

        {/* ── Quick Actions (chat + track) ── */}
        {(canOpenChat || canTrack) && (
          <View style={s.quickActionsRow}>
            {canOpenChat && (
              <View style={{ position: 'relative' }}>
                <TouchableOpacity style={[s.quickAction, { backgroundColor: '#3b82f6' }]}
                  onPress={() => router.push(`/(customer)/order-chat?orderId=${order.id}`)} activeOpacity={0.8}>
                  <Ionicons name="chatbubbles" size={20} color="#fff" />
                  <Text style={s.quickActionText}>Chat</Text>
                </TouchableOpacity>
                <ChatUnreadBadge count={chatUnread} />
              </View>
            )}
            {canTrack && (
              <TouchableOpacity style={[s.quickAction, { backgroundColor: '#6366f1' }]}
                onPress={() => router.push(`/(customer)/track-driver?orderId=${order.id}`)} activeOpacity={0.8}>
                <Ionicons name="navigate" size={20} color="#fff" />
                <Text style={s.quickActionText}>Track</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Route Card ── */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.cardTitle, { color: colors.text }]}>Route</Text>
          <View style={s.routeRow}>
            <View style={s.routeIconCol}>
              <View style={[s.routeDot, { backgroundColor: '#22c55e' }]} />
              <View style={s.routeLine} />
              <View style={[s.routeDot, { backgroundColor: '#ef4444' }]} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ marginBottom: 22 }}>
                <Text style={s.routeLabel}>PICKUP</Text>
                <Text style={[s.routeAddress, { color: colors.text }]} numberOfLines={2}>
                  {(order.pickupAddress as any)?.nickname ? `${(order.pickupAddress as any).nickname} — ` : ''}
                  {order.pickupAddress?.street || 'Pickup location'}
                </Text>
                <Text style={[s.routeSub, { color: colors.textSecondary }]}>
                  {order.pickupAddress?.delegation?.nameDelegation}, {order.pickupAddress?.delegation?.governorate?.nameGovernorate}
                </Text>
              </View>
              {order.localPickupOnly ? (
                <Text style={[s.routeSub, { color: colors.textSecondary, fontStyle: 'italic' }]}>
                  Local pickup — driver brings items to you (no separate delivery address).
                </Text>
              ) : (
                <View>
                  <Text style={s.routeLabel}>DELIVERY</Text>
                  <Text style={[s.routeAddress, { color: colors.text }]} numberOfLines={2}>
                    {(order.dropoffAddress as any)?.nickname ? `${(order.dropoffAddress as any).nickname} — ` : ''}
                    {order.dropoffAddress?.street || 'Delivery location'}
                  </Text>
                  <Text style={[s.routeSub, { color: colors.textSecondary }]}>
                    {order.dropoffAddress?.delegation?.nameDelegation}, {order.dropoffAddress?.delegation?.governorate?.nameGovernorate}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Info Chips ── */}
        <View style={s.chipsRow}>
          <View style={[s.chip, { backgroundColor: order.paymentType === 'COD' ? '#dcfce7' : '#dbeafe' }]}>
            <Text style={s.chipEmoji}>{order.paymentType === 'COD' ? '💵' : '💰'}</Text>
            <Text style={[s.chipText, { color: order.paymentType === 'COD' ? '#166534' : '#1e40af' }]}>
              {order.paymentType === 'COD' ? 'Cash' : 'Wallet'}
            </Text>
          </View>
          <View style={[s.chip, { backgroundColor: '#f3f4f6' }]}>
            <Text style={s.chipEmoji}>📦</Text>
            <Text style={[s.chipText, { color: '#374151' }]}>{order.weight} kg</Text>
          </View>
          <View style={[s.chip, { backgroundColor: '#f3f4f6' }]}>
            <Text style={s.chipEmoji}>📏</Text>
            <Text style={[s.chipText, { color: '#374151' }]}>{order.distanceKm.toFixed(1)} km</Text>
          </View>
          {order.isNightDelivery && (
            <View style={[s.chip, { backgroundColor: '#e0e7ff' }]}>
              <Text style={s.chipEmoji}>🌙</Text>
              <Text style={[s.chipText, { color: '#3730a3' }]}>Night</Text>
            </View>
          )}
          <View style={[s.chip, { backgroundColor: '#f3f4f6' }]}>
            <Text style={s.chipEmoji}>🕐</Text>
            <Text style={[s.chipText, { color: '#374151' }]}>{dateStr}</Text>
          </View>
        </View>

        {/* ── Price Breakdown ── */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.cardTitle, { color: colors.text }]}>Price Breakdown</Text>
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>Distance</Text>
            <Text style={s.priceValue}>{order.distanceKm.toFixed(1)} km</Text>
          </View>
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>Weight</Text>
            <Text style={s.priceValue}>{order.weight} kg</Text>
          </View>
          {order.deliveryZoneType && (
            <View style={s.priceRow}>
              <Text style={s.priceLabel}>Zone</Text>
              <Text style={s.priceValue}>{order.deliveryZoneType.replace(/_/g, ' ')}</Text>
            </View>
          )}
          {order.extraWeightFee > 0 && <PriceRow label="Extra Weight Fee" value={order.extraWeightFee} />}
          {order.nightFee > 0 && <PriceRow label="Night Fee 🌙" value={order.nightFee} />}
          {(order.customerExtraAmount ?? 0) > 0 && (
            <PriceRow label="Your extra (driver time / errand)" value={order.customerExtraAmount ?? 0} />
          )}
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <View style={s.priceRow}>
            <Text style={[s.totalLabel, { color: colors.text }]}>Total</Text>
            <Text style={[s.totalValue, { color: colors.primary }]}>{order.price.toFixed(2)} TND</Text>
          </View>
        </View>

        {/* ── Driver Card ── */}
        {order.driverAssignment?.driver && (
          <View
            style={[s.card, { backgroundColor: colors.card }]}
            onLayout={(event) => setDriverCardY(event.nativeEvent.layout.y)}
          >
            <Text style={[s.cardTitle, { color: colors.text }]}>Your Driver</Text>
            <View style={s.driverRow}>
              {order.driverAssignment.driver.user.image ? (
                <Image source={{ uri: order.driverAssignment.driver.user.image }} style={s.driverAvatar} />
              ) : (
                <View style={s.driverAvatar}>
                  <Ionicons name="person" size={24} color="#fff" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[s.driverName, { color: colors.text }]}>
                  {order.driverAssignment.driver.user.firstName} {order.driverAssignment.driver.user.secondName}
                </Text>
                <Text style={[s.driverPhone, { color: colors.textSecondary }]}>{order.driverAssignment.driver.user.phone}</Text>
                {order.driverAssignment.driver.avgRating !== null && order.driverAssignment.driver.avgRating !== undefined && (
                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}
                    onPress={handleShowReviews} activeOpacity={0.7}>
                    <Ionicons name="star" size={14} color="#f59e0b" />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#f59e0b' }}>
                      {order.driverAssignment.driver.avgRating.toFixed(1)}/10
                    </Text>
                    <Text style={{ fontSize: 12, color: '#9ca3af' }}>
                      · {order.driverAssignment.driver.completedOrders} deliveries
                    </Text>
                    <Ionicons name="chevron-forward" size={12} color="#9ca3af" />
                  </TouchableOpacity>
                )}
              </View>
              {canOpenChat && (
                <View style={{ position: 'relative' }}>
                  <TouchableOpacity style={s.driverChatBtn}
                    onPress={() => router.push(`/(customer)/order-chat?orderId=${order.id}`)}>
                    <Ionicons name="chatbubble-ellipses" size={18} color="#3b82f6" />
                  </TouchableOpacity>
                  <ChatUnreadBadge count={chatUnread} />
                </View>
              )}
            </View>
            {/* Performance metrics */}
            {(order.driverAssignment.driver.completionRate !== null || order.driverAssignment.driver.avgDeliveryTimeMinutes !== null) && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {order.driverAssignment.driver.completionRate !== null && (
                  <View style={{ backgroundColor: '#f0fdf4', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="checkmark-done" size={14} color="#16a34a" />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#16a34a' }}>{order.driverAssignment.driver.completionRate.toFixed(0)}% completion</Text>
                  </View>
                )}
                {order.driverAssignment.driver.avgDeliveryTimeMinutes !== null && (
                  <View style={{ backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="time-outline" size={14} color="#2563eb" />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#2563eb' }}>~{order.driverAssignment.driver.avgDeliveryTimeMinutes} min avg</Text>
                  </View>
                )}
                <View style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="stats-chart-outline" size={14} color="#6b7280" />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280' }}>{order.driverAssignment.driver.totalOrders} total orders</Text>
                </View>
              </View>
            )}
            {/* Timeline */}
            {(order.driverAssignment.acceptedAt || order.driverAssignment.arrivedAt ||
              order.driverAssignment.pickedUpAt || order.driverAssignment.deliveredAt) && (
              <View style={s.timeline}>
                {order.driverAssignment.acceptedAt && (
                  <TimelineItem label="Accepted" time={order.driverAssignment.acceptedAt} color="#2563eb" />
                )}
                {order.driverAssignment.arrivedAt && (
                  <TimelineItem label="Arrived at pickup" time={order.driverAssignment.arrivedAt} color="#7c3aed" />
                )}
                {order.driverAssignment.pickedUpAt && (
                  <TimelineItem label="Package picked up" time={order.driverAssignment.pickedUpAt} color="#ea580c" />
                )}
                {order.driverAssignment.deliveredAt && (
                  <TimelineItem label="Delivered" time={order.driverAssignment.deliveredAt} color="#16a34a" />
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Description ── */}
        {order.description && (
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Package Description</Text>
            <Text style={[s.descriptionText, { color: colors.text }]}>{order.description}</Text>
          </View>
        )}

        {/* ── Rating (already submitted) ── */}
        {order.rating && (
          <View style={[s.card, { backgroundColor: colors.card, borderLeftWidth: 4, borderLeftColor: '#f59e0b' }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Your Rating</Text>
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

        {/* ── Rate Driver (not yet rated, delivered) ── */}
        {order.status === 'DELIVERED' && !order.rating && (
          <View style={[s.card, { backgroundColor: colors.card, borderLeftWidth: 4, borderLeftColor: '#f59e0b' }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Rate Your Driver</Text>
            <View style={{ alignItems: 'center', gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {Array.from({ length: 10 }, (_, i) => (
                  <TouchableOpacity key={i} onPress={() => setRatingScore(i + 1)} activeOpacity={0.7}>
                    <Ionicons name={ratingScore !== null && i < ratingScore ? 'star' : 'star-outline'} size={26}
                      color={ratingScore !== null && i < ratingScore ? '#f59e0b' : '#d1d5db'} />
                  </TouchableOpacity>
                ))}
              </View>
              {ratingScore !== null && (
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#f59e0b' }}>
                  {ratingScore}/10 — {STAR_LABELS[ratingScore]}
                </Text>
              )}
              <TextInput
                style={{
                  width: '100%', backgroundColor: colors.inputBg, borderRadius: 12, padding: 12,
                  fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.inputBorder, minHeight: 60,
                }}
                value={ratingComment}
                onChangeText={setRatingComment}
                placeholder="Leave a comment (optional)"
                placeholderTextColor={colors.textTertiary}
                multiline
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={{
                  backgroundColor: ratingScore !== null ? '#f59e0b' : '#d1d5db',
                  paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12,
                }}
                onPress={submitRating}
                disabled={ratingScore === null || ratingSubmitting}
                activeOpacity={0.8}
              >
                {ratingSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Submit Rating</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Dispute Info ── */}
        {order.dispute && (
          <View style={[s.card, { backgroundColor: colors.card, borderLeftWidth: 4, borderLeftColor: '#dc2626' }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Dispute</Text>
            <View style={{ gap: 8 }}>
              <View style={s.priceRow}>
                <Text style={s.priceLabel}>Status</Text>
                <View style={[s.chip, { backgroundColor: order.dispute.status === 'OPEN' ? '#fee2e2' : order.dispute.status === 'RESOLVED' ? '#dcfce7' : '#fef9c3' }]}>
                  <Text style={[s.chipText, { color: order.dispute.status === 'OPEN' ? '#dc2626' : order.dispute.status === 'RESOLVED' ? '#16a34a' : '#ca8a04' }]}>
                    {order.dispute.status}
                  </Text>
                </View>
              </View>
              <View>
                <Text style={s.priceLabel}>Reason</Text>
                <Text style={[s.descriptionText, { marginTop: 4 }]}>{order.dispute.reason}</Text>
              </View>
              {order.dispute.resolution && (
                <View>
                  <Text style={s.priceLabel}>Resolution</Text>
                  <Text style={[s.descriptionText, { marginTop: 4 }]}>{order.dispute.resolution}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── Actions ── */}
        <View style={{ gap: 10, marginTop: 4 }}>
          {canChangePayment && (
            <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => handleChangePayment(order.paymentType === 'COD' ? 'WALLET' : 'COD')} activeOpacity={0.8}>
              <View style={[s.actionIconCircle, { backgroundColor: '#e0e7ff' }]}>
                <Ionicons name="swap-horizontal" size={18} color="#4f46e5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.actionTitle, { color: colors.text }]}>Switch to {order.paymentType === 'COD' ? 'Wallet' : 'Cash'}</Text>
                <Text style={s.actionSub}>Change payment method</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
            </TouchableOpacity>
          )}
          {canCancel && (
            <TouchableOpacity style={[s.actionBtn, { borderColor: '#fecaca' }]}
              onPress={handleCancel} activeOpacity={0.8}>
              <View style={[s.actionIconCircle, { backgroundColor: '#fee2e2' }]}>
                <Ionicons name="close-circle" size={18} color="#dc2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.actionTitle, { color: '#dc2626' }]}>Cancel Order</Text>
                <Text style={s.actionSub}>This action cannot be undone</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#fca5a5" />
            </TouchableOpacity>
          )}
          {canReactivate && (
            <TouchableOpacity
              style={[s.actionBtn, { borderColor: '#86efac', backgroundColor: '#f0fdf4' }]}
              onPress={async () => {
                try {
                  await orderService.reactivateOrder(order.id);
                  await loadOrder();
                } catch (e: any) {
                  Alert.alert('Error', e.message || 'Unable to reactivate order');
                }
              }}
              activeOpacity={0.8}
            >
              <View style={[s.actionIconCircle, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="refresh-circle" size={18} color="#16a34a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.actionTitle, { color: '#16a34a' }]}>Reactivate Order</Text>
                <Text style={s.actionSub}>Timer restarts from reactivation time</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#86efac" />
            </TouchableOpacity>
          )}
          {order.status === 'DRIVER_ASSIGNED' && order.driverAssignment && (
            <TouchableOpacity style={[s.actionBtn, { borderColor: '#fecaca' }]}
              onPress={handleRejectDriver} activeOpacity={0.8}>
              <View style={[s.actionIconCircle, { backgroundColor: '#fef2f2' }]}>
                <Ionicons name="person-remove" size={18} color="#dc2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.actionTitle, { color: '#dc2626' }]}>Reject This Driver</Text>
                <Text style={s.actionSub}>Search for another driver</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#fca5a5" />
            </TouchableOpacity>
          )}
          {order.status === 'DRIVER_ARRIVED' && order.driverAssignment && (
            <TouchableOpacity style={[s.actionBtn, { borderColor: '#fecaca' }]}
              onPress={handleRejectDriver} activeOpacity={0.8}>
              <View style={[s.actionIconCircle, { backgroundColor: '#fef2f2' }]}>
                <Ionicons name="person-remove" size={18} color="#dc2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.actionTitle, { color: '#dc2626' }]}>Reject driver (after arrival)</Text>
                <Text style={s.actionSub}>You must give a reason — support will be notified</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#fca5a5" />
            </TouchableOpacity>
          )}
          {order.status === 'PENDING_CUSTOMER_APPROVAL' && order.driverAssignment && (
            <>
              <TouchableOpacity style={[s.actionBtn, { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }]}
                onPress={handleApproveDriver} activeOpacity={0.8}>
                <View style={[s.actionIconCircle, { backgroundColor: '#dcfce7' }]}>
                  <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.actionTitle, { color: '#16a34a' }]}>Accept This Driver</Text>
                  <Text style={s.actionSub}>Approve and start delivery</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#86efac" />
              </TouchableOpacity>
              <TouchableOpacity style={[s.actionBtn, { borderColor: '#fecaca' }]}
                onPress={handleRejectDriver} activeOpacity={0.8}>
                <View style={[s.actionIconCircle, { backgroundColor: '#fef2f2' }]}>
                  <Ionicons name="person-remove" size={18} color="#dc2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.actionTitle, { color: '#dc2626' }]}>Reject This Driver</Text>
                  <Text style={s.actionSub}>Search for another driver</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#fca5a5" />
              </TouchableOpacity>
            </>
          )}
          {order.status === 'DELIVERED' && !order.dispute && (
            <TouchableOpacity style={[s.actionBtn, { borderColor: '#fed7aa' }]}
              onPress={handleDispute} activeOpacity={0.8}>
              <View style={[s.actionIconCircle, { backgroundColor: '#ffedd5' }]}>
                <Ionicons name="flag" size={18} color="#ea580c" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.actionTitle, { color: '#ea580c' }]}>Report Issue</Text>
                <Text style={s.actionSub}>Something went wrong?</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#fdba74" />
            </TouchableOpacity>
          )}
          {order.dispute && (order.dispute.status === 'OPEN' || order.dispute.status === 'INVESTIGATING') && (
            <TouchableOpacity style={[s.actionBtn, { borderColor: '#e5e7eb' }]}
              onPress={handleCancelDispute} activeOpacity={0.8}>
              <View style={[s.actionIconCircle, { backgroundColor: '#f3f4f6' }]}>
                <Ionicons name="arrow-undo" size={18} color="#6b7280" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.actionTitle}>Cancel Dispute</Text>
                <Text style={s.actionSub}>Withdraw your dispute</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <Modal visible={rejectModalVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>Reject driver after arrival</Text>
            <Text style={[s.modalSub, { color: colors.textSecondary }]}>
              This is serious. Describe what happened (min. 10 characters). The driver and customer service will be notified.
            </Text>
            <TextInput
              style={[s.modalInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.inputBorder }]}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Your reason..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setRejectModalVisible(false)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSubmitBtn, rejectReason.trim().length < 10 && { opacity: 0.5 }]}
                onPress={confirmRejectArrived}
                disabled={rejectReason.trim().length < 10}
              >
                <Text style={s.modalSubmitText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Dispute Reason Modal ── */}
      <Modal visible={disputeModalVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>Report an Issue</Text>
            <Text style={[s.modalSub, { color: colors.textSecondary }]}>Please describe what went wrong with this order</Text>
            <TextInput
              style={[s.modalInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.inputBorder }]}
              value={disputeReason}
              onChangeText={setDisputeReason}
              placeholder="Describe the issue..."
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setDisputeModalVisible(false)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalSubmitBtn, !disputeReason.trim() && { opacity: 0.5 }]}
                onPress={submitDispute} disabled={!disputeReason.trim()}>
                <Text style={s.modalSubmitText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Driver Reviews Modal ── */}
      <Modal visible={reviewsModalVisible} transparent animationType="fade">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setReviewsModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={[s.modalCard, { maxHeight: '70%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={s.modalTitle}>Driver Reviews</Text>
              <TouchableOpacity onPress={() => setReviewsModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {driverReviews.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#9ca3af', paddingVertical: 20 }}>No reviews yet</Text>
              ) : (
                driverReviews.map(r => (
                  <View key={r.id} style={{ borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingVertical: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>{r.customerName}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="star" size={12} color="#f59e0b" />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#f59e0b' }}>{r.score}/10</Text>
                      </View>
                    </View>
                    {r.comment && (
                      <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 18 }}>"{r.comment}"</Text>
                    )}
                    <Text style={{ fontSize: 11, color: '#d1d5db', marginTop: 4 }}>
                      {new Date(r.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Helper Components ──
function PriceRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={s.priceRow}>
      <Text style={s.priceLabel}>{label}</Text>
      <Text style={s.priceValue}>{value.toFixed(2)} TND</Text>
    </View>
  );
}

function TimelineItem({ label, time, color }: { label: string; time: string; color: string }) {
  const t = new Date(time);
  const timeStr = t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={s.timelineItem}>
      <View style={[s.timelineDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.timelineLabel}>{label}</Text>
      </View>
      <Text style={s.timelineTime}>{timeStr}</Text>
    </View>
  );
}

// ── Styles ──
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },

  header: { paddingTop: 12, paddingBottom: 24, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerAssistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  statusHero: { alignItems: 'center' },
  statusIconCircle: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  statusLabel: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  statusOrderId: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '500' },

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 14 },

  // Delivery progress — single row, all steps visible (flex-shrink labels)
  progressOneLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    paddingTop: 4,
  },
  progressOneLineCell: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 0 },
  progressOneLineDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 6,
  },
  progressOneLineBar: { flex: 1, height: 3, borderRadius: 2, minWidth: 2 },
  progressHDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  progressOneLineLabel: { fontSize: 9, fontWeight: '600', textAlign: 'center', lineHeight: 11, width: '100%' },

  // Quick actions
  quickActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  quickAction: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 14, gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  quickActionText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Route
  routeRow: { flexDirection: 'row' },
  routeIconCol: { alignItems: 'center', marginRight: 14, paddingTop: 2 },
  routeDot: { width: 14, height: 14, borderRadius: 7 },
  routeLine: { width: 2, flex: 1, backgroundColor: '#e5e7eb', marginVertical: 4 },
  routeLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, marginBottom: 2 },
  routeAddress: { fontSize: 14, fontWeight: '600', color: '#111827', lineHeight: 20 },
  routeSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },

  // Chips
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, gap: 5,
  },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 13, fontWeight: '600' },

  // Price
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  priceLabel: { fontSize: 14, color: '#6b7280' },
  priceValue: { fontSize: 14, fontWeight: '600', color: '#374151' },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 6 },
  totalLabel: { fontSize: 18, fontWeight: '800', color: '#111827' },
  totalValue: { fontSize: 20, fontWeight: '800', color: '#0284c7' },

  // Driver
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  driverAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#0284c7',
    alignItems: 'center', justifyContent: 'center',
  },
  driverName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  driverPhone: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  driverChatBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#eff6ff',
    alignItems: 'center', justifyContent: 'center',
  },

  // Timeline
  timeline: { marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f3f4f6', paddingTop: 14, gap: 10 },
  timelineItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timelineDot: { width: 10, height: 10, borderRadius: 5 },
  timelineLabel: { fontSize: 13, color: '#374151', fontWeight: '500' },
  timelineTime: { fontSize: 12, color: '#9ca3af', fontWeight: '500' },

  // Description
  descriptionText: { fontSize: 14, color: '#374151', lineHeight: 20 },

  // Action buttons
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14,
    padding: 14, gap: 12, borderWidth: 1, borderColor: '#e5e7eb',
  },
  actionIconCircle: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
  },
  actionTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  actionSub: { fontSize: 12, color: '#9ca3af', marginTop: 1 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 8,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 6 },
  modalSub: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  modalInput: {
    backgroundColor: '#f8fafc', borderRadius: 14, padding: 14, fontSize: 15, color: '#111827',
    borderWidth: 1, borderColor: '#e5e7eb', minHeight: 100,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#f3f4f6', alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#6b7280' },
  modalSubmitBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#ea580c', alignItems: 'center',
  },
  modalSubmitText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
