import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, TextInput, Alert, Modal,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { walletService } from '../../services/api';
import type { Wallet, WalletTransaction, WithdrawalRequest } from '../../services/api';

type Tab = 'overview' | 'transactions' | 'withdrawals';

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  TOP_UP: 'Top Up',
  ORDER_PAYMENT: 'Order Payment',
  REFUND: 'Refund',
  WITHDRAWAL_REQUEST: 'Withdrawal Request',
  WITHDRAWAL_APPROVED: 'Withdrawal Approved',
  WITHDRAWAL_REJECTED: 'Withdrawal Rejected',
  BONUS: 'Bonus',
  REFERRAL_REWARD: 'Referral Reward',
  ADJUSTMENT: 'Adjustment',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b',
  SUCCESS: '#10b981',
  FAILED: '#ef4444',
  ACCEPTED: '#10b981',
  REJECTED: '#ef4444',
  ON_REVIEW: '#6366f1',
};

export default function WalletScreen() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [wdLoading, setWdLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Withdrawal modal
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNote, setWithdrawNote] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);

  const loadWallet = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const w = await walletService.getWallet();
      setWallet(w);
    } catch (e: any) {
      setError(e.message || 'Failed to load wallet');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    try {
      setTxLoading(true);
      const res = await walletService.getTransactions();
      setTransactions(res.transactions ?? []);
    } catch {
      // silent
    } finally {
      setTxLoading(false);
    }
  }, []);

  const loadWithdrawals = useCallback(async () => {
    try {
      setWdLoading(true);
      const res = await walletService.getWithdrawals();
      setWithdrawals(res.requests ?? []);
    } catch {
      // silent
    } finally {
      setWdLoading(false);
    }
  }, []);

  useEffect(() => { loadWallet(); }, []);
  useEffect(() => { if (activeTab === 'transactions') loadTransactions(); }, [activeTab]);
  useEffect(() => { if (activeTab === 'withdrawals') loadWithdrawals(); }, [activeTab]);

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }
    if (wallet && amount > wallet.balance) {
      Alert.alert('Insufficient balance', 'Amount exceeds your wallet balance.');
      return;
    }
    setWithdrawing(true);
    try {
      await walletService.createWithdrawal(amount, withdrawNote.trim() || undefined);
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      setWithdrawNote('');
      Alert.alert('Request submitted', 'Your withdrawal request has been submitted.');
      loadWithdrawals();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit withdrawal request.');
    } finally {
      setWithdrawing(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const formatAmount = (amount: number, type: string) => {
    const isCredit = ['TOP_UP', 'REFUND', 'BONUS', 'REFERRAL_REWARD', 'WITHDRAWAL_APPROVED'].includes(type);
    return `${isCredit ? '+' : '-'}${Math.abs(amount).toFixed(2)}`;
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}><Text style={styles.headerTitle}>My Wallet</Text></View>
        <View style={styles.center}><ActivityIndicator size="large" color="#0284c7" /></View>
      </View>
    );
  }

  if (error || !wallet) {
    return (
      <View style={styles.container}>
        <View style={styles.header}><Text style={styles.headerTitle}>My Wallet</Text></View>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error || 'Wallet not found'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadWallet}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Wallet</Text>
      </View>

      {/* Balance card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceAmount}>
          {wallet.balance.toFixed(2)} <Text style={styles.currency}>{wallet.currency}</Text>
        </Text>
        {wallet.discount > 0 && (
          <Text style={styles.discountText}>🎁 {wallet.discount.toFixed(2)} {wallet.currency} discount available</Text>
        )}
        <TouchableOpacity
          style={styles.withdrawBtn}
          onPress={() => setShowWithdrawModal(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.withdrawBtnText}>Request Withdrawal</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['overview', 'transactions', 'withdrawals'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, activeTab === t && styles.tabActive]}
            onPress={() => setActiveTab(t)}
          >
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
              {t === 'overview' ? 'Overview' : t === 'transactions' ? 'Transactions' : 'Withdrawals'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentPad}>

        {/* Overview */}
        {activeTab === 'overview' && (
          <View style={{ gap: 16 }}>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Currency</Text>
              <Text style={styles.infoValue}>{wallet.currency}</Text>
            </View>
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Last updated</Text>
              <Text style={styles.infoValue}>{formatDate(wallet.updatedAt)}</Text>
            </View>
            <TouchableOpacity style={styles.navCard} onPress={() => setActiveTab('transactions')}>
              <Text style={styles.navCardText}>📋  View Transaction History</Text>
              <Text style={styles.navArrow}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navCard} onPress={() => setActiveTab('withdrawals')}>
              <Text style={styles.navCardText}>💸  View Withdrawal Requests</Text>
              <Text style={styles.navArrow}>→</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Transactions */}
        {activeTab === 'transactions' && (
          txLoading ? (
            <ActivityIndicator color="#0284c7" style={{ marginTop: 40 }} />
          ) : transactions.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>No transactions yet</Text>
            </View>
          ) : (
            transactions.map((tx) => (
              <View key={tx.id} style={styles.txCard}>
                <View style={styles.txLeft}>
                  <Text style={styles.txType}>{TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}</Text>
                  <Text style={styles.txDate}>{formatDate(tx.createdAt)}</Text>
                </View>
                <View style={styles.txRight}>
                  <Text style={[
                    styles.txAmount,
                    ['TOP_UP','REFUND','BONUS','REFERRAL_REWARD','WITHDRAWAL_APPROVED'].includes(tx.type)
                      ? styles.txCredit : styles.txDebit,
                  ]}>
                    {formatAmount(tx.amount, tx.type)} {wallet.currency}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[tx.status] + '22' }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[tx.status] }]}>{tx.status}</Text>
                  </View>
                </View>
              </View>
            ))
          )
        )}

        {/* Withdrawals */}
        {activeTab === 'withdrawals' && (
          wdLoading ? (
            <ActivityIndicator color="#0284c7" style={{ marginTop: 40 }} />
          ) : withdrawals.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>💸</Text>
              <Text style={styles.emptyText}>No withdrawal requests yet</Text>
              <TouchableOpacity
                style={styles.newWithdrawBtn}
                onPress={() => setShowWithdrawModal(true)}
              >
                <Text style={styles.newWithdrawBtnText}>Request Withdrawal</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {withdrawals.map((wd) => (
                <View key={wd.id} style={styles.txCard}>
                  <View style={styles.txLeft}>
                    <Text style={styles.txType}>{wd.amount.toFixed(2)} {wallet.currency}</Text>
                    <Text style={styles.txDate}>{formatDate(wd.requestedAt)}</Text>
                    {wd.descriptionOfCustomer && (
                      <Text style={styles.txNote}>{wd.descriptionOfCustomer}</Text>
                    )}
                    {wd.descriptionOfAdmin && (
                      <Text style={styles.txAdminNote}>Admin: {wd.descriptionOfAdmin}</Text>
                    )}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[wd.status] + '22' }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[wd.status] }]}>{wd.status}</Text>
                  </View>
                </View>
              ))}
              <TouchableOpacity
                style={styles.newWithdrawBtn}
                onPress={() => setShowWithdrawModal(true)}
              >
                <Text style={styles.newWithdrawBtnText}>+ New Request</Text>
              </TouchableOpacity>
            </>
          )
        )}
      </ScrollView>

      {/* Withdrawal Modal */}
      <Modal visible={showWithdrawModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Request Withdrawal</Text>
            <Text style={styles.modalBalance}>
              Balance: {wallet.balance.toFixed(2)} {wallet.currency}
            </Text>

            <Text style={styles.modalLabel}>Amount ({wallet.currency})</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="0.00"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
            />

            <Text style={styles.modalLabel}>Note (optional)</Text>
            <TextInput
              style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Reason for withdrawal..."
              placeholderTextColor="#9ca3af"
              multiline
              value={withdrawNote}
              onChangeText={setWithdrawNote}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => { setShowWithdrawModal(false); setWithdrawAmount(''); setWithdrawNote(''); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, withdrawing && styles.btnDisabled]}
                onPress={handleWithdraw}
                disabled={withdrawing}
              >
                {withdrawing
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.modalSubmitText}>Submit</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: { fontSize: 32, fontWeight: 'bold', color: '#111827' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  errorText: { color: '#dc2626', fontSize: 16, textAlign: 'center' },
  retryBtn: { backgroundColor: '#0284c7', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryBtnText: { color: '#fff', fontWeight: '600' },

  balanceCard: {
    margin: 20,
    backgroundColor: '#0284c7',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  balanceLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  balanceAmount: { color: '#fff', fontSize: 42, fontWeight: 'bold' },
  currency: { fontSize: 22, fontWeight: '400' },
  discountText: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
  withdrawBtn: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  withdrawBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 4,
    marginBottom: 4,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#0284c7' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#fff' },

  content: { flex: 1 },
  contentPad: { padding: 20, gap: 12, paddingBottom: 40 },

  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: { color: '#6b7280', fontSize: 15 },
  infoValue: { color: '#111827', fontWeight: '600', fontSize: 15 },
  navCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navCardText: { color: '#111827', fontSize: 15, fontWeight: '500' },
  navArrow: { color: '#0284c7', fontSize: 18 },

  txCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  txLeft: { flex: 1, gap: 4 },
  txRight: { alignItems: 'flex-end', gap: 6 },
  txType: { fontSize: 15, fontWeight: '600', color: '#111827' },
  txDate: { fontSize: 13, color: '#9ca3af' },
  txNote: { fontSize: 13, color: '#6b7280', fontStyle: 'italic' },
  txAdminNote: { fontSize: 13, color: '#0284c7' },
  txAmount: { fontSize: 16, fontWeight: '700' },
  txCredit: { color: '#10b981' },
  txDebit: { color: '#ef4444' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '600' },

  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 16, color: '#9ca3af' },
  newWithdrawBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  newWithdrawBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
  },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#111827' },
  modalBalance: { fontSize: 14, color: '#6b7280' },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  modalInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancel: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCancelText: { color: '#374151', fontWeight: '600', fontSize: 15 },
  modalSubmit: {
    flex: 1,
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSubmitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnDisabled: { backgroundColor: '#9ca3af' },
});
