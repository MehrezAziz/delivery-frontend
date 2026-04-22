import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../contexts/ThemeContext';
import { orderService, Order } from '../../services/api/order.service';
import { notificationService } from '../../services/api/notification.service';
import { restoreOrderTrackingForCustomer } from '../../services/notifications';
import { NotificationPreviewModal } from '../../components/NotificationPreviewModal';
import { getCustomerStatusDotColor } from '../../utils/customerStatus';

const ACTIVE_STATUSES = [
  'SEARCHING_DRIVER', 'PENDING_CUSTOMER_APPROVAL', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PICKED_UP', 'DELIVERING',
];

const STATUS_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  SEARCHING_DRIVER: { icon: 'search-outline', color: '#ca8a04', bg: '#fef9c3', label: 'Searching' },
  PENDING_CUSTOMER_APPROVAL: { icon: 'hourglass-outline', color: '#ea580c', bg: '#ffedd5', label: 'Approve Driver' },
  DRIVER_ASSIGNED:  { icon: 'person-outline', color: '#2563eb', bg: '#dbeafe', label: 'Assigned' },
  DRIVER_ARRIVED:   { icon: 'flag-outline',   color: '#7c3aed', bg: '#ede9fe', label: 'Arrived' },
  PICKED_UP:        { icon: 'cube-outline',   color: '#ea580c', bg: '#ffedd5', label: 'Picked Up' },
  DELIVERING:       { icon: 'bicycle-outline', color: '#4f46e5', bg: '#e0e7ff', label: 'On the Way' },
};

export default function CustomerHomeScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [userName, setUserName] = useState('');
  const [customerStatus, setCustomerStatus] = useState<string>('ACTIVE');
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifPreviewOpen, setNotifPreviewOpen] = useState(false);

  const loadHeaderIdentity = useCallback(async () => {
    try {
      const [u, c] = await Promise.all([AsyncStorage.getItem('user'), AsyncStorage.getItem('customer')]);
      if (u) {
        const user = JSON.parse(u);
        setUserName([user.firstName, user.secondName].filter(Boolean).join(' ').trim() || user.firstName || user.secondName || '');
      }
      if (c) {
        const cust = JSON.parse(c);
        if (cust?.customerStatus) setCustomerStatus(cust.customerStatus);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadHeaderIdentity();
    restoreOrderTrackingForCustomer();
  }, [loadHeaderIdentity]);

  const loadOrders = useCallback(async () => {
    try {
      const [orders, notifCount] = await Promise.all([
        orderService.getMyOrders(),
        notificationService.getUnreadCount().catch(() => ({ count: 0 })),
      ]);
      setActiveOrders(orders.filter(o => ACTIVE_STATUSES.includes(o.status)));
      setUnreadCount(notifCount.count);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadHeaderIdentity();
      loadOrders();
    }, [loadHeaderIdentity, loadOrders]),
  );

  useEffect(() => {
    const interval = setInterval(loadOrders, 10000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <NotificationPreviewModal
        visible={notifPreviewOpen}
        onClose={() => setNotifPreviewOpen(false)}
        variant="customer"
        onOpenFullInbox={() => router.push('/(customer)/notifications')}
        onMarkAllRead={() => setUnreadCount(0)}
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} />}>

        <View style={[s.heroStrip, { backgroundColor: colors.headerBg }]}>
          <View style={s.nameRow}>
            <View
              style={[s.headerStatusDot, { backgroundColor: getCustomerStatusDotColor(customerStatus) }]}
              accessibilityLabel={`Account status: ${customerStatus}`}
            />
            <Text style={s.userName} numberOfLines={1}>
              {userName || 'Customer'}
            </Text>
          </View>
          <Text style={s.subtitle}>Where should we deliver today?</Text>
          <TouchableOpacity style={s.notifBtnLight} onPress={() => setNotifPreviewOpen(true)} activeOpacity={0.85}>
            <Ionicons name="notifications-outline" size={22} color="#fff" />
            {unreadCount > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Create Order CTA */}
        <View style={s.section}>
          <TouchableOpacity style={[s.ctaCard, { backgroundColor: colors.primary }]} onPress={() => router.push('/(customer)/create-order')} activeOpacity={0.85}>
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
          <Text style={[s.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
          <View style={s.actionsGrid}>
            <TouchableOpacity style={[s.actionCard, { backgroundColor: colors.card }]} onPress={() => router.push('/(customer)/orders')}>
              <View style={[s.actionIconWrap, { backgroundColor: isDark ? '#1e3a5f' : '#dbeafe' }]}>
                <Ionicons name="receipt-outline" size={22} color="#2563eb" />
              </View>
              <Text style={[s.actionLabel, { color: colors.text }]}>My Orders</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionCard, { backgroundColor: colors.card }]} onPress={() => router.push('/(customer)/addresses')}>
              <View style={[s.actionIconWrap, { backgroundColor: isDark ? '#052e16' : '#dcfce7' }]}>
                <Ionicons name="location-outline" size={22} color="#16a34a" />
              </View>
              <Text style={[s.actionLabel, { color: colors.text }]}>Addresses</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionCard, { backgroundColor: colors.card }]} onPress={() => router.push('/(customer)/wallet')}>
              <View style={[s.actionIconWrap, { backgroundColor: isDark ? '#422006' : '#fef9c3' }]}>
                <Ionicons name="wallet-outline" size={22} color="#ca8a04" />
              </View>
              <Text style={[s.actionLabel, { color: colors.text }]}>Wallet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionCard, { backgroundColor: colors.card }]} onPress={() => router.push('/(customer)/support')}>
              <View style={[s.actionIconWrap, { backgroundColor: isDark ? '#2e1065' : '#ede9fe' }]}>
                <Ionicons name="headset-outline" size={22} color="#7c3aed" />
              </View>
              <Text style={[s.actionLabel, { color: colors.text }]}>Support</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Active Orders */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={[s.sectionTitle, { color: colors.text }]}>Active Orders</Text>
            {activeOrders.length > 0 && (
              <TouchableOpacity onPress={() => router.push('/(customer)/orders')}>
                <Text style={[s.seeAll, { color: colors.primary }]}>See All</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
          ) : activeOrders.length === 0 ? (
            <View style={[s.emptyCard, { backgroundColor: colors.card }]}>
              <Ionicons name="cube-outline" size={40} color={colors.textTertiary} />
              <Text style={[s.emptyText, { color: colors.textSecondary }]}>No active orders</Text>
              <Text style={[s.emptySub, { color: colors.textTertiary }]}>Create an order to get started</Text>
            </View>
          ) : (
            activeOrders.slice(0, 3).map(order => {
              const meta = STATUS_META[order.status] || STATUS_META.SEARCHING_DRIVER;
              return (
                <TouchableOpacity key={order.id} style={[s.orderCard, { backgroundColor: colors.card }]}
                  onPress={() => router.push(`/(customer)/order-detail?orderId=${order.id}`)} activeOpacity={0.8}>
                  <View style={s.orderTop}>
                    <View style={[s.orderStatusBadge, { backgroundColor: isDark ? meta.color + '22' : meta.bg }]}>
                      <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                      <Text style={[s.orderStatusText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <Text style={[s.orderPrice, { color: colors.text }]}>{order.price.toFixed(2)} TND</Text>
                  </View>
                  <View style={s.orderRoute}>
                    <View style={s.orderRouteIcons}>
                      <View style={[s.miniDot, { backgroundColor: '#22c55e' }]} />
                      <View style={[s.miniLine, { backgroundColor: colors.border }]} />
                      <View style={[s.miniDot, { backgroundColor: '#ef4444' }]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.orderAddr, { color: colors.textSecondary }]} numberOfLines={1}>
                        {order.pickupAddress?.street || order.pickupAddress?.delegation?.nameDelegation || 'Pickup'}
                      </Text>
                      <Text style={[s.orderAddr, { color: colors.textSecondary }]} numberOfLines={1}>
                        {order.dropoffAddress?.street || order.dropoffAddress?.delegation?.nameDelegation || 'Delivery'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
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
  container: { flex: 1 },
  heroStrip: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 18,
    padding: 18,
    paddingRight: 56,
    position: 'relative',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingRight: 8,
  },
  headerStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    flexShrink: 0,
    marginRight: 10,
  },
  userName: { fontSize: 22, fontWeight: '800', color: '#fff', flex: 1, minWidth: 0 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.82)', fontWeight: '500' },
  notifBtnLight: {
    position: 'absolute',
    right: 14,
    top: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute', top: -4, right: -4, backgroundColor: '#ef4444',
    borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center',
    alignItems: 'center', paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  section: { paddingHorizontal: 20, marginTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  seeAll: { fontSize: 14, fontWeight: '600' },

  // CTA
  ctaCard: {
    borderRadius: 18, padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 6,
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
    width: '47%' as any, borderRadius: 16, padding: 18,
    alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  actionIconWrap: {
    width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { fontSize: 14, fontWeight: '600' },

  // Empty
  emptyCard: {
    borderRadius: 16, padding: 32, alignItems: 'center', gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptySub: { fontSize: 13 },

  // Order cards
  orderCard: {
    borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  orderStatusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  orderStatusText: { fontSize: 12, fontWeight: '700' },
  orderPrice: { fontSize: 16, fontWeight: '800' },
  orderRoute: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderRouteIcons: { alignItems: 'center', gap: 3 },
  miniDot: { width: 8, height: 8, borderRadius: 4 },
  miniLine: { width: 2, height: 16, borderRadius: 1 },
  orderAddr: { fontSize: 13, lineHeight: 20 },
});
