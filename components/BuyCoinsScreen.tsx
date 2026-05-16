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
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import {
  coinTopupService,
  type CoinTopUpPending,
  type CoinTopUpQuote,
} from '../services/api/coin-topup.service';
import { ApiError } from '../services/api/client';
import { ThemedConfirmDialog } from './ThemedConfirmDialog';
import { coinTopupRoutes, useCoinTopupRole } from '../lib/coin-topup-role';

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
            {pack.badge ?? 'Featured'}
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
          <Text style={[packStyles.amountLabel, { color: colors.textTertiary }]}>You receive</Text>
          <Text style={[packStyles.amountCoins, { color: colors.text }]}>
            {formatCoinsDisplay(pack.coins)}{' '}
            <Text style={[packStyles.amountCoinsUnit, { color: accent }]}>coins</Text>
          </Text>
        </View>
        <View style={packStyles.amountRight}>
          <Text style={[packStyles.amountLabel, { color: colors.textTertiary }]}>You pay</Text>
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
          {selected ? 'Selected' : 'Choose this pack'}
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
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
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
      const q = await coinTopupService.quote();
      setQuote(q);
      const start = clampSliderCoins(q.presets?.[1]?.coins ?? 2000, q);
      setCoins(start);
      syncDraftFromCoins(start, q);
      await loadPending();
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : 'Unable to load rates';
      setLoadErr(msg);
    } finally {
      setLoadingQuote(false);
    }
  }, [loadPending, syncDraftFromCoins]);

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
        Alert.alert('Unavailable', subtitle || 'Payments are not available for this wallet.');
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
      const init = await coinTopupService.initFlouci(checkoutPreview.coins);
      await openFlouciCheckout(init);
    } catch (e: unknown) {
      pendingRef.current = null;
      const msg = e instanceof ApiError ? e.message : 'Could not open checkout';
      Alert.alert('Checkout', msg);
    } finally {
      setBusy(false);
    }
  }, [checkoutPreview, openFlouciCheckout, quote]);

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
      const msg = e instanceof ApiError ? e.message : 'Could not remove payment';
      Alert.alert('Remove failed', msg);
    } finally {
      setRemovingTrackingId(null);
    }
  }, [removePendingTarget]);

  const removePendingMessage = useMemo(() => {
    if (!removePendingTarget) return '';
    const fiatDigits = quote?.currencyCode === 'TND' ? 3 : 2;
    return `${removePendingTarget.coins.toFixed(2)} coins · ${removePendingTarget.fiatTotal.toFixed(fiatDigits)} ${removePendingTarget.currencyCode}\n\nThis cancels the checkout session. You can start a new purchase anytime.`;
  }, [quote?.currencyCode, removePendingTarget]);

  const resumePending = useCallback(
    async (row: CoinTopUpPending) => {
      if (!row.checkoutUrl || !row.paymentId) {
        Alert.alert('Unavailable', 'This payment session cannot be resumed. Start a new purchase.');
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
    [openFlouciCheckout],
  );

  const accentGlow = isDark ? 'rgba(94,234,212,0.16)' : 'rgba(14,165,233,0.22)';
  const accentRing = isDark ? 'rgba(94,234,212,0.35)' : 'rgba(59,130,246,0.35)';
  const popularAccent = isDark ? '#fbbf24' : '#d97706';
  const popularBg = isDark ? 'rgba(251,191,36,0.14)' : '#fffbeb';
  const popularBorder = isDark ? 'rgba(251,191,36,0.55)' : 'rgba(217,119,6,0.45)';
  const modalOverlayTint = isDark ? 'rgba(0,0,0,0.68)' : 'rgba(15,23,42,0.48)';

  if (loadingQuote && !quote) {
    return (
      <View style={[styles.fill, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={{ marginTop: 16, color: colors.textSecondary, fontWeight: '600' }}>Loading pricing…</Text>
      </View>
    );
  }

  if (loadErr || !quote) {
    return (
      <View style={[styles.fill, styles.centerPad, { backgroundColor: colors.background, paddingTop: insets.top + 24 }]}>
        <Text style={{ color: colors.danger ?? '#dc2626', fontWeight: '600' }}>{loadErr}</Text>
        <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border, marginTop: 20 }]} onPress={() => void fetchQuote()}>
          <Text style={{ color: colors.primary, fontWeight: '800' }}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12 }}>
          <View style={styles.heroVisual} pointerEvents="none">
            <View style={[styles.blob, styles.blobOne, { backgroundColor: accentGlow }]} />
            <View style={[styles.blob, styles.blobTwo, { backgroundColor: accentRing }]} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>Buy coins</Text>
          <Text style={[styles.lede, { color: colors.textSecondary }]}>
            Pay in {quote.currencyCode} · pricing follows your region&apos;s{' '}
            <Text style={{ fontWeight: '700', color: colors.text }}>country coin configuration</Text>.
          </Text>

          {pendingList.length > 0 ? (
            <View style={[styles.pendingBlock, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.pendingTitle, { color: colors.text }]}>Pending payments</Text>
              {pendingList.map((row) => {
                const removing = removingTrackingId === row.trackingId;
                return (
                  <View key={row.trackingId} style={[styles.pendingRow, { borderTopColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pendingCoins, { color: colors.text }]}>{row.coins.toFixed(2)} coins</Text>
                      <Text style={[styles.pendingFiat, { color: colors.textSecondary }]}>
                        {row.fiatTotal.toFixed(quote.currencyCode === 'TND' ? 3 : 2)} {row.currencyCode}
                      </Text>
                    </View>
                    <View style={styles.pendingActions}>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Remove pending payment"
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
                        <Text style={styles.pendingBtnText}>Complete payment</Text>
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
                { backgroundColor: colors.card, borderColor: quote.flouciReady ? colors.primary + '44' : colors.border },
              ]}
            >
              <Ionicons
                name={quote.flouciReady ? 'card-outline' : 'information-circle-outline'}
                size={22}
                color={quote.flouciReady ? colors.primary : '#f59e0b'}
              />
              <Text style={[styles.noticeBody, { color: colors.textSecondary }]}>{subtitle}</Text>
            </View>
          ) : null}

          <View
            style={[
              styles.amountCard,
              {
                borderColor: isDark ? 'rgba(148,163,184,0.22)' : 'rgba(148,163,184,0.35)',
                backgroundColor: colors.card,
                shadowColor: isDark ? '#000' : '#0f172a',
                shadowOffset: { width: 0, height: 14 },
                shadowOpacity: isDark ? 0.32 : 0.1,
                shadowRadius: 20,
                elevation: 10,
              },
            ]}
          >
            <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>You receive</Text>
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
                accessibilityLabel="Coin amount to buy"
                style={[styles.amountInput, { color: colors.text }]}
              />
              <Text style={[styles.amountUnit, { color: colors.primary }]}> coins</Text>
            </View>
            <Text style={[styles.amountHint, { color: colors.textTertiary }]}>
              Min {quote.minCoins} coins · type any amount (e.g. 55)
            </Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.payLabel, { color: colors.textSecondary }]}>You pay approximately</Text>
            <Text style={[styles.payValue, { color: colors.text }]}>{formatFiat(fiatNow, quote)}</Text>

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
                <Text style={[styles.legendText, { color: colors.textTertiary }]}>Min {quote.minCoins}</Text>
                <Text style={[styles.legendText, { color: colors.textTertiary }]}>
                  Slider max {quote.maxCoins >= 1000 ? `${quote.maxCoins / 1000}k` : quote.maxCoins}
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
                  },
                ]}
                activeOpacity={0.9}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buyNowText}>Buy now</Text>}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.packSection}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 0 }]}>Quick packs</Text>
            <Text style={[styles.packSectionHint, { color: colors.textTertiary }]}>
              Pick a ready-made bundle — amounts include live pricing for your country.
            </Text>
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
            accessibilityLabel="Dismiss"
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
              <Text style={[styles.modalTitle, { color: colors.text }]}>Confirm payment</Text>
              <Text style={[styles.modalSub, { color: colors.textSecondary }]}>
                You will pay on Flouci (secure checkout). The amount below is sent to the payment page.
              </Text>
              {checkoutPreview ? (
                <>
                  <Text style={[styles.modalCoins, { color: colors.text }]}>
                    {checkoutPreview.coins.toFixed(2)} coins
                  </Text>
                  <Text style={[styles.modalFiat, { color: colors.primary }]}>
                    {formatFiat(checkoutPreview.fiat, quote)}
                  </Text>
                </>
              ) : null}
              <TouchableOpacity
                style={[styles.buyNow, { backgroundColor: colors.primary, marginTop: 18 }]}
                disabled={busy}
                onPress={() => void confirmCheckoutPreview()}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buyNowText}>Continue to Flouci</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={{ marginTop: 12, paddingVertical: 10 }}
                disabled={busy}
                onPress={() => setCheckoutPreview(null)}
              >
                <Text style={{ textAlign: 'center', color: colors.textSecondary, fontWeight: '700' }}>Cancel</Text>
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
        title="Remove pending payment?"
        message={removePendingMessage}
        icon="trash-outline"
        destructive
        confirmLabel="Remove"
        cancelLabel="Keep"
        busy={removingTrackingId != null}
        onConfirm={() => void confirmRemovePending()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  centerPad: { paddingHorizontal: 22 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -0.6, marginTop: 6 },
  lede: { marginTop: 10, fontSize: 15, lineHeight: 21, maxWidth: 360 },
  heroVisual: { position: 'absolute', top: -20, right: -30, width: 200, height: 200 },
  blob: { position: 'absolute', borderRadius: 999 },
  blobOne: { width: 140, height: 140, top: 0, right: 0 },
  blobTwo: { width: 90, height: 90, top: 40, right: 60, opacity: 0.5 },
  pendingBlock: {
    marginTop: 18,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  pendingTitle: { fontSize: 14, fontWeight: '800', paddingVertical: 12 },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
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
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 18,
  },
  noticeBody: { flex: 1, fontSize: 13, lineHeight: 18 },
  amountCard: {
    marginTop: 22,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 20,
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
  payLabel: { fontSize: 13, fontWeight: '600' },
  payValue: { marginTop: 4, fontSize: 26, fontWeight: '800' },
  sliderTrackShell: { borderRadius: 999, paddingHorizontal: 4, paddingVertical: 6 },
  sliderLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  legendText: { fontSize: 11, fontWeight: '700' },
  buyNow: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  buyNowText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  sectionTitle: {
    marginTop: 26,
    marginBottom: 12,
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    fontWeight: '800',
  },
  packSection: { marginTop: 26 },
  packSectionHint: { marginTop: -4, marginBottom: 14, fontSize: 13, lineHeight: 19, fontWeight: '500' },
  packList: { gap: 14 },
  secondaryBtn: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
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
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '900' },
  modalSub: { marginTop: 8, fontSize: 13, lineHeight: 18 },
  modalCoins: { marginTop: 18, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  modalFiat: { marginTop: 6, fontSize: 32, fontWeight: '900', textAlign: 'center' },
});
