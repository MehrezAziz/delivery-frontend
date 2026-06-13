import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { driverPayoutService } from '../../services/api/driver-payout.service';

export default function DriverBankDetailsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [holder, setHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountRef, setAccountRef] = useState('');
  const [hasSaved, setHasSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await driverPayoutService.getPayoutBankDetails();
      if (row) {
        setHolder(row.accountHolderName);
        setBankName(row.bankName);
        setAccountRef(row.accountReference);
        setHasSaved(true);
      } else {
        setHasSaved(false);
      }
    } catch {
      setHasSaved(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const h = holder.trim();
    const b = bankName.trim();
    const r = accountRef.trim();
    if (!h || !b || !r) {
      Alert.alert(t('common.error'), t('bankDetails.required'));
      return;
    }
    setSaving(true);
    try {
      await driverPayoutService.updatePayoutBankDetails({
        accountHolderName: h,
        bankName: b,
        accountReference: r,
      });
      setHasSaved(true);
      Alert.alert(t('bankDetails.saved'), t('bankDetails.saved'));
    } catch (e: unknown) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('bankDetails.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    Alert.alert(
      t('common.remove'),
      t('common.confirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await driverPayoutService.deletePayoutBankDetails();
              setHolder('');
              setBankName('');
              setAccountRef('');
              setHasSaved(false);
              Alert.alert(t('common.success'), t('common.success'));
            } catch (e: unknown) {
              Alert.alert(t('common.error'), e instanceof Error ? e.message : t('bankDetails.saveFailed'));
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.pad}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.lead, { color: colors.textSecondary }]}>
        {t('wallet.bankDetailsBody')}
      </Text>

      <Text style={[styles.label, { color: colors.text }]}>{t('bankDetails.accountHolder')}</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
        value={holder}
        onChangeText={setHolder}
        placeholder={t('bankDetails.accountHolder')}
        placeholderTextColor={colors.textTertiary}
      />

      <Text style={[styles.label, { color: colors.text }]}>{t('bankDetails.bankName')}</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
        value={bankName}
        onChangeText={setBankName}
        placeholder={t('bankDetails.bankName')}
        placeholderTextColor={colors.textTertiary}
      />

      <Text style={[styles.label, { color: colors.text }]}>{t('bankDetails.iban')} / {t('bankDetails.rib')}</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
        value={accountRef}
        onChangeText={setAccountRef}
        placeholder={t('bankDetails.iban')}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="characters"
      />

      <TouchableOpacity
        style={[styles.primary, { backgroundColor: colors.primary }, saving && { opacity: 0.65 }]}
        onPress={() => void save()}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t('bankDetails.save')}</Text>}
      </TouchableOpacity>

      {hasSaved ? (
        <TouchableOpacity style={[styles.danger, { borderColor: colors.border }]} onPress={remove} disabled={saving}>
          <Text style={[styles.dangerText, { color: '#b91c1c' }]}>{t('common.delete')}</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('common.back')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pad: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  lead: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  primary: {
    marginTop: 22,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  danger: {
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  dangerText: { fontWeight: '700', fontSize: 15 },
  back: { marginTop: 24, alignItems: 'center' },
});
