import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { orderService, Order } from '../../services/api/order.service';
import { useTheme } from '../../contexts/ThemeContext';
import { restoreOrderTrackingForDriver } from '../../services/notifications';

const STATUS_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  DRAFT:            { icon: 'document-outline',    color: '#6b7280', bg: '#f3f4f6', label: 'Draft' },
  SEARCHING_DRIVER: { icon: 'search-outline',      color: '#ca8a04', bg: '#fef9c3', label: 'Searching' },
  PENDING_CUSTOMER_APPROVAL: { icon: 'hourglass-outline', color: '#ea580c', bg: '#ffedd5', label: 'Waiting for Customer' },
  DRIVER_ASSIGNED:  { icon: 'person-outline',      color: '#2563eb', bg: '#dbeafe', label: 'Assigned' },
  DRIVER_ARRIVED:   { icon: 'flag-outline',        color: '#7c3aed', bg: '#ede9fe', label: 'Arrived' },
  PICKED_UP:        { icon: 'cube-outline',        color: '#ea580c', bg: '#ffedd5', label: 'Picked Up' },
  DELIVERING:       { icon: 'bicycle-outline',     color: '#4f46e5', bg: '#e0e7ff', label: 'Delivering' },
  DELIVERED:        { icon: 'checkmark-circle',    color: '#16a34a', bg: '#dcfce7', label: 'Delivered' },
  CANCELLED:        { icon: 'close-circle',        color: '#dc2626', bg: '#fee2e2', label: 'Cancelled' },
  DISPUTED:         { icon: 'warning-outline',     color: '#dc2626', bg: '#fee2e2', label: 'Disputed' },
  REFUNDED:         { icon: 'arrow-undo-outline',  color: '#6b7280', bg: '#f3f4f6', label: 'Refunded' },
};

const STAR_LABELS = ['Terrible','Very Bad','Bad','Poor','Below Avg','Average','Above Avg','Good','Very Good','Excellent','Perfect'];

export default function DriverOrderDetailScreen() {
  const router = useRouter();
  const { orderId, scrollTo } = useLocalSearchParams<{ orderId: string; scrollTo?: string }>();
  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(driver)/home');
  };
  const { colors, isDark } = useTheme();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try { setOrder(await orderService.getOrder(orderId)); }
    catch (e: any) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);
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

  const handleDelivered = async () => {
    if (!order || statusUpdating) return;
    const hasProof1 = Boolean(order.driverAssignment?.image1Proof);
    if (!hasProof1) {
      router.push(`/(driver)/upload-proofs?orderId=${order.id}` as any);
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

  if (loading || !order) {
    return <View style={[s.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const meta = STATUS_META[order.status] || STATUS_META.DELIVERED;
  const da = order.driverAssignment;
  const showProofSection = ['DRIVER_ARRIVED', 'PICKED_UP', 'DELIVERING', 'DELIVERED'].includes(order.status);
  const canRevert = ['DRIVER_ARRIVED', 'PICKED_UP', 'DELIVERING'].includes(order.status);
  const nextActionLabel: Record<string, string> = {
    DRIVER_ASSIGNED: "I've arrived",
    DRIVER_ARRIVED: 'Package picked up',
    PICKED_UP: 'Start delivering now',
  };
  const canGoNext = Boolean(nextActionLabel[order.status]);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: meta.color }]}>
        <View style={s.headerTop}>
          <TouchableOpacity onPress={handleBack} style={s.headerBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Order Details</Text>
          <View style={{ width: 38 }} />
        </View>
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
                <Text style={[s.routeAddress, { color: colors.text }]} numberOfLines={2}>{order.pickupAddress?.street || 'Pickup'}</Text>
                <Text style={[s.routeSub, { color: colors.textSecondary }]}>
                  {order.pickupAddress?.delegation?.nameDelegation}, {order.pickupAddress?.delegation?.governorate?.nameGovernorate}
                </Text>
              </View>
              <View>
                <Text style={[s.routeLabel, { color: colors.textTertiary }]}>DELIVERY</Text>
                <Text style={[s.routeAddress, { color: colors.text }]} numberOfLines={2}>{order.dropoffAddress?.street || 'Dropoff'}</Text>
                <Text style={[s.routeSub, { color: colors.textSecondary }]}>
                  {order.dropoffAddress?.delegation?.nameDelegation}, {order.dropoffAddress?.delegation?.governorate?.nameGovernorate}
                </Text>
              </View>
            </View>
          </View>
        </View>

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
        </View>

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

        {(canRevert || canGoNext || order.status === 'DELIVERING') && (
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
                  <Text style={s.revertBtnText}>Return</Text>
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
                <TouchableOpacity
                  style={[s.nextBtn, { backgroundColor: '#16a34a' }, statusUpdating && { opacity: 0.6 }]}
                  onPress={handleDelivered}
                  disabled={statusUpdating}
                >
                  <Text style={s.nextBtnText}>Delivered</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Customer info */}
        {order.description && (
          <View style={[s.card, { backgroundColor: colors.card }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Package Description</Text>
            <Text style={[s.descText, { color: colors.text }]}>{order.description}</Text>
          </View>
        )}

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
              onPress={() => router.push(`/(driver)/upload-proofs?orderId=${order.id}` as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
              <Text style={s.proofActionText}>
                {da.image1Proof ? 'Update proof images' : 'Add proof images'}
              </Text>
            </TouchableOpacity>
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
});
