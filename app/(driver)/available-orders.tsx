import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, RefreshControl, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderService, AvailableOrders, Order } from '../../services/api/order.service';

const ZONE_META: Record<string, { icon: string; color: string; bg: string }> = {
  'Same Delegation':        { icon: 'location',      color: '#16a34a', bg: '#dcfce7' },
  'Same Governorate':       { icon: 'map',           color: '#2563eb', bg: '#dbeafe' },
  'Different Governorate':  { icon: 'globe-outline',  color: '#7c3aed', bg: '#ede9fe' },
  'Different Country':      { icon: 'airplane-outline', color: '#dc2626', bg: '#fee2e2' },
};

export default function AvailableOrdersScreen() {
  const router = useRouter();
  const [data, setData] = useState<AvailableOrders | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await orderService.getAvailableOrders()); }
    catch (e: any) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const i = setInterval(load, 10000); return () => clearInterval(i); }, [load]);

  const handleAccept = async (orderId: string) => {
    if (!data?.canAccept) {
      Alert.alert('Not Verified', 'Your account must be verified before you can accept orders.');
      return;
    }
    Alert.alert('Accept Order', 'Take this delivery?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Accept', onPress: async () => {
        setAccepting(orderId);
        try { await orderService.acceptOrder(orderId); Alert.alert('Success', 'Order accepted!'); router.replace('/(driver)/my-orders'); }
        catch (e: any) { Alert.alert('Error', e.message); }
        finally { setAccepting(null); }
      }},
    ]);
  };

  const renderOrderCard = (order: Order) => {
    const isAccepting = accepting === order.id;
    return (
      <View key={order.id} style={s.card}>
        {/* Top: ID + Price */}
        <View style={s.cardTop}>
          <Text style={s.orderId}>#{order.id.slice(0, 8)}</Text>
          <View style={s.priceTag}>
            <Text style={s.priceText}>{order.price.toFixed(2)}</Text>
            <Text style={s.priceCurrency}>TND</Text>
          </View>
        </View>

        {/* Route */}
        <View style={s.routeSection}>
          <View style={s.routeIconCol}>
            <View style={[s.routeDot, { backgroundColor: '#22c55e' }]} />
            <View style={s.routeLine} />
            <View style={[s.routeDot, { backgroundColor: '#ef4444' }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.routeText} numberOfLines={1}>
              {order.pickupAddress?.street || order.pickupAddress?.delegation?.nameDelegation || 'Pickup'}
            </Text>
            <View style={{ height: 14 }} />
            <Text style={s.routeText} numberOfLines={1}>
              {order.dropoffAddress?.street || order.dropoffAddress?.delegation?.nameDelegation || 'Dropoff'}
            </Text>
          </View>
        </View>

        {/* Info chips */}
        <View style={s.chipsRow}>
          <View style={s.chip}>
            <Ionicons name="resize-outline" size={12} color="#6b7280" />
            <Text style={s.chipText}>{order.distanceKm.toFixed(1)} km</Text>
          </View>
          <View style={s.chip}>
            <Ionicons name="cube-outline" size={12} color="#6b7280" />
            <Text style={s.chipText}>{order.weight} kg</Text>
          </View>
          <View style={[s.chip, { backgroundColor: order.paymentType === 'COD' ? '#dcfce7' : '#dbeafe' }]}>
            <Text style={{ fontSize: 11 }}>{order.paymentType === 'COD' ? '💵' : '💰'}</Text>
            <Text style={[s.chipText, { color: order.paymentType === 'COD' ? '#166534' : '#1e40af' }]}>
              {order.paymentType === 'COD' ? 'Cash' : 'Wallet'}
            </Text>
          </View>
          {order.isNightDelivery && (
            <View style={[s.chip, { backgroundColor: '#e0e7ff' }]}>
              <Text style={{ fontSize: 11 }}>🌙</Text>
              <Text style={[s.chipText, { color: '#3730a3' }]}>Night</Text>
            </View>
          )}
        </View>

        {/* Accept button */}
        <TouchableOpacity
          style={[s.acceptBtn, !data?.canAccept && s.acceptBtnDisabled]}
          onPress={() => handleAccept(order.id)}
          disabled={isAccepting}
          activeOpacity={0.8}
        >
          {isAccepting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name={data?.canAccept ? 'checkmark-circle' : 'eye-outline'} size={18} color="#fff" />
              <Text style={s.acceptBtnText}>{data?.canAccept ? 'Accept Order' : 'View Only'}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderSection = (title: string, orders: Order[]) => {
    if (orders.length === 0) return null;
    const meta = ZONE_META[title] || ZONE_META['Same Delegation'];
    return (
      <View style={{ marginBottom: 20 }}>
        <View style={s.sectionHeader}>
          <View style={[s.sectionIcon, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon as any} size={14} color={meta.color} />
          </View>
          <Text style={s.sectionTitle}>{title}</Text>
          <View style={s.sectionBadge}>
            <Text style={s.sectionBadgeText}>{orders.length}</Text>
          </View>
        </View>
        {orders.map(renderOrderCard)}
      </View>
    );
  };

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#0284c7" /></View>;
  }

  const totalOrders = (data?.sameDelegation.length || 0) + (data?.sameGovernorate.length || 0) +
    (data?.differentGovernorate.length || 0) + (data?.differentCountry.length || 0);

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Available Orders</Text>
          <View style={{ width: 38 }} />
        </View>
        <Text style={s.headerSub}>{totalOrders} order{totalOrders !== 1 ? 's' : ''} near you</Text>
      </View>

      {/* Verification warning */}
      {!data?.canAccept && (
        <View style={s.warningBanner}>
          <Ionicons name="alert-circle" size={18} color="#92400e" />
          <Text style={s.warningText}>Your account is not verified yet. You can browse orders but cannot accept them.</Text>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
        {totalOrders === 0 ? (
          <View style={s.empty}>
            <Ionicons name="cube-outline" size={56} color="#d1d5db" />
            <Text style={s.emptyTitle}>No orders available</Text>
            <Text style={s.emptySub}>Pull down to refresh</Text>
          </View>
        ) : (
          <>
            {renderSection('Same Delegation', data?.sameDelegation || [])}
            {renderSection('Same Governorate', data?.sameGovernorate || [])}
            {renderSection('Different Governorate', data?.differentGovernorate || [])}
            {renderSection('Different Country', data?.differentCountry || [])}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },

  // Header
  header: {
    backgroundColor: '#0284c7', paddingTop: 50, paddingBottom: 20, paddingHorizontal: 20,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 14, textAlign: 'center' },

  // Warning
  warningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fffbeb', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#fde68a',
  },
  warningText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18 },

  // Section
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#374151' },
  sectionBadge: {
    backgroundColor: '#e5e7eb', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  sectionBadgeText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },

  // Card
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  orderId: { fontSize: 15, fontWeight: '700', color: '#111827' },
  priceTag: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  priceText: { fontSize: 20, fontWeight: '800', color: '#0284c7' },
  priceCurrency: { fontSize: 12, fontWeight: '600', color: '#6b7280' },

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

  // Accept button
  acceptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#22c55e', height: 46, borderRadius: 14,
    shadowColor: '#22c55e', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  acceptBtnDisabled: { backgroundColor: '#94a3b8', shadowOpacity: 0 },
  acceptBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Empty
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#9ca3af', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#d1d5db', marginTop: 4 },
});
