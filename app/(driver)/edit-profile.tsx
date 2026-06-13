import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
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
import { EditProfileBiometricVerifyButton } from '../../components/EditProfileBiometricVerifyButton';
import { markDriverProfileNeedsRefresh } from '../../utils/profileRefreshSignals';
import {
  getBiometricPrimaryLabel,
  getBiometricSwitchLinkLabel,
  getLocalAuthentication,
} from '../../utils/editProfileBiometricGate';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export default function DriverEditProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
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
  const [vehicleType, setVehicleType] = useState('');
  const [description, setDescription] = useState('');
  const [canUseBiometric, setCanUseBiometric] = useState(false);
  const [biometricPrimaryLabel, setBiometricPrimaryLabel] = useState('Verify with biometrics');
  const [biometricSwitchLinkLabel, setBiometricSwitchLinkLabel] = useState('Use biometrics');
  const [preferPassword, setPreferPassword] = useState(false);
  const [showBiometricPasswordFallback, setShowBiometricPasswordFallback] = useState(false);
  const autoBiometricPromptedRef = useRef(false);
  const biometricVerifyRef = useRef<() => Promise<void>>(async () => {});
  const filteredPhoneCountries = useMemo(() => {
    const q = phoneCountrySearch.trim().toLowerCase();
    if (!q) return phoneCountries;
    return phoneCountries.filter((c) =>
      c.name.toLowerCase().includes(q) || c.isoCode.toLowerCase().includes(q) || c.dialCode.includes(q),
    );
  }, [phoneCountries, phoneCountrySearch]);

  useEffect(() => {
    checkGoogleUser();
  }, []);

  const checkGoogleUser = async () => {
    try {
      const countries = await ensurePhoneCountriesLoaded();
      setPhoneCountries(countries);
      await cachePhoneCountries(countries);
      const cachedIso = await getCachedPreferredPhoneCountryIso();
      const fallbackIso = cachedIso || 'TN';
      if (!cachedIso) void detectAndCachePreferredPhoneCountryIso();

      const token = await AsyncStorage.getItem('accessToken');
      const res = await axios.get(`${API_URL}/drivers/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = res.data;
      setFirstName(d.user?.firstName || '');
      setSecondName(d.user?.secondName || '');
      const backendPhone = d.user?.phone || '';
      const inferred = inferPhoneCountryAndLocal(countries, backendPhone, fallbackIso);
      setSelectedPhoneCountry(inferred.country);
      setPhone(inferred.localPhone);
      setEmail(d.user?.myEmail || '');
      setGender(d.user?.userGender || null);
      setVehicleType(d.vehicleType || '');
      setDescription(d.description || '');
      // Users without password (Google OAuth) — skip verification
      if (!d.user?.hasPassword) {
        setIsGoogleUser(true);
        setVerified(true);
        setCanUseBiometric(false);
      } else {
        let bioOk = false;
        let label = t('biometric.verifyWithBiometrics');
        const LA = await getLocalAuthentication();
        if (LA) {
          try {
            const hw = await LA.hasHardwareAsync();
            const enrolled = await LA.isEnrolledAsync();
            bioOk = hw && enrolled;
            if (bioOk) {
              const types = await LA.supportedAuthenticationTypesAsync();
              label = getBiometricPrimaryLabel(types);
              setBiometricSwitchLinkLabel(getBiometricSwitchLinkLabel(types));
            }
          } catch {
            bioOk = false;
          }
        }
        setCanUseBiometric(bioOk);
        setBiometricPrimaryLabel(label);
        if (!bioOk) setPreferPassword(true);
        else setPreferPassword(false);
        setShowBiometricPasswordFallback(false);
        autoBiometricPromptedRef.current = false;
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleBiometricVerify = async () => {
    setVerifying(true);
    let success = false;
    try {
      const LA = await getLocalAuthentication();
      if (!LA) {
        setPreferPassword(true);
        setFeedback({
          variant: 'error',
          title: t('common.error'),
          message: t('common.tryAgain'),
          okNavigates: false,
        });
        return;
      }
      const compatible = await LA.hasHardwareAsync();
      const enrolled = await LA.isEnrolledAsync();
      if (!compatible || !enrolled) {
        setPreferPassword(true);
        setFeedback({
          variant: 'error',
          title: t('common.error'),
          message: t('common.tryAgain'),
          okNavigates: false,
        });
        return;
      }
      const auth = await LA.authenticateAsync({
        promptMessage: t('editProfile.verifyIdentityBody'),
        cancelLabel: t('common.cancel'),
        disableDeviceFallback: true,
      });
      if (auth.success) {
        setVerified(true);
        success = true;
      } else if (auth.error === 'user_cancel' || auth.error === 'system_cancel') {
        /* quiet */
      } else {
        setFeedback({
          variant: 'error',
          title: t('common.error'),
          message: t('common.tryAgain'),
          okNavigates: false,
        });
      }
    } catch (e: any) {
      setFeedback({
        variant: 'error',
        title: t('common.error'),
        message: e?.message || t('common.tryAgain'),
        okNavigates: false,
      });
    } finally {
      setVerifying(false);
      if (!success) setShowBiometricPasswordFallback(true);
    }
  };

  biometricVerifyRef.current = handleBiometricVerify;

  useEffect(() => {
    if (loading || verified || !canUseBiometric || preferPassword) return;
    if (autoBiometricPromptedRef.current) return;
    autoBiometricPromptedRef.current = true;
    void biometricVerifyRef.current();
  }, [loading, verified, canUseBiometric, preferPassword]);

  const handleVerify = async () => {
    if (!password.trim()) return;
    setVerifying(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      await axios.post(`${API_URL}/auth/verify-password`, { password }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVerified(true);
    } catch (e: any) {
      setFeedback({
        variant: 'error',
        title: t('common.error'),
        message: e.response?.data?.message || t('auth.invalidPassword'),
        okNavigates: false,
      });
    } finally { setVerifying(false); }
  };

  const handleSave = async () => {
    if (!selectedPhoneCountry) {
      setFeedback({
        variant: 'error',
        title: t('common.error'),
        message: t('auth.selectCountryRequired'),
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
        title: t('common.error'),
        message: phoneCheck.message,
        okNavigates: false,
      });
      return;
    }

    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('accessToken');
      // Update user fields
      await axios.patch(`${API_URL}/auth/user/complete-profile`, {
        firstName: firstName.trim() || undefined,
        secondName: secondName.trim() || undefined,
        myEmail: email.trim() || undefined,
      }, { headers: { Authorization: `Bearer ${token}` } });

      // Update phone if changed (need a separate endpoint or use the same)
      // For now, phone update goes through complete-profile too
      // Update driver-specific fields via drivers endpoint
      await axios.patch(`${API_URL}/drivers/me`, {
        vehicleType: vehicleType.trim() || undefined,
        description: description.trim() || undefined,
        phone: selectedPhoneCountry ? toE164Phone(selectedPhoneCountry.dialCode, phone) : phone.trim() || undefined,
        userGender: gender || undefined,
      }, { headers: { Authorization: `Bearer ${token}` } });

      setFeedback({
        variant: 'success',
        title: t('editProfile.saved'),
        message: t('editProfile.saved'),
        okNavigates: true,
      });
    } catch (e: any) {
      setFeedback({
        variant: 'error',
        title: t('common.error'),
        message: e.response?.data?.message || t('editProfile.saveFailed'),
        okNavigates: false,
      });
    } finally { setSaving(false); }
  };

  const dismissFeedback = () => setFeedback(null);

  const handleFeedbackOk = () => {
    const shouldLeave = feedback?.okNavigates;
    setFeedback(null);
    if (shouldLeave) {
      markDriverProfileNeedsRefresh();
      router.replace('/(driver)/profile');
    }
  };

  if (loading) {
    return <View style={[s.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  // Password / biometric gate
  if (!verified) {
    const showBiometricFirst = canUseBiometric && !preferPassword;
    const biometricIconName =
      biometricPrimaryLabel.includes('fingerprint') && !biometricPrimaryLabel.includes('Face')
        ? 'finger-print-outline'
        : 'scan-outline';

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
            <Ionicons
              name={showBiometricFirst ? biometricIconName : 'lock-closed'}
              size={40}
              color={colors.primary}
            />
          </View>
          <Text style={[s.gateTitle, { color: colors.text }]}>{t('editProfile.verifyIdentity')}</Text>
          <Text style={[s.gateSub, { color: colors.textSecondary }]}>
            {t('editProfile.verifyIdentityBody')}
          </Text>

          {showBiometricFirst ? (
            <>
              <EditProfileBiometricVerifyButton
                onPress={handleBiometricVerify}
                verifying={verifying}
                disabled={verifying}
                colors={colors}
                label={biometricPrimaryLabel}
              />
              {showBiometricPasswordFallback ? (
                <TouchableOpacity style={s.gateLinkBtn} onPress={() => setPreferPassword(true)} disabled={verifying}>
                  <Text style={[s.gateLinkText, { color: colors.primary }]}>{t('auth.password')}</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <>
              <TextInput
                style={[s.gateInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
                value={password}
                onChangeText={setPassword}
                placeholder={t('auth.password')}
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                autoFocus
              />
              <TouchableOpacity
                style={[s.gateBtn, { backgroundColor: colors.primary }, !password.trim() && { opacity: 0.5 }]}
                onPress={handleVerify}
                disabled={verifying || !password.trim()}
              >
                {verifying ? <ActivityIndicator color="#fff" /> : <Text style={s.gateBtnText}>{t('forgotPassword.verify')}</Text>}
              </TouchableOpacity>
              {canUseBiometric ? (
                <TouchableOpacity style={s.gateLinkBtn} onPress={() => setPreferPassword(false)} disabled={verifying}>
                  <Text style={[s.gateLinkText, { color: colors.primary }]}>{biometricSwitchLinkLabel}</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
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
        <Field label={t('editProfile.firstName')} value={firstName} onChange={setFirstName} colors={colors} />
        <Field label={t('editProfile.lastName')} value={secondName} onChange={setSecondName} colors={colors} />
        <View style={{ marginBottom: 16 }}>
          <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('editProfile.phone')}</Text>
          <View style={[s.phoneRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
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
        <Field label={t('editProfile.email')} value={email} onChange={setEmail} keyboardType="email-address" colors={colors} />
        <Field label={t('auth.vehicleType')} value={vehicleType} onChange={setVehicleType} colors={colors} />
        <Field label={t('createOrder.packageDescription')} value={description} onChange={setDescription} multiline colors={colors} />

        <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('auth.selectGender')}</Text>
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

        <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>{t('editProfile.save')}</Text>}
        </TouchableOpacity>
      </ScrollView>
      <Modal visible={showPhoneCountryModal} transparent animationType="slide" onRequestClose={() => setShowPhoneCountryModal(false)}>
        <View style={s.pickerOverlay}>
          <View style={[s.pickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[s.pickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[s.pickerTitle, { color: colors.text }]}>{t('auth.selectCountryCode')}</Text>
              <TouchableOpacity onPress={() => setShowPhoneCountryModal(false)} style={s.pickerCloseBtn}>
                <Text style={[s.pickerCloseText, { color: colors.textTertiary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={[s.pickerSearchWrap, { borderColor: colors.border, backgroundColor: colors.surfaceVariant }]}>
              <Text style={s.pickerSearchIcon}>🔍</Text>
              <TextInput
                style={[s.pickerSearchInput, { color: colors.text }]}
                placeholder={t('common.search')}
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

function Field({ label, value, onChange, keyboardType, multiline, colors }: any) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput style={[s.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }, multiline && { height: 80, textAlignVertical: 'top' }]}
        value={value} onChangeText={onChange} keyboardType={keyboardType}
        multiline={multiline} placeholderTextColor={colors.textTertiary} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingTop: 8, paddingBottom: 40 },
  // Password gate
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
  gateBtn: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  gateBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  gateLinkBtn: { marginTop: 18, paddingVertical: 12, paddingHorizontal: 16 },
  gateLinkText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  // Form
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 15, color: '#111827',
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  phoneRow: { borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  countryCodeBtn: {
    minWidth: 124,
    maxWidth: 152,
    paddingHorizontal: 10,
    paddingVertical: 14,
    borderRightWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countryFlag: { fontSize: 20 },
  countryMeta: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  countryArrow: { fontSize: 13, fontWeight: '700' },
  genderBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  genderBtnText: { fontSize: 14, fontWeight: '600' },
  saveBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.5)', justifyContent: 'flex-end' },
  pickerCard: { maxHeight: '78%', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1 },
  pickerHeader: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerTitle: { fontSize: 17, fontWeight: '700' },
  pickerCloseBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  pickerCloseText: { fontSize: 18, fontWeight: '700' },
  pickerSearchWrap: { marginHorizontal: 14, marginTop: 12, marginBottom: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickerSearchIcon: { fontSize: 14 },
  pickerSearchInput: { flex: 1, fontSize: 14, padding: 0 },
  pickerList: { paddingBottom: 18 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  pickerItemFlag: { fontSize: 20 },
  pickerItemTextWrap: { flex: 1 },
  pickerItemTitle: { fontSize: 15, fontWeight: '600' },
  pickerItemSub: { fontSize: 12, marginTop: 2 },
});
