import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useTheme } from '../../contexts/ThemeContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const TYPE_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  PLATFORM_FEE: { bg: '#fee2e2', text: '#dc2626', icon: 'remove-circle-outline' },
  DEPOSIT: { bg: '#dcfce7', text: '#16a34a', icon: 'add-circle-outline' },
  BONUS: { bg: '#dbeafe', text: '#2563eb', icon: 'gift-outline' },
  PENALTY: { bg: '#ffedd5', text: '#ea580c', icon: 'warning-outline' },
  ADJUSTMENT: { bg: '#ede9fe', text: '#7c3aed', icon: 'swap-horizontal-outline' },
  DISPUTE_DEBIT: { bg: '#fee2e2', text: '#dc2626', icon: 'alert-circle-outline' },
  WITHDRAWAL: { bg: '#fef9c3', text: '#ca8a04', icon: 'arrow-down-outline' },
  REFUND: { bg: '#f3f4f6', text: '#6b7280', icon: 'return-down-back-outline' },
};

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  balanceAfter: number;
  createdAt: string;
}

export default function DriverTransactionsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState(0);
  const [currency, setCurrency] = useState('TND');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadTransactions = useCallback(async (p = 1, append = false) => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) { router.replace('/(auth)/driver-login'); return; }
      const res = await axios.get(`${API_URL}/drivers/me/transactions?page=${p}&limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = res.data;
      setBalance(data.balance);
      setCurrency(data.currency);
      setTotalPages(data.totalPages);
      if (append) {
        setTransactions(prev => [...prev, ...data.transactions]);
      } else {
        setTransactions(data.transactions);
      }
    } catch (e) {
      console.error(e);
    }
  }, [router]);

  useEffect(() => {
    loadTransactions(1).finally(() => setLoading(false));
  }, [loadTransactions]);

  const onRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await loadTransactions(1);
    setRefreshing(false);
  };

  const onEndReached = async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    const next = page + 1;
    setPage(next);
    await loadTransactions(next, true);
    setLoadingMore(false);
  };

  const renderItem = ({ item }: { item: Transaction }) => {
    const colors_ = TYPE_COLORS[item.type] || { bg: '#f3f4f6', text: '#6b7280', icon: 'ellipse-outline' };
    const isPositive = item.amount > 0;
    return (
      <View style={[s.txRow, { backgroundColor: colors.card }]}>
        <View style={[s.txIcon, { backgroundColor: colors_.bg }]}>
          <Ionicons name={colors_.icon as any} size={20} color={colors_.text} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.txType, { color: colors.text }]}>{item.type.replace(/_/g, ' ')}</Text>
          {item.description ? <Text style={[s.txDesc, { color: colors.textTertiary }]} numberOfLines={1}>{item.description}</Text> : null}
          <Text style={s.txDate}>
            {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.txAmount, { color: isPositive ? '#16a34a' : '#dc2626' }]}>
            {isPositive ? '+' : ''}{item.amount.toFixed(2)}
          </Text>
          <Text style={[s.txBalance, { color: colors.textTertiary }]}>{item.balanceAfter.toFixed(2)}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.headerBg }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Transactions</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Balance card */}
      <View style={[s.balanceCard, { backgroundColor: colors.card }]}>
        <Text style={[s.balanceLabel, { color: colors.textTertiary }]}>Current Balance</Text>
        <Text style={[s.balanceValue, { color: balance < 0 ? '#dc2626' : '#16a34a' }]}>
          {balance.toFixed(2)} {currency}
        </Text>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="receipt-outline" size={48} color="#d1d5db" />
            <Text style={s.emptyText}>No transactions yet</Text>
          </View>
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: 16 }} color="#0284c7" /> : null}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  header: {
    backgroundColor: '#0284c7', paddingTop: 50, paddingBottom: 18, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  balanceCard: {
    margin: 16, marginBottom: 0, backgroundColor: '#fff', borderRadius: 16, padding: 20,
    alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  balanceLabel: { fontSize: 13, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  balanceValue: { fontSize: 28, fontWeight: '800', marginTop: 4 },
  txRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff',
    borderRadius: 14, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  txIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  txType: { fontSize: 13, fontWeight: '700', color: '#374151' },
  txDesc: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  txDate: { fontSize: 11, color: '#d1d5db', marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: '800' },
  txBalance: { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, color: '#9ca3af', fontWeight: '600' },
});
