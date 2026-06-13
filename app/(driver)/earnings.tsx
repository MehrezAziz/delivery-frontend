import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  FlatList,
  Alert,
  Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppNavigation } from '../../contexts/AppNavigationContext';
import { driverPayoutService } from '../../services/api/driver-payout.service';
import { GameEntrySection } from '../../components/games/GameEntrySection';

function resolveApiBase(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
  const trimmed = raw.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}
const API_BASE = resolveApiBase();

type Channel = 'all' | 'wallet' | 'cash';
type Preset = 'today' | 'week' | 'month' | 'all_time' | 'custom';

type DriverMe = {
  account?: {
    balance: number;
    balanceUnit?: 'COINS';
    balanceAsLocalFiat?: number | null;
    currencySymbol?: string;
    currency: string;
    completedDeliveries: number;
  } | null;
};

type EarningItem = {
  id: string;
  at: string;
  channel: 'cash' | 'wallet';
  label: string;
  amount: number;
  orderId?: string | null;
};

type EarningsPayload = {
  currency: string;
  preset: string;
  channel: string;
  totals: {
    cash: number;
    wallet: number;
    combined: number;
    cashOrderCount: number;
    walletLineCount: number;
  };
  items: EarningItem[];
};

type WithdrawRow = {
  id: string;
  amount: number;
  feeAmount?: number;
  status: string;
  payoutMethod: string;
  payoutBankHolderName?: string | null;
  payoutBankName?: string | null;
  payoutBankAccountRef?: string | null;
  descriptionFromDriver?: string | null;
  descriptionFromStaff?: string | null;
  rejectionReason?: string | null;
  requestedAt: string;
  processedAt?: string | null;
};

type WithdrawQuote = {
  amountCoins: number;
  feeCoins: number;
  feeBps: number;
  netPayoutCoins: number;
  totalCoins: number;
  spendableCoins: number;
  currencyCode: string;
  currencySymbol: string;
  amountFiat: number | null;
  feeFiat: number | null;
  totalFiat: number | null;
};

export default function DriverEarningsScreen() {
  const router = useRouter();
  const { push } = useAppNavigation();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const [driver, setDriver] = useState<DriverMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [channel, setChannel] = useState<Channel>('wallet');
  const [preset, setPreset] = useState<Preset>('all_time');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [earnings, setEarnings] = useState<EarningsPayload | null>(null);
  const [earnLoading, setEarnLoading] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawRow[]>([]);
  const [wdModal, setWdModal] = useState(false);
  const [wdAmount, setWdAmount] = useState('');
  const [wdNote, setWdNote] = useState('');
  const [wdPayout, setWdPayout] = useState<'CASH' | 'BANK_TRANSFER'>('BANK_TRANSFER');
  const [wdBankHolder, setWdBankHolder] = useState('');
  const [wdBankName, setWdBankName] = useState('');
  const [wdBankRef, setWdBankRef] = useState('');
  const [wdSaveBank, setWdSaveBank] = useState(false);
  const [wdBusy, setWdBusy] = useState(false);
  const [wdStep, setWdStep] = useState<'form' | 'preview'>('form');
  const [wdQuote, setWdQuote] = useState<WithdrawQuote | null>(null);
  const [wdQuoteLoading, setWdQuoteLoading] = useState(false);
  const [wdCancelling, setWdCancelling] = useState<string | null>(null);
  const [walletQuickMore, setWalletQuickMore] = useState(false);

  useEffect(() => {
    if (!wdModal || wdPayout !== 'BANK_TRANSFER') return;
    let cancelled = false;
    void (async () => {
      try {
        const row = await driverPayoutService.getPayoutBankDetails();
        if (cancelled || !row) return;
        setWdBankHolder(row.accountHolderName);
        setWdBankName(row.bankName);
        setWdBankRef(row.accountReference);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wdModal, wdPayout]);

  const loadProfile = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        router.replace('/(auth)/driver-login');
        return;
      }
      const res = await axios.get<DriverMe>(`${API_BASE}/drivers/me`, {
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

  const loadEarnings = useCallback(async () => {
    const token = await AsyncStorage.getItem('accessToken');
    if (!token) return;
    setEarnLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('channel', channel);
      if (preset === 'custom' && customFrom && customTo) {
        params.set('from', customFrom);
        params.set('to', customTo);
      } else {
        params.set('preset', preset === 'custom' ? 'all_time' : preset);
      }
      const res = await axios.get<EarningsPayload>(`${API_BASE}/drivers/me/earnings?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEarnings(res.data);
    } catch {
      setEarnings(null);
    } finally {
      setEarnLoading(false);
    }
  }, [channel, preset, customFrom, customTo]);

  const loadWithdrawals = useCallback(async () => {
    const token = await AsyncStorage.getItem('accessToken');
    if (!token) return;
    try {
      const res = await axios.get<WithdrawRow[]>(`${API_BASE}/drivers/me/withdrawal-requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setWithdrawals(Array.isArray(res.data) ? res.data : []);
    } catch {
      setWithdrawals([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
      void loadWithdrawals();
    }, [loadProfile, loadWithdrawals]),
  );

  useEffect(() => {
    void loadEarnings();
  }, [loadEarnings]);

  const balance = driver?.account?.balance ?? 0;
  const deliveries = driver?.account?.completedDeliveries ?? 0;
  const negative = balance < 0;

  const displayTotal = useMemo(() => {
    if (!earnings) return 0;
    return earnings.totals.combined;
  }, [earnings]);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') setShowCustom(false);
    else setShowCustom(true);
  };

  const validateWdForm = (): number | null => {
    const amt = parseFloat((wdAmount || '').replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert(t('common.invalidAmount'), t('common.enterValidAmount'));
      return null;
    }
    const totalDebit = wdQuote?.totalCoins ?? amt;
    if (totalDebit > balance) {
      Alert.alert(t('wallet.insufficientBalance'), t('wallet.insufficientBalanceBody'));
      return null;
    }
    if (wdPayout === 'BANK_TRANSFER') {
      if (!wdBankHolder.trim() || !wdBankName.trim() || !wdBankRef.trim()) {
        Alert.alert(t('bankDetails.title'), t('bankDetails.required'));
        return null;
      }
    }
    return amt;
  };

  const goWdPreview = async () => {
    const amt = validateWdForm();
    if (amt == null) return;
    const token = await AsyncStorage.getItem('accessToken');
    if (!token) return;
    setWdQuoteLoading(true);
    try {
      const { data: q } = await axios.get<WithdrawQuote>(
        `${API_BASE}/drivers/me/withdrawal-requests/quote?amount=${encodeURIComponent(String(amt))}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (q.totalCoins > q.spendableCoins) {
        Alert.alert(
          t('wallet.insufficientBalance'),
          t('wallet.insufficientBalanceBody'),
        );
        return;
      }
      if (q.netPayoutCoins <= 0) {
        Alert.alert(t('wallet.amountTooSmall'), t('common.enterValidAmount'));
        return;
      }
      setWdQuote(q);
      setWdStep('preview');
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' && e !== null && 'response' in e &&
        typeof (e as { response?: { data?: { message?: string } } }).response?.data?.message === 'string'
          ? (e as { response: { data: { message: string } } }).response.data.message
          : e instanceof Error ? e.message : t('common.operationFailed');
      Alert.alert(t('common.error'), msg);
    } finally {
      setWdQuoteLoading(false);
    }
  };

  const submitWithdraw = async () => {
    const amt = validateWdForm();
    if (amt == null) return;
    const token = await AsyncStorage.getItem('accessToken');
    if (!token) return;
    setWdBusy(true);
    try {
      const body: Record<string, unknown> = {
        amount: amt,
        payoutMethod: wdPayout,
        description: wdNote.trim() || undefined,
      };
      if (wdPayout === 'BANK_TRANSFER') {
        body.payoutBankHolderName = wdBankHolder.trim();
        body.payoutBankName = wdBankName.trim();
        body.payoutBankAccountRef = wdBankRef.trim();
        body.saveBankDetailsToProfile = wdSaveBank;
      }
      await axios.post(`${API_BASE}/drivers/me/withdrawal-requests`, body, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setWdModal(false);
      setWdStep('form');
      setWdAmount('');
      setWdNote('');
      setWdBankHolder('');
      setWdBankName('');
      setWdBankRef('');
      setWdSaveBank(false);
      setWdQuote(null);
      Alert.alert(t('wallet.requestSubmitted'), t('wallet.withdrawalSubmitted'));
      void loadProfile();
      void loadWithdrawals();
    } catch (e: unknown) {
      const msg =
        typeof e === 'object' &&
        e !== null &&
        'response' in e &&
        typeof (e as { response?: { data?: { message?: string } } }).response?.data?.message === 'string'
          ? (e as { response: { data: { message: string } } }).response.data.message
          : e instanceof Error
            ? e.message
            : t('common.operationFailed');
      Alert.alert(t('common.error'), msg);
    } finally {
      setWdBusy(false);
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
            setWdCancelling(requestId);
            try {
              await driverPayoutService.cancelWithdrawal(requestId);
              void loadProfile();
              void loadWithdrawals();
            } catch (e: unknown) {
              Alert.alert(t('common.error'), e instanceof Error ? e.message : t('common.operationFailed'));
            } finally {
              setWdCancelling(null);
            }
          },
        },
      ],
    );
  };

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadProfile();
              void loadEarnings();
              void loadWithdrawals();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={[styles.hero, { backgroundColor: colors.primary }]}>
          <View style={styles.heroTopRow}>
            <View style={[styles.heroBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Ionicons name="wallet-outline" size={14} color="#fff" />
              <Text style={styles.heroBadgeText}>{t('common.account')}</Text>
            </View>
          </View>
          <Text style={styles.heroLabel}>{t('wallet.available')}</Text>
          <Text style={styles.heroAmount} numberOfLines={1}>
            {balance.toFixed(2)}
            <Text style={styles.heroCurrency}> {t('wallet.coins')}</Text>
          </Text>
          {driver?.account?.balanceAsLocalFiat != null && driver.account.currencySymbol ? (
            <Text style={styles.heroFiatHint}>
              ≈ {driver.account.balanceAsLocalFiat.toFixed(2)} {driver.account.currencySymbol}
            </Text>
          ) : null}
          <Text style={styles.heroHint}>
            {negative ? t('wallet.insufficientBalanceBody') : `${deliveries} ${t('driverEarnings.completedDeliveries')}`}
          </Text>
          <View style={styles.walletQuickWrap}>
            <View style={styles.walletQuickRow}>
              <TouchableOpacity
                style={styles.walletQuickItem}
                onPress={() => router.push('/(driver)/buy-coins')}
                activeOpacity={0.85}
              >
                <View style={styles.walletQuickCircle}>
                  <Text style={styles.walletQuickGlyph}>+</Text>
                </View>
                <Text style={styles.walletQuickLabel}>{t('wallet.txTypes.TOP_UP')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.walletQuickItem}
                onPress={() => {
                  setWalletQuickMore(false);
                  push('/(driver)/send-coins');
                }}
                activeOpacity={0.85}
              >
                <View style={styles.walletQuickCircle}>
                  <Ionicons name="arrow-forward" size={22} color="rgba(255,255,255,0.95)" />
                </View>
                <Text style={styles.walletQuickLabel}>{t('sendCoins.send')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.walletQuickItem}
                onPress={() => Alert.alert(t('wallet.scan'), t('wallet.scanComingSoon'))}
                activeOpacity={0.85}
              >
                <View style={styles.walletQuickCircle}>
                  <Ionicons name="scan-outline" size={22} color="rgba(255,255,255,0.95)" />
                </View>
                <Text style={styles.walletQuickLabel}>{t('wallet.scan')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.walletQuickItem}
                onPress={() => setWalletQuickMore((v) => !v)}
                activeOpacity={0.85}
              >
                <View style={styles.walletQuickCircle}>
                  <Text style={styles.walletQuickGlyph}>···</Text>
                </View>
                <Text style={styles.walletQuickLabel}>{t('common.menu')}</Text>
              </TouchableOpacity>
            </View>
            {walletQuickMore && (
              <View style={[styles.walletQuickRow, styles.walletQuickMoreRow]}>
                <TouchableOpacity
                  style={styles.walletQuickItem}
                  onPress={() => {
                    setWalletQuickMore(false);
                    setWdStep('form');
                    setWdModal(true);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.walletQuickCircle}>
                    <Text style={styles.walletQuickGlyph}>−</Text>
                  </View>
                  <Text style={styles.walletQuickLabel}>{t('wallet.requestWithdrawal')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.walletQuickItem}
                  onPress={() => {
                    setWalletQuickMore(false);
                    push('/(driver)/support');
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.walletQuickCircle}>
                    <Text style={styles.walletQuickGlyph}>?</Text>
                  </View>
                  <Text style={styles.walletQuickLabel}>{t('driverMyOrders.help')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.walletQuickItem}
                  onPress={() => {
                    setWalletQuickMore(false);
                    Alert.alert(t('wallet.news'), t('wallet.newsComingSoon'));
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.walletQuickCircle}>
                    <Ionicons name="newspaper-outline" size={20} color="rgba(255,255,255,0.95)" />
                  </View>
                  <Text style={styles.walletQuickLabel}>{t('wallet.news')}</Text>
                </TouchableOpacity>
                <View style={styles.walletQuickItem} />
              </View>
            )}
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <GameEntrySection placement="DRIVER_EARNINGS" role="driver" />
        </View>

        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('driverEarnings.title')}</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {t('driverEarnings.breakdown')}
          </Text>

          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>{t('driverTransactions.title')}</Text>
          <View style={styles.chipRow}>
            {(['all', 'wallet', 'cash'] as Channel[]).map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.chip,
                  { borderColor: colors.border, backgroundColor: channel === c ? colors.primary : colors.surfaceVariant },
                ]}
                onPress={() => setChannel(c)}
              >
                <Text style={{ color: channel === c ? '#fff' : colors.text, fontWeight: '700', textTransform: 'capitalize' }}>
                  {c === 'all' ? t('driverTransactions.all') : c === 'wallet' ? t('driverMyOrders.wallet') : t('driverMyOrders.cash')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>{t('driverEarnings.thisWeek')}</Text>
          <View style={styles.chipRow}>
            {(
              [
                ['today', t('driverEarnings.today')],
                ['week', t('driverEarnings.thisWeek')],
                ['month', t('driverEarnings.thisMonth')],
                ['all_time', t('driverEarnings.total')],
                ['custom', t('common.edit')],
              ] as [Preset, string][]
            ).map(([p, label]) => (
              <TouchableOpacity
                key={p}
                style={[
                  styles.chip,
                  { borderColor: colors.border, backgroundColor: preset === p ? colors.primary : colors.surfaceVariant },
                ]}
                onPress={() => applyPreset(p)}
              >
                <Text style={{ color: preset === p ? '#fff' : colors.text, fontWeight: '600', fontSize: 12 }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {showCustom && (
            <View style={{ marginTop: 10, gap: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>YYYY-MM-DD</Text>
              <TextInput
                style={[styles.dateInp, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
                placeholder={t('common.next')}
                placeholderTextColor={colors.textTertiary}
                value={customFrom}
                onChangeText={setCustomFrom}
              />
              <TextInput
                style={[styles.dateInp, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
                placeholder={t('common.back')}
                placeholderTextColor={colors.textTertiary}
                value={customTo}
                onChangeText={setCustomTo}
              />
              <TouchableOpacity
                style={[styles.applyBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  if (!customFrom || !customTo) {
                    Alert.alert(t('common.error'), t('common.enterValidAmount'));
                    return;
                  }
                  setPreset('custom');
                  void loadEarnings();
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{t('common.confirm')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {earnLoading ? (
            <ActivityIndicator style={{ marginTop: 16 }} color={colors.primary} />
          ) : earnings ? (
            <View style={{ marginTop: 14 }}>
              <View style={[styles.totalBanner, { backgroundColor: colors.surfaceVariant }]}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('driverEarnings.total')}</Text>
                <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>
                  {displayTotal.toFixed(2)} {earnings.currency}
                </Text>
                <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 4 }}>
                  {t('driverMyOrders.cash')} {earnings.totals.cash.toFixed(2)} · {t('driverMyOrders.wallet')} {earnings.totals.wallet.toFixed(2)}
                </Text>
              </View>
              <FlatList
                data={earnings.items}
                keyExtractor={(it) => it.id}
                scrollEnabled={false}
                ListEmptyComponent={
                  <Text style={{ color: colors.textTertiary, marginTop: 12 }}>{t('driverEarnings.empty')}</Text>
                }
                renderItem={({ item }) => (
                  <View style={[styles.rowLine, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={2}>
                        {item.label}
                      </Text>
                      <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 2 }}>
                        {item.channel.toUpperCase()} · {new Date(item.at).toLocaleString()}
                      </Text>
                    </View>
                    <Text style={{ color: item.channel === 'cash' ? '#16a34a' : colors.primary, fontWeight: '800' }}>
                      +{item.amount.toFixed(2)}
                    </Text>
                  </View>
                )}
              />
            </View>
          ) : null}
        </View>

        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('wallet.requestWithdrawal')}</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {t('wallet.insufficientBalanceBody')}
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }, balance <= 0 && { opacity: 0.45 }]}
            disabled={balance <= 0}
            onPress={() => {
              setWdStep('form');
              setWdModal(true);
            }}
          >
            <Text style={styles.primaryBtnText}>{t('wallet.requestWithdrawal')}</Text>
          </TouchableOpacity>
          {withdrawals.length > 0 && (
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>{t('driverTransactions.title')}</Text>
              {withdrawals.map((w) => (
                <View key={w.id} style={[styles.wdRow, { borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>
                      {w.amount.toFixed(2)} <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textSecondary }}>{t('wallet.coins')}</Text>
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                      {w.payoutMethod}
                    </Text>
                    {w.payoutMethod === 'BANK_TRANSFER' && (w.payoutBankName || w.payoutBankAccountRef) ? (
                      <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 4 }}>
                        {w.payoutBankName ? `${w.payoutBankName} · ` : ''}
                        {w.payoutBankAccountRef || ''}
                      </Text>
                    ) : null}
                    {(w.feeAmount ?? 0) > 0 ? (
                      <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 4 }}>
                        {t('orderDetail.fee')}: {(w.feeAmount ?? 0).toFixed(2)} {t('wallet.coins').toLowerCase()}
                      </Text>
                    ) : null}
                    {w.descriptionFromStaff ? (
                      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>
                        {t('support.title')}: {w.descriptionFromStaff}
                      </Text>
                    ) : null}
                    {w.status === 'REJECTED' && w.rejectionReason ? (
                      <Text style={{ color: '#b91c1c', fontSize: 11, marginTop: 4, fontWeight: '600' }}>
                        {t('driverDocuments.statusRejected')}: {w.rejectionReason}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{w.status}</Text>
                    {w.status === 'PENDING' ? (
                      wdCancelling === w.id ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : (
                        <TouchableOpacity onPress={() => cancelWithdrawalRequest(w.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 13 }}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                      )
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('common.menu')}</Text>
          <TouchableOpacity
            style={[styles.actionRow, { backgroundColor: colors.surfaceVariant }]}
            onPress={() => push('/(driver)/transactions')}
          >
            <Ionicons name="receipt-outline" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>{t('wallet.viewTransactionHistory')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={wdModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.wdModalScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
              {wdStep === 'form' ? (
                <>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>{t('wallet.requestWithdrawal')}</Text>
                  <Text style={{ color: colors.textTertiary, marginBottom: 10, fontSize: 13 }}>
                    {t('customerProfile.accountBalance')} {balance.toFixed(2)} {t('wallet.coins')}
                  </Text>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>{t('wallet.amountCoins')}</Text>
                  <TextInput
                    style={[styles.dateInp, { color: colors.text, borderColor: colors.border }]}
                    keyboardType="decimal-pad"
                    value={wdAmount}
                    onChangeText={setWdAmount}
                    placeholder="0.00"
                    placeholderTextColor={colors.textTertiary}
                  />
                  <Text style={{ color: colors.text, fontWeight: '600', marginTop: 10 }}>{t('wallet.receiveAs')}</Text>
                  <View style={styles.chipRow}>
                    <TouchableOpacity
                      style={[styles.chip, wdPayout === 'BANK_TRANSFER' && { backgroundColor: colors.primary }]}
                      onPress={() => setWdPayout('BANK_TRANSFER')}
                    >
                      <Text style={{ color: wdPayout === 'BANK_TRANSFER' ? '#fff' : colors.text, fontWeight: '700' }}>{t('wallet.bank')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.chip, wdPayout === 'CASH' && { backgroundColor: colors.primary }]}
                      onPress={() => setWdPayout('CASH')}
                    >
                      <Text style={{ color: wdPayout === 'CASH' ? '#fff' : colors.text, fontWeight: '700' }}>{t('wallet.cash')}</Text>
                    </TouchableOpacity>
                  </View>
                  {wdPayout === 'BANK_TRANSFER' && (
                    <>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8, marginBottom: 6 }}>
                        {t('bankDetails.notes')}
                      </Text>
                      <Text style={{ color: colors.text, fontWeight: '600', marginTop: 6 }}>{t('bankDetails.accountHolder')}</Text>
                      <TextInput
                        style={[styles.dateInp, { color: colors.text, borderColor: colors.border }]}
                        value={wdBankHolder}
                        onChangeText={setWdBankHolder}
                        placeholder={t('bankDetails.accountHolder')}
                        placeholderTextColor={colors.textTertiary}
                      />
                      <Text style={{ color: colors.text, fontWeight: '600', marginTop: 8 }}>{t('bankDetails.bankName')}</Text>
                      <TextInput
                        style={[styles.dateInp, { color: colors.text, borderColor: colors.border }]}
                        value={wdBankName}
                        onChangeText={setWdBankName}
                        placeholder={t('bankDetails.bankName')}
                        placeholderTextColor={colors.textTertiary}
                      />
                      <Text style={{ color: colors.text, fontWeight: '600', marginTop: 8 }}>{t('bankDetails.iban')} / {t('bankDetails.rib')}</Text>
                      <TextInput
                        style={[styles.dateInp, { color: colors.text, borderColor: colors.border }]}
                        value={wdBankRef}
                        onChangeText={setWdBankRef}
                        placeholder={t('bankDetails.iban')}
                        placeholderTextColor={colors.textTertiary}
                        autoCapitalize="characters"
                      />
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                        <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>{t('common.save')}</Text>
                        <Switch value={wdSaveBank} onValueChange={setWdSaveBank} />
                      </View>
                    </>
                  )}
                  <Text style={{ color: colors.text, fontWeight: '600', marginTop: 10 }}>{t('bankDetails.notes')} ({t('common.optional')})</Text>
                  <TextInput
                    style={[styles.dateInp, { height: 72, textAlignVertical: 'top', color: colors.text, borderColor: colors.border }]}
                    multiline
                    value={wdNote}
                    onChangeText={setWdNote}
                  />
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                    <TouchableOpacity
                      style={[styles.chip, { flex: 1, justifyContent: 'center' }]}
                      onPress={() => {
                        setWdModal(false);
                        setWdStep('form');
                        setWdAmount('');
                        setWdNote('');
                        setWdBankHolder('');
                        setWdBankName('');
                        setWdBankRef('');
                        setWdSaveBank(false);
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: '700' }}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { flex: 1, marginTop: 0 }, wdQuoteLoading && { opacity: 0.6 }]}
                      onPress={() => void goWdPreview()}
                      disabled={wdQuoteLoading}
                    >
                      {wdQuoteLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.primaryBtnText}>{t('common.next')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>{t('common.confirm')}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>{t('customerProfile.accountBalance')}</Text>
                  <Text style={{ color: colors.text, fontSize: 32, fontWeight: '800', marginTop: 6 }}>
                    {parseFloat((wdAmount || '').replace(',', '.') || '0').toFixed(2)}{' '}
                    <Text style={{ fontSize: 18, fontWeight: '600', color: colors.textSecondary }}>{t('wallet.coins')}</Text>
                  </Text>
                  {wdQuote && wdQuote.feeCoins > 0 ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 6 }}>
                      {t('orderDetail.fee')}: {wdQuote.feeCoins.toFixed(2)} {t('wallet.coins').toLowerCase()}
                      {wdQuote.feeBps > 0 ? ` (${wdQuote.feeBps / 100}%)` : ''}
                    </Text>
                  ) : null}
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 10 }}>{t('buyCoins.youReceive')}</Text>
                  <Text style={{ color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 4 }}>
                    {(wdQuote?.netPayoutCoins ?? parseFloat((wdAmount || '').replace(',', '.') || '0')).toFixed(2)}{' '}
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.textSecondary }}>{t('wallet.coins')}</Text>
                  </Text>
                  {wdQuote?.amountFiat != null ? (
                    <Text style={{ color: colors.textTertiary, fontSize: 14, marginTop: 2 }}>
                      ≈ {wdQuote.currencySymbol || wdQuote.currencyCode} {wdQuote.amountFiat.toFixed(2)}
                    </Text>
                  ) : null}
                  <Text style={{ color: colors.textTertiary, fontSize: 13, marginTop: 10 }}>
                    {t('customerProfile.accountBalance')} {balance.toFixed(2)} {t('wallet.coins')}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 8 }}>
                    {wdPayout === 'CASH' ? t('wallet.cash') : t('wallet.bank')}
                    {wdPayout === 'BANK_TRANSFER' && wdBankName.trim() ? ` · ${wdBankName.trim()}` : ''}
                  </Text>
                  {wdNote.trim() ? (
                    <Text style={{ color: colors.textTertiary, fontSize: 13, marginTop: 6 }}>{t('bankDetails.notes')}: {wdNote.trim()}</Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                    <TouchableOpacity
                      style={[styles.chip, { flex: 1, justifyContent: 'center' }]}
                      onPress={() => {
                        setWdStep('form');
                        setWdQuote(null);
                      }}
                      disabled={wdBusy}
                    >
                      <Text style={{ color: colors.text, fontWeight: '700' }}>{t('common.back')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { flex: 1, marginTop: 0 }, wdBusy && { opacity: 0.6 }]}
                      onPress={submitWithdraw}
                      disabled={wdBusy}
                    >
                      {wdBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{t('common.confirm')}</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
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
  heroTopRow: { flexDirection: 'row', marginBottom: 12 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  heroBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heroLabel: { color: 'rgba(255,255,255,0.52)', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  heroAmount: { color: 'rgba(255,255,255,0.95)', fontSize: 36, fontWeight: '800' },
  heroCurrency: { fontSize: 17, fontWeight: '600', color: 'rgba(255,255,255,0.58)' },
  heroFiatHint: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
  },
  heroHint: { color: 'rgba(255,255,255,0.78)', fontSize: 13, marginTop: 10 },
  walletQuickWrap: { width: '100%', marginTop: 14, paddingHorizontal: 4 },
  walletQuickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
  },
  walletQuickMoreRow: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.25)',
  },
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
  panel: {
    borderRadius: 18,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 6 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  filterLabel: { fontSize: 12, fontWeight: '700', marginTop: 8, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  totalBanner: { borderRadius: 14, padding: 14, marginBottom: 8 },
  rowLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  primaryBtn: { marginTop: 12, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14 },
  actionTitle: { fontSize: 15, fontWeight: '700' },
  wdRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    marginBottom: 8,
  },
  dateInp: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 6 },
  applyBtn: { marginTop: 8, padding: 12, borderRadius: 10, alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingVertical: 24 },
  wdModalScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 32 },
  modalCard: { borderRadius: 16, padding: 18 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
});
