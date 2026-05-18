import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { orderService, Order } from '../../services/api/order.service';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppNavigation } from '../../contexts/AppNavigationContext';
import { GameEntrySection } from '../../components/games/GameEntrySection';
import {
  restoreOrderTrackingForDriver,
  stopOrderTrackingSilently,
  subscribeDriverMyOrdersRefresh,
} from '../../services/notifications';
import { fetchChatUnreadMapForOrders } from '../../hooks/useOrderChatUnread';
import { ChatUnreadBadge } from '../../components/ChatUnreadBadge';
import { appAlert } from '../../utils/appAlert';

const STATUS_META: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  PENDING_CUSTOMER_APPROVAL: { color: '#ea580c', bg: '#ffedd5', label: 'Waiting for Customer', icon: 'hourglass-outline' },
  DRIVER_ASSIGNED: { color: '#2563eb', bg: '#dbeafe', label: 'Assigned',    icon: 'person-outline' },
  DRIVER_ARRIVED:  { color: '#7c3aed', bg: '#ede9fe', label: 'Arrived',     icon: 'flag-outline' },
  PICKED_UP:       { color: '#ea580c', bg: '#ffedd5', label: 'Picked Up',   icon: 'cube-outline' },
  DELIVERING:      { color: '#4f46e5', bg: '#e0e7ff', label: 'Delivering',  icon: 'bicycle-outline' },
  DELIVERED:       { color: '#16a34a', bg: '#dcfce7', label: 'Delivered',    icon: 'checkmark-circle' },
  RETURNED:        { color: '#e11d48', bg: '#ffe4e6', label: 'Returned',     icon: 'return-up-back-outline' },
  RETURN_DEPOSIT:  { color: '#a21caf', bg: '#fae8ff', label: 'Return deposit', icon: 'archive-outline' },
  CANCELLED:       { color: '#dc2626', bg: '#fee2e2', label: 'Cancelled',   icon: 'close-circle' },
};

const STATUS_ACTIONS: Record<string, { next: string; label: string; color: string; icon: string }> = {
  DRIVER_ASSIGNED: { next: 'DRIVER_ARRIVED', label: 'I Have Arrived',    color: '#7c3aed', icon: 'flag' },
  DRIVER_ARRIVED:  { next: 'PICKED_UP',     label: 'Package Picked Up', color: '#ea580c', icon: 'cube' },
  PICKED_UP:       { next: 'DELIVERING',    label: 'Start Delivering',  color: '#4f46e5', icon: 'bicycle' },
  DELIVERING:      { next: 'DELIVERED',     label: 'Mark Delivered',    color: '#16a34a', icon: 'checkmark-circle' },
  RETURNED:        { next: 'RETURN_DEPOSIT', label: 'Mark return deposit', color: '#a21caf', icon: 'archive' },
};

const STATUS_REVERT: Record<string, { prev: string; label: string }> = {
  DRIVER_ARRIVED: { prev: 'DRIVER_ASSIGNED', label: 'Back to Assigned' },
  PICKED_UP:      { prev: 'DRIVER_ARRIVED',  label: 'Back to Arrived' },
  DELIVERING:     { prev: 'PICKED_UP',       label: 'Back to Picked Up' },
  RETURNED:       { prev: 'DELIVERING',      label: 'Back to Delivering' },
};

function formatMoney(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(2);
}

function formatKm(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1)} km`;
}

function formatWeight(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n} kg`;
}

function isCompanyOrder(o: Order): boolean {
  return o.sourceType === 'DELIVERY_COMPANY';
}

export default function DriverMyOrdersScreen() {
  const router = useRouter();
  const { push } = useAppNavigation();
  const { colors, isDark } = useTheme();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [chatUnreadMap, setChatUnreadMap] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try { setOrders(await orderService.getDriverMyOrders()); }
    catch (e: any) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const unsub = subscribeDriverMyOrdersRefresh(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void load();
      }, 650);
    });
    return () => {
      if (debounce) clearTimeout(debounce);
      unsub();
    };
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      const i = setInterval(() => {
        void load();
      }, 10000);
      return () => clearInterval(i);
    }, [load]),
  );

  useEffect(() => {
    const ids = orders.filter((o) => o.chatRoom?.status === 'ACTIVE').map((o) => o.id);
    if (ids.length === 0) {
      setChatUnreadMap({});
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        const map = await fetchChatUnreadMapForOrders(ids);
        if (!cancelled) setChatUnreadMap(map);
      })();
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [orders]);

  const handleStatusUpdate = async (orderId: string, status: string) => {
    // If marking as delivered, check if proof is uploaded first
    if (status === 'DELIVERED' || status === 'RETURNED') {
      const order = orders.find(o => o.id === orderId);
      if (order && !order.driverAssignment?.image1Proof) {
        appAlert(
          'Proof Required',
          'You must upload at least the first proof image before marking this order.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Upload Now', onPress: () => push(`/(driver)/upload-proofs?orderId=${orderId}`) },
          ],
        );
        return;
      }
    }
    setUpdatingStatus(orderId);
    try {
      await orderService.updateOrderStatus(orderId, status);
      await load();
      if (status === 'DELIVERED' || status === 'RETURNED') await restoreOrderTrackingForDriver();
    } catch (e: any) {
      appAlert('Error', e.message);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleRevertStatus = (orderId: string) => {
    appAlert('Go Back', 'Revert to the previous status?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes, Go Back', onPress: async () => {
        setUpdatingStatus(orderId);
        try {
          await orderService.revertOrderStatus(orderId);
          await load();
          await restoreOrderTrackingForDriver();
        }
        catch (e: any) { appAlert('Error', e.message); }
        finally { setUpdatingStatus(null); }
      }},
    ]);
  };

  const handleCancel = (orderId: string) => {
    appAlert('Cancel Assignment', 'Are you sure you want to cancel this delivery?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes, Cancel', style: 'destructive', onPress: async () => {
        try {
          await orderService.cancelAssignment(orderId, 'Driver cancelled');
          await stopOrderTrackingSilently();
          router.replace('/(driver)/available-orders');
        }
        catch (e: any) { appAlert('Error', e.message); }
      }},
    ]);
  };

  if (loading) {
    return <View style={[s.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const activeOrders = orders.filter(
    o => !['DELIVERED', 'CANCELLED', 'RETURN_DEPOSIT'].includes(o.status),
  );
  const pastOrders = orders.filter(o =>
    ['DELIVERED', 'CANCELLED', 'RETURN_DEPOSIT'].includes(o.status),
  );

  const renderOrder = (order: Order) => {
    const meta = STATUS_META[order.status] || STATUS_META.DELIVERED;
    const action = STATUS_ACTIONS[order.status];
    const hasChat = order.chatRoom?.status === 'ACTIVE';
    const isUpdating = updatingStatus === order.id;

    return (
      <TouchableOpacity key={order.id} style={[s.card, { backgroundColor: colors.card }]} activeOpacity={0.7}
        onPress={() => push(`/(driver)/order-detail?orderId=${order.id}`)}>
        {/* Header: status badge + price */}
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[s.orderId, { color: colors.text }]}>#{order.id.slice(0, 8)}</Text>
            <View style={[s.statusBadge, { backgroundColor: meta.bg }]}>
              <Ionicons name={meta.icon as any} size={12} color={meta.color} />
              <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>
          <View style={s.priceCol}>
            <Text style={[s.priceText, { color: colors.primary }]}>{formatMoney(order.price)}</Text>
            <Text style={[s.priceCurrency, { color: colors.textTertiary }]}>TND</Text>
          </View>
        </View>

        {/* Route */}
        <View style={s.routeSection}>
          <View style={s.routeIconCol}>
            <View style={[s.routeDot, { backgroundColor: '#22c55e' }]} />
            <View style={[s.routeLine, { backgroundColor: colors.border }]} />
            <View style={[s.routeDot, { backgroundColor: '#ef4444' }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.routeText, { color: colors.text }]} numberOfLines={1}>
              {order.pickupAddress?.street || order.pickupAddress?.delegation?.nameDelegation || 'Pickup'}
            </Text>
            <View style={{ height: 14 }} />
            <Text style={[s.routeText, { color: colors.text }]} numberOfLines={1}>
              {order.dropoffAddress?.street || order.dropoffAddress?.delegation?.nameDelegation || 'Dropoff'}
            </Text>
          </View>
        </View>

        {/* Info chips */}
        <View style={s.chipsRow}>
          <View style={[s.chip, { backgroundColor: colors.surfaceVariant }]}>
            <Ionicons name="resize-outline" size={12} color={colors.textSecondary} />
            <Text style={[s.chipText, { color: colors.textSecondary }]}>{formatKm(order.distanceKm)}</Text>
          </View>
          <View style={[s.chip, { backgroundColor: colors.surfaceVariant }]}>
            <Ionicons name="cube-outline" size={12} color={colors.textSecondary} />
            <Text style={[s.chipText, { color: colors.textSecondary }]}>{formatWeight(order.weight)}</Text>
          </View>
          <View style={[s.chip, { backgroundColor: order.paymentType === 'COD' ? '#dcfce7' : '#dbeafe' }]}>
            <Text style={{ fontSize: 11 }}>{order.paymentType === 'COD' ? '💵' : '💰'}</Text>
            <Text style={[s.chipText, { color: order.paymentType === 'COD' ? '#166534' : '#1e40af' }]}>
              {order.paymentType === 'COD' ? 'Cash' : 'Wallet'}
            </Text>
          </View>
        </View>

        {/* Quick actions: Chat + Assistance */}
        {hasChat && (
          <View style={s.quickRow}>
            <View style={{ flex: 2, position: 'relative' }}>
              <TouchableOpacity
                style={[s.quickBtn, s.quickBtnChat, { backgroundColor: isDark ? 'rgba(37,99,235,0.22)' : '#eff6ff' }]}
                onPress={() => push(`/(driver)/order-chat?orderId=${order.id}`)}
                activeOpacity={0.7}
              >
                <Ionicons name="chatbubbles" size={18} color="#2563eb" />
                <Text style={[s.quickBtnText, { color: '#2563eb' }]}>Chat</Text>
              </TouchableOpacity>
              <ChatUnreadBadge count={chatUnreadMap[order.id] ?? 0} />
            </View>
            <TouchableOpacity
              style={[s.quickBtn, s.quickBtnHelp, { flex: 1, backgroundColor: isDark ? 'rgba(234,88,12,0.18)' : '#fff7ed' }]}
              onPress={async () => {
                try { await orderService.driverRequestAssistance(order.id); push('/(driver)/support'); }
                catch (e: any) { appAlert('Error', e.message); }
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="headset" size={15} color="#ea580c" />
              <Text style={[s.quickBtnText, { color: '#ea580c', fontSize: 12 }]}>Help</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Main action button + revert */}
        {action && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            {STATUS_REVERT[order.status] && (
              <TouchableOpacity
                style={[s.revertBtn, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                onPress={() => handleRevertStatus(order.id)}
                disabled={isUpdating}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-undo" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
            {order.status === 'DELIVERING' ? (
              <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
                {isCompanyOrder(order) && (
                  <TouchableOpacity
                    style={[s.actionBtn, { backgroundColor: '#e11d48', flex: 1, marginBottom: 0 }]}
                    onPress={() => handleStatusUpdate(order.id, 'RETURNED')}
                    disabled={isUpdating}
                    activeOpacity={0.8}
                  >
                    {isUpdating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={s.actionBtnText}>rejected</Text>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[s.actionBtn, { backgroundColor: action.color, flex: 1, marginBottom: 0 }]}
                  onPress={() => handleStatusUpdate(order.id, action.next)}
                  disabled={isUpdating}
                  activeOpacity={0.8}
                >
                  {isUpdating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name={action.icon as any} size={18} color="#fff" />
                      <Text style={s.actionBtnText}>{action.label}</Text>
                      {action.next === 'DELIVERED' && !order.driverAssignment?.image1Proof && (
                        <Ionicons name="alert-circle" size={16} color="#fbbf24" />
                      )}
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[s.actionBtn, { backgroundColor: action.color, flex: 1, marginBottom: 0 }]}
                onPress={() => handleStatusUpdate(order.id, action.next)}
                disabled={isUpdating}
                activeOpacity={0.8}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name={action.icon as any} size={18} color="#fff" />
                    <Text style={s.actionBtnText}>{action.label}</Text>
                    {action.next === 'DELIVERED' && !order.driverAssignment?.image1Proof && (
                      <Ionicons name="alert-circle" size={16} color="#fbbf24" />
                    )}
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Proof status indicator for DELIVERING */}
        {order.status === 'DELIVERING' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingHorizontal: 4 }}>
            <Ionicons
              name={order.driverAssignment?.image1Proof ? 'checkmark-circle' : 'alert-circle-outline'}
              size={16}
              color={order.driverAssignment?.image1Proof ? '#16a34a' : '#f59e0b'}
            />
            <Text style={{ fontSize: 12, color: order.driverAssignment?.image1Proof ? '#16a34a' : '#f59e0b', fontWeight: '500' }}>
              {order.driverAssignment?.image1Proof ? 'Proof uploaded' : 'Proof required before delivery'}
            </Text>
          </View>
        )}

        {/* Secondary actions */}
        <View style={s.secondaryRow}>
          {order.status === 'DRIVER_ASSIGNED' && (
            <TouchableOpacity style={[s.cancelBtn, { backgroundColor: colors.dangerBg }]} onPress={() => handleCancel(order.id)} activeOpacity={0.7}>
              <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
              <Text style={[s.cancelBtnText, { color: colors.danger }]}>Cancel</Text>
            </TouchableOpacity>
          )}
          {['PICKED_UP', 'DELIVERING', 'DELIVERED'].includes(order.status) && (
            <TouchableOpacity style={[s.proofBtn, { backgroundColor: colors.surfaceVariant }, order.driverAssignment?.image1Proof && { backgroundColor: '#dcfce7' }]}
              onPress={() => push(`/(driver)/upload-proofs?orderId=${order.id}`)} activeOpacity={0.7}>
              <Ionicons name={order.driverAssignment?.image1Proof ? 'checkmark-circle' : 'camera-outline'} size={16}
                color={order.driverAssignment?.image1Proof ? '#16a34a' : colors.text} />
              <Text style={[s.proofBtnText, { color: colors.text }, order.driverAssignment?.image1Proof && { color: '#16a34a' }]}>
                {order.driverAssignment?.image1Proof ? 'Image Uploaded' : 'Upload Proofs'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.statsBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.headerSub, { color: colors.textTertiary }]}>
          {activeOrders.length} active · {pastOrders.length} completed
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        <GameEntrySection placement="DRIVER_MY_ORDERS" role="driver" />
        {orders.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="car-outline" size={56} color={colors.textTertiary} />
            <Text style={[s.emptyTitle, { color: colors.textTertiary }]}>No deliveries yet</Text>
            <Text style={s.emptySub}>Accept orders to start delivering</Text>
          </View>
        ) : (
          <>
            {activeOrders.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <View style={s.sectionHeader}>
                  <View style={[s.sectionDot, { backgroundColor: '#22c55e' }]} />
                  <Text style={[s.sectionTitle, { color: colors.text }]}>Active</Text>
                </View>
                {activeOrders.map(renderOrder)}
              </View>
            )}
            {pastOrders.length > 0 && (
              <View>
                <View style={s.sectionHeader}>
                  <View style={[s.sectionDot, { backgroundColor: '#9ca3af' }]} />
                  <Text style={[s.sectionTitle, { color: colors.text }]}>Past</Text>
                </View>
                {pastOrders.map(renderOrder)}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },

  statsBar: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerSub: { fontSize: 13, fontWeight: '600' },

  // Section
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionDot: { width: 10, height: 10, borderRadius: 5 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  orderId: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 6 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  priceCol: { alignItems: 'flex-end' },
  priceText: { fontSize: 22, fontWeight: '800', color: '#0284c7' },
  priceCurrency: { fontSize: 11, fontWeight: '600', color: '#9ca3af' },

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

  // Quick actions
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'stretch' },
  quickBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12,
  },
  quickBtnChat: { minHeight: 48, paddingVertical: 14 },
  quickBtnHelp: { minHeight: 40, paddingVertical: 8 },
  quickBtnText: { fontSize: 13, fontWeight: '700' },

  // Main action
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 48, borderRadius: 14, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
  },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  revertBtn: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e5e7eb',
  },

  // Secondary
  secondaryRow: { flexDirection: 'row', gap: 8 },
  cancelBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
  },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: '#dc2626' },
  proofBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, backgroundColor: '#f3f4f6',
  },
  proofBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },

  // Empty
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#9ca3af', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#d1d5db', marginTop: 4 },
});
