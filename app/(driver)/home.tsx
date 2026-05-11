import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { orderService, Order } from '../../services/api/order.service';
import { clearPushToken } from '../../services/api/notification.service';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppNavigation } from '../../contexts/AppNavigationContext';
import { restoreOrderTrackingForDriver, stopOrderTrackingSilently } from '../../services/notifications';
import { syncDriverLocationTracking } from '../../services/driverLocationTracking';
import { persistDriverIdentityFromMe } from '../../utils/persistDriverIdentity';
import { useActiveOrdersChatUnreadMap } from '../../hooks/useOrderChatUnread';
import { ActiveOrderChatUnreadBadge } from '../../components/ActiveOrderChatUnreadBadge';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const ACTIVE_STATUSES = [
  'PENDING_CUSTOMER_APPROVAL',
  'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PICKED_UP', 'DELIVERING',
];

function safePrice(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}

const STATUS_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  PENDING_CUSTOMER_APPROVAL: { icon: 'hourglass-outline', color: '#ea580c', bg: '#ffedd5', label: 'Awaiting customer' },
  DRIVER_ASSIGNED: { icon: 'person-outline', color: '#2563eb', bg: '#dbeafe', label: 'Assigned' },
  DRIVER_ARRIVED:  { icon: 'flag-outline',   color: '#7c3aed', bg: '#ede9fe', label: 'Arrived' },
  PICKED_UP:       { icon: 'cube-outline',   color: '#ea580c', bg: '#ffedd5', label: 'Picked Up' },
  DELIVERING:      { icon: 'bicycle-outline', color: '#4f46e5', bg: '#e0e7ff', label: 'Delivering' },
};

export default function DriverHome() {
  const router = useRouter();
  const { push } = useAppNavigation();
  const { colors, isDark } = useTheme();
  const [driver, setDriver] = useState<any>(null);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasAvailableOrders, setHasAvailableOrders] = useState(false);

  const activeOrderIds = useMemo(() => activeOrders.map((o) => o.id), [activeOrders]);
  const chatUnreadByOrder = useActiveOrdersChatUnreadMap(activeOrderIds);

  const loadData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) { router.replace('/(auth)/driver-login'); return; }

      const [profileRes, orders] = await Promise.all([
        axios.get(`${API_URL}/drivers/me`, { headers: { Authorization: `Bearer ${token}` } }),
        orderService.getDriverMyOrders().catch(() => [] as Order[]),
      ]);
      setDriver(profileRes.data);
      await persistDriverIdentityFromMe(profileRes.data);
      const list = Array.isArray(orders) ? orders : [];
      syncDriverLocationTracking(list);
      setActiveOrders(list.filter((o) => ACTIVE_STATUSES.includes(o.status)));

      // Fetch order availability indicator for driver
      try {
        const availRes = await axios.get(`${API_URL}/driver/orders/has-available`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setHasAvailableOrders(availRes.data?.hasAvailableOrders ?? false);
      } catch {
        setHasAvailableOrders(false);
      }

    } catch (error: any) {
      if (error.response?.status === 401) {
        await stopOrderTrackingSilently();
        await AsyncStorage.clear();
        router.replace('/(auth)/driver-login');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  useEffect(() => {
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    restoreOrderTrackingForDriver();
  }, []);

  if (loading) {
    return <View style={[s.loadingContainer, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const isVerified = driver?.status === 'VERIFIED';

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}>

        {/* Status Alerts */}
        {driver?.status === 'INCOMPLETE' && (
          <TouchableOpacity style={[s.alertCard, { backgroundColor: colors.card }]} onPress={() => push('/(driver)/verification')} activeOpacity={0.8}>
            <View style={[s.alertIconWrap, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="warning" size={22} color="#ca8a04" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.alertTitle, { color: colors.text }]}>Complete Verification</Text>
              <Text style={[s.alertSub, { color: colors.textSecondary }]}>Upload your documents to start delivering</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#ca8a04" />
          </TouchableOpacity>
        )}
        {driver?.status === 'PENDING_REVIEW' && (
          <View style={[s.alertCard, { borderLeftColor: '#ca8a04', backgroundColor: colors.card }]}>
            <View style={[s.alertIconWrap, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="time" size={22} color="#ca8a04" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.alertTitle, { color: colors.text }]}>Under Review</Text>
              <Text style={[s.alertSub, { color: colors.textSecondary }]}>Your documents are being reviewed</Text>
            </View>
          </View>
        )}
        {(driver?.status === 'SUSPENDED' || driver?.status === 'REJECTED') && (
          <TouchableOpacity style={[s.alertCard, { borderLeftColor: '#dc2626', backgroundColor: colors.card }]}
            onPress={() => push('/(driver)/restrictions')} activeOpacity={0.8}>
            <View style={[s.alertIconWrap, { backgroundColor: '#fee2e2' }]}>
              <Ionicons name="alert-circle" size={22} color="#dc2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.alertTitle, { color: '#dc2626' }]}>Account {driver.status.toLowerCase()}</Text>
              <Text style={[s.alertSub, { color: colors.textSecondary }]}>Tap to see the reason</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#dc2626" />
          </TouchableOpacity>
        )}

        {/* Available + My orders (verified) */}
        {isVerified && (
          <View style={s.section}>
            <View style={s.mainActionsColumn}>
              <TouchableOpacity
                style={[s.heroTile, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => push('/(driver)/available-orders')}
                activeOpacity={0.85}
              >
                <View style={[s.heroTileIcon, { backgroundColor: isDark ? 'rgba(14,165,233,0.22)' : '#e0f2fe' }]}>
                  <Ionicons name="list-outline" size={24} color="#0284c7" />
                </View>
                <View style={s.heroTileBody}>
                  <View style={s.heroTileTitleRow}>
                    <Text style={[s.heroTileTitle, { color: colors.text }]} numberOfLines={1}>
                      Available
                    </Text>
                    <View
                      style={[
                        s.availabilityDot,
                        { backgroundColor: hasAvailableOrders ? '#22c55e' : '#9ca3af' },
                      ]}
                    />
                  </View>
                  <Text style={[s.heroTileSub, { color: colors.textSecondary }]} numberOfLines={1}>
                    Find orders
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.heroTile, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => push('/(driver)/my-orders')}
                activeOpacity={0.85}
              >
                <View style={[s.heroTileIcon, { backgroundColor: isDark ? 'rgba(22,163,74,0.22)' : '#dcfce7' }]}>
                  <Ionicons name="cube-outline" size={24} color="#16a34a" />
                </View>
                <View style={s.heroTileBody}>
                  <Text style={[s.heroTileTitle, { color: colors.text }]} numberOfLines={1}>
                    My Orders
                  </Text>
                  <Text style={[s.heroTileSub, { color: colors.textSecondary }]} numberOfLines={1}>
                    Track deliveries
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Quick Actions — same 2×2 pattern as customer home (above Active Deliveries) */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
          <View style={s.actionsGrid}>
            <TouchableOpacity
              style={[s.actionCard, { backgroundColor: colors.card }]}
              onPress={() => push('/(driver)/availability')}
              activeOpacity={0.85}
            >
              <View style={[s.actionIconWrap, { backgroundColor: isDark ? '#3b1f5c' : '#ede9fe' }]}>
                <Ionicons name="calendar-outline" size={22} color="#7c3aed" />
              </View>
              <Text style={[s.actionLabel, { color: colors.text }]}>Availability</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionCard, { backgroundColor: colors.card }]}
              onPress={() => push('/(driver)/addresses')}
              activeOpacity={0.85}
            >
              <View style={[s.actionIconWrap, { backgroundColor: isDark ? '#052e16' : '#dcfce7' }]}>
                <Ionicons name="location-outline" size={22} color="#16a34a" />
              </View>
              <Text style={[s.actionLabel, { color: colors.text }]}>Addresses</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionCard, { backgroundColor: colors.card }]}
              onPress={() => push('/(driver)/earnings')}
              activeOpacity={0.85}
            >
              <View style={[s.actionIconWrap, { backgroundColor: isDark ? '#422006' : '#fef9c3' }]}>
                <Ionicons name="cash-outline" size={22} color="#ca8a04" />
              </View>
              <Text style={[s.actionLabel, { color: colors.text }]}>Earnings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionCard, { backgroundColor: colors.card }]}
              onPress={() => push('/(driver)/settings')}
              activeOpacity={0.85}
            >
              <View style={[s.actionIconWrap, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
                <Ionicons name="settings-outline" size={22} color={colors.primary} />
              </View>
              <Text style={[s.actionLabel, { color: colors.text }]}>Settings</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Active Deliveries — after Quick Actions; empty state matches customer home */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={[s.sectionTitle, { color: colors.text }]}>Active Deliveries</Text>
            {activeOrders.length > 0 && (
              <TouchableOpacity onPress={() => push('/(driver)/my-orders')}>
                <Text style={[s.seeAll, { color: colors.primary }]}>See All</Text>
              </TouchableOpacity>
            )}
          </View>

          {activeOrders.length === 0 ? (
            <View style={[s.emptyCard, { backgroundColor: colors.card }]}>
              <Ionicons name="cube-outline" size={40} color={colors.textTertiary} />
              <Text style={[s.emptyText, { color: colors.textSecondary }]}>No active orders</Text>
              <Text style={[s.emptySub, { color: colors.textTertiary }]}>Create an order to get started</Text>
            </View>
          ) : (
            activeOrders.slice(0, 3).map((order) => {
              const meta = STATUS_META[order.status] || STATUS_META.DRIVER_ASSIGNED;
              return (
                <TouchableOpacity key={order.id} style={[s.orderCard, { backgroundColor: colors.card }]}
                  onPress={() => push(`/(driver)/my-orders`)} activeOpacity={0.8}>
                  <ActiveOrderChatUnreadBadge
                    count={chatUnreadByOrder[order.id] ?? 0}
                    iconColor={colors.primary}
                    iconBg={isDark ? `${colors.primary}28` : colors.primaryLight}
                  />
                  <View style={s.orderTop}>
                    <View style={[s.orderBadge, { backgroundColor: meta.bg }]}>
                      <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                      <Text style={[s.orderBadgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <Text style={[s.orderPrice, { color: colors.text }]}>{safePrice(order.price)} TND</Text>
                  </View>
                  <View style={s.orderRoute}>
                    <View style={s.routeIcons}>
                      <View style={[s.dot, { backgroundColor: '#22c55e' }]} />
                      <View style={[s.line, { backgroundColor: colors.border }]} />
                      <View style={[s.dot, { backgroundColor: '#ef4444' }]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.routeAddr, { color: colors.textSecondary }]} numberOfLines={1}>
                        {order.pickupAddress?.street || order.pickupAddress?.delegation?.nameDelegation || 'Pickup'}
                      </Text>
                      <Text style={[s.routeAddr, { color: colors.textSecondary }]} numberOfLines={1}>
                        {order.dropoffAddress?.street || order.dropoffAddress?.delegation?.nameDelegation || 'Delivery'}
                      </Text>
                    </View>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },

  section: { paddingHorizontal: 20, marginTop: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 14 },
  seeAll: { fontSize: 14, fontWeight: '600', color: '#0284c7' },

  // Alerts
  alertCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', marginHorizontal: 20, marginTop: 16, padding: 16, borderRadius: 16,
    borderLeftWidth: 4, borderLeftColor: '#ca8a04',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  alertIconWrap: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
  },
  alertTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  alertSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },

  // Available + My orders tiles (stacked full-width rows)
  mainActionsColumn: { gap: 12, alignSelf: 'stretch' },
  heroTile: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  heroTileIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTileBody: { flex: 1, minWidth: 0 },
  heroTileTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroTileTitle: { fontSize: 15, fontWeight: '700' },
  heroTileSub: { fontSize: 12, marginTop: 2 },
  availabilityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // Quick actions grid (customer home parity)
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: {
    width: '47%' as any,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  actionIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 14, fontWeight: '600' },

  // Empty (parity with customer home Active Orders)
  emptyCard: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptySub: { fontSize: 13 },

  // Order cards
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  orderBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  orderBadgeText: { fontSize: 12, fontWeight: '700' },
  orderPrice: { fontSize: 16, fontWeight: '800', color: '#111827' },
  orderRoute: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeIcons: { alignItems: 'center', gap: 3 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { width: 2, height: 16, backgroundColor: '#e5e7eb', borderRadius: 1 },
  routeAddr: { fontSize: 13, color: '#6b7280', lineHeight: 20 },
});
