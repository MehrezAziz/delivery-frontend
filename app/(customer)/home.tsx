import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { orderService, Order } from '../../services/api/order.service';
import { restoreOrderTrackingForCustomer } from '../../services/notifications';
import { appAlert } from '../../utils/appAlert';
import { api } from '../../services/api/client';
import { useActiveOrdersChatUnreadMap } from '../../hooks/useOrderChatUnread';
import { ActiveOrderChatUnreadBadge } from '../../components/ActiveOrderChatUnreadBadge';
import { GameEntrySection } from '../../components/games/GameEntrySection';
import { hasIncompleteCreateOrderDraft } from '../../utils/createOrderDraftStorage';

const ACTIVE_STATUSES = [
  'PENDING_PUBLISH', 'SEARCHING_DRIVER', 'PENDING_CUSTOMER_APPROVAL', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PICKED_UP', 'DELIVERING',
];

const STATUS_META: Record<string, { icon: string; color: string; bg: string; labelKey: string }> = {
  PENDING_PUBLISH: { icon: 'calendar-outline', color: '#0284c7', bg: '#e0f2fe', labelKey: 'customerHome.status.Scheduled' },
  SEARCHING_DRIVER: { icon: 'search-outline', color: '#ca8a04', bg: '#fef9c3', labelKey: 'customerHome.status.Searching' },
  PENDING_CUSTOMER_APPROVAL: { icon: 'hourglass-outline', color: '#ea580c', bg: '#ffedd5', labelKey: 'customerHome.status.ApproveDriver' },
  DRIVER_ASSIGNED:  { icon: 'person-outline', color: '#2563eb', bg: '#dbeafe', labelKey: 'customerHome.status.Assigned' },
  DRIVER_ARRIVED:   { icon: 'flag-outline',   color: '#7c3aed', bg: '#ede9fe', labelKey: 'customerHome.status.Arrived' },
  PICKED_UP:        { icon: 'cube-outline',   color: '#ea580c', bg: '#ffedd5', labelKey: 'customerHome.status.PickedUp' },
  DELIVERING:       { icon: 'bicycle-outline', color: '#4f46e5', bg: '#e0e7ff', labelKey: 'customerHome.status.OnTheWay' },
};

export default function CustomerHomeScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [customerStatus, setCustomerStatus] = useState<string>('ACTIVE');
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMainAddress, setHasMainAddress] = useState(false);
  const [hasOrderDraft, setHasOrderDraft] = useState(false);

  const activeOrderIds = useMemo(() => activeOrders.map((o) => o.id), [activeOrders]);
  const chatUnreadByOrder = useActiveOrdersChatUnreadMap(activeOrderIds);

  const loadHeaderIdentity = useCallback(async () => {
    try {
      const c = await AsyncStorage.getItem('customer');
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

  useEffect(() => {
    if (customerStatus === 'CREATED' && !hasMainAddress) {
      appAlert(
        t('customerHome.addressVerificationRequired'),
        t('customerHome.pleaseAddMain'),
        [
          { text: t('customerHome.later'), style: 'cancel' },
          { text: t('customerHome.addMainAddress'), onPress: () => router.push('/(customer)/addresses') },
        ],
      );
    }
  }, [customerStatus, hasMainAddress, router, t]);

  const loadOrders = useCallback(async () => {
    try {
      const [orders, addresses] = await Promise.all([
        orderService.getMyOrders(),
        api.get<Array<{ nickname?: string | null }>>('/addresses').catch(() => []),
      ]);
      setActiveOrders(orders.filter(o => ACTIVE_STATUSES.includes(o.status)));
      setHasMainAddress(addresses.some((a) => String(a.nickname || '').toUpperCase() === 'MAIN'));
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
      void hasIncompleteCreateOrderDraft().then(setHasOrderDraft);
    }, [loadHeaderIdentity, loadOrders]),
  );

  useEffect(() => {
    const interval = setInterval(loadOrders, 10000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} />}>

        {/* Create Order CTA */}
        <View style={s.section}>
          <TouchableOpacity
            style={[s.ctaCard, { backgroundColor: isDark ? 'rgba(14,165,233,0.42)' : colors.primary }]}
            onPress={() => router.push('/(customer)/create-order')}
            activeOpacity={0.85}
          >
            <View style={s.ctaIconWrap}>
              <Ionicons name="add-circle" size={32} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.ctaTitleRow}>
                <Text style={s.ctaTitle}>{t('customerHome.createNewOrder')}</Text>
                {hasOrderDraft ? <View style={s.orderDraftDot} /> : null}
              </View>
              <Text style={s.ctaSub}>{t('customerHome.sendPackage')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>

        <View style={s.section}>
          <GameEntrySection placement="CUSTOMER_HOME" role="customer" />
        </View>

        {/* Quick Actions */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>{t('customerHome.quickActions')}</Text>
          <View style={s.actionsGrid}>
            <TouchableOpacity style={[s.actionCard, { backgroundColor: colors.card }]} onPress={() => router.push('/(customer)/orders')}>
              <View style={[s.actionIconWrap, { backgroundColor: isDark ? '#1e3a5f' : '#dbeafe' }]}>
                <Ionicons name="receipt-outline" size={22} color="#2563eb" />
              </View>
              <Text style={[s.actionLabel, { color: colors.text }]}>{t('customerHome.myOrders')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionCard, { backgroundColor: colors.card }]} onPress={() => router.push('/(customer)/addresses')}>
              <View style={[s.actionIconWrap, { backgroundColor: isDark ? '#052e16' : '#dcfce7' }]}>
                <Ionicons name="location-outline" size={22} color="#16a34a" />
              </View>
              <Text style={[s.actionLabel, { color: colors.text }]}>{t('customerHome.addresses')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionCard, { backgroundColor: colors.card }]} onPress={() => router.push('/(customer)/wallet')}>
              <View style={[s.actionIconWrap, { backgroundColor: isDark ? '#422006' : '#fef9c3' }]}>
                <Ionicons name="wallet-outline" size={22} color="#ca8a04" />
              </View>
              <Text style={[s.actionLabel, { color: colors.text }]}>{t('customerHome.wallet')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionCard, { backgroundColor: colors.card }]} onPress={() => router.push('/(customer)/settings')}>
              <View style={[s.actionIconWrap, { backgroundColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
                <Ionicons name="settings-outline" size={22} color={colors.primary} />
              </View>
              <Text style={[s.actionLabel, { color: colors.text }]}>{t('customerHome.settings')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Active Orders */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={[s.sectionTitle, { color: colors.text }]}>{t('customerHome.activeOrders')}</Text>
            {activeOrders.length > 0 && (
              <TouchableOpacity onPress={() => router.push('/(customer)/orders')}>
                <Text style={[s.seeAll, { color: colors.primary }]}>{t('customerHome.seeAll')}</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
          ) : activeOrders.length === 0 ? (
            <View style={[s.emptyCard, { backgroundColor: colors.card }]}>
              <Ionicons name="cube-outline" size={40} color={colors.textTertiary} />
              <Text style={[s.emptyText, { color: colors.textSecondary }]}>{t('customerHome.noActiveOrders')}</Text>
              <Text style={[s.emptySub, { color: colors.textTertiary }]}>{t('customerHome.createOrderHint')}</Text>
            </View>
          ) : (
            activeOrders.slice(0, 3).map(order => {
              const meta = STATUS_META[order.status] || STATUS_META.SEARCHING_DRIVER;
              return (
                <TouchableOpacity key={order.id} style={[s.orderCard, { backgroundColor: colors.card }]}
                  onPress={() => router.push(`/(customer)/order-detail?orderId=${order.id}`)} activeOpacity={0.8}>
                  <ActiveOrderChatUnreadBadge
                    count={chatUnreadByOrder[order.id] ?? 0}
                    iconColor={colors.primary}
                    iconBg={isDark ? `${colors.primary}28` : `${colors.primaryLight}`}
                  />
                  <View style={s.orderTop}>
                    <View style={[s.orderStatusBadge, { backgroundColor: isDark ? meta.color + '22' : meta.bg }]}>
                      <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                      <Text style={[s.orderStatusText, { color: meta.color }]}>{t(meta.labelKey)}</Text>
                    </View>
                    <Text style={[s.orderPrice, { color: colors.text }]}>{order.price.toFixed(2)} {t('common.tnd')}</Text>
                  </View>
                  <View style={s.orderRoute}>
                    <View style={s.orderRouteIcons}>
                      <View style={[s.miniDot, { backgroundColor: '#22c55e' }]} />
                      <View style={[s.miniLine, { backgroundColor: colors.border }]} />
                      <View style={[s.miniDot, { backgroundColor: '#ef4444' }]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.orderAddr, { color: colors.textSecondary }]} numberOfLines={1}>
                        {order.pickupAddress?.street || order.pickupAddress?.delegation?.nameDelegation || t('customerHome.pickup')}
                      </Text>
                      <Text style={[s.orderAddr, { color: colors.textSecondary }]} numberOfLines={1}>
                        {order.dropoffAddress?.street || order.dropoffAddress?.delegation?.nameDelegation || t('customerHome.delivery')}
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
  ctaTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap' },
  orderDraftDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f97316',
    marginStart: 6,
  },
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
