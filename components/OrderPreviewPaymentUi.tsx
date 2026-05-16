import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fiatToCoins, hasCoinRate } from '../utils/orderPriceCoins';

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
  const coinTotal = hasCoinRate(coinsPerFiatUnit)
    ? fiatToCoins(fiatTotal, coinsPerFiatUnit)
    : fiatTotal;
  const primaryText = isCash
    ? `${fiatTotal.toFixed(2)} ${currencySymbol}`
    : `${coinTotal.toFixed(2)} coins`;
  const secondaryText = isCash
    ? hasCoinRate(coinsPerFiatUnit)
      ? `≈ ${coinTotal.toFixed(2)} coins`
      : null
    : hasCoinRate(coinsPerFiatUnit)
      ? `≈ ${fiatTotal.toFixed(2)} ${currencySymbol}`
      : null;

  return (
    <View style={ui.priceRow}>
      <Text style={[ui.totalLabel, { color: labelColor }]}>Total</Text>
      <View style={ui.totalCol}>
        <Text style={[ui.totalValue, { color: primaryColor }]}>{primaryText}</Text>
        {secondaryText ? (
          <Text style={[ui.totalSecondary, { color: secondaryColor }]}>{secondaryText}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function OrderPreviewPaymentSwitch({
  isCash,
  walletBalance,
  switching,
  onSwitchToCash,
  onSwitchToWallet,
  colors,
}: {
  isCash: boolean;
  walletBalance: number | null;
  switching: boolean;
  onSwitchToCash: () => void;
  onSwitchToWallet: () => void;
  colors: {
    text: string;
    textSecondary: string;
    primary: string;
    border: string;
    card: string;
  };
}) {
  return (
    <View style={[ui.switchRow, { marginBottom: 16 }]}>
      {!isCash && walletBalance !== null ? (
        <Text style={[ui.switchBalance, { color: colors.textSecondary }]} numberOfLines={1}>
          Available: {walletBalance.toFixed(2)} coins
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
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
            <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
            <Text style={[ui.switchBtnText, { color: colors.primary }]}>
              {isCash ? 'Switch to Wallet' : 'Switch to cash'}
            </Text>
            <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  switchBalance: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
  },
  switchBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
