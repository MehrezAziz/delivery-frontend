import {
  View, Text, TouchableOpacity, Pressable, ScrollView,
  StyleSheet, ActivityIndicator, TextInput, Alert, Modal, Switch, Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { walletService, coinsService } from '../../services/api';
import type { Wallet, WalletTransaction, WithdrawalRequest, WithdrawalQuote, CoinTransferDto } from '../../services/api';
import type { WalletsSummary } from '../../services/api/wallet.service';
import { geographyService, type Country } from '../../services/api/geography.service';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppNavigation } from '../../contexts/AppNavigationContext';
import { pickScheduleDateTimeAndroid } from '../../utils/scheduleDateTimePicker';
import { coinTransferStatusMeta } from '../../utils/coinTransferStatus';
import { formatCoinSenderLine } from '../../utils/coinTransferSenderDisplay';
import { GameEntrySection } from '../../components/games/GameEntrySection';
import { hrefWithWalletId } from '../../utils/walletNavigation';

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
  GAME_PRIZE: 'Game prize',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b',
  SUCCESS: '#10b981',
  FAILED: '#ef4444',
  ACCEPTED: '#10b981',
  REJECTED: '#ef4444',
  ON_REVIEW: '#6366f1',
};

const TAB_CONFIG: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'overview', label: 'overview', icon: 'grid-outline', iconActive: 'grid' },
  { key: 'transactions', label: 'transactions', icon: 'receipt-outline', iconActive: 'receipt' },
  { key: 'withdrawals', label: 'withdrawals', icon: 'cash-outline', iconActive: 'cash' },
  { key: 'coin', label: 'coin', icon: 'paper-plane-outline', iconActive: 'paper-plane' },
];

function txTypeIcon(type: string): { icon: keyof typeof Ionicons.glyphMap; bg: string; fg: string } {
  const credit = ['TOP_UP', 'REFUND', 'BONUS', 'REFERRAL_REWARD', 'COIN_TRANSFER_RECEIVED', 'GAME_PRIZE'];
  if (credit.includes(type)) return { icon: 'arrow-down-circle', bg: '#dcfce7', fg: '#16a34a' };
  if (type.includes('WITHDRAWAL')) return { icon: 'arrow-up-circle', bg: '#ffedd5', fg: '#ea580c' };
  if (type.includes('COIN_TRANSFER')) return { icon: 'paper-plane', bg: '#e0e7ff', fg: '#4f46e5' };
  if (type === 'ORDER_PAYMENT') return { icon: 'cart', bg: '#dbeafe', fg: '#2563eb' };
  return { icon: 'swap-horizontal', bg: '#f3f4f6', fg: '#6b7280' };
}

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
  const { push: navPush } = useAppNavigation();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  const localizeTxType = (type: string): string => {
    const map: Record<string, string> = {
      TOP_UP: t('wallet.txTypes.TOP_UP'),
      ORDER_PAYMENT: t('wallet.txTypes.ORDER_PAYMENT'),
      REFUND: t('wallet.txTypes.REFUND'),
      WITHDRAWAL_REQUEST: t('wallet.txTypes.WITHDRAWAL_REQUEST'),
      WITHDRAWAL_APPROVED: t('wallet.txTypes.WITHDRAWAL_APPROVED'),
      WITHDRAWAL_REJECTED: t('wallet.txTypes.WITHDRAWAL_REJECTED'),
      BONUS: t('wallet.txTypes.BONUS'),
      REFERRAL_REWARD: t('wallet.txTypes.REFERRAL_REWARD'),
      ADJUSTMENT: t('wallet.txTypes.ADJUSTMENT'),
      COIN_TRANSFER_SENT: t('wallet.txTypes.COIN_SEND'),
      COIN_TRANSFER_RECEIVED: t('wallet.txTypes.COIN_RECEIVED'),
      GAME_PRIZE: t('wallet.txTypes.GAME_PRIZE'),
    };
    return map[type] ?? type;
  };
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletsSummary, setWalletsSummary] = useState<WalletsSummary | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const selectedWalletIdRef = useRef<string | null>(null);
  const [showAddWalletModal, setShowAddWalletModal] = useState(false);
  const [allCountries, setAllCountries] = useState<Country[]>([]);
  const [addWalletBusy, setAddWalletBusy] = useState(false);
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
  const [withdrawQuote, setWithdrawQuote] = useState<WithdrawalQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [coinTransfers, setCoinTransfers] = useState<CoinTransferDto[]>([]);
  const [coinLoading, setCoinLoading] = useState(false);
  const [cancellingCoinId, setCancellingCoinId] = useState<string | null>(null);
  const [rescheduleTargetId, setRescheduleTargetId] = useState<string | null>(null);
  const [rescheduleAt, setRescheduleAt] = useState(() => new Date(Date.now() + 3600_000));
  const [rescheduleIosOpen, setRescheduleIosOpen] = useState(false);
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [walletQuickMore, setWalletQuickMore] = useState(false);
  const [sendsOnlyFilter, setSendsOnlyFilter] = useState(false);
  const [showCoinFiatModal, setShowCoinFiatModal] = useState(false);
  const [celebrateVisible, setCelebrateVisible] = useState(false);
  const [celebrateGift, setCelebrateGift] = useState('');
  const [celebrateAmount, setCelebrateAmount] = useState('');
  const [celebrateSender, setCelebrateSender] = useState('');
  const celebrateHandledKeyRef = useRef<string | null>(null);
  const [referralBonusVisible, setReferralBonusVisible] = useState(false);
  const [referralBonusAmount, setReferralBonusAmount] = useState('');
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const referralBonusHandledRef = useRef(false);
  const params = useLocalSearchParams<{
    tab?: string;
    celebrate?: string;
    gift?: string;
    amount?: string;
    sender?: string;
    sendsOnly?: string;
    referralBonus?: string;
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

  const refreshWalletScreen = useCallback(async (preferWalletId?: string) => {
    try {
      setLoading(true);
      setError(null);
      const summary = await walletService.getWalletsSummary();
      setWalletsSummary(summary);
      const pickId = (preferWalletId && summary.wallets.some((w) => w.id === preferWalletId))
        ? preferWalletId
        : (selectedWalletIdRef.current && summary.wallets.some((w) => w.id === selectedWalletIdRef.current))
          ? selectedWalletIdRef.current
          : (summary.primaryWalletId ?? summary.wallets[0]?.id ?? null);
      selectedWalletIdRef.current = pickId;
      setSelectedWalletId(pickId);
      if (!pickId) {
        setWallet(null);
        setError(t('common.something_went_wrong'));
        return;
      }
      const picked = summary.wallets.find((w) => w.id === pickId)!;
      const w = await walletService.getWallet(picked.countryId, picked.id);
      setWallet(w);
    } catch (e: any) {
      setError(e.message || t('common.something_went_wrong'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const selectWalletTab = useCallback(async (walletId: string) => {
    selectedWalletIdRef.current = walletId;
    setSelectedWalletId(walletId);
    try {
      const picked = walletsSummary?.wallets.find((w) => w.id === walletId);
      if (!picked) {
        await refreshWalletScreen(walletId);
        return;
      }
      const w = await walletService.getWallet(picked.countryId, picked.id);
      setWallet(w);
    } catch (e: unknown) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('common.something_went_wrong'));
    }
  }, [walletsSummary, refreshWalletScreen, t]);

  const openAddWalletModal = useCallback(async () => {
    try {
      const countries = await geographyService.getCountries();
      setAllCountries(countries);
      setShowAddWalletModal(true);
    } catch (e: unknown) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('common.something_went_wrong'));
    }
  }, [t]);

  const handleAddCountryWallet = useCallback(async (countryId: string) => {
    setAddWalletBusy(true);
    try {
      const created = await walletService.createCountryWallet(countryId);
      setShowAddWalletModal(false);
      await refreshWalletScreen(created.id);
      Alert.alert(t('multiWallet.walletCreated'), created.countryName || '');
    } catch (e: unknown) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('common.operationFailed'));
    } finally {
      setAddWalletBusy(false);
    }
  }, [refreshWalletScreen, t]);

  const loadTransactions = useCallback(async () => {
    try {
      setTxLoading(true);
      const w = wallet;
      const res = await walletService.getTransactions(1, 20, w?.id, w?.countryId);
      setTransactions(res.transactions ?? []);
    } catch {
      // silent
    } finally {
      setTxLoading(false);
    }
  }, [wallet]);

  const loadWithdrawals = useCallback(async () => {
    try {
      setWdLoading(true);
      const res = await walletService.getWithdrawals(1, 20, wallet?.id, wallet?.countryId);
      setWithdrawals(res.requests ?? []);
    } catch {
      // silent
    } finally {
      setWdLoading(false);
    }
  }, [wallet]);

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
      void refreshWalletScreen();
      void loadCoinTransfers();

      const p = paramsRef.current;
      const tab = walletParam(p.tab);
      if (tab === 'coin' || tab === 'overview' || tab === 'transactions' || tab === 'withdrawals') {
        setActiveTab(tab as Tab);
      }
      if (walletParam(p.celebrate) === '1') {
        const gift = decodeURIComponentSafe(walletParam(p.gift));
        const amount = decodeURIComponentSafe(walletParam(p.amount));
        const sender = decodeURIComponentSafe(walletParam(p.sender));
        const key = `${amount}|${gift}|${sender}`;
        if (celebrateHandledKeyRef.current !== key) {
          celebrateHandledKeyRef.current = key;
          setCelebrateGift(gift);
          setCelebrateAmount(amount);
          setCelebrateSender(sender);
          setCelebrateVisible(true);
          setActiveTab('coin');
        }
        routerRef.current.setParams({
          celebrate: undefined,
          gift: undefined,
          amount: undefined,
          sender: undefined,
        } as never);
      }
      if (walletParam(p.sendsOnly) === '1') {
        setSendsOnlyFilter(true);
        setActiveTab('coin');
        routerRef.current.setParams({ sendsOnly: undefined, tab: 'coin' } as never);
      }
      if (walletParam(p.referralBonus) === '1' && !referralBonusHandledRef.current) {
        referralBonusHandledRef.current = true;
        const amount = decodeURIComponentSafe(walletParam(p.amount));
        setReferralBonusAmount(amount);
        setReferralBonusVisible(true);
        setActiveTab('overview');
        void (async () => {
          try {
            const token = await AsyncStorage.getItem('accessToken');
            if (!token) return;
            const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
            const res = await fetch(`${API_BASE}/referral/my-code`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json();
              if (data?.code) setReferralCode(String(data.code));
            }
          } catch {
            /* ignore */
          }
        })();
        routerRef.current.setParams({ referralBonus: undefined, amount: undefined } as never);
      }
    }, [refreshWalletScreen, loadCoinTransfers]),
  );

  const closeReferralBonusModal = () => setReferralBonusVisible(false);

  const copyReferralCode = async () => {
    if (!referralCode) return;
    try {
      await Clipboard.setStringAsync(referralCode);
      Alert.alert(t('common.copied'), t('wallet.copiedReferral'));
    } catch {
      Alert.alert(t('common.error'), t('customerSettings.failedToCopyReferral'));
    }
  };

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
      Alert.alert(t('common.invalidAmount'), t('common.enterValidAmount'));
      return null;
    }
    const cap = wallet?.spendable ?? wallet?.balance ?? 0;
    const totalDebit = withdrawQuote?.totalCoins ?? amount;
    if (wallet && totalDebit > cap) {
      Alert.alert(
        t('wallet.insufficientBalance'),
        t('wallet.insufficientBalanceBody'),
      );
      return null;
    }
    if (withdrawPayout === 'BANK_TRANSFER') {
      if (!bankHolder.trim() || !bankName.trim() || !bankRef.trim()) {
        Alert.alert(t('wallet.bankDetails'), t('wallet.bankDetailsBody'));
        return null;
      }
    }
    return amount;
  };

  const goWithdrawPreview = async () => {
    const amount = validateWithdrawForm();
    if (amount == null) return;
    setQuoteLoading(true);
    try {
      const q = await walletService.getWithdrawalQuote(amount, wallet?.id, wallet?.countryId);
      if (q.totalCoins > q.spendableCoins) {
        Alert.alert(
          t('wallet.insufficientBalance'),
          t('wallet.insufficientBalanceBody'),
        );
        return;
      }
      if (q.netPayoutCoins <= 0) {
        Alert.alert(t('wallet.amountTooSmall'), t('wallet.amountTooSmall'));
        return;
      }
      setWithdrawQuote(q);
      setWithdrawStep('preview');
    } catch (e: unknown) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('common.something_went_wrong'));
    } finally {
      setQuoteLoading(false);
    }
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
        walletId: wallet?.id,
        countryId: wallet?.countryId,
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
      setWithdrawQuote(null);
      Alert.alert(t('wallet.requestSubmitted'), t('wallet.withdrawalSubmitted'));
      loadWithdrawals();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || t('common.operationFailed'));
    } finally {
      setWithdrawing(false);
    }
  };

  const cancelWithdrawalRequest = (requestId: string) => {
    Alert.alert(
      t('wallet.cancelWithdrawal'),
      t('wallet.cancelWithdrawal'),
      [
        { text: t('wallet.keep'), style: 'cancel' },
        {
          text: t('wallet.cancelRequest'),
          style: 'destructive',
          onPress: async () => {
            setCancellingId(requestId);
            try {
              await walletService.cancelWithdrawal(requestId);
              await loadWithdrawals();
              await refreshWalletScreen();
            } catch (e: unknown) {
              Alert.alert(t('common.error'), e instanceof Error ? e.message : t('common.operationFailed'));
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
    setRescheduleIosOpen(Platform.OS === 'ios');
  };

  const openReschedulePickers = async () => {
    if (Platform.OS === 'android') {
      const picked = await pickScheduleDateTimeAndroid(rescheduleAt);
      if (picked) setRescheduleAt(picked);
      return;
    }
    setRescheduleIosOpen(true);
  };

  const onRescheduleIosChange = (_: DateTimePickerEvent, d?: Date) => {
    if (d) setRescheduleAt(d);
  };

  const submitReschedule = async () => {
    if (!rescheduleTargetId) return;
    const min = new Date(Date.now() + 60_000);
    if (rescheduleAt.getTime() <= min.getTime()) {
      Alert.alert(t('wallet.invalidTime'), t('wallet.invalidTimeBody'));
      return;
    }
    setRescheduleSaving(true);
    try {
      await coinsService.rescheduleTransfer(rescheduleTargetId, rescheduleAt.toISOString());
      setRescheduleTargetId(null);
      setRescheduleIosOpen(false);
      await loadCoinTransfers();
    } catch (e: unknown) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('common.operationFailed'));
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
      'COIN_TRANSFER_RECEIVED',
    ].includes(type);
    return `${isCredit ? '+' : '-'}${Math.abs(amount).toFixed(2)}`;
  };

  const coinListFiltered =
    sendsOnlyFilter && myUserId
      ? coinTransfers.filter((t) => t.senderUserId === myUserId)
      : coinTransfers;

  const walletActionHref = useCallback(
    (path: string) => hrefWithWalletId(path, selectedWalletId),
    [selectedWalletId],
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.walletSkeletonWrap}>
          <View style={[styles.balanceSkeleton, { backgroundColor: colors.skeleton }]} />
          <View style={[styles.bannerSkeleton, { backgroundColor: colors.skeleton }]} />
          <View style={[styles.tabsSkeleton, { backgroundColor: colors.skeleton }]} />
          <View style={{ gap: 10, paddingHorizontal: 20 }}>
            {[1, 2, 3].map((i) => (
              <View key={i} style={[styles.rowSkeleton, { backgroundColor: colors.skeleton }]} />
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (error || !wallet) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>{t('common.something_went_wrong')}</Text>
          <TouchableOpacity style={styles.setupBtn} onPress={() => router.push('/(auth)/customer-setup')}>
            <Text style={styles.setupBtnText}>{t('auth.addAddress')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const tabLabel = (tab: Tab) =>
    tab === 'overview'
      ? t('driverProfile.overview')
      : tab === 'transactions'
        ? t('driverTransactions.title')
        : tab === 'withdrawals'
          ? t('driverEarnings.pendingPayout')
          : t('sendCoins.send');

  const quickActions = [
    { key: 'buy', icon: 'add-circle-outline' as const, label: t('wallet.buyCoins'), onPress: () => navPush(walletActionHref('/(customer)/buy-coins')) },
    { key: 'send', icon: 'paper-plane-outline' as const, label: t('sendCoins.send'), onPress: () => navPush(walletActionHref('/(customer)/send-coins')) },
    { key: 'scan', icon: 'scan-outline' as const, label: t('wallet.scan'), onPress: () => Alert.alert(t('wallet.scan'), t('wallet.scanComingSoon')) },
    { key: 'more', icon: 'ellipsis-horizontal' as const, label: t('common.menu'), onPress: () => setWalletQuickMore((v) => !v) },
  ];

  const quickMoreActions = [
    { key: 'withdraw', icon: 'arrow-down-circle-outline' as const, label: t('wallet.requestWithdrawal'), onPress: () => { setWalletQuickMore(false); setWithdrawStep('edit'); setShowWithdrawModal(true); } },
    { key: 'support', icon: 'help-circle-outline' as const, label: t('customerProfile.support'), onPress: () => { setWalletQuickMore(false); router.push('/(customer)/support'); } },
    { key: 'news', icon: 'newspaper-outline' as const, label: t('wallet.news'), onPress: () => { setWalletQuickMore(false); Alert.alert(t('wallet.news'), t('wallet.newsComingSoon')); } },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Balance hero */}
      <View style={[styles.balanceCardOuter, { shadowColor: isDark ? '#000' : colors.primary }]}>
        <View style={[styles.balanceCard, { backgroundColor: isDark ? '#0369a1' : colors.primary }]}>
          <View style={styles.balanceDecor1} />
          <View style={styles.balanceDecor2} />

          {(walletsSummary?.wallets.length ?? 0) > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.walletCountryRow}
              style={styles.walletCountryScroll}
            >
              {walletsSummary!.wallets.map((w) => {
                const active = w.id === selectedWalletId;
                return (
                  <TouchableOpacity
                    key={w.id}
                    style={[styles.walletCountryChip, active && styles.walletCountryChipActive]}
                    onPress={() => { void selectWalletTab(w.id); }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.walletCountryChipText, active && styles.walletCountryChipTextActive]}>
                      {w.countryName || w.currencyCode || w.currency}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={styles.walletCountryAddChip}
                onPress={() => { void openAddWalletModal(); }}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={18} color="rgba(255,255,255,0.95)" />
              </TouchableOpacity>
            </ScrollView>
          ) : null}

          <View style={styles.balanceHeaderRow}>
            <View style={styles.balanceIconWrap}>
              <Ionicons name="wallet" size={22} color="rgba(255,255,255,0.95)" />
            </View>
            <Text style={styles.balanceLabel}>
              {wallet.countryName ? `${wallet.countryName} · ` : ''}{t('wallet.available')}
            </Text>
          </View>

          <Text style={styles.balanceAmount}>
            {(wallet.spendable ?? wallet.balance).toFixed(2)}
            <Text style={styles.currency}> {t('wallet.coins')}</Text>
          </Text>

          {wallet.coinsToLocalFiat ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setShowCoinFiatModal(true)}
              style={styles.fiatHintPill}
            >
              <Ionicons name="cash-outline" size={14} color="rgba(255,255,255,0.9)" />
              <Text style={styles.fiatHintText}>
                ≈ {wallet.coinsToLocalFiat.currencySymbol}{wallet.coinsToLocalFiat.spendableAsLocalFiat.toFixed(2)} {wallet.coinsToLocalFiat.currencyCode}
              </Text>
              <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          ) : null}

          {(wallet.lockedForTransfers ?? 0) > 0 && (
            <View style={styles.lockedPill}>
              <Ionicons name="lock-closed-outline" size={13} color="rgba(255,255,255,0.9)" />
              <Text style={styles.lockedHint}>
                {t('wallet.reservedForSends', { amount: wallet.lockedForTransfers!.toFixed(2) })}
              </Text>
            </View>
          )}

          {wallet.discount > 0 && (
            <View style={styles.discountPill}>
              <Ionicons name="gift-outline" size={14} color="#fef08a" />
              <Text style={styles.discountText}>{wallet.discount.toFixed(2)} {t('wallet.coins')}</Text>
            </View>
          )}

          <View style={styles.walletQuickWrap}>
            <View style={styles.walletQuickRow}>
              {quickActions.map((action) => (
                <TouchableOpacity
                  key={action.key}
                  style={styles.walletQuickItem}
                  onPress={action.onPress}
                  activeOpacity={0.85}
                >
                  <View style={styles.walletQuickCircle}>
                    <Ionicons name={action.icon} size={22} color="rgba(255,255,255,0.95)" />
                  </View>
                  <Text style={styles.walletQuickLabel} numberOfLines={2}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {walletQuickMore && (
              <View style={[styles.walletQuickRow, styles.walletQuickMoreRow]}>
                {quickMoreActions.map((action) => (
                  <TouchableOpacity
                    key={action.key}
                    style={styles.walletQuickItem}
                    onPress={action.onPress}
                    activeOpacity={0.85}
                  >
                    <View style={styles.walletQuickCircle}>
                      <Ionicons name={action.icon} size={20} color="rgba(255,255,255,0.95)" />
                    </View>
                    <Text style={styles.walletQuickLabel} numberOfLines={2}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
                <View style={styles.walletQuickItem} />
              </View>
            )}
          </View>
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.92}
        accessibilityRole="button"
        accessibilityLabel={t('wallet.buyCoins')}
        onPress={() => navPush(walletActionHref('/(customer)/buy-coins'))}
        style={[styles.promoBanner, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={[styles.promoIconWrap, { backgroundColor: isDark ? '#0c4a6e' : colors.primaryLight }]}>
          <Ionicons name="sparkles" size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.promoTitle, { color: colors.text }]}>{t('wallet.buyCoins')}</Text>
          <Text style={[styles.promoSub, { color: colors.textSecondary }]} numberOfLines={2}>
            {t('buyCoins.title')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.primary} />
      </TouchableOpacity>

      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        <GameEntrySection placement="CUSTOMER_WALLET" role="customer" />
      </View>

      {/* Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsScrollContent}
        style={styles.tabsScroll}
      >
        <View style={[styles.tabs, { backgroundColor: isDark ? colors.surfaceVariant : colors.surfaceVariant, borderColor: colors.border }]}>
          {TAB_CONFIG.map(({ key, icon, iconActive }) => {
            const active = activeTab === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.tab, active && [styles.tabActive, { backgroundColor: colors.primary }]]}
                onPress={() => setActiveTab(key)}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={active ? iconActive : icon}
                  size={15}
                  color={active ? '#fff' : colors.textSecondary}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.tabText, { color: colors.textSecondary }, active && styles.tabTextActive]}>
                  {tabLabel(key)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {sendsOnlyFilter && activeTab === 'coin' && (
        <View
          style={[
            styles.sendsOnlyBanner,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sendsOnlyBannerText, { color: colors.text }]}>{t('wallet.showingYourSends')}</Text>
          <TouchableOpacity onPress={() => setSendsOnlyFilter(false)} hitSlop={12}>
            <Text style={{ color: colors.primary, fontWeight: '800' }}>{t('common.showAll')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tab content */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentPad}>

        {/* Overview */}
        {activeTab === 'overview' && (
          <View style={{ gap: 14 }}>
            <View style={styles.overviewStatsRow}>
              <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.statIconWrap, { backgroundColor: isDark ? '#0c4a6e' : colors.primaryLight }]}>
                  <Ionicons name="wallet-outline" size={18} color={colors.primary} />
                </View>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('wallet.available')}</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {(wallet.spendable ?? wallet.balance).toFixed(2)}
                </Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.statIconWrap, { backgroundColor: isDark ? '#422006' : colors.warningBg }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.warning} />
                </View>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('sendCoins.send')}</Text>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {(wallet.lockedForTransfers ?? 0).toFixed(2)}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.75}
              onPress={() => {
                if (!wallet) return;
                if (wallet.coinsToLocalFiat) setShowCoinFiatModal(true);
                else Alert.alert(t('wallet.cashEquivalent'), t('wallet.cashEquivalent'));
              }}
            >
              <View style={[styles.infoCardIcon, { backgroundColor: isDark ? '#14532d' : colors.successBg }]}>
                <Ionicons name="cash-outline" size={20} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('wallet.currency')}</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{wallet.currency}</Text>
                <Text style={{ color: colors.textTertiary, fontSize: 12, marginTop: 2 }}>
                  {t('wallet.tapForEstimate')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </TouchableOpacity>

            <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.infoCardIcon, { backgroundColor: isDark ? '#1e3a5f' : '#dbeafe' }]}>
                <Ionicons name="time-outline" size={20} color="#2563eb" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('common.refresh')}</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{formatDate(wallet.updatedAt)}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.navCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setActiveTab('transactions')}
              activeOpacity={0.8}
            >
              <View style={[styles.navCardIcon, { backgroundColor: isDark ? '#312e81' : '#e0e7ff' }]}>
                <Ionicons name="receipt-outline" size={20} color="#4f46e5" />
              </View>
              <Text style={[styles.navCardText, { color: colors.text }]}>{t('wallet.viewTransactionHistory')}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setActiveTab('withdrawals')}
              activeOpacity={0.8}
            >
              <View style={[styles.navCardIcon, { backgroundColor: isDark ? '#422006' : '#ffedd5' }]}>
                <Ionicons name="cash-outline" size={20} color="#ea580c" />
              </View>
              <Text style={[styles.navCardText, { color: colors.text }]}>{t('wallet.requestWithdrawal')}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Transactions */}
        {activeTab === 'transactions' && (
          txLoading ? (
            <ActivityIndicator color="#0284c7" style={{ marginTop: 40 }} />
          ) : transactions.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIconWrap, { backgroundColor: isDark ? colors.surfaceVariant : colors.surfaceVariant }]}>
                <Ionicons name="receipt-outline" size={36} color={colors.textTertiary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('wallet.noTransactions')}</Text>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>{t('wallet.viewTransactionHistory')}</Text>
            </View>
          ) : (
            transactions.map((tx) => {
              const meta = txTypeIcon(tx.type);
              const isDarkIcon = isDark;
              return (
              <View key={tx.id} style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.txIconWrap, { backgroundColor: isDarkIcon ? colors.surfaceVariant : meta.bg }]}>
                  <Ionicons name={meta.icon} size={20} color={isDarkIcon ? colors.primary : meta.fg} />
                </View>
                <View style={styles.txLeft}>
                  <Text style={[styles.txType, { color: colors.text }]}>{localizeTxType(tx.type)}</Text>
                  <Text style={[styles.txDate, { color: colors.textTertiary }]}>{formatDate(tx.createdAt)}</Text>
                </View>
                <View style={styles.txRight}>
                  <Text style={[
                    styles.txAmount,
                    ['TOP_UP','REFUND','BONUS','REFERRAL_REWARD','COIN_TRANSFER_RECEIVED','GAME_PRIZE'].includes(tx.type)
                      ? styles.txCredit : styles.txDebit,
                  ]}>
                    {formatAmount(tx.amount, tx.type)}
                  </Text>
                  <Text style={[styles.txCoinUnit, { color: colors.textTertiary }]}>{t('wallet.coins')}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[tx.status] + '22' }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[tx.status] }]}>{tx.status}</Text>
                  </View>
                </View>
              </View>
            );})
          )
        )}

        {/* Withdrawals */}
        {activeTab === 'withdrawals' && (
          wdLoading ? (
            <ActivityIndicator color="#0284c7" style={{ marginTop: 40 }} />
          ) : withdrawals.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.surfaceVariant }]}>
                <Ionicons name="cash-outline" size={36} color={colors.textTertiary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('wallet.noTransactions')}</Text>
              <TouchableOpacity
                style={[styles.newWithdrawBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  setWithdrawStep('edit');
                  setShowWithdrawModal(true);
                }}
              >
                <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.newWithdrawBtnText}>{t('wallet.requestWithdrawal')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {withdrawals.map((wd) => (
                <View key={wd.id} style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.txIconWrap, { backgroundColor: isDark ? colors.surfaceVariant : '#ffedd5' }]}>
                    <Ionicons name="arrow-up-circle-outline" size={20} color={isDark ? colors.primary : '#ea580c'} />
                  </View>
                  <View style={styles.txLeft}>
                    <Text style={[styles.wdAmountLine, { color: colors.text }]}>
                      {wd.amount.toFixed(2)} <Text style={styles.wdAmountCurrency}>{t('wallet.coins')}</Text>
                    </Text>
                    <Text style={[styles.txDate, { color: colors.textTertiary }]}>{formatDate(wd.requestedAt)}</Text>
                    {wd.payoutMethod && (
                      <Text style={[styles.txDate, { color: colors.textSecondary }]}>
                        {wd.payoutMethod === 'CASH' ? t('wallet.cash') : t('wallet.bank')}
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
                    {(wd.feeAmount ?? 0) > 0 && (
                      <Text style={[styles.txNote, { color: colors.textTertiary }]}>
                        {t('sendCoins.fee')}: {(wd.feeAmount ?? 0).toFixed(2)} {t('wallet.coins')}
                      </Text>
                    )}
                    {wd.descriptionOfAdmin ? (
                      <Text style={styles.txAdminNote}>{t('customerProfile.support')}: {wd.descriptionOfAdmin}</Text>
                    ) : null}
                    {wd.status === 'REJECTED' && wd.rejectionReason ? (
                      <Text style={[styles.txAdminNote, { color: '#b91c1c' }]}>{t('driverDocuments.statusRejected')}: {wd.rejectionReason}</Text>
                    ) : null}
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
                          <Text style={styles.cancelWdText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                      )
                    ) : null}
                  </View>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.newWithdrawBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  setWithdrawStep('edit');
                  setShowWithdrawModal(true);
                }}
              >
                <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.newWithdrawBtnText}>{t('wallet.requestWithdrawal')}</Text>
              </TouchableOpacity>
            </>
          )
        )}

        {activeTab === 'coin' && (
          coinLoading ? (
            <ActivityIndicator color="#0284c7" style={{ marginTop: 40 }} />
          ) : coinListFiltered.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.surfaceVariant }]}>
                <Ionicons name="paper-plane-outline" size={36} color={colors.textTertiary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('wallet.noTransactions')}</Text>
              {!sendsOnlyFilter ? (
                <TouchableOpacity style={[styles.newWithdrawBtn, { backgroundColor: colors.primary }]} onPress={() => navPush(walletActionHref('/(customer)/send-coins'))}>
                  <Ionicons name="paper-plane" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.newWithdrawBtnText}>{t('sendCoins.send')}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.newWithdrawBtn, { backgroundColor: colors.primary }]} onPress={() => setSendsOnlyFilter(false)}>
                  <Text style={styles.newWithdrawBtnText}>{t('common.showAll')}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
              {coinListFiltered.map((tx) => {
                const isRecipientRow = !!(
                  myUserId &&
                  tx.recipientUserId === myUserId &&
                  tx.senderUserId !== myUserId
                );
                const isSentRow = !!myUserId && tx.senderUserId === myUserId;
                const showFeeBreakdownRow = !isRecipientRow || tx.showFeeBreakdown === true;
                const statusStyle = coinTransferStatusMeta(tx.status);
                const directionLabel = isSentRow ? t('sendCoins.sent') : isRecipientRow ? t('sendCoins.received') : null;
                const senderLine = isRecipientRow ? formatCoinSenderLine(tx) : null;
                return (
                <View key={tx.id} style={[styles.txCard, { backgroundColor: colors.card }]}>
                  <View style={styles.txLeft}>
                    <View style={styles.coinTxTitleRow}>
                      <View style={[styles.coinStatusBadge, { backgroundColor: statusStyle.bg }]}>
                        <Ionicons name={statusStyle.icon} size={13} color={statusStyle.fg} />
                        <Text style={[styles.coinStatusText, { color: statusStyle.fg }]}>
                          {statusStyle.label}
                        </Text>
                      </View>
                      {directionLabel ? (
                        <Text style={[styles.coinDirection, { color: colors.textSecondary }]}>
                          {directionLabel}
                        </Text>
                      ) : null}
                    </View>
                    {senderLine ? (
                      <Text style={[styles.coinSenderLine, { color: colors.text }]}>
                        {t('sendCoins.from')} {senderLine}
                      </Text>
                    ) : null}
                    <Text style={[styles.txDate, { color: colors.textTertiary }]}>{formatDate(tx.createdAt)}</Text>
                    {showFeeBreakdownRow ? (
                      <Text style={[styles.txDate, { color: colors.textSecondary }]}>
                        {t('sendCoins.gross')} {tx.grossCoins.toFixed(2)} · {t('sendCoins.fee')} {tx.feeCoins.toFixed(2)} · {t('sendCoins.theyReceive')} {tx.netCoins.toFixed(2)}
                      </Text>
                    ) : (
                      <Text style={[styles.txDate, { color: colors.textSecondary }]}>
                        {t('sendCoins.received')} {tx.netCoins.toFixed(2)} {t('wallet.coins')}
                      </Text>
                    )}
                    {tx.giftMessage ? (
                      <Text style={[styles.txNote, { color: colors.textSecondary }]} numberOfLines={2}>
                        “{tx.giftMessage}”
                      </Text>
                    ) : null}
                    {tx.status === 'SCHEDULED' && tx.scheduledAt && isSentRow ? (
                      <Text style={[styles.txScheduled, { color: colors.primary }]}>
                        {t('sendCoins.scheduleSend')} {formatDateTimeLocal(tx.scheduledAt)}
                      </Text>
                    ) : null}
                    {tx.status === 'PENDING' && tx.pendingUntil ? (
                      <Text style={[styles.txDate, { color: colors.textSecondary, marginTop: 2 }]}>
                        {formatDateTimeLocal(tx.pendingUntil)}
                      </Text>
                    ) : null}
                    {tx.status === 'FAILED' && tx.failedReason ? (
                      <Text style={[styles.txDate, { color: colors.danger ?? '#dc2626', marginTop: 2 }]}>
                        {tx.failedReason}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.txRight, { gap: 10 }]}>
                    {tx.status === 'SCHEDULED' && tx.senderUserId === myUserId ? (
                      <TouchableOpacity
                        onPress={() => openRescheduleModal(tx)}
                        disabled={cancellingCoinId === tx.id || rescheduleSaving}
                        hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
                      >
                        <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('sendCoins.editTime')}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {tx.status === 'SCHEDULED' && tx.senderUserId === myUserId ? (
                      cancellingCoinId === tx.id ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : (
                        <TouchableOpacity
                          onPress={() => {
                            Alert.alert(
                              t('wallet.cancelScheduledSend'),
                              t('wallet.cancelScheduledSend'),
                              [
                                { text: t('common.no'), style: 'cancel' },
                                {
                                  text: t('wallet.cancelSend'),
                                  style: 'destructive',
                                  onPress: async () => {
                                    setCancellingCoinId(tx.id);
                                    try {
                                      await coinsService.cancelTransfer(tx.id);
                                      await loadCoinTransfers();
                                      await refreshWalletScreen();
                                    } catch (e: unknown) {
                                      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('common.operationFailed'));
                                    } finally {
                                      setCancellingCoinId(null);
                                    }
                                  },
                                },
                              ],
                            );
                          }}
                        >
                          <Text style={{ color: colors.danger, fontWeight: '700' }}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                      )
                    ) : null}
                  </View>
                </View>
              );
              })}
              <TouchableOpacity style={[styles.newWithdrawBtn, { backgroundColor: colors.primary }]} onPress={() => navPush(walletActionHref('/(customer)/send-coins'))}>
                <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.newWithdrawBtnText}>{t('wallet.newSend')}</Text>
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
                  <Text style={[styles.modalTitle, { color: colors.text }]}>{t('wallet.requestWithdrawal')}</Text>
                  <Text style={[styles.modalBalanceMuted, { color: colors.textTertiary }]}>
                    {t('wallet.available')} {(wallet.spendable ?? wallet.balance).toFixed(2)} {t('wallet.coins')}
                    {(wallet.lockedForTransfers ?? 0) > 0
                      ? ` ${t('wallet.reservedForSends', { amount: wallet.lockedForTransfers!.toFixed(2) })}`
                      : ''}
                  </Text>

                  <Text style={[styles.modalLabel, { color: colors.text }]}>{t('wallet.amountCoins')}</Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="decimal-pad"
                    value={withdrawAmount}
                    onChangeText={setWithdrawAmount}
                  />

                  <Text style={[styles.modalLabel, { color: colors.text }]}>{t('wallet.receiveAs')}</Text>
                  <View style={styles.payoutRow}>
                    <TouchableOpacity
                      style={[styles.chip, { borderColor: colors.border }, withdrawPayout === 'BANK_TRANSFER' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => setWithdrawPayout('BANK_TRANSFER')}
                    >
                      <Text style={{ color: withdrawPayout === 'BANK_TRANSFER' ? '#fff' : colors.text, fontWeight: '700' }}>{t('wallet.bank')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chip, { borderColor: colors.border }, withdrawPayout === 'CASH' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                      onPress={() => setWithdrawPayout('CASH')}
                    >
                      <Text style={{ color: withdrawPayout === 'CASH' ? '#fff' : colors.text, fontWeight: '700' }}>{t('wallet.cash')}</Text>
                    </TouchableOpacity>
                  </View>

                  {withdrawPayout === 'BANK_TRANSFER' && (
                    <>
                      <Text style={[styles.modalHint, { color: colors.textSecondary }]}>
                        {t('wallet.bankDetailsBody')}
                      </Text>
                      <Text style={[styles.modalLabel, { color: colors.text }]}>{t('bankDetails.accountHolder')}</Text>
                      <TextInput
                        style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                        placeholder={t('bankDetails.accountHolder')}
                        placeholderTextColor={colors.textTertiary}
                        value={bankHolder}
                        onChangeText={setBankHolder}
                      />
                      <Text style={[styles.modalLabel, { color: colors.text }]}>{t('bankDetails.bankName')}</Text>
                      <TextInput
                        style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                        placeholder={t('bankDetails.bankName')}
                        placeholderTextColor={colors.textTertiary}
                        value={bankName}
                        onChangeText={setBankName}
                      />
                      <Text style={[styles.modalLabel, { color: colors.text }]}>{t('bankDetails.iban')} / {t('bankDetails.rib')}</Text>
                      <TextInput
                        style={[styles.modalInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                        placeholder={t('bankDetails.iban')}
                        placeholderTextColor={colors.textTertiary}
                        value={bankRef}
                        onChangeText={setBankRef}
                        autoCapitalize="characters"
                      />
                      <View style={styles.saveBankRow}>
                        <Text style={[styles.modalLabel, { flex: 1, marginBottom: 0 }]}>{t('bankDetails.save')}</Text>
                        <Switch value={saveBankProfile} onValueChange={setSaveBankProfile} />
                      </View>
                    </>
                  )}

                  <Text style={[styles.modalLabel, { color: colors.text }]}>{t('bankDetails.notes')} ({t('common.optional')})</Text>
                  <TextInput
                    style={[styles.modalInput, { height: 80, textAlignVertical: 'top', backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                    placeholder={t('wallet.reasonPlaceholder')}
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
                        setWithdrawQuote(null);
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
                      <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalSubmit, quoteLoading && styles.btnDisabled]}
                      onPress={() => void goWithdrawPreview()}
                      disabled={quoteLoading}
                    >
                      {quoteLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.modalSubmitText}>{t('sendCoins.previewFees')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>{t('common.confirm')}</Text>
                  <Text style={[styles.previewHint, { color: colors.textSecondary }]}>{t('wallet.title')}</Text>
                  <Text style={[styles.previewAmount, { color: colors.text }]}>
                    {parseFloat(withdrawAmount || '0').toFixed(2)}{' '}
                    <Text style={[styles.previewCurrency, { color: colors.textSecondary }]}>{t('wallet.coins')}</Text>
                  </Text>
                  {withdrawQuote && withdrawQuote.feeCoins > 0 ? (
                    <Text style={[styles.previewMeta, { color: colors.textSecondary, marginTop: 6 }]}>
                      {t('sendCoins.fee')}: {withdrawQuote.feeCoins.toFixed(2)} {t('wallet.coins')}
                      {withdrawQuote.feeBps > 0 ? ` (${withdrawQuote.feeBps / 100}%)` : ''}
                    </Text>
                  ) : null}
                  <Text style={[styles.previewHint, { color: colors.textSecondary, marginTop: 10 }]}>{t('buyCoins.youReceive')}</Text>
                  <Text style={[styles.previewAmount, { color: colors.text, fontSize: 28 }]}>
                    {(withdrawQuote?.netPayoutCoins ?? parseFloat(withdrawAmount || '0')).toFixed(2)}{' '}
                    <Text style={[styles.previewCurrency, { color: colors.textSecondary, fontSize: 16 }]}>{t('wallet.coins')}</Text>
                  </Text>
                  {withdrawQuote?.amountFiat != null ? (
                    <Text style={[styles.previewFiat, { color: colors.textTertiary }]}>
                      ≈ {withdrawQuote.currencySymbol || withdrawQuote.currencyCode}{' '}
                      {withdrawQuote.amountFiat.toFixed(2)}
                    </Text>
                  ) : null}
                  <Text style={[styles.modalBalanceMuted, { color: colors.textTertiary }]}>
                    {t('wallet.available')} {(wallet.spendable ?? wallet.balance).toFixed(2)} {t('wallet.coins')}
                    {(wallet.lockedForTransfers ?? 0) > 0
                      ? ` ${t('wallet.reservedForSends', { amount: wallet.lockedForTransfers!.toFixed(2) })}`
                      : ''}
                  </Text>
                  <Text style={[styles.previewMeta, { color: colors.textSecondary }]}>
                    {withdrawPayout === 'CASH' ? t('wallet.cash') : t('wallet.bank')}
                    {withdrawPayout === 'BANK_TRANSFER' && bankName.trim()
                      ? ` · ${bankName.trim()}`
                      : ''}
                  </Text>
                  {withdrawNote.trim() ? (
                    <Text style={[styles.previewMeta, { color: colors.textTertiary }]}>{t('bankDetails.notes')}: {withdrawNote.trim()}</Text>
                  ) : null}

                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={styles.modalCancel}
                      onPress={() => {
                        setWithdrawStep('edit');
                        setWithdrawQuote(null);
                      }}
                      disabled={withdrawing}
                    >
                      <Text style={styles.modalCancelText}>{t('common.back')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalSubmit, withdrawing && styles.btnDisabled]}
                      onPress={handleWithdraw}
                      disabled={withdrawing}
                    >
                      {withdrawing
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={styles.modalSubmitText}>{t('common.confirm')}</Text>}
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
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.rescheduleModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('sendCoins.rescheduleTitle')}</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 14, fontSize: 14 }}>
              {t('sendCoins.rescheduleBody')}
            </Text>
            <TouchableOpacity
              style={[styles.reschedulePickRow, { borderColor: colors.border, backgroundColor: colors.inputBg }]}
              onPress={() => void openReschedulePickers()}
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
                onValueChange={onRescheduleIosChange}
                onDismiss={() => setRescheduleIosOpen(false)}
              />
            ) : null}
            <View style={[styles.modalButtons, { marginTop: 20 }]}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setRescheduleTargetId(null);
                  setRescheduleIosOpen(false);
                }}
                disabled={rescheduleSaving}
              >
                <Text style={styles.modalCancelText}>{t('common.close')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, rescheduleSaving && styles.btnDisabled]}
                onPress={() => void submitReschedule()}
                disabled={rescheduleSaving}
              >
                {rescheduleSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>{t('common.save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showCoinFiatModal} transparent animationType="fade" onRequestClose={() => setShowCoinFiatModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.celebrateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 8 }]}>{t('wallet.cashEquivalent')}</Text>
            {wallet?.coinsToLocalFiat ? (
              <>
                <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>
                  {t('buyCoins.countryCoinConfig')}:{' '}
                  <Text style={{ fontWeight: '700', color: colors.text }}>
                    1.00 {wallet.coinsToLocalFiat.currencyCode} ={' '}
                    {wallet.coinsToLocalFiat.coinsPerFiatUnit % 1 === 0
                      ? wallet.coinsToLocalFiat.coinsPerFiatUnit
                      : Number(wallet.coinsToLocalFiat.coinsPerFiatUnit.toFixed(4))}{' '}
                    {t('wallet.coins')}
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
                    <Text style={{ color: colors.textSecondary, fontSize: 15 }}>{t('orderPreviewPayment.yourWalletBalance')}</Text>
                    <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>
                      {wallet.coinsToLocalFiat.currencySymbol} {wallet.coinsToLocalFiat.balanceAsLocalFiat.toFixed(2)}{' '}
                      {wallet.coinsToLocalFiat.currencyCode}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 15 }}>{t('orderPreviewPayment.availableToSpend')}</Text>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
                      {wallet.coinsToLocalFiat.currencySymbol}{' '}
                      {wallet.coinsToLocalFiat.spendableAsLocalFiat.toFixed(2)} {wallet.coinsToLocalFiat.currencyCode}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: colors.textTertiary, fontSize: 12, lineHeight: 18, marginBottom: 16 }}>
                  {t('wallet.tapForEstimate')}
                </Text>
              </>
            ) : null}
            <TouchableOpacity
              style={[styles.celebrateBtn, { backgroundColor: colors.primary }]}
              onPress={() => setShowCoinFiatModal(false)}
            >
              <Text style={styles.celebrateBtnText}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={celebrateVisible} transparent animationType="fade">
        <View style={styles.celebrateOverlay}>
          <View style={[styles.celebrateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={styles.celebrateEmoji}>🎉</Text>
            <Text style={[styles.celebrateTitle, { color: colors.text }]}>
              {celebrateGift.trim() ? t('sendCoins.receivedCoinsTitle') : t('sendCoins.receivedCoinsTitle')}
            </Text>
            {celebrateSender.trim() ? (
              <Text style={[styles.celebrateFrom, { color: colors.textSecondary }]}>
                {t('sendCoins.from')} <Text style={{ fontWeight: '800', color: colors.text }}>{celebrateSender.trim()}</Text>
              </Text>
            ) : null}
            {celebrateAmount.trim() ? (
              <Text style={[styles.celebrateAmount, { color: '#16a34a' }]}>+{celebrateAmount.trim()} {t('wallet.coins')}</Text>
            ) : null}
            {celebrateGift.trim() ? (
              <Text style={[styles.celebrateGift, { color: colors.textSecondary }]}>“{celebrateGift.trim()}”</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.celebrateBtn, { backgroundColor: colors.primary }]}
              onPress={() => setCelebrateVisible(false)}
            >
              <Text style={styles.celebrateBtnText}>{t('sendCoins.awesome')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={referralBonusVisible} transparent animationType="fade" onRequestClose={closeReferralBonusModal}>
        <Pressable style={styles.celebrateOverlay} onPress={closeReferralBonusModal}>
          <Pressable
            style={[styles.celebrateCard, styles.referralBonusCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <TouchableOpacity style={styles.referralBonusClose} onPress={closeReferralBonusModal} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.celebrateEmoji}>🎉</Text>
            <Text style={[styles.celebrateTitle, { color: colors.text }]}>{t('gameCongrats.title')}</Text>
            <Text style={[styles.referralBonusSub, { color: colors.textSecondary }]}>
              {t('customerSettings.referrals')}
            </Text>
            {referralBonusAmount.trim() ? (
              <Text style={[styles.celebrateAmount, { color: '#16a34a' }]}>
                +{referralBonusAmount.trim().match(/coins/i)
                  ? referralBonusAmount.trim()
                  : `${referralBonusAmount.trim()} ${t('wallet.coins')}`}
              </Text>
            ) : null}
            <Text style={[styles.referralBonusHint, { color: colors.textSecondary }]}>
              {t('customerSettings.referralShareHint')}
            </Text>
            {referralCode ? (
              <View style={[styles.referralCodeRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <Text style={[styles.referralCodeText, { color: colors.text }]} selectable>
                  {referralCode}
                </Text>
                <TouchableOpacity onPress={copyReferralCode} hitSlop={8} style={styles.referralCopyBtn}>
                  <Ionicons name="copy-outline" size={22} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ) : (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 8 }} />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showAddWalletModal} transparent animationType="slide" onRequestClose={() => setShowAddWalletModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.addWalletSheet, { backgroundColor: colors.card }]}>
            <View style={styles.addWalletHead}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('multiWallet.addWallet')}</Text>
              <TouchableOpacity onPress={() => setShowAddWalletModal(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {addWalletBusy ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {allCountries
                  .filter((c) => !walletsSummary?.wallets.some((w) => w.countryId === c.id))
                  .map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.addWalletRow, { borderBottomColor: colors.border }]}
                      onPress={() => { void handleAddCountryWallet(c.id); }}
                    >
                      <Text style={[styles.addWalletRowTitle, { color: colors.text }]}>{c.name}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{c.currencyCode}</Text>
                    </TouchableOpacity>
                  ))}
                {allCountries.filter((c) => !walletsSummary?.wallets.some((w) => w.countryId === c.id)).length === 0 ? (
                  <Text style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>
                    {t('multiWallet.noMoreCountries')}
                  </Text>
                ) : null}
              </ScrollView>
            )}
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
  setupBtn: { backgroundColor: '#0284c7', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  setupBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  walletSkeletonWrap: { paddingTop: 12, gap: 14 },
  balanceSkeleton: { marginHorizontal: 20, height: 220, borderRadius: 24 },
  bannerSkeleton: { marginHorizontal: 20, height: 72, borderRadius: 16 },
  tabsSkeleton: { marginHorizontal: 20, height: 44, borderRadius: 14 },
  rowSkeleton: { height: 72, borderRadius: 14 },

  balanceCardOuter: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  balanceCard: {
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  balanceDecor1: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  balanceDecor2: {
    position: 'absolute',
    bottom: -50,
    left: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  balanceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  balanceIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletCountryScroll: { alignSelf: 'stretch', marginBottom: 6, maxHeight: 36, zIndex: 1 },
  walletCountryRow: { gap: 8, paddingBottom: 4, alignItems: 'center' },
  walletCountryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  walletCountryChipActive: { backgroundColor: 'rgba(255,255,255,0.95)' },
  walletCountryChipText: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '700' },
  walletCountryChipTextActive: { color: '#0284c7' },
  walletCountryAddChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  balanceLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' },
  balanceAmount: { color: '#fff', fontSize: 42, fontWeight: '800', letterSpacing: -1, zIndex: 1 },
  currency: { fontSize: 18, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  fiatHintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 2,
    zIndex: 1,
  },
  fiatHintText: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '600' },
  lockedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    zIndex: 1,
  },
  lockedHint: { fontSize: 12, color: 'rgba(255,255,255,0.88)' },
  discountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(254,240,138,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    zIndex: 1,
  },
  discountText: { color: '#fef08a', fontSize: 13, fontWeight: '600' },
  walletQuickWrap: { width: '100%', marginTop: 10, paddingHorizontal: 2, zIndex: 1 },
  walletQuickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
  },
  walletQuickMoreRow: { marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.25)' },
  walletQuickItem: { flex: 1, alignItems: 'center', maxWidth: '25%' },
  walletQuickCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletQuickLabel: {
    marginTop: 7,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
    textAlign: 'center',
    lineHeight: 13,
  },

  promoBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  promoIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoTitle: { fontSize: 15, fontWeight: '700' },
  promoSub: { fontSize: 12, marginTop: 2, lineHeight: 17 },

  tabsScroll: { marginTop: 8, marginBottom: 4, flexGrow: 0 },
  tabsScrollContent: { paddingHorizontal: 16 },
  tabs: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 11,
    minWidth: 88,
  },
  tabActive: { backgroundColor: '#0284c7' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  tabTextActive: { color: '#fff' },

  content: { flex: 1 },
  contentPad: { padding: 16, gap: 10, paddingBottom: 40 },

  overviewStatsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 6,
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { fontSize: 12, fontWeight: '600' },
  statValue: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },

  infoCard: {
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  infoCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: { color: '#6b7280', fontSize: 13, fontWeight: '600' },
  infoValue: { color: '#111827', fontWeight: '700', fontSize: 16, marginTop: 2 },
  navCard: {
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  navCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navCardText: { flex: 1, color: '#111827', fontSize: 15, fontWeight: '600' },

  txCard: {
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  txIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  txLeft: { flex: 1, gap: 3 },
  txRight: { alignItems: 'flex-end', gap: 2 },
  txCoinUnit: { fontSize: 11, fontWeight: '600' },
  wdRightCol: { alignItems: 'flex-end', gap: 8 },
  wdAmountLine: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  wdAmountCurrency: { fontSize: 15, fontWeight: '600', opacity: 0.85 },
  cancelWdBtn: { paddingVertical: 4 },
  cancelWdText: { color: '#b91c1c', fontWeight: '700', fontSize: 13 },
  txType: { fontSize: 15, fontWeight: '600', color: '#111827' },
  coinTxTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 2,
  },
  coinStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  coinStatusText: { fontSize: 12, fontWeight: '800' },
  coinDirection: { fontSize: 12, fontWeight: '600' },
  coinSenderLine: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  txDate: { fontSize: 13, color: '#9ca3af' },
  txNote: { fontSize: 13, color: '#6b7280', fontStyle: 'italic' },
  txScheduled: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  txAdminNote: { fontSize: 13, color: '#0284c7' },
  txAmount: { fontSize: 16, fontWeight: '700' },
  txCredit: { color: '#10b981' },
  txDebit: { color: '#ef4444' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '600' },

  empty: { alignItems: 'center', paddingTop: 48, gap: 10, paddingHorizontal: 24 },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  newWithdrawBtn: {
    flexDirection: 'row',
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  newWithdrawBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  addWalletSheet: {
    marginTop: 'auto',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    maxHeight: '70%',
  },
  addWalletHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  addWalletRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addWalletRowTitle: { fontSize: 16, fontWeight: '600' },

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
  previewFiat: { fontSize: 14, marginTop: 2, fontWeight: '500' },
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
  celebrateFrom: { fontSize: 15, marginTop: 10, textAlign: 'center' },
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

  referralBonusCard: { position: 'relative', width: '100%', maxWidth: 360, alignSelf: 'center' },
  referralBonusClose: { position: 'absolute', top: 12, right: 12, zIndex: 1 },
  referralBonusSub: { fontSize: 15, marginTop: 6, textAlign: 'center' },
  referralBonusHint: { fontSize: 13, marginTop: 16, textAlign: 'center', lineHeight: 20, paddingHorizontal: 4 },
  referralCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 12,
    borderWidth: 1,
    width: '100%',
  },
  referralCodeText: { flex: 1, fontSize: 17, fontWeight: '700', letterSpacing: 1 },
  referralCopyBtn: { padding: 8 },

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
