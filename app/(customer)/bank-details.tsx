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
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { walletService } from '../../services/api';

export default function CustomerBankDetailsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [holder, setHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountRef, setAccountRef] = useState('');
  const [hasSaved, setHasSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await walletService.getPayoutBankDetails();
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
      Alert.alert('Missing fields', 'Please fill account holder, bank name, and account reference.');
      return;
    }
    setSaving(true);
    try {
      await walletService.updatePayoutBankDetails({
        accountHolderName: h,
        bankName: b,
        accountReference: r,
      });
      setHasSaved(true);
      Alert.alert('Saved', 'Your payout bank details were updated.');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    Alert.alert(
      'Remove bank details',
      'Clear saved payout bank information from your profile? You can enter them again when requesting a withdrawal.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await walletService.deletePayoutBankDetails();
              setHolder('');
              setBankName('');
              setAccountRef('');
              setHasSaved(false);
              Alert.alert('Removed', 'Saved bank details were cleared.');
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
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
        These details are used when you choose bank transfer for wallet withdrawals. You can update or clear them anytime.
      </Text>

      <Text style={[styles.label, { color: colors.text }]}>Account holder name</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
        value={holder}
        onChangeText={setHolder}
        placeholder="Full name as on the account"
        placeholderTextColor={colors.textTertiary}
      />

      <Text style={[styles.label, { color: colors.text }]}>Bank name</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
        value={bankName}
        onChangeText={setBankName}
        placeholder="e.g. STB, BIAT"
        placeholderTextColor={colors.textTertiary}
      />

      <Text style={[styles.label, { color: colors.text }]}>IBAN / RIB / account number</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
        value={accountRef}
        onChangeText={setAccountRef}
        placeholder="Your payout reference"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="characters"
      />

      <TouchableOpacity
        style={[styles.primary, { backgroundColor: colors.primary }, saving && { opacity: 0.65 }]}
        onPress={() => void save()}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save</Text>}
      </TouchableOpacity>

      {hasSaved ? (
        <TouchableOpacity style={[styles.danger, { borderColor: colors.border }]} onPress={remove} disabled={saving}>
          <Text style={[styles.dangerText, { color: '#b91c1c' }]}>Delete saved bank details</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={{ color: colors.primary, fontWeight: '600' }}>Back</Text>
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
