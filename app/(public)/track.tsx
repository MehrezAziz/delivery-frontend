import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { orderService } from '../../services/api/order.service';

export default function PublicTrackScreen() {
  const { token: paramToken } = useLocalSearchParams<{ token?: string }>();
  const { t } = useTranslation();
  const [inputToken, setInputToken] = useState(paramToken || '');
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState<{
    status: string;
    driverLocation: { latitude: number; longitude: number; timestamp: string } | null;
    dropoffAddress: { street: string | null; delegation: string; governorate: string } | null;
  } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeToken = useRef<string>('');

  const fetchTracking = async (token: string) => {
    try {
      const data = await orderService.getPublicTracking(token);
      setTracking(data);
    } catch (e: any) {
      setTracking(null);
      if (intervalRef.current) clearInterval(intervalRef.current);
      Alert.alert(t('common.error'), e.message || t('publicTrack.invalidCodeBody'));
    }
  };

  const handleTrack = async () => {
    const token = inputToken.trim().toUpperCase();
    if (!token) return;
    setLoading(true);
    activeToken.current = token;
    try {
      await fetchTracking(token);
      // Poll every 5 seconds
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => fetchTracking(token), 5000);
    } finally {
      setLoading(false);
    }
  };

  // Auto-track if token passed via deep link
  useEffect(() => {
    if (paramToken) handleTrack();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const driverCoord = tracking?.driverLocation
    ? { latitude: tracking.driverLocation.latitude, longitude: tracking.driverLocation.longitude }
    : null;

  return (
    <View style={s.container}>
      {/* Token input */}
      <View style={s.inputCard}>
        <Text style={s.title}>{t('publicTrack.title')}</Text>
        <Text style={s.subtitle}>{t('publicTrack.enterCode')}</Text>
        <View style={s.row}>
          <TextInput
            style={s.input}
            value={inputToken}
            onChangeText={setInputToken}
            placeholder={t('publicTrack.placeholder')}
            placeholderTextColor="#9ca3af"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <TouchableOpacity style={s.btn} onPress={handleTrack} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="search" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Map */}
      {tracking && (
        <>
          <MapView
            style={s.map}
            provider={PROVIDER_GOOGLE}
            region={driverCoord
              ? { ...driverCoord, latitudeDelta: 0.008, longitudeDelta: 0.008 }
              : { latitude: 36.8, longitude: 10.18, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
          >
            {driverCoord && (
              <Marker coordinate={driverCoord} title={t('publicTrack.driver')}>
                <View style={s.driverMarker}>
                  <Ionicons name="car" size={20} color="#fff" />
                </View>
              </Marker>
            )}
          </MapView>

          {/* Status card */}
          <View style={s.statusCard}>
            <View style={s.statusRow}>
              <Ionicons name="radio-button-on" size={14} color="#22c55e" />
              <Text style={s.statusText}>{tracking.status.replace(/_/g, ' ')}</Text>
            </View>
            {tracking.dropoffAddress && (
              <Text style={s.addressText} numberOfLines={1}>
                <Ionicons name="location" size={13} color="#ef4444" />
                {' '}{tracking.dropoffAddress.street || tracking.dropoffAddress.delegation}, {tracking.dropoffAddress.governorate}
              </Text>
            )}
            {!driverCoord && (
              <Text style={s.waitText}>{t('publicTrack.waitingLocation')}</Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  inputCard: {
    backgroundColor: '#fff', padding: 20, paddingTop: 60,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 4,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  row: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1, height: 48, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12,
    paddingHorizontal: 14, fontSize: 16, color: '#111827', backgroundColor: '#f9fafb',
    letterSpacing: 1,
  },
  btn: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: '#0284c7',
    alignItems: 'center', justifyContent: 'center',
  },
  map: { flex: 1 },
  statusCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 8,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  statusText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  addressText: { fontSize: 13, color: '#6b7280' },
  waitText: { fontSize: 13, color: '#ca8a04', marginTop: 8 },
  driverMarker: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#0284c7',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
  },
});
