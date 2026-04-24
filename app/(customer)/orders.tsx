import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert, StyleSheet, Animated, Dimensions, Pressable,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { orderService, Order } from '../../services/api/order.service';
import { useTheme } from '../../contexts/ThemeContext';
import { useCustomerTabBarInset } from '../../contexts/CustomerTabBarInsetContext';
import { fetchChatUnreadMapForOrders } from '../../hooks/useOrderChatUnread';
import { ChatUnreadBadge } from '../../components/ChatUnreadBadge';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SIDEBAR_WIDTH = SCREEN_WIDTH * 0.65;

const ALL_STATUSES = [
  'ALL', 'SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED',
  'PICKED_UP', 'DELIVERING', 'DELIVERED', 'AUTO_CANCELLED', 'CANCELLED', 'DISPUTED', 'REFUNDED',
];

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  SEARCHING_DRIVER: { bg: '#fef9c3', text: '#854d0e', label: 'Searching' },
  DRIVER_ASSIGNED: { bg: '#dbeafe', text: '#1e40af', label: 'Assigned' },
  DRIVER_ARRIVED: { bg: '#e9d5ff', text: '#6b21a8', label: 'Arrived' },
  PICKED_UP: { bg: '#ffedd5', text: '#9a3412', label: 'Picked Up' },
  DELIVERING: { bg: '#e0e7ff', text: '#3730a3', label: 'Delivering' },
  DELIVERED: { bg: '#dcfce7', text: '#166534', label: 'Delivered' },
  AUTO_CANCELLED: { bg: '#fee2e2', text: '#991b1b', label: 'Auto-cancelled' },
  CANCELLED: { bg: '#fee2e2', text: '#991b1b', label: 'Cancelled' },
  DISPUTED: { bg: '#fee2e2', text: '#991b1b', label: 'Disputed' },
  REFUNDED: { bg: '#f3f4f6', text: '#374151', label: 'Refunded' },
  FAILED: { bg: '#fee2e2', text: '#991b1b', label: 'Failed' },
  DRAFT: { bg: '#f3f4f6', text: '#374151', label: 'Draft' },
};

export default function CustomerOrdersScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const tabBarPad = useCustomerTabBarInset();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [togglingPayment, setTogglingPayment] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(SIDEBAR_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const [trackModalOpen, setTrackModalOpen] = useState(false);
  const [trackCode, setTrackCode] = useState('');
  const [chatUnreadMap, setChatUnreadMap] = useState<Record<string, number>>({});

  // Clear track code when leaving the page
  useFocusEffect(
    useCallback(() => {
      return () => setTrackCode('');
    }, [])
  );

  const openSidebar = () => {
    setSidebarOpen(true);
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(overlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  const closeSidebar = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: SIDEBAR_WIDTH, duration: 200, useNativeDriver: true }),
      Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setSidebarOpen(false));
  };

  const selectFilter = (s: string) => {
    setFilter(s);
    closeSidebar();
  };

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

  useEffect(() => {
    const ids = orders.filter((o) => !!o.chatRoom).map((o) => o.id);
    if (ids.length === 0) {
      setChatUnreadMap({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const map = await fetchChatUnreadMapForOrders(ids);
      if (!cancelled) setChatUnreadMap(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [orders]);

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
      <View style={[st.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[st.container, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[st.toolbar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[st.headerCount, { color: colors.textTertiary }]}>{orders.length} total</Text>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <TouchableOpacity style={[st.trackBtn, { backgroundColor: '#0284c7' }]} onPress={() => setTrackModalOpen(true)} activeOpacity={0.8}>
            <Ionicons name="location-outline" size={16} color="#fff" />
            <Text style={st.trackBtnText}>Track</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.filterBtn, { backgroundColor: colors.surfaceVariant }, filter !== 'ALL' && { backgroundColor: colors.primary }]} onPress={openSidebar} activeOpacity={0.7}>
            <Ionicons name="filter" size={20} color={filter !== 'ALL' ? '#fff' : colors.text} />
            {filter !== 'ALL' && <View style={[st.filterDot, { backgroundColor: colors.primary }]} />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Track a Delivery Modal */}
      <Modal visible={trackModalOpen} transparent animationType="fade" onRequestClose={() => setTrackModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={st.modalOverlay} onPress={() => setTrackModalOpen(false)}>
            <Pressable style={[st.modalBox, { backgroundColor: colors.card }]} onPress={() => {}}>
              <View style={st.modalHeader}>
                <Text style={[st.modalTitle, { color: colors.text }]}>Track a Delivery</Text>
                <TouchableOpacity onPress={() => setTrackModalOpen(false)} style={st.modalClose}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={[st.modalSubtitle, { color: colors.textSecondary }]}>Enter the code shared with you</Text>
              <TextInput
                style={[st.modalInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                value={trackCode}
                onChangeText={setTrackCode}
                placeholder="e.g. TRK-A3F9X2"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
              />
              <TouchableOpacity
                style={[st.modalBtn, !trackCode.trim() && { opacity: 0.4 }]}
                disabled={!trackCode.trim()}
                onPress={() => {
                  setTrackModalOpen(false);
                  router.push(`/(public)/track?token=${trackCode.trim().toUpperCase()}`);
                }}
                activeOpacity={0.8}
              >
                <Text style={st.modalBtnText}>Start Tracking</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Orders list */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 + tabBarPad }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {filteredOrders.length === 0 ? (
          <View style={[st.empty, { paddingBottom: tabBarPad }]}>
            <Ionicons name="receipt-outline" size={48} color={colors.border} />
            <Text style={[st.emptyText, { color: colors.textTertiary }]}>No orders found</Text>
          </View>
        ) : filteredOrders.map((order) => {
          const cfg = STATUS_CONFIG[order.status] || { bg: '#f3f4f6', text: '#374151', label: order.status };
          const canEditPayment = order.status === 'SEARCHING_DRIVER';

          return (
            <TouchableOpacity key={order.id} style={[st.card, { backgroundColor: colors.card }]}
              onPress={() => router.push(`/(customer)/order-detail?orderId=${order.id}`)}
              activeOpacity={0.7}>
              {/* Top row: ID + status */}
              <View style={st.cardTopRow}>
                <Text style={[st.orderId, { color: colors.text }]}>#{order.id.slice(0, 8)}</Text>
                <View style={[st.statusBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={[st.statusText, { color: cfg.text }]}>{cfg.label}</Text>
                </View>
              </View>

              {/* Route */}
              <View style={st.routeSection}>
                <View style={st.routeItem}>
                  <View style={[st.routeDot, { backgroundColor: '#22c55e' }]} />
                  <Text style={[st.routeText, { color: colors.text }]} numberOfLines={1}>
                    {order.pickupAddress?.delegation?.nameDelegation || 'Pickup'}
                  </Text>
                </View>
                <View style={st.routeItem}>
                  <View style={[st.routeDot, { backgroundColor: '#ef4444' }]} />
                  <Text style={[st.routeText, { color: colors.text }]} numberOfLines={1}>
                    {order.dropoffAddress?.delegation?.nameDelegation || 'Dropoff'}
                  </Text>
                </View>
              </View>

              {/* Bottom row: price + payment */}
              <View style={st.cardBottomRow}>
                <Text style={[st.price, { color: colors.primary }]}>{order.price.toFixed(2)} TND</Text>

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
                <View style={[st.driverRow, { borderTopColor: colors.border }]}>
                  <Ionicons name="car-outline" size={14} color={colors.textSecondary} />
                  <Text style={[st.driverText, { color: colors.textSecondary }]}>
                    {order.driverAssignment.driver.user.firstName} {order.driverAssignment.driver.user.secondName}
                  </Text>
                </View>
              )}

              {order.chatRoom && (
                <View style={[st.chatQuickRow, { borderTopColor: colors.border }]}>
                  <View style={{ position: 'relative', alignSelf: 'flex-start' }}>
                    <TouchableOpacity
                      style={[st.chatQuickBtn, { backgroundColor: '#eff6ff' }]}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        router.push(`/(customer)/order-chat?orderId=${order.id}`);
                      }}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="chatbubbles" size={16} color="#2563eb" />
                      <Text style={st.chatQuickBtnText}>Chat</Text>
                    </TouchableOpacity>
                    <ChatUnreadBadge count={chatUnreadMap[order.id] ?? 0} />
                  </View>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Sidebar overlay + drawer */}
      {sidebarOpen && (
        <>
          <Animated.View style={[st.overlay, { opacity: overlayAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeSidebar} />
          </Animated.View>
          <Animated.View style={[st.sidebar, { transform: [{ translateX: slideAnim }], backgroundColor: colors.card }]}>
            <Text style={[st.sidebarTitle, { color: colors.text }]}>Filter by Status</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {ALL_STATUSES.map(s => {
                const active = filter === s;
                const cfg = STATUS_CONFIG[s];
                const label = s === 'ALL' ? 'All Orders' : (cfg?.label || s.replace(/_/g, ' '));
                const count = s === 'ALL' ? orders.length : orders.filter(o => o.status === s).length;
                return (
                  <TouchableOpacity key={s} style={[st.sidebarItem, active && st.sidebarItemActive]}
                    onPress={() => selectFilter(s)} activeOpacity={0.7}>
                    {cfg && <View style={[st.sidebarDot, { backgroundColor: cfg.text }]} />}
                    {!cfg && <Ionicons name="list" size={14} color={colors.text} />}
                    <Text style={[st.sidebarItemText, { color: colors.text }, active && st.sidebarItemTextActive]}>{label}</Text>
                    <Text style={[st.sidebarCount, { color: colors.textTertiary }]}>{count}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },

  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerCount: { fontSize: 13, fontWeight: '600' },
  filterBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
  filterDot: {
    position: 'absolute', top: 8, right: 8, width: 8, height: 8,
    borderRadius: 4, backgroundColor: '#0284c7',
  },

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

  chatQuickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f3f4f6',
    paddingTop: 10,
    marginTop: 10,
  },
  chatQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  chatQuickBtnText: { fontSize: 13, fontWeight: '700', color: '#2563eb' },

  // Sidebar
  overlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 10,
  },
  sidebar: {
    position: 'absolute', top: 0, right: 0, bottom: 0, width: SIDEBAR_WIDTH,
    backgroundColor: '#fff', zIndex: 11, paddingTop: 60, paddingHorizontal: 20,
    shadowColor: '#000', shadowOffset: { width: -2, height: 0 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 10,
  },
  sidebarTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 20 },
  sidebarItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4,
  },
  sidebarItemActive: { backgroundColor: '#e0f2fe' },
  sidebarDot: { width: 10, height: 10, borderRadius: 5 },
  sidebarItemText: { flex: 1, fontSize: 15, fontWeight: '500', color: '#374151' },
  sidebarItemTextActive: { color: '#0284c7', fontWeight: '700' },
  sidebarCount: { fontSize: 13, fontWeight: '600', color: '#9ca3af' },

  // Track button
  trackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 21,
  },
  trackBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Track modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalBox: {
    width: '100%', borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 12,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  modalClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  modalSubtitle: { fontSize: 14, marginBottom: 16 },
  modalInput: {
    height: 50, borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 14, fontSize: 16, letterSpacing: 1, marginBottom: 16,
  },
  modalBtn: {
    backgroundColor: '#0284c7', borderRadius: 12, height: 50,
    alignItems: 'center', justifyContent: 'center',
  },
  modalBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
