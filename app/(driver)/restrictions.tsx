import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

interface Restriction {
  id: string;
  type: 'SUSPENSION' | 'BLOCK' | 'WARNING';
  reason: string;
  startDate: string;
  endDate: string | null;
  liftedAt: string | null;
}

export default function DriverRestrictionsScreen() {
  const router = useRouter();
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadRestrictions(); }, []);

  const loadRestrictions = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) { router.replace('/(auth)/driver-login'); return; }
      const response = await axios.get(`${API_URL}/restrictions/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRestrictions(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load restrictions');
    } finally { setLoading(false); }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'BLOCK': return '#dc2626';
      case 'SUSPENSION': return '#f59e0b';
      case 'WARNING': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  if (loading) return <View style={s.centered}><ActivityIndicator size="large" color="#007AFF" /></View>;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={s.title}>My Restrictions</Text>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity onPress={loadRestrictions}><Text style={s.retryText}>Retry</Text></TouchableOpacity>
          </View>
        )}
        {restrictions.length === 0 && !error && (
          <View style={s.emptyBox}>
            <Ionicons name="checkmark-circle" size={48} color="#34C759" />
            <Text style={s.emptyTitle}>No Active Restrictions</Text>
            <Text style={s.emptyText}>Your account is in good standing.</Text>
          </View>
        )}
        {restrictions.map((r) => (
          <View key={r.id} style={s.card}>
            <View style={[s.typeBadge, { backgroundColor: getTypeColor(r.type) + '20' }]}>
              <Text style={[s.typeText, { color: getTypeColor(r.type) }]}>{r.type}</Text>
            </View>
            <Text style={s.reasonLabel}>Reason:</Text>
            <Text style={s.reasonText}>{r.reason}</Text>
            <View style={s.dateRow}>
              <Text style={s.dateLabel}>Since: {formatDate(r.startDate)}</Text>
              {r.endDate && <Text style={s.dateLabel}>Until: {formatDate(r.endDate)}</Text>}
              {!r.endDate && r.type === 'BLOCK' && <Text style={[s.dateLabel, { color: '#dc2626' }]}>Permanent</Text>}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 56, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  errorBox: { backgroundColor: '#fef2f2', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  errorText: { color: '#dc2626', marginBottom: 8 },
  retryText: { color: '#007AFF', fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginTop: 12 },
  emptyText: { fontSize: 14, color: '#666', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  typeBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginBottom: 12 },
  typeText: { fontSize: 12, fontWeight: '700' },
  reasonLabel: { fontSize: 13, color: '#666', marginBottom: 4 },
  reasonText: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 12 },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dateLabel: { fontSize: 12, color: '#666' },
});
