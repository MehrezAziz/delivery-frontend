import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { orderService, Order } from '../../services/api/order.service';

const ALL_STATUSES = [
  'ALL', 'SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED',
  'PICKED_UP', 'DELIVERING', 'DELIVERED', 'CANCELLED', 'DISPUTED',
];

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  SEARCHING_DRIVER: { bg: '#fef9c3', text: '#854d0e', label: 'Searching' },
  DRIVER_ASSIGNED: { bg: '#dbeafe', text: '#1e40af', label: 'Assigned' },
  DRIVER_ARRIVED: { bg: '#e9d5ff', text: '#6b21a8', label: 'Arrived' },
  PICKED_UP: { bg: '#ffedd5', text: '#9a3412', label: 'Picked Up' },
  DELIVERING: { bg: '#e0e7ff', text: '#3730a3', label: 'Delivering' },
  DELIVERED: { bg: '#dcfce7', text: '#166534', label: 'Delivered' },
  CANCELLED: { bg: '#fee2e2', text: '#991b1b', label: 'Cancelled' },
  DISPUTED: { bg: '#fee2e2', text: '#991b1b', label: 'Disputed' },
  REFUNDED: { bg: '#f3f4f6', text: '#374151', label: 'Refunded' },
  FAILED: { bg: '#fee2e2', text: '#991b1b', label: 'Failed' },
  DRAFT: { bg: '#f3f4f6', text: '#374151', label: 'Draft' },
};

export default function CustomerOrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [togglingPayment, setTogglingPayment] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const data = await orderService.getMyOrders();
      setOrders(data);
    } catch (e: any) {
      console.error('Failed to load orders:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useEffect(() => {
    const interval = setInterval(loadOrders, 10000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const onRefresh = () => { setRefreshing(true); loadOrders(); };

  const filteredOrders = filter === 'ALL' ? orders : orders.filter(o => o.status === filter);

  const togglePaymentType = async (order: Order) => {
    const newType = order.paymentType === 'COD' ? 'WALLET' : 'COD';
    setTogglingPayment(order.id);
    try {
      await orderService.changePaymentMethod(order.id, newType);
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, paymentType: newType } : o));
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to change payment method');
    } finally {
      setTogglingPayment(null);
    }
  };

  if (loading) {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color="#0284c7" />
      </View>
    );
  }

  return (
    <View style={st.container}>
      <StatusBar style="dark" />
      {/* Header */}
      <View style={st.header}>
        <Text style={st.headerTitle}>My Orders</Text>
        <Text style={st.headerCount}>{orders.length} total</Text>
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={st.filterRow}>
        {ALL_STATUSES.map(s => {
          const active = filter === s;
          return (
            <TouchableOpacity
              key={s}
              style={[st.filterChip, active && st.filterChipActive]}
              onPress={() => setFilter(s)}
              activeOpacity={0.7}
            >
              <Text style={[st.filterChipText, active && st.filterChipTextActive]}>
                {s === 'ALL' ? 'All' : (STATUS_CONFIG[s]?.label || s.replace(/_/g, ' '))}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Orders list */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {filteredOrders.length === 0 ? (
          <View style={st.empty}>
            <Ionicons name="receipt-outline" size={48} color="#d1d5db" />
            <Text style={st.emptyText}>No orders found</Text>
          </View>
        ) : filteredOrders.map((order) => {
          const cfg = STATUS_CONFIG[order.status] || { bg: '#f3f4f6', text: '#374151', label: order.status };
          const canEditPayment = order.status === 'SEARCHING_DRIVER';

          return (
            <TouchableOpacity key={order.id} style={st.card}
              onPress={() => router.push(`/(customer)/order-detail?orderId=${order.id}`)}
              activeOpacity={0.7}>
              {/* Top row: ID + status */}
              <View style={st.cardTopRow}>
                <Text style={st.orderId}>#{order.id.slice(0, 8)}</Text>
                <View style={[st.statusBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={[st.statusText, { color: cfg.text }]}>{cfg.label}</Text>
                </View>
              </View>

              {/* Route */}
              <View style={st.routeSection}>
                <View style={st.routeItem}>
                  <View style={[st.routeDot, { backgroundColor: '#22c55e' }]} />
                  <Text style={st.routeText} numberOfLines={1}>
                    {order.pickupAddress?.delegation?.nameDelegation || 'Pickup'}
                  </Text>
                </View>
                <View style={st.routeItem}>
                  <View style={[st.routeDot, { backgroundColor: '#ef4444' }]} />
                  <Text style={st.routeText} numberOfLines={1}>
                    {order.dropoffAddress?.delegation?.nameDelegation || 'Dropoff'}
                  </Text>
                </View>
              </View>

              {/* Bottom row: price + payment */}
              <View style={st.cardBottomRow}>
                <Text style={st.price}>{order.price.toFixed(2)} TND</Text>

                {canEditPayment ? (
                  <TouchableOpacity
                    style={[st.paymentToggle, order.paymentType === 'COD' ? st.paymentCOD : st.paymentWallet]}
                    onPress={(e) => { e.stopPropagation?.(); togglePaymentType(order); }}
                    disabled={togglingPayment === order.id}
                    activeOpacity={0.7}
                  >
                    {togglingPayment === order.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={st.paymentToggleText}>
                        {order.paymentType === 'COD' ? '💵 Cash' : '💰 Wallet'} ✎
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={[st.paymentBadge, order.paymentType === 'COD' ? st.paymentCODBadge : st.paymentWalletBadge]}>
                    <Text style={st.paymentBadgeText}>
                      {order.paymentType === 'COD' ? '💵 Cash' : '💰 Wallet'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Driver info */}
              {order.driverAssignment?.driver && (
                <View style={st.driverRow}>
                  <Ionicons name="car-outline" size={14} color="#6b7280" />
                  <Text style={st.driverText}>
                    {order.driverAssignment.driver.user.firstName} {order.driverAssignment.driver.user.secondName}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },

  header: {
    backgroundColor: '#fff', paddingTop: 54, paddingBottom: 16, paddingHorizontal: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#111827' },
  headerCount: { fontSize: 14, color: '#9ca3af', fontWeight: '500' },

  filterRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb',
  },
  filterChipActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  filterChipTextActive: { color: '#fff' },

  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { color: '#9ca3af', fontSize: 16, marginTop: 12 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  orderId: { fontSize: 16, fontWeight: '700', color: '#111827' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 12, fontWeight: '700' },

  routeSection: { marginBottom: 12, gap: 6 },
  routeItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeText: { fontSize: 14, color: '#374151', flex: 1 },

  cardBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  price: { fontSize: 18, fontWeight: '800', color: '#0284c7' },

  paymentToggle: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, minWidth: 90, alignItems: 'center',
  },
  paymentCOD: { backgroundColor: '#22c55e' },
  paymentWallet: { backgroundColor: '#3b82f6' },
  paymentToggleText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  paymentBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  paymentCODBadge: { backgroundColor: '#dcfce7' },
  paymentWalletBadge: { backgroundColor: '#dbeafe' },
  paymentBadgeText: { fontSize: 12, fontWeight: '600', color: '#374151' },

  driverRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f3f4f6',
    paddingTop: 10, marginTop: 10,
  },
  driverText: { fontSize: 13, color: '#6b7280' },
});
