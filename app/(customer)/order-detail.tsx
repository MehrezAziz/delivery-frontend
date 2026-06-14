import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl, StyleSheet, TextInput, Modal, Image, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { clampMinSchedule } from '../../utils/schedPublishHelpers';
import { pickScheduleDateTimeAndroid } from '../../utils/scheduleDateTimePicker';
import { orderService, Order, computeOrderCancelRemainingSec } from '../../services/api/order.service';
import { walletService } from '../../services/api/wallet.service';
import { OrderPreviewAvailableBalance } from '../../components/OrderPreviewPaymentUi';
import { fiatToCoins, hasCoinRate } from '../../utils/orderPriceCoins';
import { useTheme } from '../../contexts/ThemeContext';
import { useOrderChatUnread } from '../../hooks/useOrderChatUnread';
import { ChatUnreadBadge } from '../../components/ChatUnreadBadge';
import {
  restoreOrderTrackingForCustomer,
  subscribeOrderDetailRefresh,
  syncCustomerOrderTrackingFromOrder,
} from '../../services/notifications';

/** Customer-facing delivery steps (no company return / deposit steps). */
const STATUS_FLOW = [
  'SEARCHING_DRIVER', 'PENDING_CUSTOMER_APPROVAL', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PICKED_UP', 'DELIVERING', 'DELIVERED',
];

const STATUS_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  DRAFT:            { icon: 'document-outline',   color: '#6b7280', bg: '#f3f4f6', label: 'Draft' },
  PENDING_PUBLISH:  { icon: 'calendar-outline',   color: '#0284c7', bg: '#e0f2fe', label: 'Scheduled' },
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
  const { t } = useTranslation();
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
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [draftPublishAt, setDraftPublishAt] = useState(new Date());
  const [scheduleIosOpen, setScheduleIosOpen] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [walletSpendable, setWalletSpendable] = useState<number | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);
  const [driverCardY, setDriverCardY] = useState<number | null>(null);
  const hasAutoScrolledRef = useRef(false);

  const loadOrder = useCallback(async () => {
    try {
      const data = await orderService.getOrder(orderId);
      setOrder(data);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || t('common.something_went_wrong'));
    } finally { setLoading(false); setRefreshing(false); }
  }, [orderId, t]);

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'PENDING_PUBLISH': return t('customerHome.status.Scheduled');
      case 'SEARCHING_DRIVER': return t('customerHome.status.Searching');
      case 'PENDING_CUSTOMER_APPROVAL': return t('orderDetail.waitingApproval');
      case 'DRIVER_ASSIGNED': return t('customerHome.status.Assigned');
      case 'DRIVER_ARRIVED': return t('customerHome.status.Arrived');
      case 'PICKED_UP': return t('customerHome.status.PickedUp');
      case 'DELIVERING': return t('customerHome.status.OnTheWay');
      case 'DELIVERED': return t('orderDetail.delivered');
      case 'CANCELLED': return t('orderDetail.cancelled');
      case 'REFUNDED': return t('orderDetail.refunded');
      case 'DISPUTED': return t('orderDetail.dispute');
      default: return STATUS_META[status]?.label ?? status;
    }
  };

  useEffect(() => { loadOrder(); }, [loadOrder]);

  const loadWalletBalance = useCallback(async () => {
    try {
      const w = await walletService.getWallet();
      setWalletSpendable(w.spendable ?? w.balance ?? 0);
    } catch {
      setWalletSpendable(null);
    }
  }, []);

  useEffect(() => {
    void loadWalletBalance();
  }, [loadWalletBalance]);
  useEffect(() => {
    if (!orderId) return;
    return subscribeOrderDetailRefresh(orderId, () => {
      void loadOrder();
    });
  }, [orderId, loadOrder]);

  // Keep Android persistent order tracking notification synchronized from this exact order payload
  // while user is on order details (even if push arrives late/missed).
  useEffect(() => {
    if (!order) return;
    void syncCustomerOrderTrackingFromOrder(order);
  }, [order?.id, order?.status]);

  // Safety reconciliation with global tracker map (covers app reopen / stale map cases).
  useEffect(() => {
    if (!order?.id) return;
    void restoreOrderTrackingForCustomer();
  }, [order?.id, order?.status]);
  useEffect(() => {
    if (!orderId) return;
    const pollMs =
      order?.status === 'SEARCHING_DRIVER' ? 3000 : order?.status === 'PENDING_PUBLISH' ? 10000 : 5000;
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
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
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
    Alert.alert(t('orderDetail.cancelConfirm'), t('orderDetail.cancelConfirmBody'), [
      { text: t('common.no'), style: 'cancel' },
      { text: t('common.yes'), style: 'destructive', onPress: async () => {
        try {
          await orderService.cancelOrder(orderId, t('orderDetail.cancelled'));
          loadOrder();
        } catch (e: any) { Alert.alert(t('common.error'), e.message); }
      }},
    ]);
  };

  const handleChangePayment = (type: 'COD' | 'WALLET') => {
    Alert.alert(t('orderDetail.paymentMethod'), `${type === 'COD' ? t('orderDetail.cash') : t('orderDetail.wallet')}?`, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), onPress: async () => {
        try {
          const updated = await orderService.changePaymentMethod(orderId, type);
          setOrder(updated);
        } catch (e: any) { Alert.alert(t('common.error'), e.message); }
      }},
    ]);
  };

  const handleAssistance = async () => {
    try {
      const ticket = await orderService.requestAssistance(orderId, t('support.describeIssue'));
      router.push(`/(customer)/support-chat?ticketId=${(ticket as any).id}`);
    } catch (e: any) { Alert.alert(t('common.error'), e.message); }
  };

  const handleDispute = () => {
    setDisputeReason('');
    setDisputeModalVisible(true);
  };

  const submitDispute = async () => {
    if (!disputeReason.trim()) {
      Alert.alert(t('common.error'), t('orderDetail.disputeReason'));
      return;
    }
    setDisputeModalVisible(false);
    try {
      await orderService.createDispute(orderId, disputeReason.trim());
      Alert.alert(t('orderDetail.disputeSubmitted'), t('support.submittedBody'));
      loadOrder();
    } catch (e: any) { Alert.alert(t('common.error'), e.message); }
  };

  const submitRating = async () => {
    if (ratingScore === null) {
      Alert.alert(t('common.error'), t('orderDetail.rateExperience'));
      return;
    }
    setRatingSubmitting(true);
    try {
      await orderService.rateOrder(orderId, ratingScore, ratingComment.trim() || undefined);
      Alert.alert(t('common.success'), t('orderDetail.ratingSubmitted'));
      loadOrder();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || t('orderDetail.ratingFailed'));
    } finally {
      setRatingSubmitting(false);
    }
  };

  const handleCancelDispute = () => {
    Alert.alert(t('orderDetail.dispute'), t('orderDetail.cancelConfirmBody'), [
      { text: t('common.no'), style: 'cancel' },
      { text: t('common.yes'), style: 'destructive', onPress: async () => {
        try {
          await orderService.cancelDispute(orderId);
          loadOrder();
        } catch (e: any) { Alert.alert(t('common.error'), e.message); }
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
      Alert.alert(t('common.error'), e.message);
    }
  };

  const handleRejectDriver = () => {
    if (order?.status === 'DRIVER_ARRIVED') {
      setRejectReason('');
      setRejectModalVisible(true);
      return;
    }
    Alert.alert(
      t('orderDetail.rejectDriver'),
      t('orderDetail.cancelConfirmBody'),
      [
        { text: t('common.no'), style: 'cancel' },
        { text: t('common.yes'), style: 'destructive', onPress: () => submitRejectDriver(undefined) },
      ],
    );
  };

  const confirmRejectArrived = () => {
    const r = rejectReason.trim();
    if (r.length < 10) {
      Alert.alert(t('common.required'), t('orderDetail.disputeReason'));
      return;
    }
    submitRejectDriver(r);
  };

  const handleNotifyDrivers = async () => {
    setNotifyLoading(true);
    try {
      const res = await orderService.notifyDriversUrgent(orderId);
      Alert.alert(t('common.success'), res.message || `${res.notifiedDrivers}`);
      loadOrder();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || t('common.tryAgain'));
    } finally {
      setNotifyLoading(false);
    }
  };

  const handleApproveDriver = async () => {
    try {
      await orderService.approveDriver(orderId);
      loadOrder();
    } catch (e: any) { Alert.alert(t('common.error'), e.message); }
  };

  const handleShowReviews = async () => {
    try {
      const data = await orderService.getDriverReviews(orderId);
      setDriverReviews(data.reviews);
      setReviewsModalVisible(true);
    } catch (e: any) { Alert.alert(t('common.error'), e.message || t('common.something_went_wrong')); }
  };

  if (loading || !order) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const meta = STATUS_META[order.status] || STATUS_META.DRAFT;
  const canCancel = ['SEARCHING_DRIVER', 'DRAFT', 'PENDING_PUBLISH'].includes(order.status);
  const canReactivate = ['CANCELLED', 'AUTO_CANCELLED'].includes(order.status);
  const canChangePayment = [
    'SEARCHING_DRIVER',
    'PENDING_PUBLISH',
    'PENDING_CUSTOMER_APPROVAL',
    'DRIVER_ASSIGNED',
    'DRIVER_ARRIVED',
  ].includes(order.status);
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

  const openScheduleEditor = () => {
    const base = order.scheduledPublishAt
      ? new Date(order.scheduledPublishAt)
      : new Date(Date.now() + 5 * 60 * 1000);
    setDraftPublishAt(clampMinSchedule(base));
    setScheduleIosOpen(Platform.OS === 'ios');
    setScheduleModalVisible(true);
  };

  const openSchedulePickers = async () => {
    if (Platform.OS === 'android') {
      const picked = await pickScheduleDateTimeAndroid(draftPublishAt);
      if (picked) setDraftPublishAt(picked);
      return;
    }
    setScheduleIosOpen(true);
  };

  const onScheduleIosChange = (_: DateTimePickerEvent, d?: Date) => {
    if (d) setDraftPublishAt(clampMinSchedule(d));
  };

  const saveSchedule = async () => {
    const iso = clampMinSchedule(draftPublishAt).toISOString();
    setScheduleSaving(true);
    try {
      const updated = await orderService.updateScheduledPublish(orderId, iso);
      setOrder(updated);
      setScheduleModalVisible(false);
      setScheduleIosOpen(false);
      void syncCustomerOrderTrackingFromOrder(updated);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('common.tryAgain'));
    } finally {
      setScheduleSaving(false);
    }
  };

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: meta.color }]}>
        <View style={s.headerAssistRow}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={handleAssistance} style={s.headerBtn} accessibilityLabel={t('support.contactSupport')}>
            <Ionicons name="headset-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={s.statusHero}>
          <View style={[s.statusIconCircle, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name={meta.icon as any} size={32} color="#fff" />
          </View>
          <Text style={s.statusLabel}>{getStatusLabel(order.status)}</Text>
          <Text style={s.statusOrderId}>#{order.id.slice(0, 8)}</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrder(); }} />}>

        {order.status === 'PENDING_PUBLISH' && order.scheduledPublishAt ? (
          <View style={[s.card, { backgroundColor: colors.card, marginBottom: 16 }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>{t('customerHome.status.Scheduled')}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 14 }}>
              <Text style={{ fontWeight: '800', color: colors.text }}>
                {new Date(order.scheduledPublishAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </Text>
            </Text>
            <TouchableOpacity
              style={[s.actionBtn, { borderColor: colors.primary, backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : '#e0f2fe' }]}
              onPress={openScheduleEditor}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={20} color={colors.primary} />
              <Text style={[s.actionTitle, { color: colors.primary }]}>{t('common.edit')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Progress Steps (only for active orders) ── */}
        {isActive && currentStepIndex >= 0 && (
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>{t('orderDetail.timeline')}</Text>
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
                      {getStatusLabel(step)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {order.status === 'SEARCHING_DRIVER' && order.urgentNotify && (
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>{t('orderDetail.notifyDrivers')}</Text>
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
                  {t('orderDetail.notifyDriversNow')}
                </Text>
              )}
            </TouchableOpacity>
            {order.urgentNotify.nextButtonEnabledAt && urgentRemainingSec > 0 && (
              <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 8 }}>
                {t('orderDetail.nextUrgentNotifyIn', {
                  time: `${Math.floor(urgentRemainingSec / 60)}:${String(urgentRemainingSec % 60).padStart(2, '0')}`,
                })}
              </Text>
            )}
          </View>
        )}

        {order.status === 'SEARCHING_DRIVER' && (
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>{t('orderDetail.cancelOrder')}</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 10 }}>
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
                          Alert.alert(t('common.error'), e.message || t('common.tryAgain'));
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
              <View style={s.quickActionSlot}>
                <TouchableOpacity style={[s.quickAction, { backgroundColor: '#3b82f6' }]}
                  onPress={() => router.push(`/(customer)/order-chat?orderId=${order.id}`)} activeOpacity={0.8}>
                  <Ionicons name="chatbubbles" size={20} color="#fff" />
                  <Text style={s.quickActionText}>{t('orderDetail.chat')}</Text>
                </TouchableOpacity>
                <ChatUnreadBadge count={chatUnread} />
              </View>
            )}
            {canTrack && (
              <View style={s.quickActionSlot}>
                <TouchableOpacity style={[s.quickAction, { backgroundColor: '#6366f1' }]}
                  onPress={() => router.push(`/(customer)/track-driver?orderId=${order.id}`)} activeOpacity={0.8}>
                  <Ionicons name="navigate" size={20} color="#fff" />
                  <Text style={s.quickActionText}>{t('orderDetail.track')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ── Route Card ── */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.cardTitle, { color: colors.text }]}>{t('orderDetail.pickup')} / {t('orderDetail.delivery')}</Text>
          <View style={s.routeRow}>
            <View style={s.routeIconCol}>
              <View style={[s.routeDot, { backgroundColor: '#22c55e' }]} />
              <View style={s.routeLine} />
              <View style={[s.routeDot, { backgroundColor: '#ef4444' }]} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ marginBottom: 22 }}>
                <Text style={s.routeLabel}>{t('createOrder.pickup').toUpperCase()}</Text>
                <Text style={[s.routeAddress, { color: colors.text }]} numberOfLines={2}>
                  {(order.pickupAddress as any)?.nickname ? `${(order.pickupAddress as any).nickname} — ` : ''}
                  {order.pickupAddress?.street || t('orderDetail.pickup')}
                </Text>
                <Text style={[s.routeSub, { color: colors.textSecondary }]}>
                  {order.pickupAddress?.delegation?.nameDelegation}, {order.pickupAddress?.delegation?.governorate?.nameGovernorate}
                </Text>
              </View>
              {order.localPickupOnly ? (
                <Text style={[s.routeSub, { color: colors.textSecondary, fontStyle: 'italic' }]}>
                  {t('localPickup.description')}
                </Text>
              ) : (
                <View>
                  <Text style={s.routeLabel}>{t('createOrder.delivery').toUpperCase()}</Text>
                  <Text style={[s.routeAddress, { color: colors.text }]} numberOfLines={2}>
                    {(order.dropoffAddress as any)?.nickname ? `${(order.dropoffAddress as any).nickname} — ` : ''}
                    {order.dropoffAddress?.street || t('orderDetail.delivery')}
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
              {order.paymentType === 'COD' ? t('orderDetail.cash') : t('orderDetail.wallet')}
            </Text>
          </View>
          <View style={[s.chip, { backgroundColor: '#f3f4f6' }]}>
            <Text style={s.chipEmoji}>📦</Text>
            <Text style={[s.chipText, { color: '#374151' }]}>{order.weight} {t('common.kg')}</Text>
          </View>
          <View style={[s.chip, { backgroundColor: '#f3f4f6' }]}>
            <Text style={s.chipEmoji}>📏</Text>
            <Text style={[s.chipText, { color: '#374151' }]}>{order.distanceKm.toFixed(1)} {t('common.km')}</Text>
          </View>
          {order.isNightDelivery && (
            <View style={[s.chip, { backgroundColor: '#e0e7ff' }]}>
              <Text style={s.chipEmoji}>🌙</Text>
              <Text style={[s.chipText, { color: '#3730a3' }]}>{t('orderDetail.timeline')}</Text>
            </View>
          )}
          <View style={[s.chip, { backgroundColor: '#f3f4f6' }]}>
            <Text style={s.chipEmoji}>🕐</Text>
            <Text style={[s.chipText, { color: '#374151' }]}>{dateStr}</Text>
          </View>
        </View>

        {/* ── Price Breakdown ── */}
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <Text style={[s.cardTitle, { color: colors.text }]}>{t('orderDetail.fee')}</Text>
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>{t('orderDetail.distance')}</Text>
            <Text style={s.priceValue}>{order.distanceKm.toFixed(1)} {t('common.km')}</Text>
          </View>
          <View style={s.priceRow}>
            <Text style={s.priceLabel}>{t('createOrder.weight')}</Text>
            <Text style={s.priceValue}>{order.weight} {t('common.kg')}</Text>
          </View>
          {order.deliveryZoneType && (
            <View style={s.priceRow}>
              <Text style={s.priceLabel}>{t('orderDetail.delivery')}</Text>
              <Text style={s.priceValue}>{order.deliveryZoneType.replace(/_/g, ' ')}</Text>
            </View>
          )}
          {order.extraWeightFee > 0 && <PriceRow label={t('createOrder.weight')} value={order.extraWeightFee} />}
          {order.nightFee > 0 && <PriceRow label={t('orderDetail.fee')} value={order.nightFee} />}
          {(order.customerExtraAmount ?? 0) > 0 && (
            <PriceRow label={t('orderDetail.fee')} value={order.customerExtraAmount ?? 0} />
          )}
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          <View style={s.priceRow}>
            <Text style={[s.totalLabel, { color: colors.text }]}>{t('orderDetail.total')}</Text>
            <Text style={[s.totalValue, { color: colors.primary }]}>{order.price.toFixed(2)} {t('common.tnd')}</Text>
          </View>
          <View style={{ marginTop: 14 }}>
            <OrderPreviewAvailableBalance
              walletBalance={walletSpendable}
              isCash={order.paymentType === 'COD'}
              coinsPerFiatUnit={order.coinsPerFiatUnit}
              currencySymbol={order.currencySymbol ?? order.currencyCode ?? 'TND'}
              orderTotalCoins={
                order.priceCoins ??
                (hasCoinRate(order.coinsPerFiatUnit)
                  ? fiatToCoins(order.price, order.coinsPerFiatUnit!)
                  : order.price)
              }
              colors={colors}
              isDark={isDark}
            />
          </View>
        </View>

        {/* ── Driver Card ── */}
        {order.driverAssignment?.driver && (
          <View
            style={[s.card, { backgroundColor: colors.card }]}
            onLayout={(event) => setDriverCardY(event.nativeEvent.layout.y)}
          >
            <Text style={[s.cardTitle, { color: colors.text }]}>{t('orderDetail.driver')}</Text>
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
                      · {order.driverAssignment.driver.completedOrders}
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
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#16a34a' }}>{order.driverAssignment.driver.completionRate.toFixed(0)}%</Text>
                  </View>
                )}
                {order.driverAssignment.driver.avgDeliveryTimeMinutes !== null && (
                  <View style={{ backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="time-outline" size={14} color="#2563eb" />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#2563eb' }}>~{order.driverAssignment.driver.avgDeliveryTimeMinutes} min</Text>
                  </View>
                )}
                <View style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="stats-chart-outline" size={14} color="#6b7280" />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280' }}>{order.driverAssignment.driver.totalOrders}</Text>
                </View>
              </View>
            )}
            {/* Timeline */}
            {(order.driverAssignment.acceptedAt || order.driverAssignment.arrivedAt ||
              order.driverAssignment.pickedUpAt || order.driverAssignment.deliveredAt) && (
              <View style={s.timeline}>
                {order.driverAssignment.acceptedAt && (
                  <TimelineItem label={t('common.confirm')} time={order.driverAssignment.acceptedAt} color="#2563eb" />
                )}
                {order.driverAssignment.arrivedAt && (
                  <TimelineItem label={t('trackDriver.arrivedAtPickup')} time={order.driverAssignment.arrivedAt} color="#7c3aed" />
                )}
                {order.driverAssignment.pickedUpAt && (
                  <TimelineItem label={t('customerHome.status.PickedUp')} time={order.driverAssignment.pickedUpAt} color="#ea580c" />
                )}
                {order.driverAssignment.deliveredAt && (
                  <TimelineItem label={t('orderDetail.delivered')} time={order.driverAssignment.deliveredAt} color="#16a34a" />
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Description ── */}
        {order.description && (
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>{t('createOrder.packageDescription')}</Text>
            <Text style={[s.descriptionText, { color: colors.text }]}>{order.description}</Text>
          </View>
        )}

        {/* ── Rating (already submitted) ── */}
        {order.rating && (
          <View style={[s.card, { backgroundColor: colors.card, borderLeftWidth: 4, borderLeftColor: '#f59e0b' }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>{t('orderDetail.rateDriver')}</Text>
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
            <Text style={[s.cardTitle, { color: colors.text }]}>{t('orderDetail.rateDriver')}</Text>
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
                placeholder={t('orderDetail.leaveAReview')}
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
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{t('orderDetail.submitRating')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Dispute Info ── */}
        {order.dispute && (
          <View style={[s.card, { backgroundColor: colors.card, borderLeftWidth: 4, borderLeftColor: '#dc2626' }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>{t('orderDetail.dispute')}</Text>
            <View style={{ gap: 8 }}>
              <View style={s.priceRow}>
                <Text style={s.priceLabel}>{t('orderDetail.status')}</Text>
                <View style={[s.chip, { backgroundColor: order.dispute.status === 'OPEN' ? '#fee2e2' : order.dispute.status === 'RESOLVED' ? '#dcfce7' : '#fef9c3' }]}>
                  <Text style={[s.chipText, { color: order.dispute.status === 'OPEN' ? '#dc2626' : order.dispute.status === 'RESOLVED' ? '#16a34a' : '#ca8a04' }]}>
                    {order.dispute.status}
                  </Text>
                </View>
              </View>
              <View>
                <Text style={s.priceLabel}>{t('restrictions.reason')}</Text>
                <Text style={[s.descriptionText, { marginTop: 4 }]}>{order.dispute.reason}</Text>
              </View>
              {order.dispute.resolution && (
                <View>
                  <Text style={s.priceLabel}>{t('common.success')}</Text>
                  <Text style={[s.descriptionText, { marginTop: 4 }]}>{order.dispute.resolution}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── Actions ── */}
        <View style={{ gap: 10, marginTop: 4 }}>
          {canChangePayment && (
            <>
              <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleChangePayment(order.paymentType === 'COD' ? 'WALLET' : 'COD')} activeOpacity={0.8}>
                <View style={[s.actionIconCircle, { backgroundColor: '#e0e7ff' }]}>
                  <Ionicons name="swap-horizontal" size={18} color="#4f46e5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.actionTitle, { color: colors.text }]}>{order.paymentType === 'COD' ? t('orderDetail.wallet') : t('orderDetail.cash')}</Text>
                  <Text style={s.actionSub}>{t('orderDetail.paymentMethod')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
              </TouchableOpacity>
              {canCancel && (
                <TouchableOpacity
                  style={[
                    s.cancelOrderInline,
                    { backgroundColor: isDark ? '#7f1d1d' : '#dc2626' },
                  ]}
                  onPress={handleCancel}
                  activeOpacity={0.85}
                >
                  <Ionicons name="close-circle" size={14} color="#fff" />
                  <Text style={s.cancelOrderText}>{t('orderDetail.cancelOrder')}</Text>
                </TouchableOpacity>
              )}
            </>
          )}
          {canCancel && !canChangePayment && (
            <TouchableOpacity
              style={[
                s.cancelOrderInline,
                { backgroundColor: isDark ? '#7f1d1d' : '#dc2626' },
              ]}
              onPress={handleCancel}
              activeOpacity={0.85}
            >
              <Ionicons name="close-circle" size={14} color="#fff" />
              <Text style={s.cancelOrderText}>{t('orderDetail.cancelOrder')}</Text>
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
                  Alert.alert(t('common.error'), e.message || t('common.tryAgain'));
                }
              }}
              activeOpacity={0.8}
            >
              <View style={[s.actionIconCircle, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="refresh-circle" size={18} color="#16a34a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.actionTitle, { color: '#16a34a' }]}>{t('common.refresh')}</Text>
                <Text style={s.actionSub}>{t('common.retry')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#86efac" />
            </TouchableOpacity>
          )}
          {order.status === 'DRIVER_ASSIGNED' && order.driverAssignment && (
            <View style={s.rejectDriverRow}>
              <TouchableOpacity style={[s.rejectDriverBtn, { borderColor: '#fecaca' }]}
                onPress={handleRejectDriver} activeOpacity={0.8}>
                <Ionicons name="person-remove" size={14} color="#dc2626" />
                <Text style={s.rejectDriverText}>{t('orderDetail.rejectDriver')}</Text>
              </TouchableOpacity>
            </View>
          )}
          {order.status === 'DRIVER_ARRIVED' && order.driverAssignment && (
            <View style={s.rejectDriverRow}>
              <TouchableOpacity style={[s.rejectDriverBtn, { borderColor: '#fecaca' }]}
                onPress={handleRejectDriver} activeOpacity={0.8}>
                <Ionicons name="person-remove" size={14} color="#dc2626" />
                <Text style={s.rejectDriverText}>{t('orderDetail.rejectDriver')}</Text>
              </TouchableOpacity>
            </View>
          )}
          {order.status === 'PENDING_CUSTOMER_APPROVAL' && order.driverAssignment && (
            <>
              <TouchableOpacity style={[s.actionBtn, { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }]}
                onPress={handleApproveDriver} activeOpacity={0.8}>
                <View style={[s.actionIconCircle, { backgroundColor: '#dcfce7' }]}>
                  <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.actionTitle, { color: '#16a34a' }]}>{t('orderDetail.approveDriver')}</Text>
                  <Text style={s.actionSub}>{t('orderDetail.driverApproved')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#86efac" />
              </TouchableOpacity>
              <View style={s.rejectDriverRow}>
                <TouchableOpacity style={[s.rejectDriverBtn, { borderColor: '#fecaca' }]}
                  onPress={handleRejectDriver} activeOpacity={0.8}>
                  <Ionicons name="person-remove" size={14} color="#dc2626" />
                  <Text style={s.rejectDriverText}>{t('orderDetail.rejectDriver')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
          {order.status === 'DELIVERED' && !order.dispute && (
            <TouchableOpacity style={[s.actionBtn, { borderColor: '#fed7aa' }]}
              onPress={handleDispute} activeOpacity={0.8}>
              <View style={[s.actionIconCircle, { backgroundColor: '#ffedd5' }]}>
                <Ionicons name="flag" size={18} color="#ea580c" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.actionTitle, { color: '#ea580c' }]}>{t('orderDetail.dispute')}</Text>
                <Text style={s.actionSub}>{t('common.something_went_wrong')}</Text>
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
                <Text style={s.actionTitle}>{t('common.cancel')}</Text>
                <Text style={s.actionSub}>{t('orderDetail.dispute')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <Modal visible={rejectModalVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>{t('orderDetail.rejectDriver')}</Text>
            <Text style={[s.modalSub, { color: colors.textSecondary }]}>
              {t('orderDetail.disputeReason')}
            </Text>
            <TextInput
              style={[s.modalInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.inputBorder }]}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder={t('restrictions.reason')}
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setRejectModalVisible(false)}>
                <Text style={s.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSubmitBtn, rejectReason.trim().length < 10 && { opacity: 0.5 }]}
                onPress={confirmRejectArrived}
                disabled={rejectReason.trim().length < 10}
              >
                <Text style={s.modalSubmitText}>{t('common.submit')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Dispute Reason Modal ── */}
      <Modal visible={disputeModalVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>{t('orderDetail.dispute')}</Text>
            <Text style={[s.modalSub, { color: colors.textSecondary }]}>{t('orderDetail.disputeReason')}</Text>
            <TextInput
              style={[s.modalInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.inputBorder }]}
              value={disputeReason}
              onChangeText={setDisputeReason}
              placeholder={t('support.describeIssue')}
              placeholderTextColor={colors.textTertiary}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setDisputeModalVisible(false)}>
                <Text style={s.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalSubmitBtn, !disputeReason.trim() && { opacity: 0.5 }]}
                onPress={submitDispute} disabled={!disputeReason.trim()}>
                <Text style={s.modalSubmitText}>{t('common.submit')}</Text>
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
              <Text style={s.modalTitle}>{t('orderDetail.rateDriver')}</Text>
              <TouchableOpacity onPress={() => setReviewsModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {driverReviews.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#9ca3af', paddingVertical: 20 }}>{t('common.noResults')}</Text>
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

      <Modal
        visible={scheduleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setScheduleModalVisible(false);
          setScheduleIosOpen(false);
        }}
      >
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>{t('createOrder.scheduleFor')}</Text>
            <Text style={[s.modalSub, { color: colors.textSecondary }]}>
              {t('createOrder.later')}
            </Text>
            <TouchableOpacity
              style={[s.schedulePickRow, { borderColor: colors.border, backgroundColor: colors.inputBg ?? colors.card }]}
              onPress={() => void openSchedulePickers()}
              activeOpacity={0.8}
            >
              <Ionicons name="calendar-outline" size={22} color={colors.primary} />
              <Text style={[s.actionTitle, { color: colors.text, flex: 1, marginLeft: 12 }]}>
                {draftPublishAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </Text>
            </TouchableOpacity>
            {Platform.OS === 'ios' && scheduleIosOpen && scheduleModalVisible ? (
              <DateTimePicker
                value={draftPublishAt}
                mode="datetime"
                display="spinner"
                minimumDate={new Date(Date.now() + 60 * 1000)}
                themeVariant={isDark ? 'dark' : 'light'}
                onValueChange={onScheduleIosChange}
                onDismiss={() => setScheduleIosOpen(false)}
                style={{ marginBottom: 8 }}
              />
            ) : null}
            <View style={s.modalActions}>
              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={() => {
                  setScheduleModalVisible(false);
                  setScheduleIosOpen(false);
                }}
              >
                <Text style={s.modalCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalSubmitBtn, scheduleSaving && { opacity: 0.6 }]}
                onPress={() => void saveSchedule()}
                disabled={scheduleSaving}
              >
                {scheduleSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.modalSubmitText}>{t('common.save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  const d = new Date(time);
  const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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
  quickActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 14, justifyContent: 'center', alignSelf: 'center', width: '100%', maxWidth: 460 },
  quickActionSlot: { flex: 1, position: 'relative' },
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
  rejectDriverRow: { alignItems: 'flex-end', marginBottom: 8 },
  rejectDriverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#fef2f2',
  },
  rejectDriverText: { fontSize: 13, fontWeight: '600', color: '#dc2626' },

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
  schedulePickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
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
  cancelOrderInline: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  cancelOrderText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
