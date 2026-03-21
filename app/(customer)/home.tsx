import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { orderService, Order } from '../../services/api/order.service';

const ACTIVE_STATUSES = [
  'SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PICKED_UP', 'DELIVERING',
];

const STATUS_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  SEARCHING_DRIVER: { icon: 'search-outline', color: '#ca8a04', bg: '#fef9c3', label: 'Searching' },
  DRIVER_ASSIGNED:  { icon: 'person-outline', color: '#2563eb', bg: '#dbeafe', label: 'Assigned' },
  DRIVER_ARRIVED:   { icon: 'flag-outline',   color: '#7c3aed', bg: '#ede9fe', label: 'Arrived' },
  PICKED_UP:        { icon: 'cube-outline',   color: '#ea580c', bg: '#ffedd5', label: 'Picked Up' },
  DELIVERING:       { icon: 'bicycle-outline', color: '#4f46e5', bg: '#e0e7ff', label: 'On the Way' },
};

export default function CustomerHomeScreen() {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('user').then(u => {
      if (u) {
        const user = JSON.parse(u);
        setUserName(user.firstName || user.secondName || '');
      }
    });
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const orders = await orderService.getMyOrders();
      setActiveOrders(orders.filter(o => ACTIVE_STATUSES.includes(o.status)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadOrders(); }, [loadOrders]));

  useEffect(() => {
    const interval = setInterval(loadOrders, 10000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerContent}>
          <View>
            <Text style={s.greeting}>Hello{userName ? `, ${userName}` : ''} 👋</Text>
            <Text style={s.subtitle}>Where should we deliver today?</Text>
          </View>
          <TouchableOpacity style={s.notifBtn} onPress={() => router.push('/(customer)/support')}>
            <Ionicons name="chatbubble-ellipses-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} />}>

        {/* Create Order CTA */}
        <View style={s.section}>
          <TouchableOpacity style={s.ctaCard} onPress={() => router.push('/(customer)/create-order')} activeOpacity={0.85}>
            <View style={s.ctaIconWrap}>
              <Ionicons name="add-circle" size={32} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.ctaTitle}>Create New Order</Text>
              <Text style={s.ctaSub}>Send a package anywhere</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Quick Actions</Text>
          <View style={s.actionsGrid}>
            <TouchableOpacity style={s.actionCard} onPress={() => router.push('/(customer)/orders')}>
              <View style={[s.actionIconWrap, { backgroundColor: '#dbeafe' }]}>
                <Ionicons name="receipt-outline" size={22} color="#2563eb" />
              </View>
              <Text style={s.actionLabel}>My Orders</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionCard} onPress={() => router.push('/(customer)/addresses')}>
              <View style={[s.actionIconWrap, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="location-outline" size={22} color="#16a34a" />
              </View>
              <Text style={s.actionLabel}>Addresses</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionCard} onPress={() => router.push('/(customer)/wallet')}>
              <View style={[s.actionIconWrap, { backgroundColor: '#fef9c3' }]}>
                <Ionicons name="wallet-outline" size={22} color="#ca8a04" />
              </View>
              <Text style={s.actionLabel}>Wallet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionCard} onPress={() => router.push('/(customer)/support')}>
              <View style={[s.actionIconWrap, { backgroundColor: '#ede9fe' }]}>
                <Ionicons name="headset-outline" size={22} color="#7c3aed" />
              </View>
              <Text style={s.actionLabel}>Support</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Active Orders */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Active Orders</Text>
            {activeOrders.length > 0 && (
              <TouchableOpacity onPress={() => router.push('/(customer)/orders')}>
                <Text style={s.seeAll}>See All</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator size="small" color="#0284c7" style={{ marginTop: 20 }} />
          ) : activeOrders.length === 0 ? (
            <View style={s.emptyCard}>
              <Ionicons name="cube-outline" size={40} color="#d1d5db" />
              <Text style={s.emptyText}>No active orders</Text>
              <Text style={s.emptySub}>Create an order to get started</Text>
            </View>
          ) : (
            activeOrders.slice(0, 3).map(order => {
              const meta = STATUS_META[order.status] || STATUS_META.SEARCHING_DRIVER;
              return (
                <TouchableOpacity key={order.id} style={s.orderCard}
                  onPress={() => router.push(`/(customer)/order-detail?orderId=${order.id}`)} activeOpacity={0.8}>
                  <View style={s.orderTop}>
                    <View style={[s.orderStatusBadge, { backgroundColor: meta.bg }]}>
                      <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                      <Text style={[s.orderStatusText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <Text style={s.orderPrice}>{order.price.toFixed(2)} TND</Text>
                  </View>
                  <View style={s.orderRoute}>
                    <View style={s.orderRouteIcons}>
                      <View style={[s.miniDot, { backgroundColor: '#22c55e' }]} />
                      <View style={s.miniLine} />
                      <View style={[s.miniDot, { backgroundColor: '#ef4444' }]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.orderAddr} numberOfLines={1}>
                        {order.pickupAddress?.street || order.pickupAddress?.delegation?.nameDelegation || 'Pickup'}
                      </Text>
                      <Text style={s.orderAddr} numberOfLines={1}>
                        {order.dropoffAddress?.street || order.dropoffAddress?.delegation?.nameDelegation || 'Delivery'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    backgroundColor: '#0284c7', paddingTop: 52, paddingBottom: 24,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
  },
  headerContent: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24,
  },
  greeting: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  notifBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },

  section: { paddingHorizontal: 20, marginTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 14 },
  seeAll: { fontSize: 14, fontWeight: '600', color: '#0284c7' },

  // CTA
  ctaCard: {
    backgroundColor: '#0284c7', borderRadius: 18, padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: '#0284c7', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  ctaIconWrap: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  ctaTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  ctaSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },

  // Actions grid
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: {
    width: '47%' as any, backgroundColor: '#fff', borderRadius: 16, padding: 18,
    alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  actionIconWrap: {
    width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },

  // Empty
  emptyCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center', gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#6b7280' },
  emptySub: { fontSize: 13, color: '#9ca3af' },

  // Order cards
  orderCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  orderStatusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  orderStatusText: { fontSize: 12, fontWeight: '700' },
  orderPrice: { fontSize: 16, fontWeight: '800', color: '#111827' },
  orderRoute: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderRouteIcons: { alignItems: 'center', gap: 3 },
  miniDot: { width: 8, height: 8, borderRadius: 4 },
  miniLine: { width: 2, height: 16, backgroundColor: '#e5e7eb', borderRadius: 1 },
  orderAddr: { fontSize: 13, color: '#6b7280', lineHeight: 20 },
});
