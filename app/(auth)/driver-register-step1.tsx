import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Image, Modal, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useTheme } from '../../contexts/ThemeContext';
import {
  ensurePhoneCountriesLoaded,
  cachePhoneCountries,
  getCachedPreferredPhoneCountryIso,
  detectAndCachePreferredPhoneCountryIso,
  setCachedPreferredPhoneCountryIso,
  resolvePreferredPhoneCountry,
  toE164Phone,
  validateNationalPhoneForCountry,
  type PhoneCountry,
} from '../../services/phone-countries';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

try {
  GoogleSignin.configure({
    webClientId: '295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9.apps.googleusercontent.com',
    iosClientId: '295733709390-cmkprqadbcrannp1l4gl3drlab8b37r9.apps.googleusercontent.com',
    offlineAccess: true,
  });
} catch {}

export default function DriverRegisterStep1() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [formData, setFormData] = useState({
    phone: '', password: '', firstName: '', secondName: '',
    myEmail: '', userGender: '' as 'MALE' | 'FEMALE' | '',
  });
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [phoneCountries, setPhoneCountries] = useState<PhoneCountry[]>([]);
  const [selectedPhoneCountry, setSelectedPhoneCountry] = useState<PhoneCountry | null>(null);
  const [showPhoneCountryModal, setShowPhoneCountryModal] = useState(false);
  const [phoneCountrySearch, setPhoneCountrySearch] = useState('');
  const [resolvingPhoneCountry, setResolvingPhoneCountry] = useState(true);

  const filteredPhoneCountries = useMemo(() => {
    const q = phoneCountrySearch.trim().toLowerCase();
    if (!q) return phoneCountries;
    return phoneCountries.filter((c) =>
      c.name.toLowerCase().includes(q) || c.isoCode.toLowerCase().includes(q) || c.dialCode.includes(q),
    );
  }, [phoneCountries, phoneCountrySearch]);

  useEffect(() => {
    const bootstrapPhoneCountry = async () => {
      setResolvingPhoneCountry(true);
      try {
        const enriched = await ensurePhoneCountriesLoaded();
        setPhoneCountries(enriched);
        await cachePhoneCountries(enriched);
        const cachedIso = await getCachedPreferredPhoneCountryIso();
        const preferred = resolvePreferredPhoneCountry(enriched, cachedIso || 'TN');
        setSelectedPhoneCountry(preferred);
        if (!cachedIso) {
          void detectAndCachePreferredPhoneCountryIso().then((detectedIso) => {
            if (!detectedIso) return;
            const matched = resolvePreferredPhoneCountry(enriched, detectedIso);
            if (matched) setSelectedPhoneCountry(matched);
          });
        }
      } finally {
        setResolvingPhoneCountry(false);
      }
    };
    void bootstrapPhoneCountry();
  }, []);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission Denied', 'We need camera roll permissions.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setProfileImage(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission Denied', 'We need camera permissions.'); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled) setProfileImage(result.assets[0].uri);
  };

  const showImageOptions = () => {
    Alert.alert('Profile Picture', 'Choose an option', [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickImage },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      try { await GoogleSignin.signOut(); } catch {}
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken;
      if (!idToken) throw new Error('No ID token received from Google');

      const res = await axios.post(`${API_BASE}/auth/driver/google`, { idToken });
      await AsyncStorage.setItem('driverPendingToken', res.data.pendingToken);
      router.push('/(auth)/driver-register-step2');
    } catch (error: any) {
      let msg = 'Failed to sign in with Google';
      if (error.code === 'SIGN_IN_CANCELLED') msg = 'Sign-in was cancelled';
      else if (error.response?.data?.message) msg = Array.isArray(error.response.data.message) ? error.response.data.message.join('\n') : error.response.data.message;
      else if (error.message) msg = error.message;
      Alert.alert('Google Sign-In Failed', msg);
    } finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    if (!formData.phone || !formData.password) {
      Alert.alert('Error', 'Phone and password are required'); return;
    }
    if (!selectedPhoneCountry) {
      Alert.alert('Error', 'Please select a country for the phone number'); return;
    }
    const phoneCheck = validateNationalPhoneForCountry(
      selectedPhoneCountry.isoCode,
      selectedPhoneCountry.dialCode,
      formData.phone,
    );
    if (!phoneCheck.ok) {
      Alert.alert('Invalid phone', phoneCheck.message);
      return;
    }
    if (formData.password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters'); return;
    }

    setLoading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('phone', toE164Phone(selectedPhoneCountry.dialCode, formData.phone));
      formDataToSend.append('password', formData.password);
      if (formData.firstName) formDataToSend.append('firstName', formData.firstName);
      if (formData.secondName) formDataToSend.append('secondName', formData.secondName);
      if (formData.myEmail) formDataToSend.append('myEmail', formData.myEmail);
      if (formData.userGender) formDataToSend.append('userGender', formData.userGender);

      if (profileImage) {
        const filename = profileImage.split('/').pop();
        const match = /\.(\w+)$/.exec(filename || '');
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        formDataToSend.append('image', { uri: profileImage, name: filename || 'profile.jpg', type } as any);
      }

      const response = await axios.post(`${API_BASE}/auth/driver/register/step1`, formDataToSend, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      await AsyncStorage.setItem('driverPendingToken', response.data.pendingToken);
      router.push('/(auth)/driver-register-step2');
    } catch (error: any) {
      const rawMsg = error.response?.data?.message;
      const msg = Array.isArray(rawMsg) ? rawMsg.join('\n') : (rawMsg || error.message || 'An error occurred');
      Alert.alert('Registration Failed', String(msg));
    } finally { setLoading(false); }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollInner}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.heroCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
        <Text style={[styles.stepBadge, { color: colors.primary, backgroundColor: colors.primaryLight }]}>Step 1 of 3</Text>
        <Text style={[styles.title, { color: colors.text }]}>Personal information</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Photo, phone, and password to create your driver account.</Text>
      </View>

      {/* Profile Picture */}
      <View style={styles.imageContainer}>
        <TouchableOpacity onPress={showImageOptions} style={styles.imagePicker}>
          {profileImage ? (
            <Image source={{ uri: profileImage }} style={styles.profileImage} />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
              <Ionicons name="camera" size={40} color={colors.textSecondary} />
              <Text style={[styles.imageText, { color: colors.textSecondary }]}>Add Photo</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Google Sign-In */}
      <TouchableOpacity style={[styles.googleButton, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={handleGoogleSignIn} disabled={loading}>
        <Ionicons name="logo-google" size={24} color="#DB4437" />
        <Text style={[styles.googleButtonText, { color: colors.text }]}>Continue with Google</Text>
      </TouchableOpacity>

      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        <Text style={[styles.dividerText, { color: colors.textTertiary }]}>OR</Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Phone Number *</Text>
        <View style={[styles.phoneRow, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}>
          <TouchableOpacity
            style={[styles.countryCodeBtn, { borderRightColor: colors.inputBorder }]}
            onPress={() => setShowPhoneCountryModal(true)}
            activeOpacity={0.7}
          >
            {resolvingPhoneCountry ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Text style={styles.countryFlag}>{selectedPhoneCountry?.flag || '🏳️'}</Text>
                <Text style={[styles.countryMeta, { color: colors.text }]}>
                  {selectedPhoneCountry?.isoCode || 'TN'} +{selectedPhoneCountry?.dialCode || '216'}
                </Text>
                <Text style={[styles.countryArrow, { color: colors.textTertiary }]}>▾</Text>
              </>
            )}
          </TouchableOpacity>
          <TextInput
            style={[styles.phoneInput, { color: colors.text }]}
            placeholder="XX XXX XXX"
            placeholderTextColor={colors.textTertiary}
            value={formData.phone}
            onChangeText={text => setFormData({ ...formData, phone: text.replace(/[^\d\s]/g, '') })}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Password *</Text>
        <View style={[styles.passwordContainer, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}>
          <TextInput style={[styles.passwordInput, { color: colors.text }]} placeholder="Min 8 characters" placeholderTextColor={colors.textTertiary}
            value={formData.password} onChangeText={text => setFormData({ ...formData, password: text })}
            secureTextEntry={!showPassword} autoCapitalize="none" />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
            <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>First Name</Text>
        <TextInput style={[styles.input, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }]} placeholder="John" placeholderTextColor={colors.textTertiary} value={formData.firstName}
          onChangeText={text => setFormData({ ...formData, firstName: text })} />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Last Name</Text>
        <TextInput style={[styles.input, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }]} placeholder="Doe" placeholderTextColor={colors.textTertiary} value={formData.secondName}
          onChangeText={text => setFormData({ ...formData, secondName: text })} />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Email</Text>
        <TextInput style={[styles.input, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text }]} placeholder="john@example.com" placeholderTextColor={colors.textTertiary} value={formData.myEmail}
          onChangeText={text => setFormData({ ...formData, myEmail: text })}
          keyboardType="email-address" autoCapitalize="none" />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Gender</Text>
        <View style={styles.genderContainer}>
          {(['MALE', 'FEMALE'] as const).map(g => (
            <TouchableOpacity key={g}
              style={[styles.genderButton, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }, formData.userGender === g && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setFormData({ ...formData, userGender: g })}>
              <Text style={[styles.genderText, { color: colors.text }, formData.userGender === g && styles.genderTextActive]}>
                {g === 'MALE' ? 'Male' : 'Female'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={[styles.submitButton, { backgroundColor: colors.primary }, loading && styles.submitButtonDisabled]}
        onPress={handleSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Continue to Step 2</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.loginLink} onPress={() => router.push('/(auth)/driver-login')}>
        <Text style={[styles.loginLinkText, { color: colors.textSecondary }]}>
          Already have an account? <Text style={[styles.loginLinkBold, { color: colors.primary }]}>Login</Text>
        </Text>
      </TouchableOpacity>
      <Modal
        visible={showPhoneCountryModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPhoneCountryModal(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>Select country code</Text>
              <TouchableOpacity onPress={() => setShowPhoneCountryModal(false)} style={styles.pickerCloseBtn}>
                <Text style={[styles.pickerCloseText, { color: colors.textTertiary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.pickerSearchWrap, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}>
              <Text style={styles.pickerSearchIcon}>🔍</Text>
              <TextInput
                style={[styles.pickerSearchInput, { color: colors.text }]}
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
              contentContainerStyle={styles.pickerList}
              renderItem={({ item: country }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    setSelectedPhoneCountry(country);
                    void setCachedPreferredPhoneCountryIso(country.isoCode);
                    setShowPhoneCountryModal(false);
                    setPhoneCountrySearch('');
                  }}
                >
                  <Text style={styles.pickerItemFlag}>{country.flag}</Text>
                  <View style={styles.pickerItemTextWrap}>
                    <Text style={[styles.pickerItemTitle, { color: colors.text }]}>{country.name}</Text>
                    <Text style={[styles.pickerItemSub, { color: colors.textSecondary }]}>{country.isoCode} · +{country.dialCode}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollInner: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  heroCard: {
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 18,
    marginBottom: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  stepBadge: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 10,
  },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 300 },
  imageContainer: { alignItems: 'center', marginBottom: 20 },
  imagePicker: { width: 120, height: 120, borderRadius: 60, overflow: 'hidden' },
  profileImage: { width: '100%', height: '100%' },
  imagePlaceholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderStyle: 'dashed' },
  imageText: { marginTop: 8, fontSize: 14 },
  googleButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderWidth: 1, borderRadius: 8, gap: 12, marginBottom: 20 },
  googleButtonText: { fontSize: 16, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 16, fontSize: 14 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  phoneRow: {
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  countryCodeBtn: {
    minWidth: 124,
    maxWidth: 152,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRightWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countryFlag: { fontSize: 20 },
  countryMeta: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  countryArrow: { fontSize: 13, fontWeight: '700' },
  phoneInput: { flex: 1, padding: 12, fontSize: 16 },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8 },
  passwordInput: { flex: 1, padding: 12, fontSize: 16 },
  eyeIcon: { padding: 12 },
  genderContainer: { flexDirection: 'row', gap: 12 },
  genderButton: { flex: 1, padding: 12, borderWidth: 1, borderRadius: 8, alignItems: 'center' },
  genderText: { fontSize: 16 },
  genderTextActive: { color: '#fff', fontWeight: '600' },
  submitButton: { padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  loginLink: { marginTop: 20, marginBottom: 40, alignItems: 'center' },
  loginLinkText: { fontSize: 16 },
  loginLinkBold: { fontWeight: '600' },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerCard: {
    maxHeight: '78%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
  },
  pickerHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerTitle: { fontSize: 17, fontWeight: '700' },
  pickerCloseBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  pickerCloseText: { fontSize: 18, fontWeight: '700' },
  pickerSearchWrap: {
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickerSearchIcon: { fontSize: 14 },
  pickerSearchInput: { flex: 1, fontSize: 14, padding: 0 },
  pickerList: { paddingBottom: 18 },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  pickerItemFlag: { fontSize: 20 },
  pickerItemTextWrap: { flex: 1 },
  pickerItemTitle: { fontSize: 15, fontWeight: '600' },
  pickerItemSub: { fontSize: 12, marginTop: 2 },
});
