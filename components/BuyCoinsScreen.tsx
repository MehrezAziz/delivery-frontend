import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import * as WebBrowser from 'expo-web-browser';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import {
  coinTopupService,
  type CoinTopUpPending,
  type CoinTopUpQuote,
} from '../services/api/coin-topup.service';
import { ApiError } from '../services/api/client';
import { ThemedConfirmDialog } from './ThemedConfirmDialog';
import { parseWalletIdParam } from '../utils/walletNavigation';

type PackPreset = CoinTopUpQuote['presets'][number];

function formatFiat(price: number, q: CoinTopUpQuote) {
  if (!Number.isFinite(price)) return '—';
  const digits = q.currencyCode === 'TND' ? 3 : 2;
  const n = price.toFixed(digits);
  const sym = (q.currencySymbol?.trim() ?? q.currencyCode).replace(/,/g, '');
  return `${sym} ${n}`.replace(/,/g, '');
}

/** Slider / quick packs: clamp to min..max (5k). */
function clampSliderCoins(v: number, q: CoinTopUpQuote) {
  const n = Math.round(v * 100) / 100;
  return Math.min(q.maxCoins, Math.max(q.minCoins, n));
}

/** Free-text input: minimum only (no upper cap). */
function clampInputCoins(v: number, q: CoinTopUpQuote) {
  if (!Number.isFinite(v)) return q.minCoins;
  const n = Math.round(v * 100) / 100;
  return Math.max(q.minCoins, n);
}

function isPopularPack(pack: { badge?: string }) {
  const b = (pack.badge ?? '').toLowerCase();
  return b.includes('most') || b.includes('popular');
}

function formatCoinsDisplay(coins: number) {
  return coins % 1 === 0 ? coins.toLocaleString('en-US') : coins.toFixed(2);
}

function QuickPackCard({
  pack,
  quote,
  selected,
  popular,
  busy,
  onSelect,
  colors,
  isDark,
  popularAccent,
  popularBg,
  popularBorder,
  t,
}: {
  pack: PackPreset;
  quote: CoinTopUpQuote;
  selected: boolean;
  popular: boolean;
  busy: boolean;
  onSelect: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  isDark: boolean;
  popularAccent: string;
  popularBg: string;
  popularBorder: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const fiatPack = pack.coins / quote.coinsPerFiatUnit;
  const accent = popular ? popularAccent : colors.primary;
  const borderColor = selected ? colors.primary : popular ? popularBorder : colors.border;
  const cardBg = popular ? popularBg : selected ? (isDark ? 'rgba(14,165,233,0.1)' : '#f0f9ff') : colors.card;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected }}
      activeOpacity={0.9}
      disabled={busy}
      onPress={onSelect}
      style={[
        packStyles.card,
        popular && packStyles.cardFeatured,
        {
          borderColor,
          backgroundColor: cardBg,
          shadowColor: popular ? popularAccent : isDark ? '#000' : '#0f172a',
        },
      ]}
    >
      {popular || pack.badge ? (
        <View
          style={[
            packStyles.badgePill,
            {
              backgroundColor: popular ? popularAccent : colors.primary + '18',
              alignSelf: 'flex-start',
            },
          ]}
        >
          {popular ? <Ionicons name="star" size={11} color="#fff" style={{ marginRight: 2 }} /> : null}
          <Text style={[packStyles.badgeText, { color: popular ? '#fff' : colors.primary }]}>
            {pack.badge ?? t('buyCoins.quickPacks')}
          </Text>
        </View>
      ) : null}

      <View style={packStyles.headerRow}>
        <View style={packStyles.headerText}>
          <Text style={[packStyles.packTitle, { color: colors.text }]}>{pack.label}</Text>
          {pack.sub ? (
            <Text style={[packStyles.packSub, { color: colors.textSecondary }]}>{pack.sub}</Text>
          ) : null}
        </View>
        <View
          style={[
            packStyles.iconBubble,
            { backgroundColor: accent + (isDark ? '28' : '1a'), borderColor: accent + '44' },
          ]}
        >
          <Ionicons name={popular ? 'flash' : 'wallet-outline'} size={22} color={accent} />
        </View>
      </View>

      <View style={[packStyles.amountBox, { backgroundColor: isDark ? 'rgba(15,23,42,0.45)' : 'rgba(255,255,255,0.72)' }]}>
        <View>
          <Text style={[packStyles.amountLabel, { color: colors.textTertiary }]}>{t('buyCoins.youReceive')}</Text>
          <Text style={[packStyles.amountCoins, { color: colors.text }]}>
            {formatCoinsDisplay(pack.coins)}{' '}
            <Text style={[packStyles.amountCoinsUnit, { color: accent }]}>{t('buyCoins.coins')}</Text>
          </Text>
        </View>
        <View style={packStyles.amountRight}>
          <Text style={[packStyles.amountLabel, { color: colors.textTertiary }]}>{t('buyCoins.youPay')}</Text>
          <Text style={[packStyles.amountFiat, { color: colors.text }]}>{formatFiat(fiatPack, quote)}</Text>
        </View>
      </View>

      <View
        style={[
          packStyles.cta,
          {
            backgroundColor: selected || popular ? accent : colors.surfaceVariant,
            borderColor: selected || popular ? accent : colors.border,
          },
        ]}
      >
        <Text style={[packStyles.ctaText, { color: selected || popular ? '#fff' : colors.text }]}>
          {selected ? t('common.select') : t('buyCoins.buyNow')}
        </Text>
        <Ionicons name={selected ? 'checkmark-circle' : 'arrow-forward'} size={18} color={selected || popular ? '#fff' : colors.textSecondary} />
      </View>
    </TouchableOpacity>
  );
}

const packStyles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  cardFeatured: {
    borderWidth: 2,
    paddingTop: 22,
    shadowOpacity: 0.2,
    shadowRadius: 22,
    elevation: 8,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 12,
  },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerText: { flex: 1 },
  packTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  packSub: { marginTop: 6, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountBox: {
    marginTop: 16,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  amountLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  amountCoins: { marginTop: 4, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  amountCoinsUnit: { fontSize: 16, fontWeight: '800' },
  amountRight: { alignItems: 'flex-end' },
  amountFiat: { marginTop: 4, fontSize: 18, fontWeight: '800' },
  cta: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  ctaText: { fontSize: 15, fontWeight: '800' },
});

export default function BuyCoinsScreen() {
  const router = useRouter();
  const { walletId: walletIdParam } = useLocalSearchParams<{ walletId?: string }>();
  const selectedWalletId = parseWalletIdParam(walletIdParam);
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const role = useCoinTopupRole();
  const { buyCoinsResult: resultPath } = coinTopupRoutes(role);

  const [quote, setQuote] = useState<CoinTopUpQuote | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [coins, setCoins] = useState(500);
  const [coinsDraft, setCoinsDraft] = useState('500');
  const [coinsFieldFocused, setCoinsFieldFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [pendingList, setPendingList] = useState<CoinTopUpPending[]>([]);
  const [removingTrackingId, setRemovingTrackingId] = useState<string | null>(null);
  const [removePendingTarget, setRemovePendingTarget] = useState<CoinTopUpPending | null>(null);
  const [checkoutPreview, setCheckoutPreview] = useState<{
    coins: number;
    fiat: number;
  } | null>(null);

  const pendingRef = useRef<{ trackingId: string; paymentId: string } | null>(null);
  const verifyingRef = useRef(false);

  const syncDraftFromCoins = useCallback((c: number, q: CoinTopUpQuote) => {
    const v = coinsFieldFocused ? clampInputCoins(c, q) : clampSliderCoins(c, q);
    setCoinsDraft(v % 1 !== 0 ? v.toFixed(2) : String(Math.round(v)));
  }, [coinsFieldFocused]);

  const loadPending = useCallback(async () => {
    try {
      const rows = await coinTopupService.pending();
      setPendingList(rows);
    } catch {
      setPendingList([]);
    }
  }, []);

  const fetchQuote = useCallback(async () => {
    try {
      setLoadErr(null);
      setLoadingQuote(true);
      const q = await coinTopupService.quote(selectedWalletId);
      setQuote(q);
      const start = clampSliderCoins(q.presets?.[1]?.coins ?? 2000, q);
      setCoins(start);
      syncDraftFromCoins(start, q);
      await loadPending();
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : t('common.something_went_wrong');
      setLoadErr(msg);
    } finally {
      setLoadingQuote(false);
    }
  }, [loadPending, syncDraftFromCoins, t, selectedWalletId]);

  useEffect(() => {
    void fetchQuote();
  }, [fetchQuote]);

  useEffect(() => {
    if (!quote || coinsFieldFocused) return;
    syncDraftFromCoins(coins, quote);
  }, [coins, coinsFieldFocused, quote, syncDraftFromCoins]);

  function applyCoinsFromDraft() {
    if (!quote) return;
    const normalized = coinsDraft.replace(',', '.').replace(/[^\d.]/g, '');
    const n = parseFloat(normalized);
    if (!Number.isFinite(n)) {
      syncDraftFromCoins(coins, quote);
      return;
    }
    setCoins(clampInputCoins(n, quote));
  }

  const goToResult = useCallback(
    (status: 'success' | 'failed', extra?: { coins?: number; fiat?: number }) => {
      router.replace({
        pathname: resultPath,
        params: {
          status,
          role,
          coins: extra?.coins != null ? String(extra.coins) : undefined,
          fiat: extra?.fiat != null ? String(extra.fiat) : undefined,
          currencyCode: quote?.currencyCode ?? 'TND',
        },
      });
    },
    [quote?.currencyCode, resultPath, role, router],
  );

  const tryVerifyPending = useCallback(async () => {
    const p = pendingRef.current;
    if (!p || verifyingRef.current) return;
    verifyingRef.current = true;
    try {
      const res = await coinTopupService.verify({
        trackingId: p.trackingId,
        paymentId: p.paymentId,
      });
      if (res.status === 'FAILED') {
        pendingRef.current = null;
        const fiat = quote ? res.coins / quote.coinsPerFiatUnit : undefined;
        goToResult('failed', { coins: res.coins, fiat });
        void loadPending();
        return;
      }
      if (res.status !== 'COMPLETED' && !res.fulfilled) return;
      pendingRef.current = null;
      const fiat = quote ? res.coins / quote.coinsPerFiatUnit : undefined;
      goToResult('success', { coins: res.coins, fiat });
      void loadPending();
    } catch {
      /* network — retry later */
    } finally {
      verifyingRef.current = false;
    }
  }, [goToResult, loadPending, quote]);

  useFocusEffect(
    useCallback(() => {
      void tryVerifyPending();
      void loadPending();
    }, [loadPending, tryVerifyPending]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void tryVerifyPending();
    });
    return () => sub.remove();
  }, [tryVerifyPending]);

  const fiatNow = useMemo(() => {
    if (!quote) return NaN;
    return coins / quote.coinsPerFiatUnit;
  }, [coins, quote]);

  const subtitle = quote?.flouciNote;

  const openFlouciCheckout = useCallback(
    async (init: { trackingId: string; paymentId: string; checkoutUrl: string; coinsQuoted: number }) => {
      pendingRef.current = { trackingId: init.trackingId, paymentId: init.paymentId };
      await WebBrowser.openBrowserAsync(init.checkoutUrl);
      await tryVerifyPending();
    },
    [tryVerifyPending],
  );

  const startCheckout = useCallback(
    async (amount: number) => {
      if (!quote) return;
      if (!quote.flouciReady) {
        Alert.alert(t('buyCoins.unavailable'), subtitle || t('buyCoins.unavailable'));
        return;
      }
      const normalized = clampInputCoins(amount, quote);
      setCoins(normalized);
      syncDraftFromCoins(normalized, quote);
      const fiat = normalized / quote.coinsPerFiatUnit;
      setCheckoutPreview({ coins: normalized, fiat });
    },
    [quote, subtitle, syncDraftFromCoins],
  );

  const confirmCheckoutPreview = useCallback(async () => {
    if (!checkoutPreview || !quote) return;
    setCheckoutPreview(null);
    setBusy(true);
    try {
      const init = await coinTopupService.initFlouci(checkoutPreview.coins, selectedWalletId);
      await openFlouciCheckout(init);
    } catch (e: unknown) {
      pendingRef.current = null;
      const msg = e instanceof ApiError ? e.message : t('common.something_went_wrong');
      Alert.alert(t('buyCoins.checkout'), msg);
    } finally {
      setBusy(false);
    }
  }, [checkoutPreview, openFlouciCheckout, quote, selectedWalletId, t]);

  const confirmRemovePending = useCallback(async () => {
    const row = removePendingTarget;
    if (!row) return;
    setRemovingTrackingId(row.trackingId);
    try {
      await coinTopupService.cancelPending(row.trackingId);
      if (pendingRef.current?.trackingId === row.trackingId) {
        pendingRef.current = null;
      }
      setPendingList((prev) => prev.filter((p) => p.trackingId !== row.trackingId));
      setRemovePendingTarget(null);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : t('buyCoins.removeFailed');
      Alert.alert(t('buyCoins.removeFailed'), msg);
    } finally {
      setRemovingTrackingId(null);
    }
  }, [removePendingTarget, t]);

  const removePendingMessage = useMemo(() => {
    if (!removePendingTarget) return '';
    const fiatDigits = quote?.currencyCode === 'TND' ? 3 : 2;
    return `${removePendingTarget.coins.toFixed(2)} ${t('buyCoins.coins')} · ${removePendingTarget.fiatTotal.toFixed(fiatDigits)} ${removePendingTarget.currencyCode}\n\n${t('buyCoins.sessionNotResumable')}`;
  }, [quote?.currencyCode, removePendingTarget, t]);

  const resumePending = useCallback(
    async (row: CoinTopUpPending) => {
      if (!row.checkoutUrl || !row.paymentId) {
        Alert.alert(t('buyCoins.unavailable'), t('buyCoins.sessionNotResumable'));
        return;
      }
      setBusy(true);
      try {
        await openFlouciCheckout({
          trackingId: row.trackingId,
          paymentId: row.paymentId,
          checkoutUrl: row.checkoutUrl,
          coinsQuoted: row.coins,
        });
      } finally {
        setBusy(false);
      }
    },
    [openFlouciCheckout, t],
  );

  const popularAccent = isDark ? '#fbbf24' : '#d97706';
  const popularBg = isDark ? 'rgba(251,191,36,0.14)' : '#fffbeb';
  const popularBorder = isDark ? 'rgba(251,191,36,0.55)' : 'rgba(217,119,6,0.45)';
  const modalOverlayTint = isDark ? 'rgba(0,0,0,0.68)' : 'rgba(15,23,42,0.48)';

  if (loadingQuote && !quote) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 12, gap: 14 }]}>
        <View style={[styles.skeletonHero, { backgroundColor: colors.skeleton }]} />
        <View style={[styles.skeletonCard, { backgroundColor: colors.skeleton }]} />
        <View style={[styles.skeletonPack, { backgroundColor: colors.skeleton }]} />
        <View style={[styles.skeletonPack, { backgroundColor: colors.skeleton, height: 140 }]} />
      </View>
    );
  }

  if (loadErr || !quote) {
    return (
      <View style={[styles.fill, styles.centerPad, { backgroundColor: colors.background, paddingTop: 24 }]}>
        <View style={[styles.errorIconWrap, { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2' }]}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.danger ?? '#dc2626'} />
        </View>
        <Text style={[styles.errorTitle, { color: colors.text }]}>{t('buyCoins.unavailable')}</Text>
        <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>{loadErr}</Text>
        <TouchableOpacity
          style={[styles.retryBtn, { backgroundColor: colors.primary, marginTop: 24 }]}
          onPress={() => void fetchQuote()}
        >
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={styles.retryBtnText}>{t('buyCoins.tryAgain')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const rateLabel =
    quote.coinsPerFiatUnit % 1 === 0
      ? quote.coinsPerFiatUnit.toLocaleString('en-US')
      : quote.coinsPerFiatUnit.toFixed(2);

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          {/* Hero */}
          <View style={[styles.heroOuter, { shadowColor: isDark ? '#000' : colors.primary }]}>
            <View style={[styles.heroCard, { backgroundColor: isDark ? '#0369a1' : colors.primary }]}>
              <View style={styles.heroDecor1} />
              <View style={styles.heroDecor2} />
              <View style={styles.heroTopRow}>
                <View style={styles.heroIconWrap}>
                  <Ionicons name="sparkles" size={22} color="rgba(255,255,255,0.95)" />
                </View>
                <View style={[styles.heroStatusPill, { backgroundColor: quote.flouciReady ? 'rgba(16,185,129,0.25)' : 'rgba(251,191,36,0.25)' }]}>
                  <Ionicons
                    name={quote.flouciReady ? 'checkmark-circle' : 'time-outline'}
                    size={13}
                    color={quote.flouciReady ? '#6ee7b7' : '#fde68a'}
                  />
                  <Text style={[styles.heroStatusText, { color: quote.flouciReady ? '#d1fae5' : '#fef3c7' }]}>
                    {quote.flouciReady ? t('buyCoins.buyNow') : t('buyCoins.unavailable')}
                  </Text>
                </View>
              </View>
              <Text style={styles.heroTitle}>{t('buyCoins.title')}</Text>
              <Text style={styles.heroSub}>
                {t('buyCoins.payInPrefix')}{quote.currencyCode}{t('buyCoins.pricingFollowsRegion')}
              </Text>
              <View style={styles.heroRateRow}>
                <View style={styles.heroRatePill}>
                  <Ionicons name="swap-horizontal" size={14} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.heroRateText}>
                    1 {quote.currencyCode} = {rateLabel} {t('buyCoins.coins')}
                  </Text>
                </View>
                <View style={styles.heroRatePill}>
                  <Ionicons name="globe-outline" size={14} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.heroRateText}>{quote.currencyCode}</Text>
                </View>
              </View>
            </View>
          </View>

          {pendingList.length > 0 ? (
            <View style={[styles.pendingBlock, { borderColor: isDark ? 'rgba(251,191,36,0.35)' : '#fcd34d', backgroundColor: isDark ? 'rgba(251,191,36,0.08)' : '#fffbeb' }]}>
              <View style={styles.pendingHeader}>
                <View style={[styles.pendingHeaderIcon, { backgroundColor: isDark ? 'rgba(251,191,36,0.2)' : '#fef3c7' }]}>
                  <Ionicons name="hourglass-outline" size={18} color={popularAccent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pendingTitle, { color: colors.text }]}>{t('buyCoins.pendingPayments')}</Text>
                  <Text style={[styles.pendingHeaderSub, { color: colors.textSecondary }]}>
                    {pendingList.length} {pendingList.length === 1 ? 'session' : 'sessions'}
                  </Text>
                </View>
              </View>
              {pendingList.map((row) => {
                const removing = removingTrackingId === row.trackingId;
                return (
                  <View key={row.trackingId} style={[styles.pendingRow, { borderTopColor: isDark ? 'rgba(251,191,36,0.2)' : '#fde68a' }]}>
                    <View style={[styles.pendingCoinIcon, { backgroundColor: isDark ? 'rgba(14,165,233,0.15)' : colors.primaryLight }]}>
                      <Ionicons name="logo-bitcoin" size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pendingCoins, { color: colors.text }]}>{row.coins.toFixed(2)} {t('buyCoins.coins')}</Text>
                      <Text style={[styles.pendingFiat, { color: colors.textSecondary }]}>
                        {row.fiatTotal.toFixed(quote.currencyCode === 'TND' ? 3 : 2)} {row.currencyCode}
                      </Text>
                    </View>
                    <View style={styles.pendingActions}>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={t('buyCoins.removePending')}
                        disabled={busy || removing}
                        onPress={() => setRemovePendingTarget(row)}
                        style={[styles.pendingRemoveBtn, { borderColor: colors.border }]}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        {removing ? (
                          <ActivityIndicator size="small" color={colors.danger ?? '#dc2626'} />
                        ) : (
                          <Ionicons name="trash-outline" size={20} color={colors.danger ?? '#dc2626'} />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.pendingBtn, { backgroundColor: colors.primary }]}
                        disabled={busy || removing || !row.checkoutUrl}
                        onPress={() => void resumePending(row)}
                      >
                        <Text style={styles.pendingBtnText}>{t('buyCoins.completePayment')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {subtitle ? (
            <View
              style={[
                styles.noticeCard,
                {
                  backgroundColor: colors.card,
                  borderColor: quote.flouciReady ? colors.primary + '55' : '#fcd34d',
                  borderLeftWidth: 3,
                  borderLeftColor: quote.flouciReady ? colors.primary : '#f59e0b',
                },
              ]}
            >
              <View style={[styles.noticeIconWrap, { backgroundColor: quote.flouciReady ? colors.primaryLight : '#fef3c7' }]}>
                <Ionicons
                  name={quote.flouciReady ? 'card-outline' : 'information-circle-outline'}
                  size={20}
                  color={quote.flouciReady ? colors.primary : '#f59e0b'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.noticeTitle, { color: colors.text }]}>
                  {quote.flouciReady ? t('buyCoins.continueToFlouci') : t('buyCoins.unavailable')}
                </Text>
                <Text style={[styles.noticeBody, { color: colors.textSecondary }]}>{subtitle}</Text>
              </View>
            </View>
          ) : null}

          <View style={[styles.sectionHeader, { marginTop: subtitle || pendingList.length ? 18 : 20 }]}>
            <View style={[styles.sectionIconWrap, { backgroundColor: isDark ? '#0c4a6e' : colors.primaryLight }]}>
              <Ionicons name="create-outline" size={18} color={colors.primary} />
            </View>
            <View>
              <Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>{t('buyCoins.coinAmountToBuy')}</Text>
              <Text style={[styles.sectionHeaderSub, { color: colors.textTertiary }]}>{t('buyCoins.countryCoinConfig')}</Text>
            </View>
          </View>

          <View
            style={[
              styles.amountCard,
              {
                borderColor: isDark ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.35)',
                backgroundColor: colors.card,
                shadowColor: isDark ? '#000' : '#0f172a',
              },
            ]}
          >
            <View style={[styles.amountCardAccent, { backgroundColor: colors.primary }]} />
            <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>{t('buyCoins.youReceive')}</Text>
            <View style={styles.amountInputRow}>
              <TextInput
                value={coinsDraft}
                onChangeText={setCoinsDraft}
                onFocus={() => setCoinsFieldFocused(true)}
                onBlur={() => {
                  setCoinsFieldFocused(false);
                  applyCoinsFromDraft();
                }}
                keyboardType="decimal-pad"
                inputMode="decimal"
                selectTextOnFocus
                placeholder={String(quote.minCoins)}
                placeholderTextColor={colors.textTertiary}
                underlineColorAndroid="transparent"
                accessibilityLabel={t('buyCoins.coinAmountToBuy')}
                style={[styles.amountInput, { color: colors.text }]}
              />
              <Text style={[styles.amountUnit, { color: colors.primary }]}>{t('buyCoins.coinsSuffix')}</Text>
            </View>
            <Text style={[styles.amountHint, { color: colors.textTertiary }]}>
              {t('buyCoins.minimumCoins', { n: quote.minCoins })}
            </Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.payRow}>
              <View style={[styles.payIconWrap, { backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#dcfce7' }]}>
                <Ionicons name="cash-outline" size={20} color="#16a34a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.payLabel, { color: colors.textSecondary }]}>{t('buyCoins.youPayApprox')}</Text>
                <Text style={[styles.payValue, { color: colors.text }]}>{formatFiat(fiatNow, quote)}</Text>
              </View>
            </View>

            <View style={{ marginTop: 18 }}>
              <View style={[styles.sliderTrackShell, { backgroundColor: colors.surfaceVariant ?? 'rgba(0,0,0,0.06)' }]}>
                <Slider
                  style={{ width: '100%', height: 44 }}
                  minimumValue={quote.minCoins}
                  maximumValue={quote.maxCoins}
                  step={quote.stepCoins}
                  value={Math.min(Math.max(clampSliderCoins(coins, quote), quote.minCoins), quote.maxCoins)}
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={isDark ? '#334155' : '#cbd5e1'}
                  thumbTintColor={colors.primary}
                  onSlidingComplete={(v) => {
                    setCoinsFieldFocused(false);
                    setCoins(clampSliderCoins(v as number, quote));
                  }}
                  onValueChange={(v) => {
                    setCoinsFieldFocused(false);
                    setCoins(clampSliderCoins(v as number, quote));
                  }}
                />
              </View>
              <View style={styles.sliderLegend}>
                <Text style={[styles.legendText, { color: colors.textTertiary }]}>{t('buyCoins.minimumCoins', { n: quote.minCoins })}</Text>
                <Text style={[styles.legendText, { color: colors.textTertiary }]}>
                  {t('buyCoins.sliderMax', { max: quote.maxCoins >= 1000 ? `${quote.maxCoins / 1000}` : quote.maxCoins })}
                </Text>
              </View>

              <TouchableOpacity
                accessibilityRole="button"
                disabled={busy || !quote.flouciReady}
                onPress={() => void startCheckout(coins)}
                style={[
                  styles.buyNow,
                  {
                    backgroundColor: quote.flouciReady ? colors.primary : colors.textTertiary,
                    opacity: busy ? 0.72 : 1,
                    shadowColor: quote.flouciReady ? colors.primary : 'transparent',
                  },
                ]}
                activeOpacity={0.9}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="lock-closed-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.buyNowText}>{t('buyCoins.buyNow')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.packSection}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, { backgroundColor: isDark ? 'rgba(251,191,36,0.15)' : popularBg }]}>
                <Ionicons name="flash" size={18} color={popularAccent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>{t('buyCoins.quickPacks')}</Text>
                <Text style={[styles.packSectionHint, { color: colors.textTertiary, marginTop: 2 }]}>
                  {t('buyCoins.quickPacksHint')}
                </Text>
              </View>
            </View>
            <View style={styles.packList}>
              {quote.presets.map((pack) => {
                const sel = clampSliderCoins(coins, quote) === clampSliderCoins(pack.coins, quote);
                const popular = isPopularPack(pack);
                return (
                  <QuickPackCard
                    key={pack.label + pack.coins}
                    pack={pack}
                    quote={quote}
                    selected={sel}
                    popular={popular}
                    busy={busy}
                    colors={colors}
                    isDark={isDark}
                    popularAccent={popularAccent}
                    popularBg={popularBg}
                    popularBorder={popularBorder}
                    t={t}
                    onSelect={() => {
                      setCoinsFieldFocused(false);
                      setCoins(clampSliderCoins(pack.coins, quote));
                      void startCheckout(pack.coins);
                    }}
                  />
                );
              })}
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={checkoutPreview != null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => !busy && setCheckoutPreview(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={[StyleSheet.absoluteFillObject, { backgroundColor: modalOverlayTint }]}
            onPress={() => !busy && setCheckoutPreview(null)}
            accessibilityRole="button"
            accessibilityLabel={t('buyCoins.dismiss')}
          />
          <View style={styles.modalAlign} pointerEvents="box-none">
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  shadowColor: isDark ? '#000' : '#0f172a',
                },
              ]}
              accessibilityViewIsModal
            >
              <View style={[styles.modalIconWrap, { backgroundColor: isDark ? '#0c4a6e' : colors.primaryLight }]}>
                <Ionicons name="shield-checkmark-outline" size={28} color={colors.primary} />
              </View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('buyCoins.confirmPayment')}</Text>
              <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
                {t('buyCoins.continueToFlouci')}
              </Text>
              {checkoutPreview ? (
                <View style={[styles.modalAmountBox, { backgroundColor: isDark ? colors.surfaceVariant : '#f8fafc', borderColor: colors.border }]}>
                  <Text style={[styles.modalCoinsLabel, { color: colors.textTertiary }]}>{t('buyCoins.youReceive')}</Text>
                  <Text style={[styles.modalCoins, { color: colors.text }]}>
                    {checkoutPreview.coins.toFixed(2)} {t('buyCoins.coins')}
                  </Text>
                  <View style={[styles.modalDivider, { backgroundColor: colors.border }]} />
                  <Text style={[styles.modalCoinsLabel, { color: colors.textTertiary }]}>{t('buyCoins.youPay')}</Text>
                  <Text style={[styles.modalFiat, { color: colors.primary }]}>
                    {formatFiat(checkoutPreview.fiat, quote)}
                  </Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={[styles.buyNow, { backgroundColor: colors.primary, marginTop: 18, flexDirection: 'row' }]}
                disabled={busy}
                onPress={() => void confirmCheckoutPreview()}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="open-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.buyNowText}>{t('buyCoins.continueToFlouci')}</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={{ marginTop: 12, paddingVertical: 10 }}
                disabled={busy}
                onPress={() => setCheckoutPreview(null)}
              >
                <Text style={{ textAlign: 'center', color: colors.textSecondary, fontWeight: '700' }}>{t('buyCoins.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ThemedConfirmDialog
        visible={removePendingTarget != null}
        onClose={() => {
          if (!removingTrackingId) setRemovePendingTarget(null);
        }}
        title={t('buyCoins.removePending')}
        message={removePendingMessage}
        icon="trash-outline"
        destructive
        confirmLabel={t('common.remove')}
        cancelLabel={t('wallet.keep')}
        busy={removingTrackingId != null}
        onConfirm={() => void confirmRemovePending()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centerPad: { paddingHorizontal: 22, alignItems: 'center' },
  skeletonHero: { height: 168, borderRadius: 24 },
  skeletonCard: { height: 280, borderRadius: 22 },
  skeletonPack: { height: 160, borderRadius: 20 },
  errorIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  errorTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 14,
  },
  retryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  heroOuter: {
    borderRadius: 24,
    marginBottom: 4,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  heroCard: {
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
  },
  heroDecor1: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroDecor2: {
    position: 'absolute',
    bottom: -30,
    left: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    zIndex: 1,
  },
  heroIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  heroStatusText: { fontSize: 11, fontWeight: '800' },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: '#fff',
    zIndex: 1,
  },
  heroSub: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.82)',
    zIndex: 1,
  },
  heroRateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
    zIndex: 1,
  },
  heroRatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  heroRateText: { color: 'rgba(255,255,255,0.95)', fontSize: 12, fontWeight: '700' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderTitle: { fontSize: 16, fontWeight: '800' },
  sectionHeaderSub: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  pendingBlock: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  pendingHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingHeaderSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  pendingTitle: { fontSize: 15, fontWeight: '800' },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pendingCoinIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendingRemoveBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingCoins: { fontSize: 15, fontWeight: '800' },
  pendingFiat: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  pendingBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  pendingBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
  },
  noticeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  noticeBody: { fontSize: 13, lineHeight: 18 },
  amountCard: {
    marginTop: 0,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 20,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  amountCardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  amountLabel: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  amountHint: { marginTop: 6, fontSize: 11, fontWeight: '600' },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginTop: 4,
    marginHorizontal: -4,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  amountInput: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1,
    minWidth: 72,
    paddingVertical: 0,
    paddingHorizontal: 4,
    margin: 0,
  },
  amountUnit: { fontSize: 19, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 14, opacity: 0.85 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  payIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payLabel: { fontSize: 13, fontWeight: '600' },
  payValue: { marginTop: 2, fontSize: 26, fontWeight: '800' },
  sliderTrackShell: { borderRadius: 999, paddingHorizontal: 4, paddingVertical: 6 },
  sliderLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  legendText: { fontSize: 11, fontWeight: '700' },
  buyNow: {
    flexDirection: 'row',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  buyNowText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  packSection: { marginTop: 24 },
  packSectionHint: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  packList: { gap: 14 },
  modalRoot: { flex: 1 },
  modalAlign: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 22,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  modalSub: { marginTop: 8, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  modalAmountBox: {
    alignSelf: 'stretch',
    marginTop: 18,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    alignItems: 'center',
  },
  modalCoinsLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  modalDivider: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: 12 },
  modalCoins: { marginTop: 4, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  modalFiat: { marginTop: 4, fontSize: 30, fontWeight: '900', textAlign: 'center' },
});
