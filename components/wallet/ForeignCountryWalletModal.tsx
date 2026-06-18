import React from 'react';
import {
  Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';

export type ForeignCountryWalletModalProps = {
  visible: boolean;
  countryName: string;
  currencyCode?: string;
  busy?: boolean;
  onCreateWallet: () => void;
  onCashOnly: () => void;
  onClose: () => void;
};

export function ForeignCountryWalletModal({
  visible,
  countryName,
  currencyCode,
  busy,
  onCreateWallet,
  onCashOnly,
  onClose,
}: ForeignCountryWalletModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={[s.card, { backgroundColor: colors.card }]}>
          <View style={s.iconWrap}>
            <Ionicons name="globe-outline" size={28} color={colors.primary} />
          </View>
          <Text style={[s.title, { color: colors.text }]}>
            {t('multiWallet.promptTitle', { country: countryName })}
          </Text>
          <Text style={[s.body, { color: colors.textSecondary }]}>
            {t('multiWallet.promptBody', { country: countryName, currency: currencyCode || '' })}
          </Text>
          {busy ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
          ) : (
            <>
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={onCreateWallet}
                activeOpacity={0.85}
              >
                <Text style={s.primaryBtnText}>{t('multiWallet.createWallet', { country: countryName })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.secondaryBtn, { borderColor: colors.border }]}
                onPress={onCashOnly}
                activeOpacity={0.85}
              >
                <Text style={[s.secondaryBtnText, { color: colors.text }]}>{t('multiWallet.cashOnly')}</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity onPress={onClose} style={s.cancelBtn}>
            <Text style={{ color: colors.textTertiary, fontWeight: '600' }}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 18,
    padding: 22,
    alignItems: 'stretch',
  },
  iconWrap: { alignSelf: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 18 },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 8,
  },
  secondaryBtnText: { fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', paddingTop: 8 },
});
