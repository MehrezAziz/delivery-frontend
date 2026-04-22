import { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useTheme } from '../../contexts/ThemeContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

type DriverMe = {
  account?: {
    balance: number;
    currency: string;
    completedDeliveries: number;
  } | null;
};

export default function DriverEarningsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [driver, setDriver] = useState<DriverMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        router.replace('/(auth)/driver-login');
        return;
      }
      const res = await axios.get<DriverMe>(`${API_URL}/drivers/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDriver(res.data);
    } catch {
      setDriver(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const balance = driver?.account?.balance ?? 0;
  const currency = driver?.account?.currency ?? 'TND';
  const deliveries = driver?.account?.completedDeliveries ?? 0;
  const negative = balance < 0;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View
          style={[
            styles.hero,
            { backgroundColor: colors.primary },
          ]}
        >
          <View style={styles.heroTopRow}>
            <View style={[styles.heroBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Ionicons name="trending-up" size={14} color="#fff" />
              <Text style={styles.heroBadgeText}>Wallet</Text>
            </View>
          </View>
          <Text style={styles.heroLabel}>Account balance</Text>
          <Text style={styles.heroAmount} numberOfLines={1}>
            {balance.toFixed(2)}
            <Text style={styles.heroCurrency}> {currency}</Text>
          </Text>
          <Text style={styles.heroHint}>
            {negative
              ? 'Settle negative balance to stay active'
              : 'Earnings from completed deliveries are reflected here'}
          </Text>
        </View>

        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.metricIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="bicycle" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.metricValue, { color: colors.text }]}>{deliveries}</Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Completed</Text>
          </View>
          <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.metricIcon, { backgroundColor: negative ? '#fee2e2' : '#dcfce7' }]}>
              <Ionicons name="wallet-outline" size={20} color={negative ? '#dc2626' : '#16a34a'} />
            </View>
            <Text style={[styles.metricValue, { color: negative ? '#dc2626' : colors.text }]} numberOfLines={1}>
              {balance.toFixed(0)}
            </Text>
            <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Balance ({currency})</Text>
          </View>
        </View>

        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.panelTitle, { color: colors.text }]}>Quick actions</Text>
          <TouchableOpacity
            style={[styles.actionRow, { backgroundColor: colors.surfaceVariant }]}
            onPress={() => router.push('/(driver)/transactions')}
            activeOpacity={0.75}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="receipt-outline" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Transaction history</Text>
              <Text style={[styles.actionSub, { color: colors.textSecondary }]}>
                Credits, fees, and payouts in one list
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, { backgroundColor: colors.surfaceVariant, marginTop: 10 }]}
            onPress={() => router.push('/(driver)/my-orders')}
            activeOpacity={0.75}
          >
            <View style={[styles.actionIcon, { backgroundColor: isDark ? 'rgba(34,197,94,0.2)' : '#dcfce7' }]}>
              <Ionicons name="list-outline" size={22} color="#16a34a" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>My deliveries</Text>
              <Text style={[styles.actionSub, { color: colors.textSecondary }]}>Review active and past jobs</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        <View style={[styles.tipCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={22} color={colors.primary} />
          <Text style={[styles.tipText, { color: colors.textSecondary }]}>
            Detailed earnings breakdown and filters are available in transaction history.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  hero: {
    borderRadius: 20,
    padding: 22,
    marginBottom: 16,
    overflow: 'hidden',
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 12 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  heroBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  heroAmount: { color: '#fff', fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  heroCurrency: { fontSize: 20, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  heroHint: { color: 'rgba(255,255,255,0.78)', fontSize: 13, marginTop: 12, lineHeight: 18 },
  metricsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  metricIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  metricValue: { fontSize: 22, fontWeight: '800' },
  metricLabel: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  panel: {
    borderRadius: 18,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
  },
  panelTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
  },
  actionIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: { fontSize: 15, fontWeight: '700' },
  actionSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tipText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '500' },
});
