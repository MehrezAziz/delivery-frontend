import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { coinTopupRoutes, useCoinTopupRole } from '../lib/coin-topup-role';

type ResultStatus = 'success' | 'failed';

export default function CoinTopupResultScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const role = useCoinTopupRole();
  const { buyCoins: buyCoinsPath } = coinTopupRoutes(role);
  const params = useLocalSearchParams<{
    status?: string;
    coins?: string;
    fiat?: string;
    currencyCode?: string;
  }>();
  const status: ResultStatus = params.status === 'failed' ? 'failed' : 'success';
  const coins = params.coins ? Number(params.coins) : NaN;
  const fiat = params.fiat ? Number(params.fiat) : NaN;
  const currencyCode = params.currencyCode?.trim() || 'TND';

  const isSuccess = status === 'success';

  const headline = useMemo(() => {
    if (isSuccess) return t('coinTopupResult.success');
    return t('coinTopupResult.failed');
  }, [isSuccess, t]);

  const subline = useMemo(() => {
    if (isSuccess) {
      if (Number.isFinite(coins)) {
        return t('coinTopupResult.successBody', { count: coins.toFixed(2) });
      }
      return t('coinTopupResult.successGenericBody');
    }
    return t('coinTopupResult.failedBody');
  }, [coins, isSuccess, t]);

  const accent = isSuccess ? (isDark ? '#34d399' : '#059669') : (isDark ? '#f87171' : '#dc2626');
  const glow = isSuccess
    ? isDark
      ? 'rgba(52,211,153,0.18)'
      : 'rgba(16,185,129,0.2)'
    : isDark
      ? 'rgba(248,113,113,0.16)'
      : 'rgba(239,68,68,0.14)';

  return (
    <View style={[styles.fill, { backgroundColor: colors.background, paddingTop: insets.top + 24 }]}>
      <View style={[styles.glowOrb, { backgroundColor: glow }]} />
      <View style={styles.body}>
        <View style={[styles.iconRing, { borderColor: accent + '55', backgroundColor: accent + '18' }]}>
          <Ionicons name={isSuccess ? 'checkmark-circle' : 'close-circle'} size={72} color={accent} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{headline}</Text>
        {Number.isFinite(fiat) ? (
          <Text style={[styles.fiatHero, { color: colors.text }]}>
            {fiat.toFixed(currencyCode === 'TND' ? 3 : 2)} {currencyCode}
          </Text>
        ) : null}
        <Text style={[styles.sub, { color: colors.textSecondary }]}>{subline}</Text>
        {isSuccess ? (
          <View style={[styles.confettiRow, { borderColor: colors.border }]}>
            {['🎉', '✨', '🪙', '✨', '🎉'].map((emoji, i) => (
              <Text key={`${emoji}-${i}`} style={styles.confettiEmoji}>
                {emoji}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.replace({ pathname: buyCoinsPath, params: { role } })}
          activeOpacity={0.9}
        >
          <Text style={styles.primaryBtnText}>{isSuccess ? t('coinTopupResult.done') : t('coinTopupResult.backToBuy')}</Text>
        </TouchableOpacity>
        {!isSuccess ? (
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={() => router.replace({ pathname: buyCoinsPath, params: { role } })}
            activeOpacity={0.9}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>{t('coinTopupResult.tryAgain')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  glowOrb: {
    position: 'absolute',
    top: 40,
    alignSelf: 'center',
    width: 260,
    height: 260,
    borderRadius: 999,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  iconRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' },
  fiatHero: { marginTop: 10, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  sub: { marginTop: 12, fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 320 },
  confettiRow: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  confettiEmoji: { fontSize: 22 },
  actions: { paddingHorizontal: 20, gap: 10 },
  primaryBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  secondaryBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  secondaryBtnText: { fontWeight: '800', fontSize: 15 },
});
