import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { fiatToCoins, coinsToFiat, hasCoinRate } from '../utils/orderPriceCoins';

export function OrderPreviewTotalPrice({
  fiatTotal,
  coinsPerFiatUnit,
  currencySymbol,
  isCash,
  labelColor,
  primaryColor,
  secondaryColor,
}: {
  fiatTotal: number;
  coinsPerFiatUnit: number | null | undefined;
  currencySymbol: string;
  isCash: boolean;
  labelColor: string;
  primaryColor: string;
  secondaryColor: string;
}) {
  const { t } = useTranslation();
  const coinTotal = hasCoinRate(coinsPerFiatUnit)
    ? fiatToCoins(fiatTotal, coinsPerFiatUnit)
    : fiatTotal;
  const primaryText = isCash
    ? `${fiatTotal.toFixed(2)} ${currencySymbol}`
    : `${coinTotal.toFixed(2)}${t('orderPreviewPayment.coinsSuffix')}`;
  const secondaryText = isCash
    ? hasCoinRate(coinsPerFiatUnit)
      ? `${t('orderPreviewPayment.approx')}${coinTotal.toFixed(2)}${t('orderPreviewPayment.coinsSuffix')}`
      : null
    : hasCoinRate(coinsPerFiatUnit)
      ? `${t('orderPreviewPayment.approx')}${fiatTotal.toFixed(2)} ${currencySymbol}`
      : null;

  return (
    <View style={ui.priceRow}>
      <Text style={[ui.totalLabel, { color: labelColor }]}>{t('orderPreviewPayment.total')}</Text>
      <View style={ui.totalCol}>
        <Text style={[ui.totalValue, { color: primaryColor }]}>{primaryText}</Text>
        {secondaryText ? (
          <Text style={[ui.totalSecondary, { color: secondaryColor }]}>{secondaryText}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function OrderPreviewAvailableBalance({
  walletBalance,
  isCash,
  coinsPerFiatUnit,
  currencySymbol,
  orderTotalCoins,
  colors,
  isDark,
}: {
  walletBalance: number | null;
  isCash: boolean;
  coinsPerFiatUnit?: number | null;
  currencySymbol?: string;
  orderTotalCoins?: number;
  colors: {
    text: string;
    textSecondary: string;
    textTertiary?: string;
    primary: string;
    border: string;
    card: string;
    danger?: string;
    success?: string;
  };
  isDark?: boolean;
}) {
  const { t } = useTranslation();
  if (walletBalance === null) return null;

  const sym = currencySymbol?.trim() || 'TND';
  const fiatEquiv = hasCoinRate(coinsPerFiatUnit) ? coinsToFiat(walletBalance, coinsPerFiatUnit!) : null;
  const insufficient =
    !isCash &&
    orderTotalCoins != null &&
    Number.isFinite(orderTotalCoins) &&
    walletBalance < orderTotalCoins;

  const shellBg = isDark ? 'rgba(15,23,42,0.55)' : 'rgba(248,250,252,0.95)';
  const accent = insufficient ? colors.danger ?? '#dc2626' : isCash ? colors.success ?? '#16a34a' : colors.primary;

  return (
    <View
      style={[
        ui.balanceCard,
        {
          backgroundColor: shellBg,
          borderColor: insufficient ? accent + '55' : colors.border,
        },
      ]}
    >
      <View style={[ui.balanceIconWrap, { backgroundColor: accent + '1a' }]}>
        <Ionicons name={isCash ? 'cash-outline' : 'wallet-outline'} size={22} color={accent} />
      </View>
      <View style={ui.balanceBody}>
        <Text style={[ui.balanceLabel, { color: colors.textSecondary }]}>
          {isCash ? t('orderPreviewPayment.yourWalletBalance') : t('orderPreviewPayment.availableToSpend')}
        </Text>
        <Text style={[ui.balancePrimary, { color: colors.text }]}>
          {walletBalance.toFixed(2)}{' '}
          <Text style={[ui.balanceUnit, { color: accent }]}>{t('common.coinsUnit')}</Text>
        </Text>
        {fiatEquiv != null ? (
          <Text style={[ui.balanceSecondary, { color: colors.textTertiary ?? colors.textSecondary }]}>
            {t('orderPreviewPayment.approx')}{fiatEquiv.toFixed(sym === 'TND' ? 3 : 2)} {sym}
          </Text>
        ) : null}
        {isCash ? (
          <Text style={[ui.balanceHint, { color: colors.textSecondary }]}>
            {t('orderPreviewPayment.cashAtDelivery')}
          </Text>
        ) : insufficient && orderTotalCoins != null ? (
          <Text style={[ui.balanceHint, { color: accent }]}>
            {t('orderPreviewPayment.needMoreCoinsPrefix')}{(orderTotalCoins - walletBalance).toFixed(2)}{t('orderPreviewPayment.needMoreCoinsSuffix')}
          </Text>
        ) : !isCash ? (
          <Text style={[ui.balanceHint, { color: colors.textSecondary }]}>
            {t('orderPreviewPayment.walletDebitNote')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function OrderPreviewPaymentSwitch({
  isCash,
  walletBalance,
  coinsPerFiatUnit,
  currencySymbol,
  orderTotalCoins,
  switching,
  onSwitchToCash,
  onSwitchToWallet,
  colors,
  isDark,
}: {
  isCash: boolean;
  walletBalance: number | null;
  coinsPerFiatUnit?: number | null;
  currencySymbol?: string;
  orderTotalCoins?: number;
  switching: boolean;
  onSwitchToCash: () => void;
  onSwitchToWallet: () => void;
  colors: {
    text: string;
    textSecondary: string;
    textTertiary?: string;
    primary: string;
    border: string;
    card: string;
    danger?: string;
    success?: string;
  };
  isDark?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={ui.switchBlock}>
      <OrderPreviewAvailableBalance
        walletBalance={walletBalance}
        isCash={isCash}
        coinsPerFiatUnit={coinsPerFiatUnit}
        currencySymbol={currencySymbol}
        orderTotalCoins={orderTotalCoins}
        colors={colors}
        isDark={isDark}
      />
      <TouchableOpacity
        style={[ui.switchBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
        onPress={isCash ? onSwitchToWallet : onSwitchToCash}
        disabled={switching}
        activeOpacity={0.75}
      >
        {switching ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <>
            <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
            <Text style={[ui.switchBtnText, { color: colors.primary }]}>
              {isCash ? t('orderPreviewPayment.switchToWallet') : t('orderPreviewPayment.switchToCash')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const ui = StyleSheet.create({
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  totalLabel: { fontSize: 16, fontWeight: '700' },
  totalCol: { alignItems: 'flex-end' },
  totalValue: { fontSize: 20, fontWeight: '800' },
  totalSecondary: { fontSize: 12, fontWeight: '500', marginTop: 2, opacity: 0.65 },
  switchBlock: { marginBottom: 16, gap: 12 },
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  balanceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceBody: { flex: 1, minWidth: 0 },
  balanceLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  balancePrimary: { marginTop: 4, fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  balanceUnit: { fontSize: 15, fontWeight: '800' },
  balanceSecondary: { marginTop: 2, fontSize: 13, fontWeight: '600' },
  balanceHint: { marginTop: 8, fontSize: 12, lineHeight: 17, fontWeight: '500' },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  switchBtnText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
});
