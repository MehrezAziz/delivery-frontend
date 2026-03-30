import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderService } from '../../services/api/order.service';
import { useTheme } from '../../contexts/ThemeContext';

const STAR_LABELS = ['', 'Terrible', 'Very Bad', 'Bad', 'Poor', 'Below Avg', 'Average', 'Above Avg', 'Good', 'Very Good', 'Excellent'];

export default function DriverMyRatingsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await orderService.getDriverRatings()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <View style={[s.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color="#f59e0b" /></View>;
  }

  const avg = data?.avgRating;
  const ratings = data?.ratings || [];

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Ratings</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>

        {/* Summary card */}
        <View style={[s.summaryCard, { backgroundColor: colors.card }]}>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <Text style={s.avgScore}>{avg !== null ? avg.toFixed(1) : '—'}</Text>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {Array.from({ length: 10 }, (_, i) => (
                <Ionicons key={i} name={avg !== null && i < Math.round(avg) ? 'star' : 'star-outline'}
                  size={18} color={avg !== null && i < Math.round(avg) ? '#f59e0b' : '#d1d5db'} />
              ))}
            </View>
            <Text style={[s.summaryText, { color: colors.textSecondary }]}>
              {data?.totalRatings || 0} ratings · {data?.completedOrders || 0} deliveries
            </Text>
          </View>
        </View>

        {/* Ratings list */}
        {ratings.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="star-outline" size={48} color={colors.textTertiary} />
            <Text style={[s.emptyTitle, { color: colors.textTertiary }]}>No ratings yet</Text>
            <Text style={s.emptySub}>Complete deliveries to receive ratings</Text>
          </View>
        ) : (
          ratings.map((r: any) => (
            <View key={r.id} style={[s.ratingCard, { backgroundColor: colors.card }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[s.customerName, { color: colors.text }]}>{r.customerName}</Text>
                <Text style={[s.ratingDate, { color: colors.textTertiary }]}>
                  {new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <Ionicons key={i} name={i < r.score ? 'star' : 'star-outline'} size={14}
                      color={i < r.score ? '#f59e0b' : '#d1d5db'} />
                  ))}
                </View>
                <Text style={s.scoreLabel}>{r.score}/10</Text>
              </View>
              {r.comment && <Text style={[s.comment, { color: colors.textSecondary }]}>"{r.comment}"</Text>}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  header: {
    backgroundColor: '#f59e0b', paddingTop: 50, paddingBottom: 18, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  summaryCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 24, marginBottom: 16, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  avgScore: { fontSize: 48, fontWeight: '800', color: '#f59e0b' },
  summaryText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  ratingCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  customerName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  ratingDate: { fontSize: 12, color: '#9ca3af' },
  scoreLabel: { fontSize: 13, fontWeight: '600', color: '#f59e0b' },
  comment: { fontSize: 14, color: '#6b7280', marginTop: 8, fontStyle: 'italic' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#9ca3af', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#d1d5db', marginTop: 4 },
});
