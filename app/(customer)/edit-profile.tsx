import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../contexts/ThemeContext';
import {
  ensurePhoneCountriesLoaded,
  cachePhoneCountries,
  getCachedPreferredPhoneCountryIso,
  detectAndCachePreferredPhoneCountryIso,
  inferPhoneCountryAndLocal,
  toE164Phone,
  validateNationalPhoneForCountry,
  type PhoneCountry,
} from '../../services/phone-countries';
import { ProfileFeedbackModal } from '../../components/ProfileFeedbackModal';
import { markCustomerProfileNeedsRefresh } from '../../utils/profileRefreshSignals';
import type { ThemeColors } from '../../contexts/ThemeContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

export default function CustomerEditProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [feedback, setFeedback] = useState<{
    variant: 'success' | 'error';
    title: string;
    message: string;
    okNavigates: boolean;
  } | null>(null);
  const [verified, setVerified] = useState(false);
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [secondName, setSecondName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountries, setPhoneCountries] = useState<PhoneCountry[]>([]);
  const [selectedPhoneCountry, setSelectedPhoneCountry] = useState<PhoneCountry | null>(null);
  const [showPhoneCountryModal, setShowPhoneCountryModal] = useState(false);
  const [phoneCountrySearch, setPhoneCountrySearch] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [hasReferralCode, setHasReferralCode] = useState(false);
  const [referralApplying, setReferralApplying] = useState(false);
  const filteredPhoneCountries = useMemo(() => {
    const q = phoneCountrySearch.trim().toLowerCase();
    if (!q) return phoneCountries;
    return phoneCountries.filter((c) =>
      c.name.toLowerCase().includes(q) || c.isoCode.toLowerCase().includes(q) || c.dialCode.includes(q),
    );
  }, [phoneCountries, phoneCountrySearch]);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const countries = await ensurePhoneCountriesLoaded();
      setPhoneCountries(countries);
      await cachePhoneCountries(countries);
      const cachedIso = await getCachedPreferredPhoneCountryIso();
      const fallbackIso = cachedIso || 'TN';
      if (!cachedIso) void detectAndCachePreferredPhoneCountryIso();

      const token = await AsyncStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/customers/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      setFirstName(d.user?.firstName || '');
      setSecondName(d.user?.secondName || '');
      const backendPhone = d.user?.phone || '';
      const inferred = inferPhoneCountryAndLocal(countries, backendPhone, fallbackIso);
      setSelectedPhoneCountry(inferred.country);
      setPhone(inferred.localPhone);
      setEmail(d.user?.myEmail || '');
      setGender(d.user?.userGender || null);
      setHasReferralCode(!!d.referredByCodeId);
      if (!d.user?.hasPassword) {
        setIsGoogleUser(true);
        setVerified(true);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleVerify = async () => {
    if (!password.trim()) return;
    setVerifying(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const res = await fetch(`${API_URL.replace('/api', '')}/api/auth/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Invalid password'); }
      setVerified(true);
    } catch (e: any) {
      setFeedback({
        variant: 'error',
        title: 'Verification failed',
        message: e.message || 'Invalid password',
        okNavigates: false,
      });
    } finally { setVerifying(false); }
  };

  const handleApplyReferralCode = async () => {
    if (!referralCodeInput.trim()) return;
    setReferralApplying(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const res = await fetch(`${API_URL.replace('/api', '')}/api/referral/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: referralCodeInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to apply referral code');
      setHasReferralCode(true);
      setReferralCodeInput('');
      setFeedback({
        variant: 'success',
        title: 'Success',
        message: 'Referral code applied successfully.',
        okNavigates: false,
      });
    } catch (e: any) {
      setFeedback({
        variant: 'error',
        title: 'Could not apply code',
        message: e.message || 'Failed to apply referral code',
        okNavigates: false,
      });
    } finally { setReferralApplying(false); }
  };

  const handleSave = async () => {
    if (!selectedPhoneCountry) {
      setFeedback({
        variant: 'error',
        title: 'Country required',
        message: 'Please select a country for the phone number.',
        okNavigates: false,
      });
      return;
    }
    const phoneCheck = validateNationalPhoneForCountry(
      selectedPhoneCountry.isoCode,
      selectedPhoneCountry.dialCode,
      phone,
    );
    if (!phoneCheck.ok) {
      setFeedback({
        variant: 'error',
        title: 'Invalid phone',
        message: phoneCheck.message,
        okNavigates: false,
      });
      return;
    }

    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      const res = await fetch(`${API_URL}/customers/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firstName: firstName.trim() || undefined,
          secondName: secondName.trim() || undefined,
          myEmail: email.trim() || undefined,
          userGender: gender || undefined,
          phone: selectedPhoneCountry ? toE164Phone(selectedPhoneCountry.dialCode, phone) : phone.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update profile');
      setFeedback({
        variant: 'success',
        title: 'Profile updated',
        message: 'Your changes have been saved.',
        okNavigates: true,
      });
    } catch (e: any) {
      setFeedback({
        variant: 'error',
        title: 'Could not save',
        message: e?.message || 'Failed to update profile. This phone number may already be in use.',
        okNavigates: false,
      });
    } finally { setSaving(false); }
  };

  const dismissFeedback = () => setFeedback(null);

  const handleFeedbackOk = () => {
    const shouldLeave = feedback?.okNavigates;
    setFeedback(null);
    if (shouldLeave) {
      markCustomerProfileNeedsRefresh();
      router.replace('/(customer)/profile');
    }
  };

  if (loading) return <View style={[s.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;

  if (!verified) {
    return (
      <View style={[s.container, { backgroundColor: colors.background }]}>
        <ProfileFeedbackModal
          visible={!!feedback}
          variant={feedback?.variant ?? 'error'}
          title={feedback?.title ?? ''}
          message={feedback?.message ?? ''}
          okNavigatesOnPress={!!feedback?.okNavigates}
          onBackdropPress={dismissFeedback}
          onOkPress={handleFeedbackOk}
        />
        <View style={[s.gateContainer, { backgroundColor: colors.background }]}>
          <View style={[s.gateIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="lock-closed" size={40} color={colors.primary} />
          </View>
          <Text style={[s.gateTitle, { color: colors.text }]}>Verify Your Identity</Text>
          <Text style={[s.gateSub, { color: colors.textSecondary }]}>Enter your password to edit your profile</Text>
          <TextInput style={[s.gateInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.inputBorder }]} value={password} onChangeText={setPassword}
            placeholder="Enter your password" placeholderTextColor={colors.textTertiary} secureTextEntry autoFocus />
          <TouchableOpacity style={[s.gateBtn, { backgroundColor: colors.primary }, !password.trim() && { opacity: 0.5 }]}
            onPress={handleVerify} disabled={verifying || !password.trim()}>
            {verifying ? <ActivityIndicator color="#fff" /> : <Text style={s.gateBtnText}>Verify</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <ProfileFeedbackModal
        visible={!!feedback}
        variant={feedback?.variant ?? 'error'}
        title={feedback?.title ?? ''}
        message={feedback?.message ?? ''}
        okNavigatesOnPress={!!feedback?.okNavigates}
        onBackdropPress={dismissFeedback}
        onOkPress={handleFeedbackOk}
      />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}>
        <Field label="First Name" value={firstName} onChange={setFirstName} colors={colors} />
        <Field label="Last Name" value={secondName} onChange={setSecondName} colors={colors} />
        <View style={{ marginBottom: 16 }}>
          <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Phone</Text>
          <View style={[s.phoneRow, { borderColor: colors.border, backgroundColor: colors.inputBg }]}>
            <TouchableOpacity
              style={[s.countryCodeBtn, { borderRightColor: colors.border, backgroundColor: colors.surfaceVariant }]}
              onPress={() => setShowPhoneCountryModal(true)}
              activeOpacity={0.7}
            >
              <Text style={s.countryFlag}>{selectedPhoneCountry?.flag || '🏳️'}</Text>
              <Text style={[s.countryMeta, { color: colors.text }]}>{selectedPhoneCountry?.isoCode || 'TN'} +{selectedPhoneCountry?.dialCode || '216'}</Text>
              <Text style={[s.countryArrow, { color: colors.textTertiary }]}>▾</Text>
            </TouchableOpacity>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0, borderWidth: 0, borderRadius: 0, backgroundColor: 'transparent', color: colors.text }]}
              value={phone}
              onChangeText={(text) => setPhone(text.replace(/[^\d\s]/g, ''))}
              keyboardType="phone-pad"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        </View>
        <Field label="Email" value={email} onChange={setEmail} keyboardType="email-address" colors={colors} />

        <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Gender</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          {['MALE', 'FEMALE'].map(g => (
            <TouchableOpacity
              key={g}
              style={[
                s.genderBtn,
                { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
                gender === g && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
              onPress={() => setGender(g)}
            >
              <Text style={[s.genderBtnText, { color: colors.text }, gender === g && { color: '#fff' }]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Referral Code Section */}
        {!hasReferralCode && (
          <View style={{ marginBottom: 16 }}>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Referral Code</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput
                style={[s.input, { flex: 1, backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                value={referralCodeInput}
                onChangeText={setReferralCodeInput}
                placeholder="Enter a referral code"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={[s.saveBtn, { flex: 0, paddingHorizontal: 20, marginTop: 0, backgroundColor: colors.primary }, (!referralCodeInput.trim() || referralApplying) && { opacity: 0.5 }]}
                onPress={handleApplyReferralCode}
                disabled={!referralCodeInput.trim() || referralApplying}
              >
                {referralApplying ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Apply</Text>}
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: colors.textTertiary, marginTop: 4 }}>
              You can only add a referral code once. It cannot be changed later.
            </Text>
          </View>
        )}
        {hasReferralCode && (
          <View style={{ marginBottom: 16 }}>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Referral Code</Text>
            <Text style={{ fontSize: 14, color: colors.success, fontWeight: '600' }}>✓ Referral code already applied</Text>
          </View>
        )}

        <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Save Changes</Text>}
        </TouchableOpacity>
      </ScrollView>
      <Modal visible={showPhoneCountryModal} transparent animationType="slide" onRequestClose={() => setShowPhoneCountryModal(false)}>
        <View style={s.pickerOverlay}>
          <View style={[s.pickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.pickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[s.pickerTitle, { color: colors.text }]}>Select country code</Text>
              <TouchableOpacity onPress={() => setShowPhoneCountryModal(false)} style={s.pickerCloseBtn}>
                <Text style={[s.pickerCloseText, { color: colors.textTertiary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={[s.pickerSearchWrap, { borderColor: colors.border, backgroundColor: colors.surfaceVariant }]}>
              <Text style={s.pickerSearchIcon}>🔍</Text>
              <TextInput
                style={[s.pickerSearchInput, { color: colors.text }]}
                placeholder="Search country, ISO or code"
                placeholderTextColor={colors.textTertiary}
                value={phoneCountrySearch}
                onChangeText={setPhoneCountrySearch}
              />
            </View>
            <FlatList
              keyboardShouldPersistTaps="handled"
              data={filteredPhoneCountries}
              keyExtractor={(country) => country.id}
              initialNumToRender={24}
              maxToRenderPerBatch={24}
              windowSize={8}
              contentContainerStyle={s.pickerList}
              renderItem={({ item: country }) => (
                <TouchableOpacity
                  style={[s.pickerItem, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    setSelectedPhoneCountry(country);
                    setShowPhoneCountryModal(false);
                    setPhoneCountrySearch('');
                  }}
                >
                  <Text style={s.pickerItemFlag}>{country.flag}</Text>
                  <View style={s.pickerItemTextWrap}>
                    <Text style={[s.pickerItemTitle, { color: colors.text }]}>{country.name}</Text>
                    <Text style={[s.pickerItemSub, { color: colors.textSecondary }]}>{country.isoCode} · +{country.dialCode}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  keyboardType,
  editable = true,
  multiline,
  colors,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | undefined;
  editable?: boolean;
  multiline?: boolean;
  colors: ThemeColors;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        style={[
          s.input,
          {
            backgroundColor: colors.inputBg,
            color: colors.text,
            borderColor: colors.border,
          },
          multiline && { height: 80, textAlignVertical: 'top' },
          !editable && { backgroundColor: colors.surfaceVariant, color: colors.textTertiary },
        ]}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        multiline={multiline}
        editable={editable}
        placeholderTextColor={colors.textTertiary}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingTop: 8, paddingBottom: 40 },
  gateContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  gateIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  gateTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 8 },
  gateSub: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 24 },
  gateInput: {
    width: '100%', backgroundColor: '#fff', borderRadius: 14, padding: 16,
    fontSize: 16, color: '#111827', borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16,
  },
  gateBtn: { width: '100%', backgroundColor: '#0284c7', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  gateBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 15, color: '#111827',
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  phoneRow: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  countryCodeBtn: {
    minWidth: 124,
    maxWidth: 152,
    paddingHorizontal: 10,
    paddingVertical: 14,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
  },
  countryFlag: { fontSize: 20 },
  countryMeta: { fontSize: 13, fontWeight: '700', color: '#111827', flexShrink: 1 },
  countryArrow: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  genderBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  genderBtnText: { fontSize: 14, fontWeight: '600' },
  saveBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.5)', justifyContent: 'flex-end' },
  pickerCard: { maxHeight: '78%', backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: '#e5e7eb' },
  pickerHeader: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  pickerCloseBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  pickerCloseText: { fontSize: 18, fontWeight: '700', color: '#6b7280' },
  pickerSearchWrap: { marginHorizontal: 14, marginTop: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickerSearchIcon: { fontSize: 14 },
  pickerSearchInput: { flex: 1, fontSize: 14, color: '#111827', padding: 0 },
  pickerList: { paddingBottom: 18 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb', gap: 10 },
  pickerItemFlag: { fontSize: 20 },
  pickerItemTextWrap: { flex: 1 },
  pickerItemTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  pickerItemSub: { fontSize: 12, marginTop: 2, color: '#6b7280' },
});
