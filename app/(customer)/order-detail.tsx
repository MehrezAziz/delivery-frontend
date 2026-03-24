import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl, StyleSheet, TextInput, Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderService, Order } from '../../services/api/order.service';

const STATUS_FLOW = [
  'SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PICKED_UP', 'DELIVERING', 'DELIVERED',
];

const STATUS_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  DRAFT:            { icon: 'document-outline',   color: '#6b7280', bg: '#f3f4f6', label: 'Draft' },
  SEARCHING_DRIVER: { icon: 'search-outline',     color: '#ca8a04', bg: '#fef9c3', label: 'Searching Driver' },
  DRIVER_ASSIGNED:  { icon: 'person-outline',     color: '#2563eb', bg: '#dbeafe', label: 'Driver Assigned' },
  DRIVER_ARRIVED:   { icon: 'flag-outline',       color: '#7c3aed', bg: '#ede9fe', label: 'Driver Arrived' },
  PICKED_UP:        { icon: 'cube-outline',       color: '#ea580c', bg: '#ffedd5', label: 'Picked Up' },
  DELIVERING:       { icon: 'bicycle-outline',    color: '#4f46e5', bg: '#e0e7ff', label: 'On the Way' },
  DELIVERED:        { icon: 'checkmark-circle',    color: '#16a34a', bg: '#dcfce7', label: 'Delivered' },
  CANCELLED:        { icon: 'close-circle',        color: '#dc2626', bg: '#fee2e2', label: 'Cancelled' },
  DISPUTED:         { icon: 'warning-outline',     color: '#dc2626', bg: '#fee2e2', label: 'Disputed' },
  REFUNDED:         { icon: 'arrow-undo-outline',  color: '#6b7280', bg: '#f3f4f6', label: 'Refunded' },
  FAILED:           { icon: 'alert-circle-outline', color: '#dc2626', bg: '#fee2e2', label: 'Failed' },
};

const STAR_LABELS = ['Terrible', 'Very Bad', 'Bad', 'Poor', 'Below Average', 'Average', 'Above Average', 'Good', 'Very Good', 'Excellent', 'Perfect'];

export default function OrderDetailScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disputeModalVisible, setDisputeModalVisible] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [ratingScore, setRatingScore] = useState<number | null>(null);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  const loadOrder = useCallback(async () => {
    try {
      const data = await orderService.getOrder(orderId);
      setOrder(data);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load order');
    } finally { setLoading(false); setRefreshing(false); }
  }, [orderId]);

  useEffect(() => { loadOrder(); }, [loadOrder]);
  useEffect(() => {
    const interval = setInterval(loadOrder, 5000);
    return () => clearInterval(interval);
  }, [loadOrder]);

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

  const handleRejectDriver = () => {
    Alert.alert(
      'Reject Driver',
      'Are you sure you want to reject this driver? The order will go back to searching for a new driver. This driver will not be able to accept this order again.',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, Reject', style: 'destructive', onPress: async () => {
          try {
            await orderService.rejectDriver(orderId);
            loadOrder();
          } catch (e: any) { Alert.alert('Error', e.message); }
        }},
      ],
    );
  };

  if (loading || !order) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#0284c7" />
      </View>
    );
  }

  const meta = STATUS_META[order.status] || STATUS_META.DRAFT;
  const canCancel = ['SEARCHING_DRIVER', 'DRAFT'].includes(order.status);
  const canChangePayment = ['SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED'].includes(order.status);
  const hasChat = !!order.chatRoom && order.chatRoom.status === 'ACTIVE';
  const canTrack = order.status === 'DELIVERING';
  const isActive = STATUS_FLOW.includes(order.status) && order.status !== 'DELIVERED';
  const currentStepIndex = STATUS_FLOW.indexOf(order.status);
  const createdDate = new Date(order.createdAt);
  const dateStr = createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = createdDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={s.container}>
      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: meta.color }]}>
        <View style={s.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Order Details</Text>
          <TouchableOpacity onPress={handleAssistance} style={s.headerBtn}>
            <Ionicons name="headset-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        {/* Status hero */}
        <View style={s.statusHero}>
          <View style={[s.statusIconCircle, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name={meta.icon as any} size={32} color="#fff" />
          </View>
          <Text style={s.statusLabel}>{meta.label}</Text>
          <Text style={s.statusOrderId}>#{order.id.slice(0, 8)}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrder(); }} />}>

        {/* ── Progress Steps (only for active orders) ── */}
        {isActive && currentStepIndex >= 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Delivery Progress</Text>
            <View style={s.stepsRow}>
              {STATUS_FLOW.map((step, i) => {
                const done = i <= currentStepIndex;
                const isCurrent = i === currentStepIndex;
                const stepMeta = STATUS_META[step];
                return (
                  <View key={step} style={s.stepItem}>
                    <View style={[
                      s.stepDot,
                      done && { backgroundColor: meta.color },
                      isCurrent && { transform: [{ scale: 1.3 }] },
                      !done && { backgroundColor: '#e5e7eb' },
                    ]}>
                      {done && <Ionicons name="checkmark" size={10} color="#fff" />}
                    </View>
                    {i < STATUS_FLOW.length - 1 && (
                      <View style={[s.stepLine, done && { backgroundColor: meta.color }]} />
                    )}
                  </View>
                );
              })}
            </View>
            <View style={s.stepsLabels}>
              <Text style={[s.stepLabel, { color: meta.color }]}>Search</Text>
              <Text style={s.stepLabel}>Assign</Text>
              <Text style={s.stepLabel}>Arrive</Text>
              <Text style={s.stepLabel}>Pickup</Text>
              <Text style={s.stepLabel}>Deliver</Text>
              <Text style={s.stepLabel}>Done</Text>
            </View>
          </View>
        )}

        {/* ── Quick Actions (chat + track) ── */}
        {(hasChat || canTrack) && (
          <View style={s.quickActionsRow}>
            {hasChat && (
              <TouchableOpacity style={[s.quickAction, { backgroundColor: '#3b82f6' }]}
                onPress={() => router.push(`/(customer)/order-chat?orderId=${order.id}`)} activeOpacity={0.8}>
                <Ionicons name="chatbubbles" size={20} color="#fff" />
                <Text style={s.quickActionText}>Chat</Text>
              </TouchableOpacity>
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
        <View style={s.card}>
          <Text style={s.cardTitle}>Route</Text>
          <View style={s.routeRow}>
            <View style={s.routeIconCol}>
              <View style={[s.routeDot, { backgroundColor: '#22c55e' }]} />
              <View style={s.routeLine} />
              <View style={[s.routeDot, { backgroundColor: '#ef4444' }]} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ marginBottom: 22 }}>
                <Text style={s.routeLabel}>PICKUP</Text>
                <Text style={s.routeAddress} numberOfLines={2}>{order.pickupAddress?.street || 'Pickup location'}</Text>
                <Text style={s.routeSub}>
                  {order.pickupAddress?.delegation?.nameDelegation}, {order.pickupAddress?.delegation?.governorate?.nameGovernorate}
                </Text>
              </View>
              <View>
                <Text style={s.routeLabel}>DELIVERY</Text>
                <Text style={s.routeAddress} numberOfLines={2}>{order.dropoffAddress?.street || 'Delivery location'}</Text>
                <Text style={s.routeSub}>
                  {order.dropoffAddress?.delegation?.nameDelegation}, {order.dropoffAddress?.delegation?.governorate?.nameGovernorate}
                </Text>
              </View>
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
        <View style={s.card}>
          <Text style={s.cardTitle}>Price Breakdown</Text>
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
          <View style={s.divider} />
          <View style={s.priceRow}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalValue}>{order.price.toFixed(2)} TND</Text>
          </View>
        </View>

        {/* ── Driver Card ── */}
        {order.driverAssignment?.driver && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Your Driver</Text>
            <View style={s.driverRow}>
              <View style={s.driverAvatar}>
                <Ionicons name="person" size={24} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.driverName}>
                  {order.driverAssignment.driver.user.firstName} {order.driverAssignment.driver.user.secondName}
                </Text>
                <Text style={s.driverPhone}>{order.driverAssignment.driver.user.phone}</Text>
                {order.driverAssignment.driver.avgRating !== null && order.driverAssignment.driver.avgRating !== undefined && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Ionicons name="star" size={14} color="#f59e0b" />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#f59e0b' }}>
                      {order.driverAssignment.driver.avgRating.toFixed(1)}/10
                    </Text>
                    <Text style={{ fontSize: 12, color: '#9ca3af' }}>
                      · {order.driverAssignment.driver.completedOrders} deliveries
                    </Text>
                  </View>
                )}
              </View>
              {hasChat && (
                <TouchableOpacity style={s.driverChatBtn}
                  onPress={() => router.push(`/(customer)/order-chat?orderId=${order.id}`)}>
                  <Ionicons name="chatbubble-ellipses" size={18} color="#3b82f6" />
                </TouchableOpacity>
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
          <View style={s.card}>
            <Text style={s.cardTitle}>Package Description</Text>
            <Text style={s.descriptionText}>{order.description}</Text>
          </View>
        )}

        {/* ── Rating (already submitted) ── */}
        {order.rating && (
          <View style={[s.card, { borderLeftWidth: 4, borderLeftColor: '#f59e0b' }]}>
            <Text style={s.cardTitle}>Your Rating</Text>
            <View style={{ alignItems: 'center', gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {Array.from({ length: 10 }, (_, i) => (
                  <Ionicons key={i} name={i < order.rating!.score ? 'star' : 'star-outline'} size={20}
                    color={i < order.rating!.score ? '#f59e0b' : '#d1d5db'} />
                ))}
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>
                {order.rating.score}/10 — {STAR_LABELS[order.rating.score]}
              </Text>
              {order.rating.comment && (
                <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center' }}>"{order.rating.comment}"</Text>
              )}
            </View>
          </View>
        )}

        {/* ── Rate Driver (not yet rated, delivered) ── */}
        {order.status === 'DELIVERED' && !order.rating && (
          <View style={[s.card, { borderLeftWidth: 4, borderLeftColor: '#f59e0b' }]}>
            <Text style={s.cardTitle}>Rate Your Driver</Text>
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
                  width: '100%', backgroundColor: '#f8fafc', borderRadius: 12, padding: 12,
                  fontSize: 14, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb', minHeight: 60,
                }}
                value={ratingComment}
                onChangeText={setRatingComment}
                placeholder="Leave a comment (optional)"
                placeholderTextColor="#9ca3af"
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
          <View style={[s.card, { borderLeftWidth: 4, borderLeftColor: '#dc2626' }]}>
            <Text style={s.cardTitle}>Dispute</Text>
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
            <TouchableOpacity style={s.actionBtn}
              onPress={() => handleChangePayment(order.paymentType === 'COD' ? 'WALLET' : 'COD')} activeOpacity={0.8}>
              <View style={[s.actionIconCircle, { backgroundColor: '#e0e7ff' }]}>
                <Ionicons name="swap-horizontal" size={18} color="#4f46e5" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.actionTitle}>Switch to {order.paymentType === 'COD' ? 'Wallet' : 'Cash'}</Text>
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

      {/* ── Dispute Reason Modal ── */}
      <Modal visible={disputeModalVisible} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Report an Issue</Text>
            <Text style={s.modalSub}>Please describe what went wrong with this order</Text>
            <TextInput
              style={s.modalInput}
              value={disputeReason}
              onChangeText={setDisputeReason}
              placeholder="Describe the issue..."
              placeholderTextColor="#9ca3af"
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

  // Header
  header: { paddingTop: 50, paddingBottom: 24, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 20,
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: 'rgba(255,255,255,0.85)', fontSize: 16, fontWeight: '600' },
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

  // Progress steps
  stepsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#e5e7eb',
  },
  stepLine: { width: 28, height: 3, backgroundColor: '#e5e7eb', borderRadius: 2, marginHorizontal: 2 },
  stepsLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  stepLabel: { fontSize: 9, color: '#9ca3af', fontWeight: '600', textAlign: 'center', width: 42 },

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
