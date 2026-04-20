import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, Pressable, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useTheme } from '../../contexts/ThemeContext';
import { orderService, Order } from '../../services/api/order.service';

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
  RETURN_DEPOSIT_SETTLEMENT: { bg: '#ede9fe', text: '#6d28d9', icon: 'layers-outline' },
};

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  balanceAfter: number;
  createdAt: string;
  referenceId: string | null;
  referenceType: string | null;
}

type MergedReturnDeposit = {
  kind: 'merged_return_deposit';
  id: string;
  netAmount: number;
  balanceAfter: number;
  createdAt: string;
  referenceId: string;
  grossPayout: number;
  platformFee: number;
};

type DisplayRow = { kind: 'single'; tx: Transaction } | MergedReturnDeposit;

function buildDisplayRows(transactions: Transaction[]): DisplayRow[] {
  const out: DisplayRow[] = [];
  const used = new Set<string>();

  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    if (used.has(t.id)) continue;

    const next = transactions[i + 1];
    if (next && !used.has(next.id)) {
      const pair = [t, next];
      const fee = pair.find((x) => x.type === 'PLATFORM_FEE');
      const adj = pair.find((x) => x.type === 'ADJUSTMENT');
      if (
        fee &&
        adj &&
        fee.referenceId &&
        fee.referenceId === adj.referenceId &&
        fee.referenceType === 'ORDER'
      ) {
        const desc = `${fee.description || ''} ${adj.description || ''}`;
        if (desc.toLowerCase().includes('return-deposit') || desc.toLowerCase().includes('return deposit')) {
          used.add(fee.id);
          used.add(adj.id);
          const grossPayout = adj.amount;
          const platformFee = -fee.amount;
          out.push({
            kind: 'merged_return_deposit',
            id: `m-${fee.id}-${adj.id}`,
            netAmount: grossPayout - platformFee,
            balanceAfter: Number(fee.balanceAfter),
            createdAt: fee.createdAt > adj.createdAt ? fee.createdAt : adj.createdAt,
            referenceId: fee.referenceId,
            grossPayout,
            platformFee,
          });
          continue;
        }
      }
    }
    out.push({ kind: 'single', tx: t });
  }
  return out;
}

export default function DriverTransactionsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState(0);
  const [currency, setCurrency] = useState('TND');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailExtra, setDetailExtra] = useState<{
    merged?: MergedReturnDeposit;
    single?: Transaction;
  } | null>(null);

  const displayRows = useMemo(() => buildDisplayRows(transactions), [transactions]);

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

  useEffect(() => {
    if (!detailOrderId) {
      setDetailOrder(null);
      return;
    }
    setDetailLoading(true);
    void orderService
      .getOrder(detailOrderId)
      .then((o) => setDetailOrder(o))
      .catch(() => setDetailOrder(null))
      .finally(() => setDetailLoading(false));
  }, [detailOrderId]);

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

  const openDetail = (row: DisplayRow) => {
    if (row.kind === 'merged_return_deposit') {
      setDetailExtra({ merged: row });
      setDetailOrderId(row.referenceId);
      return;
    }
    const tx = row.tx;
    if (tx.referenceType === 'ORDER' && tx.referenceId) {
      setDetailExtra({ single: tx });
      setDetailOrderId(tx.referenceId);
    } else {
      setDetailExtra({ single: tx });
      setDetailOrderId(null);
      setDetailOrder(null);
    }
  };

  const closeDetail = () => {
    setDetailOrderId(null);
    setDetailExtra(null);
    setDetailOrder(null);
  };

  const renderItem = ({ item: row }: { item: DisplayRow }) => {
    if (row.kind === 'merged_return_deposit') {
      const colors_ = TYPE_COLORS.RETURN_DEPOSIT_SETTLEMENT;
      const isPositive = row.netAmount > 0;
      return (
        <TouchableOpacity
          style={[s.txRow, { backgroundColor: colors.card }]}
          onPress={() => openDetail(row)}
          activeOpacity={0.75}
        >
          <View style={[s.txIcon, { backgroundColor: colors_.bg }]}>
            <Ionicons name={colors_.icon as any} size={20} color={colors_.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.txType, { color: colors.text }]}>Return deposit (settlement)</Text>
            <Text style={[s.txDesc, { color: colors.textTertiary }]} numberOfLines={2}>
              Platform fee + payout combined
            </Text>
            <Text style={s.txDate}>
              {new Date(row.createdAt).toLocaleDateString()}{' '}
              {new Date(row.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.txAmount, { color: isPositive ? '#16a34a' : '#dc2626' }]}>
              {isPositive ? '+' : ''}{row.netAmount.toFixed(2)}
            </Text>
            <Text style={[s.txBalance, { color: colors.textTertiary }]} accessibilityLabel="Wallet balance after">
              {row.balanceAfter.toFixed(2)} bal.
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    const item = row.tx;
    const colors_ = TYPE_COLORS[item.type] || { bg: '#f3f4f6', text: '#6b7280', icon: 'ellipse-outline' };
    const isPositive = item.amount > 0;
    return (
      <TouchableOpacity
        style={[s.txRow, { backgroundColor: colors.card }]}
        onPress={() => openDetail(row)}
        activeOpacity={0.75}
      >
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
          <Text style={[s.txBalance, { color: colors.textTertiary }]} accessibilityLabel="Wallet balance after">
            {item.balanceAfter.toFixed(2)} bal.
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[s.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const showModal = detailExtra !== null;

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { backgroundColor: colors.headerBg }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(driver)/home')} style={s.headerBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Transactions</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={[s.balanceCard, { backgroundColor: colors.card }]}>
        <Text style={[s.balanceLabel, { color: colors.textTertiary }]}>Current Balance</Text>
        <Text style={[s.balanceValue, { color: balance < 0 ? '#dc2626' : '#16a34a' }]}>
          {balance.toFixed(2)} {currency}
        </Text>
      </View>

      <FlatList
        data={displayRows}
        keyExtractor={(row) => (row.kind === 'merged_return_deposit' ? row.id : row.tx.id)}
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

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={closeDetail}>
        <Pressable style={s.modalOverlay} onPress={closeDetail}>
          <Pressable style={[s.modalBox, { backgroundColor: colors.card }]} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.text }]}>Transaction details</Text>
              <TouchableOpacity onPress={closeDetail} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {detailExtra?.merged && (
                <View style={{ marginBottom: 16 }}>
                  <DetailLine label="Return gross (price + 50%)" value={`${detailExtra.merged.grossPayout.toFixed(2)} TND`} colors={colors} />
                  <DetailLine label="Platform fee (deducted)" value={`-${detailExtra.merged.platformFee.toFixed(2)} TND`} colors={colors} />
                  <DetailLine label="Net credited to wallet" value={`${detailExtra.merged.netAmount.toFixed(2)} TND`} colors={colors} bold />
                  <DetailLine
                    label="Wallet balance after"
                    value={`${Number(detailExtra.merged.balanceAfter).toFixed(2)} TND`}
                    colors={colors}
                    bold
                  />
                </View>
              )}
              {detailExtra?.single && (
                <View style={{ marginBottom: 12 }}>
                  <DetailLine label="Transaction type" value={detailExtra.single.type.replace(/_/g, ' ')} colors={colors} />
                  <DetailLine
                    label="Transaction amount (TND)"
                    value={`${detailExtra.single.amount >= 0 ? '+' : ''}${Number(detailExtra.single.amount).toFixed(2)}`}
                    colors={colors}
                  />
                  <DetailLine
                    label="Wallet balance after (ledger)"
                    value={`${Number(detailExtra.single.balanceAfter ?? 0).toFixed(2)} TND`}
                    colors={colors}
                    bold
                  />
                  {detailExtra.single.description ? (
                    <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 8, fontStyle: 'italic' }}>
                      {detailExtra.single.description}
                    </Text>
                  ) : null}
                </View>
              )}
              {detailLoading && <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />}
              {!detailLoading && detailOrder && (
                <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12 }}>
                  <Text style={[s.sectionTitle, { color: colors.text }]}>Related delivery order</Text>
                  <Text style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 8 }}>
                    Customer delivery price (not your wallet ledger).
                  </Text>
                  <DetailLine label="Order price" value={`${detailOrder.price.toFixed(2)} TND`} colors={colors} />
                  <DetailLine label="Payment" value={detailOrder.paymentType} colors={colors} />
                  <DetailLine label="Status" value={detailOrder.status.replace(/_/g, ' ')} colors={colors} />
                  {detailOrder.extraWeightFee > 0 && (
                    <DetailLine label="Extra weight fee" value={`${detailOrder.extraWeightFee.toFixed(2)} TND`} colors={colors} />
                  )}
                  {detailOrder.nightFee > 0 && (
                    <DetailLine label="Night fee" value={`${detailOrder.nightFee.toFixed(2)} TND`} colors={colors} />
                  )}
                  <DetailLine label="Distance" value={`${detailOrder.distanceKm.toFixed(1)} km`} colors={colors} />
                </View>
              )}
              {!detailLoading && !detailOrder && detailOrderId && (
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Could not load order.</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function DetailLine({
  label,
  value,
  colors,
  bold,
}: {
  label: string;
  value: string;
  colors: { text: string; textSecondary: string };
  bold?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, gap: 12 }}>
      <Text style={{ fontSize: 13, color: colors.textSecondary, flex: 1 }}>{label}</Text>
      <Text style={{ fontSize: 13, color: colors.text, fontWeight: bold ? '800' : '600', textAlign: 'right' }}>{value}</Text>
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
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20,
  },
  modalBox: {
    borderRadius: 16, padding: 18, maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
});
