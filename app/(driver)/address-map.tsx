import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useTheme } from '../../contexts/ThemeContext';

function parseParam(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

export default function DriverAddressMapScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{ lat?: string | string[]; lng?: string | string[]; kind?: string | string[]; title?: string | string[] }>();

  const latRaw = parseParam(params.lat);
  const lngRaw = parseParam(params.lng);
  const kind = parseParam(params.kind) as 'pickup' | 'dropoff' | '';
  const title = parseParam(params.title) || 'Location';

  const coord = useMemo(() => {
    const lat = parseFloat(latRaw);
    const lng = parseFloat(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { latitude: lat, longitude: lng };
  }, [latRaw, lngRaw]);

  const markerColor = kind === 'dropoff' ? '#ef4444' : '#22c55e';

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(driver)/home');
  };

  if (!coord) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={handleBack} style={[s.headerBtn, { backgroundColor: colors.surfaceVariant, marginBottom: 16 }]}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 24 }}>
          Invalid or missing map coordinates.
        </Text>
      </View>
    );
  }

  const region = {
    ...coord,
    latitudeDelta: 0.012,
    longitudeDelta: 0.012,
  };

  return (
    <View style={s.container}>
      <MapView style={s.map} provider={PROVIDER_GOOGLE} initialRegion={region}>
        <Marker coordinate={coord} title={title}>
          <View style={[s.markerOuter, { borderColor: markerColor }]}>
            <View style={[s.markerInner, { backgroundColor: markerColor }]}>
              <Ionicons name="location" size={22} color="#fff" />
            </View>
          </View>
        </Marker>
      </MapView>

      <View style={[s.headerOverlay, { backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)' }]}>
        <TouchableOpacity onPress={handleBack} style={[s.headerBtn, { backgroundColor: colors.surfaceVariant }]}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 42 }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  map: { flex: 1 },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center', marginHorizontal: 8 },
  markerOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderRadius: 999,
    padding: 2,
    backgroundColor: '#fff',
  },
  markerInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
