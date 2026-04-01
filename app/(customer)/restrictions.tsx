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
import { useTheme } from '../../contexts/ThemeContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

interface Restriction {
  id: string;
  type: 'SUSPENSION' | 'BLOCK' | 'WARNING';
  reason: string;
  startDate: string;
  endDate: string | null;
  liftedAt: string | null;
}

export default function CustomerRestrictionsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRestrictions();
  }, []);

  const loadRestrictions = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) { router.replace('/(auth)/customer-login'); return; }

      const response = await axios.get(`${API_URL}/restrictions/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRestrictions(response.data);
    } catch (err: any) {
      console.error('Load restrictions error:', err);
      setError(err.response?.data?.message || 'Failed to load restrictions');
    } finally {
      setLoading(false);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'BLOCK': return '#dc2626';
      case 'SUSPENSION': return '#f59e0b';
      case 'WARNING': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'BLOCK': return 'ban';
      case 'SUSPENSION': return 'pause-circle';
      case 'WARNING': return 'warning';
      default: return 'information-circle';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(customer)/home')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>My Restrictions</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            <TouchableOpacity onPress={loadRestrictions}>
              <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {restrictions.length === 0 && !error && (
          <View style={styles.emptyBox}>
            <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Active Restrictions</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Your account is in good standing.</Text>
          </View>
        )}

        {restrictions.map((r) => (
          <View key={r.id} style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.cardHeader}>
              <Ionicons name={getTypeIcon(r.type) as any} size={24} color={getTypeColor(r.type)} />
              <View style={[styles.typeBadge, { backgroundColor: getTypeColor(r.type) + '20' }]}>
                <Text style={[styles.typeText, { color: getTypeColor(r.type) }]}>{r.type}</Text>
              </View>
            </View>
            <Text style={[styles.reasonLabel, { color: colors.textSecondary }]}>Reason:</Text>
            <Text style={[styles.reasonText, { color: colors.text }]}>{r.reason}</Text>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Since: {formatDate(r.startDate)}</Text>
              {r.endDate && <Text style={styles.dateLabel}>Until: {formatDate(r.endDate)}</Text>}
              {!r.endDate && r.type === 'BLOCK' && (
                <Text style={[styles.dateLabel, { color: '#dc2626' }]}>Permanent</Text>
              )}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, backgroundColor: '#fff', gap: 12 },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#111827' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  errorBox: { backgroundColor: '#fef2f2', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  errorText: { color: '#dc2626', marginBottom: 8 },
  retryText: { color: '#0284c7', fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#111827', marginTop: 12 },
  emptyText: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  typeText: { fontSize: 12, fontWeight: '700' },
  reasonLabel: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  reasonText: { fontSize: 15, color: '#111827', lineHeight: 22, marginBottom: 12 },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dateLabel: { fontSize: 12, color: '#6b7280' },
});
