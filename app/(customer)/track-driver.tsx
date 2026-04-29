import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Share, Clipboard,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { orderService, Order } from '../../services/api/order.service';
import { useTheme } from '../../contexts/ThemeContext';
import { GOOGLE_MAPS_DARK_STYLE } from '../../constants/googleMapsDarkStyle';
import { appAlert } from '../../utils/appAlert';

function normalizeDriverLocationPayload(loc: unknown): { latitude: number; longitude: number } | null {
  if (loc == null || typeof loc !== 'object') return null;
  const o = loc as Record<string, unknown>;
  const nested = o.driverLocation;
  if (nested && typeof nested === 'object') {
    const inner = normalizeDriverLocationPayload(nested);
    if (inner) return inner;
  }
  const lat = o.latitude ?? o.lat;
  const lng = o.longitude ?? o.lng ?? o.long;
  if (lat == null || lng == null) return null;
  const la = typeof lat === 'string' ? parseFloat(lat) : Number(lat);
  const ln = typeof lng === 'string' ? parseFloat(lng) : Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  return { latitude: la, longitude: ln };
}

export default function TrackDriverScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { colors, isDark } = useTheme();
  const [order, setOrder] = useState<Order | null>(null);
  const [driverLoc, setDriverLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);

  const handleShare = useCallback(async () => {
    try {
      const res = await orderService.getTrackingToken(orderId);
      const token = res.trackingToken;
      setTrackingToken(token);
      const webLink = `http://localhost:3001/track/${token}`;
      await Share.share({
        message: `Track my delivery live!\n\n📦 Code: ${token}\n🔗 Link: ${webLink}\n\nOpen the app → Orders → "Track" button → enter the code.\nOr tap the link to track in your browser.`,
        title: 'Track My Delivery',
      });
    } catch (e: any) {
      appAlert('Error', e.message || 'Could not get tracking token');
    }
  }, [orderId]);
  const loadData = useCallback(async () => {
    try {
      const [orderData, loc] = await Promise.all([
        orderService.getOrder(orderId),
        orderService.getDriverLocation(orderId).catch(() => null),
      ]);
      setOrder(orderData);
      const coords = normalizeDriverLocationPayload(loc);
      if (coords) setDriverLoc(coords);
    } catch (e: any) {
      appAlert('Error', e.message || 'Failed to load tracking data');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Poll every 5 seconds for real-time tracking
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const loc = await orderService.getDriverLocation(orderId);
        const coords = normalizeDriverLocationPayload(loc);
        if (coords) setDriverLoc(coords);
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [orderId]);

  // Track whether we've centered on driver
  const [mapRegion, setMapRegion] = useState<any>(null);
  const hasCenteredOnDriver = useRef(false);
  useEffect(() => {
    if (!driverLoc || hasCenteredOnDriver.current) return;
    hasCenteredOnDriver.current = true;
    setMapRegion({ ...driverLoc, latitudeDelta: 0.012, longitudeDelta: 0.012 });
  }, [driverLoc]);

  if (loading || !order) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const pickupCoord = order.pickupAddress?.latitude && order.pickupAddress?.longitude
    ? { latitude: order.pickupAddress.latitude, longitude: order.pickupAddress.longitude } : null;
  const dropoffCoord = order.dropoffAddress?.latitude && order.dropoffAddress?.longitude
    ? { latitude: order.dropoffAddress.latitude, longitude: order.dropoffAddress.longitude } : null;

  const centerCoord = driverLoc || pickupCoord || dropoffCoord || { latitude: 36.8, longitude: 10.18 };
  const zoomDelta = driverLoc ? 0.008 : 0.04;

  const driverName = order?.driverAssignment?.driver
    ? `${order.driverAssignment.driver.user.firstName || ''} ${order.driverAssignment.driver.user.secondName || ''}`.trim()
    : 'Driver';

  return (
    <View style={s.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={s.map}
        provider={PROVIDER_GOOGLE}
        region={mapRegion || { ...centerCoord, latitudeDelta: zoomDelta, longitudeDelta: zoomDelta }}
        onRegionChangeComplete={(r) => {
          if (hasCenteredOnDriver.current) setMapRegion(r);
        }}
        showsUserLocation
        customMapStyle={isDark ? GOOGLE_MAPS_DARK_STYLE : undefined}
      >
        {driverLoc && (
          <Marker
            coordinate={driverLoc}
            title={driverName}
            description="Live driver position"
            tracksViewChanges={false}
          >
            <View style={s.driverMarker}>
              <Ionicons name="car" size={22} color="#fff" />
            </View>
          </Marker>
        )}
        {pickupCoord && (
          <Marker coordinate={pickupCoord} title="Pickup" tracksViewChanges={false}>
            <View style={s.pickupMarker}>
              <Ionicons name="flag" size={18} color="#fff" />
            </View>
          </Marker>
        )}
        {dropoffCoord && (
          <Marker coordinate={dropoffCoord} title="Delivery" description="Drop-off" tracksViewChanges={false}>
            <View style={s.deliveryMarker}>
              <Ionicons name="cube" size={20} color="#fff" />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Header overlay */}
      <View style={[s.headerOverlay, { backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)' }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(customer)/home')} style={[s.headerBtn, { backgroundColor: colors.surfaceVariant }]}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Track Driver</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={handleShare} style={[s.headerBtn, { backgroundColor: colors.surfaceVariant }]}>
            <Ionicons name="share-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {
          if (!mapRef.current) return;
          const coords: { latitude: number; longitude: number }[] = [];
          if (driverLoc) coords.push(driverLoc);
          if (pickupCoord) coords.push(pickupCoord);
          if (dropoffCoord) coords.push(dropoffCoord);
          if (coords.length >= 2) {
            mapRef.current.fitToCoordinates(coords, { edgePadding: { top: 80, right: 60, bottom: 200, left: 60 }, animated: true });
          }
        }} style={[s.headerBtn, { backgroundColor: colors.surfaceVariant }]}>
          <Ionicons name="expand-outline" size={20} color={colors.text} />
        </TouchableOpacity>
        </View>
      </View>

      {/* Bottom info card */}
      <View style={[s.bottomCard, { backgroundColor: colors.card }]}>
        {/* Driver info */}
        {order?.driverAssignment?.driver && (
          <View style={s.driverRow}>
            <View style={s.driverAvatar}>
              <Ionicons name="person" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.driverNameText, { color: colors.text }]}>{driverName}</Text>
              <Text style={[s.driverPhone, { color: colors.textSecondary }]}>{order.driverAssignment.driver.user.phone}</Text>
            </View>
            <TouchableOpacity style={s.chatBtn}
              onPress={() => router.push(`/(customer)/order-chat?orderId=${orderId}`)}>
              <Ionicons name="chatbubble-ellipses" size={18} color="#0284c7" />
            </TouchableOpacity>
          </View>
        )}

        {/* Route summary */}
        <View style={s.routeRow}>
          <View style={s.routeIcons}>
            <View style={[s.dot, { backgroundColor: '#22c55e' }]} />
            <View style={s.line} />
            <View style={[s.dot, { backgroundColor: '#ef4444' }]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.routeAddr, { color: colors.textSecondary }]} numberOfLines={1}>
              {order?.pickupAddress?.street || order?.pickupAddress?.delegation?.nameDelegation || 'Pickup'}
            </Text>
            <Text style={[s.routeAddr, { color: colors.textSecondary }]} numberOfLines={1}>
              {order?.dropoffAddress?.street || order?.dropoffAddress?.delegation?.nameDelegation || 'Delivery'}
            </Text>
          </View>
        </View>

        {!driverLoc && (
          <View style={s.noLocCard}>
            <Ionicons name="location-outline" size={20} color="#ca8a04" />
            <Text style={s.noLocText}>Waiting for driver location update...</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  map: { flex: 1 },

  headerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 50, paddingBottom: 12, paddingHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  headerBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },

  driverMarker: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#0284c7',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 6,
  },
  pickupMarker: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#22c55e',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    elevation: 4,
  },
  deliveryMarker: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#ea580c',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4, elevation: 6,
  },

  bottomCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 36,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10,
  },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  driverAvatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#0284c7',
    alignItems: 'center', justifyContent: 'center',
  },
  driverNameText: { fontSize: 16, fontWeight: '700', color: '#111827' },
  driverPhone: { fontSize: 13, color: '#6b7280', marginTop: 1 },
  chatBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#eff6ff',
    alignItems: 'center', justifyContent: 'center',
  },

  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeIcons: { alignItems: 'center', gap: 3 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { width: 2, height: 16, backgroundColor: '#e5e7eb', borderRadius: 1 },
  routeAddr: { fontSize: 13, color: '#6b7280', lineHeight: 20 },

  noLocCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fef9c3', borderRadius: 12, padding: 12, marginTop: 12,
  },
  noLocText: { fontSize: 13, color: '#ca8a04', fontWeight: '500' },
});
