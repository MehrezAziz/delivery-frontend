import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, TextInput, Alert, Modal, Switch, Platform,
} from 'react-native';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { walletService, coinsService } from '../../services/api';
import type { Wallet, WalletTransaction, WithdrawalRequest, CoinTransferDto } from '../../services/api';
import { useTheme } from '../../contexts/ThemeContext';

type Tab = 'overview' | 'transactions' | 'withdrawals' | 'coin';

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
  COIN_TRANSFER_SENT: 'Coin send',
  COIN_TRANSFER_RECEIVED: 'Coin received',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b',
  SUCCESS: '#10b981',
  FAILED: '#ef4444',
  ACCEPTED: '#10b981',
  REJECTED: '#ef4444',
  ON_REVIEW: '#6366f1',
};

function walletParam(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

function decodeURIComponentSafe(s: string): string {
  if (!s) return '';
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export default function WalletScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
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
  const [withdrawPayout, setWithdrawPayout] = useState<'CASH' | 'BANK_TRANSFER'>('BANK_TRANSFER');
  const [bankHolder, setBankHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankRef, setBankRef] = useState('');
  const [saveBankProfile, setSaveBankProfile] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawStep, setWithdrawStep] = useState<'edit' | 'preview'>('edit');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [coinTransfers, setCoinTransfers] = useState<CoinTransferDto[]>([]);
  const [coinLoading, setCoinLoading] = useState(false);
  const [cancellingCoinId, setCancellingCoinId] = useState<string | null>(null);
  const [rescheduleTargetId, setRescheduleTargetId] = useState<string | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState(() => new Date(Date.now() + 3600_000));
  const [rescheduleIosOpen, setRescheduleIosOpen] = useState(false);
  const [rescheduleAndroidPhase, setRescheduleAndroidPhase] = useState<'idle' | 'date' | 'time'>('idle');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [walletQuickMore, setWalletQuickMore] = useState(false);
  const [sendsOnlyFilter, setSendsOnlyFilter] = useState(false);
  const [showCoinFiatModal, setShowCoinFiatModal] = useState(false);
  const [celebrateVisible, setCelebrateVisible] = useState(false);
  const [celebrateGift, setCelebrateGift] = useState('');
  const [celebrateAmount, setCelebrateAmount] = useState('');
  const celebrateHandledKeyRef = useRef<string | null>(null);
  const params = useLocalSearchParams<{
    tab?: string;
    celebrate?: string;
    gift?: string;
    amount?: string;
    sendsOnly?: string;
  }>();
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (!showWithdrawModal || withdrawPayout !== 'BANK_TRANSFER') return;
    let cancelled = false;
    void (async () => {
      try {
        const saved = await walletService.getPayoutBankDetails();
        if (cancelled || !saved) return;
        setBankHolder(saved.accountHolderName);
        setBankName(saved.bankName);
        setBankRef(saved.accountReference);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showWithdrawModal, withdrawPayout]);

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

  const loadCoinTransfers = useCallback(async () => {
    try {
      setCoinLoading(true);
      const res = await coinsService.listTransfers(1, 30);
      setCoinTransfers(res.transfers ?? []);
    } catch {
      setCoinTransfers([]);
    } finally {
      setCoinLoading(false);
    }
  }, []);

  // Reload wallet on focus. Do not depend on `params` here — useLocalSearchParams() returns a new object
  // every render, which would recreate this callback and retrigger useFocusEffect in an infinite loop.
  useFocusEffect(
    useCallback(() => {
      void loadWallet();
      void loadCoinTransfers();

      const p = paramsRef.current;
      const tab = walletParam(p.tab);
      if (tab === 'coin' || tab === 'overview' || tab === 'transactions' || tab === 'withdrawals') {
        setActiveTab(tab as Tab);
      }
      if (walletParam(p.celebrate) === '1') {
        const gift = decodeURIComponentSafe(walletParam(p.gift));
        const amount = decodeURIComponentSafe(walletParam(p.amount));
        const key = `${amount}|${gift}`;
        if (celebrateHandledKeyRef.current !== key) {
          celebrateHandledKeyRef.current = key;
          setCelebrateGift(gift);
          setCelebrateAmount(amount);
          setCelebrateVisible(true);
          setActiveTab('coin');
        }
        routerRef.current.setParams({ celebrate: undefined, gift: undefined, amount: undefined } as never);
      }
      if (walletParam(p.sendsOnly) === '1') {
        setSendsOnlyFilter(true);
        setActiveTab('coin');
        routerRef.current.setParams({ sendsOnly: undefined, tab: 'coin' } as never);
      }
    }, [loadWallet, loadCoinTransfers]),
  );

  useEffect(() => {
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem('user');
        if (!raw) return;
        const u = JSON.parse(raw) as { id?: string };
        setMyUserId(u?.id ?? null);
      } catch {
        setMyUserId(null);
      }
    })();
  }, []);

  useEffect(() => { if (activeTab === 'transactions') loadTransactions(); }, [activeTab]);
  useEffect(() => { if (activeTab === 'withdrawals') loadWithdrawals(); }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'coin') void loadCoinTransfers();
  }, [activeTab, loadCoinTransfers]);

  useEffect(() => {
    if (activeTab !== 'coin') setSendsOnlyFilter(false);
  }, [activeTab]);

  const validateWithdrawForm = (): number | null => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return null;
    }
    const cap = wallet?.spendable ?? wallet?.balance ?? 0;
    if (wallet && amount > cap) {
      Alert.alert('Insufficient balance', 'Amount exceeds your available balance (coins reserved for pending sends are excluded).');
      return null;
    }
    if (withdrawPayout === 'BANK_TRANSFER') {
      if (!bankHolder.trim() || !bankName.trim() || !bankRef.trim()) {
        Alert.alert('Bank details', 'Please enter account holder, bank name, and IBAN/RIB/account number.');
        return null;
      }
    }
    return amount;
  };

  const goWithdrawPreview = () => {
    const amount = validateWithdrawForm();
    if (amount == null) return;
    setWithdrawStep('preview');
  };

  const handleWithdraw = async () => {
    const amount = validateWithdrawForm();
    if (amount == null) return;
    setWithdrawing(true);
    try {
      await walletService.createWithdrawal(amount, {
        description: withdrawNote.trim() || undefined,
        payoutMethod: withdrawPayout,
        payoutBankHolderName: bankHolder.trim(),
        payoutBankName: bankName.trim(),
        payoutBankAccountRef: bankRef.trim(),
        saveBankDetailsToProfile: saveBankProfile,
      });
      setShowWithdrawModal(false);
      setWithdrawStep('edit');
      setWithdrawAmount('');
      setWithdrawNote('');
      setWithdrawPayout('BANK_TRANSFER');
      setBankHolder('');
      setBankName('');
      setBankRef('');
      setSaveBankProfile(false);
      Alert.alert('Request submitted', 'Your withdrawal request has been submitted.');
      loadWithdrawals();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to submit withdrawal request.');
    } finally {
      setWithdrawing(false);
    }
  };

  const cancelWithdrawalRequest = (requestId: string) => {
    Alert.alert(
      'Cancel withdrawal?',
      'This will cancel your pending request. You can submit a new one later.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel request',
          style: 'destructive',
          onPress: async () => {
            setCancellingId(requestId);
            try {
              await walletService.cancelWithdrawal(requestId);
              await loadWithdrawals();
              await loadWallet();
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Could not cancel');
            } finally {
              setCancellingId(null);
            }
          },
        },
      ],
    );
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const formatDateTimeLocal = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const openRescheduleModal = (t: CoinTransferDto) => {
    if (!t.scheduledAt) return;
    const d = new Date(t.scheduledAt);
    setRescheduleAt(Number.isNaN(d.getTime()) ? new Date(Date.now() + 3600_000) : d);
    setRescheduleTargetId(t.id);
    setRescheduleAndroidPhase('idle');
    setRescheduleIosOpen(Platform.OS === 'ios');
  };

  const onRescheduleIosChange = (_: DateTimePickerEvent, d?: Date) => {
    setRescheduleIosOpen(Platform.OS === 'ios');
    if (d) setRescheduleAt(d);
  };

  const onRescheduleAndroidChange = (event: DateTimePickerEvent, d?: Date) => {
    if (event?.type === 'dismissed') {
      setRescheduleAndroidPhase('idle');
      return;
    }
    if (!d) {
      setRescheduleAndroidPhase('idle');
      return;
    }
    if (rescheduleAndroidPhase === 'date') {
      const next = new Date(rescheduleAt);
      next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
      setRescheduleAt(next);
      setRescheduleAndroidPhase('time');
      return;
    }
    if (rescheduleAndroidPhase === 'time') {
      const next = new Date(rescheduleAt);
      next.setHours(d.getHours(), d.getMinutes(), 0, 0);
      setRescheduleAt(next);
      setRescheduleAndroidPhase('idle');
    }
  };

  const submitReschedule = async () => {
    if (!rescheduleTargetId) return;
    const min = new Date(Date.now() + 60_000);
    if (rescheduleAt.getTime() <= min.getTime()) {
      Alert.alert('Invalid time', 'Choose a date and time at least one minute from now.');
      return;
    }
    setRescheduleSaving(true);
    try {
      await coinsService.rescheduleTransfer(rescheduleTargetId, rescheduleAt.toISOString());
      setRescheduleTargetId(null);
      setRescheduleIosOpen(false);
      await loadCoinTransfers();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update schedule');
    } finally {
      setRescheduleSaving(false);
    }
  };

  const formatAmount = (amount: number, type: string) => {
    const isCredit = [
      'TOP_UP',
      'REFUND',
      'BONUS',
      'REFERRAL_REWARD',
      'WITHDRAWAL_APPROVED',
      'COIN_TRANSFER_RECEIVED',
    ].includes(type);
    return `${isCredit ? '+' : '-'}${Math.abs(amount).toFixed(2)}`;
  };

  const coinListFiltered =
    sendsOnlyFilter && myUserId
      ? coinTransfers.filter((t) => t.senderUserId === myUserId)
      : coinTransfers;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </View>
    );
  }

  if (error || !wallet) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>Wallet not found</Text>
          <TouchableOpacity style={styles.setupBtn} onPress={() => router.push('/(auth)/customer-setup')}>
            <Text style={styles.setupBtnText}>Add address to get a wallet</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Balance card */}
      <View style={[styles.balanceCard, { backgroundColor: colors.primary }]}>
        <Text style={styles.balanceLabel}>Available balance</Text>
        <Text style={styles.balanceAmount}>
          {(wallet.spendable ?? wallet.balance).toFixed(2)}{' '}
          <Text style={styles.currency}>Coins</Text>
        </Text>
        {(wallet.lockedForTransfers ?? 0) > 0 && (
          <Text style={[styles.lockedHint, { color: 'rgba(255,255,255,0.85)' }]}>
            {wallet.lockedForTransfers!.toFixed(2)} Coins reserved for pending sends
          </Text>
        )}
        {wallet.discount > 0 && (
          <Text style={styles.discountText}>🎁 {wallet.discount.toFixed(2)} Coins discount available</Text>
        )}
        <View style={styles.walletQuickWrap}>
          <View style={styles.walletQuickRow}>
            <TouchableOpacity
              style={styles.walletQuickItem}
              onPress={() => Alert.alert('Deposit', 'Coin top-up is coming soon.')}
              activeOpacity={0.85}
            >
              <View style={styles.walletQuickCircle}>
                <Text style={styles.walletQuickGlyph}>+</Text>
              </View>
              <Text style={styles.walletQuickLabel}>Deposit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.walletQuickItem}
              onPress={() => router.push('/(customer)/send-coins')}
              activeOpacity={0.85}
            >
              <View style={styles.walletQuickCircle}>
                <Ionicons name="arrow-forward" size={22} color="rgba(255,255,255,0.95)" />
              </View>
              <Text style={styles.walletQuickLabel}>Send</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.walletQuickItem}
              onPress={() => Alert.alert('Scan', 'QR scanning is coming soon.')}
              activeOpacity={0.85}
            >
              <View style={styles.walletQuickCircle}>
                <Ionicons name="scan-outline" size={22} color="rgba(255,255,255,0.95)" />
              </View>
              <Text style={styles.walletQuickLabel}>Scan</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.walletQuickItem}
              onPress={() => setWalletQuickMore((v) => !v)}
              activeOpacity={0.85}
            >
              <View style={styles.walletQuickCircle}>
                <Text style={styles.walletQuickGlyph}>···</Text>
              </View>
              <Text style={styles.walletQuickLabel}>More</Text>
            </TouchableOpacity>
          </View>
          {walletQuickMore && (
            <View style={[styles.walletQuickRow, styles.walletQuickMoreRow]}>
              <TouchableOpacity
                style={styles.walletQuickItem}
                onPress={() => {
                  setWalletQuickMore(false);
                  setWithdrawStep('edit');
                  setShowWithdrawModal(true);
                }}
                activeOpacity={0.85}
              >
                <View style={styles.walletQuickCircle}>
                  <Text style={styles.walletQuickGlyph}>−</Text>
                </View>
                <Text style={styles.walletQuickLabel}>Withdraw</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.walletQuickItem}
                onPress={() => {
                  setWalletQuickMore(false);
                  router.push('/(customer)/support');
                }}
                activeOpacity={0.85}
              >
                <View style={styles.walletQuickCircle}>
                  <Text style={styles.walletQuickGlyph}>?</Text>
                </View>
                <Text style={styles.walletQuickLabel}>Help</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.walletQuickItem}
                onPress={() => {
                  setWalletQuickMore(false);
                  Alert.alert('News', 'Updates and announcements are coming soon.');
                }}
                activeOpacity={0.85}
              >
                <View style={styles.walletQuickCircle}>
                  <Ionicons name="newspaper-outline" size={20} color="rgba(255,255,255,0.95)" />
                </View>
                <Text style={styles.walletQuickLabel}>News</Text>
              </TouchableOpacity>
              <View style={styles.walletQuickItem} />
            </View>
          )}
        </View>
      </View>

      <View style={[styles.comingSoonBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.comingSoonTitle, { color: colors.text }]}>Buy coins</Text>
        <Text style={[styles.comingSoonText, { color: colors.textSecondary }]}>
          Top up your wallet with coins. <Text style={{ fontWeight: '700', color: colors.text }}>Coming soon.</Text>
        </Text>
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.card }]}>
        {(['overview', 'transactions', 'withdrawals', 'coin'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, activeTab === t && [styles.tabActive, { backgroundColor: colors.primary }]]}
            onPress={() => setActiveTab(t)}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === t && styles.tabTextActive]}>
              {t === 'overview'
                ? 'Overview'
                : t === 'transactions'
                  ? 'Ledger'
                  : t === 'withdrawals'
                    ? 'Payouts'
                    : 'Sends'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {sendsOnlyFilter && activeTab === 'coin' && (
        <View
          style={[
            styles.sendsOnlyBanner,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sendsOnlyBannerText, { color: colors.text }]}>Showing your sends</Text>
          <TouchableOpacity onPress={() => setSendsOnlyFilter(false)} hitSlop={12}>
            <Text style={{ color: colors.primary, fontWeight: '800' }}>Show all</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tab content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentPad}>

        {/* Overview */}
        {activeTab === 'overview' && (
          <View style={{ gap: 16 }}>
            <TouchableOpacity
              style={[styles.infoCard, { backgroundColor: colors.card }]}
              activeOpacity={0.75}
              onPress={() => {
                if (!wallet) return;
                if (wallet.coinsToLocalFiat) setShowCoinFiatModal(true);
                else {
                  Alert.alert(
                    'Cash equivalent',
                    'No active coin rate is set for your country yet. Your balance is shown in coins only.',
                  );
                }
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Currency</Text>
                <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 4 }}>
                  Tap for estimated value in local money
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.infoValue, { color: colors.text }]}>{wallet.currency}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </View>
            </TouchableOpacity>
            <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Last updated</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>{formatDate(wallet.updatedAt)}</Text>
            </View>
            <TouchableOpacity style={[styles.navCard, { backgroundColor: colors.card }]} onPress={() => setActiveTab('transactions')}>
              <Text style={[styles.navCardText, { color: colors.text }]}>📋  View Transaction History</Text>
              <Text style={[styles.navArrow, { color: colors.primary }]}>→</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.navCard, { backgroundColor: colors.card }]} onPress={() => setActiveTab('withdrawals')}>
              <Text style={[styles.navCardText, { color: colors.text }]}>💸  View Withdrawal Requests</Text>
              <Text style={[styles.navArrow, { color: colors.primary }]}>→</Text>
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
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No transactions yet</Text>
            </View>
          ) : (
            transactions.map((tx) => (
              <View key={tx.id} style={[styles.txCard, { backgroundColor: colors.card }]}>
                <View style={styles.txLeft}>
                  <Text style={[styles.txType, { color: colors.text }]}>{TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}</Text>
                  <Text style={[styles.txDate, { color: colors.textTertiary }]}>{formatDate(tx.createdAt)}</Text>
                </View>
                <View style={styles.txRight}>
                  <Text style={[
                    styles.txAmount,
                    ['TOP_UP','REFUND','BONUS','REFERRAL_REWARD','WITHDRAWAL_APPROVED','COIN_TRANSFER_RECEIVED'].includes(tx.type)
                      ? styles.txCredit : styles.txDebit,
                  ]}>
                    {formatAmount(tx.amount, tx.type)} Coins
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
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No withdrawal requests yet</Text>
              <TouchableOpacity
                style={styles.newWithdrawBtn}
                onPress={() => {
                  setWithdrawStep('edit');
                  setShowWithdrawModal(true);
                }}
              >
                <Text style={styles.newWithdrawBtnText}>Request Withdrawal</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {withdrawals.map((wd) => (
                <View key={wd.id} style={[styles.txCard, { backgroundColor: colors.card }]}>
                  <View style={styles.txLeft}>
                    <Text style={[styles.wdAmountLine, { color: colors.text }]}>
                      {wd.amount.toFixed(2)} <Text style={styles.wdAmountCurrency}>Coins</Text>
                    </Text>
                    <Text style={[styles.txDate, { color: colors.textTertiary }]}>{formatDate(wd.requestedAt)}</Text>
                    {wd.payoutMethod && (
                      <Text style={[styles.txDate, { color: colors.textSecondary }]}>
                        {wd.payoutMethod === 'CASH' ? 'Cash pickup' : 'Bank transfer'}
                      </Text>
                    )}
                    {wd.payoutMethod === 'BANK_TRANSFER' && (wd.payoutBankName || wd.payoutBankAccountRef) && (
                      <Text style={[styles.txNote, { color: colors.textTertiary }]}>
                        {wd.payoutBankName ? `${wd.payoutBankName} · ` : ''}
                        {wd.payoutBankAccountRef || ''}
                      </Text>
                    )}
                    {wd.descriptionOfCustomer && (
                      <Text style={styles.txNote}>{wd.descriptionOfCustomer}</Text>
                    )}
                    {wd.descriptionOfAdmin && (
                      <Text style={styles.txAdminNote}>Admin: {wd.descriptionOfAdmin}</Text>
                    )}
                  </View>
                  <View style={styles.wdRightCol}>
                    <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[wd.status] + '22' }]}>
                      <Text style={[styles.statusText, { color: STATUS_COLORS[wd.status] }]}>{wd.status}</Text>
                    </View>
                    {wd.status === 'PENDING' ? (
                      cancellingId === wd.id ? (
                        <ActivityIndicator style={{ marginTop: 8 }} color={colors.primary} />
                      ) : (
                        <TouchableOpacity
                          onPress={() => cancelWithdrawalRequest(wd.id)}
                          style={styles.cancelWdBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.cancelWdText}>Cancel</Text>
                        </TouchableOpacity>
                      )
                    ) : null}
                  </View>
                </View>
              ))}
              <TouchableOpacity
                style={styles.newWithdrawBtn}
                onPress={() => {
                  setWithdrawStep('edit');
                  setShowWithdrawModal(true);
                }}
              >
                <Text style={styles.newWithdrawBtnText}>+ New Request</Text>
              </TouchableOpacity>
            </>
          )
        )}

        {activeTab === 'coin' && (
          coinLoading ? (
            <ActivityIndicator color="#0284c7" style={{ marginTop: 40 }} />
          ) : coinListFiltered.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>↗️</Text>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
                {sendsOnlyFilter ? 'No outgoing sends in recent history' : 'No coin sends yet'}
              </Text>
              {!sendsOnlyFilter ? (
                <TouchableOpacity style={styles.newWithdrawBtn} onPress={() => router.push('/(customer)/send-coins')}>
                  <Text style={styles.newWithdrawBtnText}>Send coins</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.newWithdrawBtn} onPress={() => setSendsOnlyFilter(false)}>
                  <Text style={styles.newWithdrawBtnText}>Show all transfers</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
              {coinListFiltered.map((t) => {
                const isRecipientRow = !!(
                  myUserId &&
                  t.recipientUserId === myUserId &&
                  t.senderUserId !== myUserId
                );
                const showFeeBreakdownRow = !isRecipientRow || t.showFeeBreakdown === true;
                return (
                <View key={t.id} style={[styles.txCard, { backgroundColor: colors.card }]}>
                  <View style={styles.txLeft}>
                    <Text style={[styles.txType, { color: colors.text }]}>
                      {t.status === 'COMPLETED'
                        ? t.senderUserId === myUserId
                          ? 'Sent'
                          : 'Received'
                        : t.status}
                    </Text>
                    <Text style={[styles.txDate, { color: colors.textTertiary }]}>{formatDate(t.createdAt)}</Text>
                    {showFeeBreakdownRow ? (
                      <Text style={[styles.txDate, { color: colors.textSecondary }]}>
                        Gross {t.grossCoins.toFixed(2)} · Fee {t.feeCoins.toFixed(2)} · Net {t.netCoins.toFixed(2)}
                      </Text>
                    ) : (
                      <Text style={[styles.txDate, { color: colors.textSecondary }]}>
                        You received {t.netCoins.toFixed(2)} coins
                      </Text>
                    )}
                    {t.giftMessage ? (
                      <Text style={[styles.txNote, { color: colors.textSecondary }]} numberOfLines={2}>
                        “{t.giftMessage}”
                      </Text>
                    ) : null}
                    {t.status === 'SCHEDULED' && t.scheduledAt && t.senderUserId === myUserId ? (
                      <Text style={[styles.txScheduled, { color: colors.primary }]}>
                        Sends at {formatDateTimeLocal(t.scheduledAt)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.txRight, { gap: 10 }]}>
                    {t.status === 'SCHEDULED' && t.senderUserId === myUserId ? (
                      <TouchableOpacity
                        onPress={() => openRescheduleModal(t)}
                        disabled={cancellingCoinId === t.id || rescheduleSaving}
                        hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
                      >
                        <Text style={{ color: colors.primary, fontWeight: '700' }}>Edit time</Text>
                      </TouchableOpacity>
                    ) : null}
                    {t.status === 'SCHEDULED' && t.senderUserId === myUserId ? (
                      cancellingCoinId === t.id ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : (
                        <TouchableOpacity
                          onPress={() => {
                            Alert.alert(
                              'Cancel scheduled send?',
                              'This send will not happen. Coins are not locked until the scheduled time.',
                              [
                                { text: 'No', style: 'cancel' },
                                {
                                  text: 'Cancel send',
                                  style: 'destructive',
                                  onPress: async () => {
                                    setCancellingCoinId(t.id);
                                    try {
                                      await coinsService.cancelTransfer(t.id);
                                      await loadCoinTransfers();
                                      await loadWallet();
                                    } catch (e: unknown) {
                                      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
                                    } finally {
                                      setCancellingCoinId(null);
                                    }
                                  },
                                },
                              ],
                            );
                          }}
                        >
                          <Text style={{ color: colors.danger, fontWeight: '700' }}>Cancel</Text>
                        </TouchableOpacity>
                      )
                    ) : null}
                  </View>
                </View>
              );
              })}
              <TouchableOpacity style={styles.newWithdrawBtn} onPress={() => router.push('/(customer)/send-coins')}>
                <Text style={styles.newWithdrawBtnText}>+ New send</Text>
              </TouchableOpacity>
            </>
          )
        )}
      </ScrollView>

      {/* Withdrawal Modal */}
      <Modal visible={showWithdrawModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
              {withdrawStep === 'edit' ? (
                <>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Request withdrawal</Text>
                  <Text style={[styles.modalBalanceMuted, { color: colors.textTertiary }]}>
                    Available {(wallet.spendable ?? wallet.balance).toFixed(2)} Coins
                    {(wallet.lockedForTransfers ?? 0) > 0
                      ? ` · ${wallet.lockedForTransfers!.toFixed(2)} reserved for sends`
                      : ''}
                  </Text>

                  <Text style={[styles.modalLabel, { color: colors.text }]}>Amount (Coins)</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="decimal-pad"
                    value={withdrawAmount}
                    onChangeText={setWithdrawAmount}
                  />

                  <Text style={[styles.modalLabel, { color: colors.text }]}>Receive as</Text>
                  <View style={styles.payoutRow}>
                    <TouchableOpacity
                      style={[styles.chip, { borderColor: colors.border }, withdrawPayout === 'BANK_TRANSFER' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => setWithdrawPayout('BANK_TRANSFER')}
                    >
                      <Text style={{ color: withdrawPayout === 'BANK_TRANSFER' ? '#fff' : colors.text, fontWeight: '700' }}>Bank</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chip, { borderColor: colors.border }, withdrawPayout === 'CASH' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => setWithdrawPayout('CASH')}
                    >
                      <Text style={{ color: withdrawPayout === 'CASH' ? '#fff' : colors.text, fontWeight: '700' }}>Cash</Text>
                    </TouchableOpacity>
                  </View>

                  {withdrawPayout === 'BANK_TRANSFER' && (
                    <>
                      <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
                        Bank transfers may take a few business days to reach your account after we send them.
                      </Text>
                      <Text style={[styles.modalLabel, { color: colors.text }]}>Account holder name</Text>
                      <TextInput
                        style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                        placeholder="Full name as on the account"
                        placeholderTextColor={colors.textTertiary}
                        value={bankHolder}
                        onChangeText={setBankHolder}
                      />
                      <Text style={[styles.modalLabel, { color: colors.text }]}>Bank name</Text>
                      <TextInput
                        style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                        placeholder="e.g. STB, BIAT"
                        placeholderTextColor={colors.textTertiary}
                        value={bankName}
                        onChangeText={setBankName}
                      />
                      <Text style={[styles.modalLabel, { color: colors.text }]}>IBAN / RIB / account number</Text>
                      <TextInput
                        style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                        placeholder="Your payout reference"
                        placeholderTextColor={colors.textTertiary}
                        value={bankRef}
                        onChangeText={setBankRef}
                        autoCapitalize="characters"
                      />
                      <View style={styles.saveBankRow}>
                        <Text style={[styles.modalLabel, { flex: 1, marginBottom: 0 }]}>Save bank details for next time</Text>
                        <Switch value={saveBankProfile} onValueChange={setSaveBankProfile} />
                      </View>
                    </>
                  )}

                  <Text style={[styles.modalLabel, { color: colors.text }]}>Note (optional)</Text>
                  <TextInput
                    style={[styles.modalInput, { height: 80, textAlignVertical: 'top', backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                    placeholder="Reason for withdrawal..."
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    value={withdrawNote}
                    onChangeText={setWithdrawNote}
                  />

                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={styles.modalCancel}
                      onPress={() => {
                        setShowWithdrawModal(false);
                        setWithdrawStep('edit');
                        setWithdrawAmount('');
                        setWithdrawNote('');
                        setWithdrawPayout('BANK_TRANSFER');
                        setBankHolder('');
                        setBankName('');
                        setBankRef('');
                        setSaveBankProfile(false);
                      }}
                    >
                      <Text style={styles.modalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalSubmit} onPress={goWithdrawPreview}>
                      <Text style={styles.modalSubmitText}>Review request</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Confirm withdrawal</Text>
                  <Text style={[styles.previewHint, { color: colors.textSecondary }]}>You are requesting</Text>
                  <Text style={[styles.previewAmount, { color: colors.text }]}>
                    {parseFloat(withdrawAmount || '0').toFixed(2)}{' '}
                    <Text style={[styles.previewCurrency, { color: colors.textSecondary }]}>Coins</Text>
                  </Text>
                  <Text style={[styles.modalBalanceMuted, { color: colors.textTertiary }]}>
                    Available {(wallet.spendable ?? wallet.balance).toFixed(2)} Coins
                    {(wallet.lockedForTransfers ?? 0) > 0
                      ? ` · ${wallet.lockedForTransfers!.toFixed(2)} reserved for sends`
                      : ''}
                  </Text>
                  <Text style={[styles.previewMeta, { color: colors.textSecondary }]}>
                    {withdrawPayout === 'CASH' ? 'Cash pickup' : 'Bank transfer'}
                    {withdrawPayout === 'BANK_TRANSFER' && bankName.trim()
                      ? ` · ${bankName.trim()}`
                      : ''}
                  </Text>
                  {withdrawNote.trim() ? (
                    <Text style={[styles.previewMeta, { color: colors.textTertiary }]}>Note: {withdrawNote.trim()}</Text>
                  ) : null}

                  <View style={styles.modalButtons}>
                    <TouchableOpacity style={styles.modalCancel} onPress={() => setWithdrawStep('edit')} disabled={withdrawing}>
                      <Text style={styles.modalCancelText}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalSubmit, withdrawing && styles.btnDisabled]}
                      onPress={handleWithdraw}
                      disabled={withdrawing}
                    >
                      {withdrawing
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.modalSubmitText}>Confirm request</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={!!rescheduleTargetId}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setRescheduleTargetId(null);
          setRescheduleIosOpen(false);
          setRescheduleAndroidPhase('idle');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.rescheduleModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Reschedule send</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 14, fontSize: 14 }}>
              Choose a new date and time. It must be at least one minute from now.
            </Text>
            <TouchableOpacity
              style={[styles.reschedulePickRow, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
              onPress={() => {
                if (Platform.OS === 'android') setRescheduleAndroidPhase('date');
                else setRescheduleIosOpen(true);
              }}
            >
              <Ionicons name="calendar-outline" size={22} color={colors.primary} />
              <Text style={{ color: colors.text, marginLeft: 12, flex: 1, fontWeight: '600' }}>
                {rescheduleAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </Text>
            </TouchableOpacity>
            {Platform.OS === 'ios' && rescheduleIosOpen && rescheduleTargetId ? (
              <DateTimePicker
                value={rescheduleAt}
                mode="datetime"
                display="spinner"
                minimumDate={new Date(Date.now() + 60_000)}
                onChange={onRescheduleIosChange}
              />
            ) : null}
            {Platform.OS === 'android' && rescheduleAndroidPhase !== 'idle' && rescheduleTargetId ? (
              <DateTimePicker
                value={rescheduleAt}
                mode={rescheduleAndroidPhase === 'date' ? 'date' : 'time'}
                display="default"
                minimumDate={rescheduleAndroidPhase === 'date' ? new Date(Date.now() + 60_000) : undefined}
                onChange={onRescheduleAndroidChange}
              />
            ) : null}
            <View style={[styles.modalButtons, { marginTop: 20 }]}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setRescheduleTargetId(null);
                  setRescheduleIosOpen(false);
                  setRescheduleAndroidPhase('idle');
                }}
                disabled={rescheduleSaving}
              >
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, rescheduleSaving && styles.btnDisabled]}
                onPress={() => void submitReschedule()}
                disabled={rescheduleSaving}
              >
                {rescheduleSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showCoinFiatModal} transparent animationType="fade" onRequestClose={() => setShowCoinFiatModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.celebrateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 8 }]}>Coins in your currency</Text>
            {wallet?.coinsToLocalFiat ? (
              <>
                <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>
                  Using your country&apos;s active coin configuration:{' '}
                  <Text style={{ fontWeight: '700', color: colors.text }}>
                    1.00 {wallet.coinsToLocalFiat.currencyCode} ={' '}
                    {wallet.coinsToLocalFiat.coinsPerFiatUnit % 1 === 0
                      ? wallet.coinsToLocalFiat.coinsPerFiatUnit
                      : Number(wallet.coinsToLocalFiat.coinsPerFiatUnit.toFixed(4))}{' '}
                    coins
                  </Text>
                  .
                </Text>
                <View style={{ alignSelf: 'stretch', gap: 12, marginBottom: 8 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      paddingVertical: 10,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Total balance</Text>
                    <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>
                      {wallet.coinsToLocalFiat.currencySymbol} {wallet.coinsToLocalFiat.balanceAsLocalFiat.toFixed(2)}{' '}
                      {wallet.coinsToLocalFiat.currencyCode}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Available to spend</Text>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
                      {wallet.coinsToLocalFiat.currencySymbol}{' '}
                      {wallet.coinsToLocalFiat.spendableAsLocalFiat.toFixed(2)} {wallet.coinsToLocalFiat.currencyCode}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: colors.textTertiary, fontSize: 12, lineHeight: 18, marginBottom: 16 }}>
                  Reference only (same rate as when cash is converted to coins). Actual order or payout amounts may
                  differ.
                </Text>
              </>
            ) : null}
            <TouchableOpacity
              style={[styles.celebrateBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowCoinFiatModal(false)}
            >
              <Text style={styles.celebrateBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={celebrateVisible} transparent animationType="fade">
        <View style={styles.celebrateOverlay}>
          <View style={[styles.celebrateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={styles.celebrateEmoji}>🎉</Text>
            <Text style={[styles.celebrateTitle, { color: colors.text }]}>
              {celebrateGift.trim() ? 'You received a gift!' : 'Coins received'}
            </Text>
            {celebrateAmount.trim() ? (
              <Text style={[styles.celebrateAmount, { color: '#16a34a' }]}>+{celebrateAmount.trim()} coins</Text>
            ) : null}
            {celebrateGift.trim() ? (
              <Text style={[styles.celebrateGift, { color: colors.textSecondary }]}>“{celebrateGift.trim()}”</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.celebrateBtn, { backgroundColor: colors.primary }]}
              onPress={() => setCelebrateVisible(false)}
            >
              <Text style={styles.celebrateBtnText}>Awesome</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  errorText: { color: '#6b7280', fontSize: 16, textAlign: 'center' },
  setupBtn: { backgroundColor: '#0284c7', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  setupBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  balanceCard: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#0284c7',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  balanceLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '600' },
  balanceAmount: { color: 'rgba(255,255,255,0.92)', fontSize: 40, fontWeight: 'bold' },
  currency: { fontSize: 20, fontWeight: '600', color: 'rgba(255,255,255,0.65)' },
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
  walletQuickWrap: { width: '100%', marginTop: 8, paddingHorizontal: 4 },
  walletQuickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
  },
  walletQuickMoreRow: { marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.25)' },
  walletQuickItem: { flex: 1, alignItems: 'center', maxWidth: '25%' },
  walletQuickCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletQuickGlyph: { color: 'rgba(255,255,255,0.95)', fontSize: 22, fontWeight: '700', marginTop: -2 },
  walletQuickLabel: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  lockedHint: { fontSize: 12, textAlign: 'center', marginTop: 2 },

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
  wdRightCol: { alignItems: 'flex-end', gap: 8 },
  wdAmountLine: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  wdAmountCurrency: { fontSize: 15, fontWeight: '600', opacity: 0.85 },
  cancelWdBtn: { paddingVertical: 4 },
  cancelWdText: { color: '#b91c1c', fontWeight: '700', fontSize: 13 },
  txType: { fontSize: 15, fontWeight: '600', color: '#111827' },
  txDate: { fontSize: 13, color: '#9ca3af' },
  txNote: { fontSize: 13, color: '#6b7280', fontStyle: 'italic' },
  txScheduled: { fontSize: 13, fontWeight: '700', marginTop: 4 },
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
    justifyContent: 'center',
    paddingVertical: 24,
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  modalHint: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  saveBankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 4,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 12,
  },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#111827' },
  modalBalanceMuted: { fontSize: 13, color: '#9ca3af', marginBottom: 8 },
  previewHint: { fontSize: 13, marginTop: 4 },
  previewAmount: { fontSize: 36, fontWeight: '800', marginTop: 4, letterSpacing: -0.5 },
  previewCurrency: { fontSize: 20, fontWeight: '600' },
  previewMeta: { fontSize: 13, marginTop: 10, lineHeight: 18 },
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
  payoutRow: { flexDirection: 'row', gap: 10 },
  chip: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, borderWidth: 1 },
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
  comingSoonBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  comingSoonTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  comingSoonText: { fontSize: 13, lineHeight: 18 },

  sendsOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  sendsOnlyBannerText: { fontSize: 14, fontWeight: '600', flex: 1, marginRight: 12 },

  celebrateOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  celebrateCard: {
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    alignItems: 'center',
  },
  celebrateEmoji: { fontSize: 56, marginBottom: 8 },
  celebrateTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  celebrateAmount: { fontSize: 30, fontWeight: '900', marginTop: 12, textAlign: 'center' },
  celebrateGift: { fontSize: 16, marginTop: 16, textAlign: 'center', fontStyle: 'italic', lineHeight: 22 },
  celebrateBtn: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    alignItems: 'center',
    width: '100%',
  },
  celebrateBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  rescheduleModalCard: {
    marginHorizontal: 20,
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  reschedulePickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
});
