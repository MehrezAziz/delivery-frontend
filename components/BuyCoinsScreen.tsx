import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
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
  type CoinTopUpQuote,
} from '../services/api/coin-topup.service';
import { ApiError } from '../services/api/client';

/** Plain amount: dot as decimal separator, no thousand separators or commas. */
function formatFiat(price: number, q: CoinTopUpQuote) {
  if (!Number.isFinite(price)) return '—';
  const digits = q.currencyCode === 'TND' ? 3 : 2;
  const n = price.toFixed(digits);
  const sym = (q.currencySymbol?.trim() ?? q.currencyCode).replace(/,/g, '');
  return `${sym} ${n}`.replace(/,/g, '');
}

function snapCoins(v: number, q: CoinTopUpQuote) {
  const step = q.stepCoins || 1;
  const base = q.minCoins + Math.round((v - q.minCoins) / step) * step;
  const x = Math.min(q.maxCoins, Math.max(q.minCoins, base));
  return Math.round(x * 100) / 100;
}

export default function BuyCoinsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [quote, setQuote] = useState<CoinTopUpQuote | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [coins, setCoins] = useState(500);
  const [coinsDraft, setCoinsDraft] = useState('500');
  const [coinsFieldFocused, setCoinsFieldFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(true);

  const pendingRef = useRef<{ trackingId: string; paymentId: string } | null>(null);

  const syncDraftFromCoins = useCallback((c: number, q: CoinTopUpQuote) => {
    const snapped = snapCoins(c, q);
    setCoinsDraft(snapped % 1 !== 0 ? snapped.toFixed(2) : String(Math.round(snapped)));
  }, []);

  const fetchQuote = useCallback(async () => {
    try {
      setLoadErr(null);
      setLoadingQuote(true);
      const q = await coinTopupService.quote();
      setQuote(q);
      const start = snapCoins(Math.min(Math.max(q.presets?.[1]?.coins ?? 2000, q.minCoins), q.maxCoins), q);
      setCoins(start);
      syncDraftFromCoins(start, q);
    } catch (e: unknown) {
      const msg = e instanceof ApiError ? e.message : 'Unable to load rates';
      setLoadErr(msg);
    } finally {
      setLoadingQuote(false);
    }
  }, [syncDraftFromCoins]);

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
    setCoins(snapCoins(n, quote));
  }

  const tryVerifyPending = useCallback(async () => {
    const p = pendingRef.current;
    if (!p) return;
    try {
      const res = await coinTopupService.verify({
        trackingId: p.trackingId,
        paymentId: p.paymentId,
      });
      if (res.status === 'FAILED') {
        pendingRef.current = null;
        return;
      }
      if (res.status !== 'COMPLETED' && !res.fulfilled) return;
      pendingRef.current = null;
      Alert.alert(
        'Coins added',
        `${res.coins.toFixed(2)} coins were credited to your account.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch {
      /* network — retry later */
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void tryVerifyPending();
    }, [tryVerifyPending]),
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

  async function pay() {
    if (!quote) return;
    if (!quote.flouciReady) {
      Alert.alert('Unavailable', subtitle || 'Payments are not available for this wallet.');
      return;
    }
    const normalized = coinsDraft.replace(',', '.').replace(/[^\d.]/g, '');
    const parsed = parseFloat(normalized);
    const amount = Number.isFinite(parsed) ? snapCoins(parsed, quote) : snapCoins(coins, quote);
    setCoins(amount);
    syncDraftFromCoins(amount, quote);

    setBusy(true);
    try {
      const init = await coinTopupService.initFlouci(amount);
      pendingRef.current = { trackingId: init.trackingId, paymentId: init.paymentId };
      await WebBrowser.openBrowserAsync(init.checkoutUrl);
      await tryVerifyPending();
    } catch (e: unknown) {
      pendingRef.current = null;
      const msg = e instanceof ApiError ? e.message : 'Could not open checkout';
      Alert.alert('Checkout', msg);
    } finally {
      setBusy(false);
    }
  }

  const accentGlow = isDark ? 'rgba(94,234,212,0.16)' : 'rgba(14,165,233,0.22)';
  const accentRing = isDark ? 'rgba(94,234,212,0.35)' : 'rgba(59,130,246,0.35)';

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
          {/* Decorative blobs */}
          <View style={styles.heroVisual} pointerEvents="none">
            <View style={[styles.blob, styles.blobOne, { backgroundColor: accentGlow }]} />
            <View style={[styles.blob, styles.blobTwo, { backgroundColor: accentRing }]} />
          </View>

          <Text style={[styles.title, { color: colors.text }]}>Buy coins</Text>
          <Text style={[styles.lede, { color: colors.textSecondary }]}>
            Pay in {quote.currencyCode} · pricing follows your region&apos;s{' '}
            <Text style={{ fontWeight: '700', color: colors.text }}>country coin configuration</Text>.
          </Text>

          {subtitle && (
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
          )}

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
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                underlineColorAndroid="transparent"
                accessibilityLabel="Coin amount to buy"
                style={[styles.amountInput, { color: colors.text }]}
              />
              <Text style={[styles.amountUnit, { color: colors.primary }]}> coins</Text>
            </View>
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
                  value={Math.min(Math.max(coins, quote.minCoins), quote.maxCoins)}
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={isDark ? '#334155' : '#cbd5e1'}
                  thumbTintColor={colors.primary}
                  onSlidingComplete={(v) => setCoins(snapCoins(v as number, quote))}
                  onValueChange={(v) => setCoins(snapCoins(v as number, quote))}
                />
              </View>
              <View style={styles.sliderLegend}>
                <Text style={[styles.legendText, { color: colors.textTertiary }]}>
                  Min {quote.minCoins.toFixed(0)}
                </Text>
                <Text style={[styles.legendText, { color: colors.textTertiary }]}>
                  Max {quote.maxCoins >= 1000 ? `${quote.maxCoins / 1000}k` : quote.maxCoins}
                </Text>
              </View>

              <TouchableOpacity
                accessibilityRole="button"
                disabled={busy || !quote.flouciReady}
                onPress={() => void pay()}
                style={[
                  styles.buyNow,
                  {
                    backgroundColor: quote.flouciReady ? colors.primary : colors.textTertiary,
                    opacity: busy ? 0.72 : 1,
                  },
                ]}
                activeOpacity={0.9}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buyNowText}>Buy now</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Quick packs</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.packRow}>
            {quote.presets.map((pack) => {
              const fiatPack = pack.coins / quote.coinsPerFiatUnit;
              const sel = snapCoins(coins, quote) === snapCoins(pack.coins, quote);
              return (
                <TouchableOpacity
                  key={pack.label + pack.coins}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  activeOpacity={0.92}
                  onPress={() => setCoins(snapCoins(pack.coins, quote))}
                  style={[
                    styles.packCard,
                    {
                      borderColor: sel ? colors.primary : colors.border,
                      backgroundColor: sel ? (isDark ? 'rgba(14,165,233,0.12)' : '#eff6ff') : colors.card,
                    },
                  ]}
                >
                  {pack.badge && (
                    <View style={[styles.badgePill, { backgroundColor: colors.primary + '22' }]}>
                      <Text style={[styles.badgeText, { color: colors.primary }]}>{pack.badge}</Text>
                    </View>
                  )}
                  <Text style={[styles.packLabel, { color: colors.textSecondary }]}>{pack.label}</Text>
                  <Text style={[styles.packCoins, { color: colors.text }]}>{pack.coins} coins</Text>
                  <Text style={[styles.packFiat, { color: colors.textTertiary }]}>{formatFiat(fiatPack, quote)}</Text>
                  <View style={[styles.packBtn, { backgroundColor: sel ? colors.primary : colors.surfaceVariant }]}>
                    <Text style={[styles.packBtnText, { color: sel ? '#fff' : colors.text }]}>Choose</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[styles.foot, { color: colors.textTertiary }]}>
            You will complete payment in a secure browser. When you return here, your balance refreshes automatically.
          </Text>
        </View>
      </ScrollView>
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
  sliderTrackShell: {
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  sliderLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  legendText: { fontSize: 11, fontWeight: '700' },
  buyNow: {
    marginTop: 18,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyNowText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  sectionTitle: {
    marginTop: 26,
    marginBottom: 12,
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    fontWeight: '800',
  },
  packRow: { gap: 12, paddingRight: 24 },
  packCard: {
    width: 158,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginRight: 4,
    gap: 6,
    position: 'relative',
    overflow: 'hidden',
  },
  badgePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 6,
  },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  packLabel: { fontSize: 12, fontWeight: '700' },
  packCoins: { fontSize: 17, fontWeight: '900' },
  packFiat: { fontSize: 13 },
  packBtn: { marginTop: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12 },
  packBtnText: { fontWeight: '800', fontSize: 13 },
  secondaryBtn: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
  foot: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    opacity: 0.92,
    paddingHorizontal: 8,
  },
});
