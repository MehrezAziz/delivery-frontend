import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, ScrollView, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';
import { orderService, Order } from '../../services/api/order.service';
import { notificationService } from '../../services/api/notification.service';
import { clearPushToken } from '../../services/api/notification.service';
import { useTheme } from '../../contexts/ThemeContext';
import { ThemeToggle } from '../../components/ThemeToggle';
import { restoreOrderTrackingForDriver, stopOrderTrackingSilently } from '../../services/notifications';
import { syncDriverLocationTracking } from '../../services/driverLocationTracking';
import { NotificationPreviewModal } from '../../components/NotificationPreviewModal';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const ACTIVE_STATUSES = [
  'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PICKED_UP', 'DELIVERING',
];

const STATUS_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  DRIVER_ASSIGNED: { icon: 'person-outline', color: '#2563eb', bg: '#dbeafe', label: 'Assigned' },
  DRIVER_ARRIVED:  { icon: 'flag-outline',   color: '#7c3aed', bg: '#ede9fe', label: 'Arrived' },
  PICKED_UP:       { icon: 'cube-outline',   color: '#ea580c', bg: '#ffedd5', label: 'Picked Up' },
  DELIVERING:      { icon: 'bicycle-outline', color: '#4f46e5', bg: '#e0e7ff', label: 'Delivering' },
};

export default function DriverHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [driver, setDriver] = useState<any>(null);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasAvailableOrders, setHasAvailableOrders] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifPreviewOpen, setNotifPreviewOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) { router.replace('/(auth)/driver-login'); return; }

      const [profileRes, orders] = await Promise.all([
        axios.get(`${API_URL}/drivers/me`, { headers: { Authorization: `Bearer ${token}` } }),
        orderService.getDriverMyOrders().catch(() => [] as Order[]),
      ]);
      setDriver(profileRes.data);
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

      // Fetch unread notification count
      try {
        const notifCount = await notificationService.getUnreadCount();
        setUnreadCount(notifCount.count);
      } catch {
        setUnreadCount(0);
      }
    } catch (error: any) {
      if (error.response?.status === 401) {
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

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => {
        await stopOrderTrackingSilently();
        await clearPushToken();
        await AsyncStorage.clear();
        router.replace('/(auth)/driver-login');
      }},
    ]);
  };

  if (loading) {
    return <View style={[s.loadingContainer, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const firstName = driver?.user?.firstName || 'Driver';
  const statusColor = driver?.status === 'VERIFIED' ? '#16a34a'
    : driver?.status === 'PENDING_REVIEW' ? '#ca8a04' : '#dc2626';
  const statusLabel = driver?.status === 'VERIFIED' ? 'Verified'
    : driver?.status === 'PENDING_REVIEW' ? 'Pending'
    : driver?.status === 'INCOMPLETE' ? 'Incomplete'
    : driver?.status || '';
  const isVerified = driver?.status === 'VERIFIED';

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <NotificationPreviewModal
        visible={notifPreviewOpen}
        onClose={() => setNotifPreviewOpen(false)}
        variant="driver"
        onOpenFullInbox={() => router.push('/(driver)/notifications')}
      />
      {/* Status bar background */}
      <View style={{ backgroundColor: colors.headerBg, height: insets.top }} />
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.headerBg }]}>
        <View style={s.headerContent}>
          <View style={{ flex: 1 }}>
            <Text style={s.greeting}>Hello, {firstName} 👋</Text>
            <View style={s.statusRow}>
              <View style={[s.statusDot, { backgroundColor: statusColor }]} />
              <Text style={s.statusLabel}>{statusLabel}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ThemeToggle color="#fff" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
            <TouchableOpacity onPress={() => setNotifPreviewOpen(true)} style={s.logoutBtn}>
              <Ionicons name="notifications-outline" size={20} color="#fff" />
              {unreadCount > 0 && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
              <Ionicons name="log-out-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}>

        {/* Status Alerts */}
        {driver?.status === 'INCOMPLETE' && (
          <TouchableOpacity style={[s.alertCard, { backgroundColor: colors.card }]} onPress={() => router.push('/(driver)/verification')} activeOpacity={0.8}>
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
            onPress={() => router.push('/(driver)/restrictions')} activeOpacity={0.8}>
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

        {/* Main Actions */}
        {isVerified && (
          <View style={s.section}>
            <View style={s.mainActionsRow}>
              <TouchableOpacity style={[s.mainAction, { backgroundColor: '#0284c7' }]}
                onPress={() => router.push('/(driver)/available-orders')} activeOpacity={0.85}>
                <View style={s.mainActionIcon}>
                  <Ionicons name="list" size={26} color="#fff" />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={s.mainActionTitle}>Available</Text>
                  <View style={{
                    width: 10, height: 10, borderRadius: 5,
                    backgroundColor: hasAvailableOrders ? '#22c55e' : '#9ca3af',
                  }} />
                </View>
                <Text style={s.mainActionSub}>Find orders</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.mainAction, { backgroundColor: '#16a34a' }]}
                onPress={() => router.push('/(driver)/my-orders')} activeOpacity={0.85}>
                <View style={s.mainActionIcon}>
                  <Ionicons name="cube" size={26} color="#fff" />
                </View>
                <Text style={s.mainActionTitle}>My Orders</Text>
                <Text style={s.mainActionSub}>Track deliveries</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Active Orders */}
        {activeOrders.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Text style={[s.sectionTitle, { color: colors.text }]}>Active Deliveries</Text>
              <TouchableOpacity onPress={() => router.push('/(driver)/my-orders')}>
                <Text style={[s.seeAll, { color: colors.primary }]}>See All</Text>
              </TouchableOpacity>
            </View>
            {activeOrders.slice(0, 3).map(order => {
              const meta = STATUS_META[order.status] || STATUS_META.DRIVER_ASSIGNED;
              return (
                <TouchableOpacity key={order.id} style={[s.orderCard, { backgroundColor: colors.card }]}
                  onPress={() => router.push(`/(driver)/my-orders`)} activeOpacity={0.8}>
                  <View style={s.orderTop}>
                    <View style={[s.orderBadge, { backgroundColor: meta.bg }]}>
                      <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                      <Text style={[s.orderBadgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <Text style={[s.orderPrice, { color: colors.text }]}>{order.price.toFixed(2)} TND</Text>
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
            })}
          </View>
        )}

        {/* Quick Menu */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Quick Menu</Text>
          <View style={[s.menuCard, { backgroundColor: colors.card }]}>
            {[
              { icon: 'calendar-outline', label: 'Availability', route: '/(driver)/availability', color: '#7c3aed' },
              { icon: 'person-outline', label: 'Profile', route: '/(driver)/profile', color: '#0284c7' },
              { icon: 'document-text-outline', label: 'Documents', route: '/(driver)/documents', color: '#2563eb' },
              { icon: 'location-outline', label: 'Addresses', route: '/(driver)/addresses', color: '#16a34a' },
              { icon: 'warning-outline', label: 'Restrictions', route: '/(driver)/restrictions', color: '#ea580c' },
              { icon: 'headset-outline', label: 'Support', route: '/(driver)/support', color: '#0284c7' },
            ].map((item, i, arr) => (
              <TouchableOpacity key={item.label}
                style={[s.menuItem, i < arr.length - 1 && [s.menuItemBorder, { borderBottomColor: colors.border }]]}
                onPress={() => router.push(item.route as any)} activeOpacity={0.7}>
                <View style={[s.menuIconWrap, { backgroundColor: item.color + '15' }]}>
                  <Ionicons name={item.icon as any} size={20} color={item.color} />
                </View>
                <Text style={[s.menuLabel, { color: colors.text }]}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },

  header: {
    backgroundColor: '#0284c7', paddingTop: 16, paddingBottom: 24,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
  },
  headerContent: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24,
  },
  greeting: { fontSize: 24, fontWeight: '800', color: '#fff', marginBottom: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  logoutBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    position: 'absolute', top: -4, right: -4, backgroundColor: '#ef4444',
    borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center',
    alignItems: 'center', paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

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

  // Main actions
  mainActionsRow: { flexDirection: 'row', gap: 12 },
  mainAction: {
    flex: 1, borderRadius: 18, padding: 20, alignItems: 'center', gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  mainActionIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  mainActionTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  mainActionSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },

  // Order cards
  orderCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
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

  // Menu
  menuCard: {
    backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  menuIconWrap: {
    width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#374151' },
});
