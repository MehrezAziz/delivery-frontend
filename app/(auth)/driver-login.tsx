import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { saveLoginTimestamp } from '../../services/auth-session';
import { restoreOrderTrackingForDriver } from '../../services/notifications';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { persistDriverIdentityFromMe } from '../../utils/persistDriverIdentity';
import {
  ensurePhoneCountriesLoaded,
  cachePhoneCountries,
  getCachedPreferredPhoneCountryIso,
  detectAndCachePreferredPhoneCountryIso,
  resolvePreferredPhoneCountry,
  toE164Phone,
  type PhoneCountry,
} from '../../services/phone-countries';
import {
  clearLoginFailures,
  getLoginLockStatus,
  recordLoginFailure,
} from '../../services/login-attempt-lockout';
import { formatMsAsMmSs } from '../../utils/format-mm-ss';
import { describeGoogleSignInSetupError } from '../../config/googleSignIn';

/** Backend routes use global prefix `/api`. Env may already include `/api`. */
const RAW_API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const API_URL = RAW_API.replace(/\/$/, '').endsWith('/api')
  ? RAW_API.replace(/\/$/, '')
  : `${RAW_API.replace(/\/$/, '')}/api`;

function getDriverLoginErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Phone number or password is incorrect';
  }
  const status = error.response?.status;
  const raw = (error.response?.data as { message?: string | string[] } | undefined)?.message;
  const serverMsg = Array.isArray(raw) ? raw.join(' ') : typeof raw === 'string' ? raw : '';

  if (serverMsg.includes('Google OAuth') || serverMsg.includes('Google sign-in')) {
    return serverMsg;
  }
  if (serverMsg.toLowerCase().includes('suspend')) {
    return serverMsg;
  }
  if (status && status >= 500) {
    return 'Something went wrong. Please try again.';
  }
  return 'Phone number or password is incorrect';
}

function shouldRecordDriverLoginFailure(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  if (status !== 400 && status !== 401) return false;
  const raw = (error.response?.data as { message?: string | string[] } | undefined)?.message;
  const serverMsg = Array.isArray(raw) ? raw.join(' ') : typeof raw === 'string' ? raw : '';
  if (serverMsg.includes('Google OAuth') || serverMsg.includes('Google sign-in')) return false;
  if (serverMsg.toLowerCase().includes('suspend')) return false;
  return true;
}

export default function DriverLogin() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [phoneCountries, setPhoneCountries] = useState<PhoneCountry[]>([]);
  const [selectedPhoneCountry, setSelectedPhoneCountry] = useState<PhoneCountry | null>(null);
  const [showPhoneCountryModal, setShowPhoneCountryModal] = useState(false);
  const [phoneCountrySearch, setPhoneCountrySearch] = useState('');
  const [resolvingPhoneCountry, setResolvingPhoneCountry] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLockUntil, setLoginLockUntil] = useState(0);
  const [, bumpLockCountdown] = useState(0);

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

  useEffect(() => {
    if (!loginLockUntil || loginLockUntil <= Date.now()) return;
    const id = setInterval(() => {
      bumpLockCountdown((x) => x + 1);
      if (Date.now() >= loginLockUntil) setLoginLockUntil(0);
    }, 1000);
    return () => clearInterval(id);
  }, [loginLockUntil]);

  const handleLogin = async () => {
    // Validation
    if (!phone || !password) {
      Alert.alert('Error', 'Please enter phone and password');
      return;
    }
    if (!selectedPhoneCountry) {
      Alert.alert('Error', 'Please select a country for the phone number');
      return;
    }

    const e164 = toE164Phone(selectedPhoneCountry.dialCode, phone);
    const lock = await getLoginLockStatus('driver', e164);
    if (lock.locked) {
      setLoginLockUntil(lock.lockedUntil);
      setLoginError('Too many failed login attempts. Please wait before trying again.');
      return;
    }

    setLoginError(null);
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/auth/driver/login`, {
        phone: e164,
        password,
      });

      // Store tokens
      await AsyncStorage.setItem('accessToken', response.data.accessToken);
      await AsyncStorage.setItem('refreshToken', response.data.refreshToken);
      await AsyncStorage.setItem('userRole', 'DRIVER');
      await saveLoginTimestamp();

      // Get driver profile to extract IDs
      const profileResponse = await axios.get(`${API_URL}/drivers/me`, {
        headers: {
          Authorization: `Bearer ${response.data.accessToken}`,
        },
      });

      await AsyncStorage.setItem('userId', profileResponse.data.user.id);
      await AsyncStorage.setItem('driverId', profileResponse.data.id);
      await persistDriverIdentityFromMe(profileResponse.data);

      await restoreOrderTrackingForDriver();

      await clearLoginFailures('driver', e164);
      setLoginLockUntil(0);

      // Navigate to driver home
      router.replace('/(driver)/home');
    } catch (error: unknown) {
      if (__DEV__) {
        console.error('Login error:', error);
      }
      if (shouldRecordDriverLoginFailure(error)) {
        await recordLoginFailure('driver', e164);
      }
      setLoginError(getDriverLoginErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoginError(null);
    setLoginLockUntil(0);
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      
      // Force sign out to show account picker
      try {
        await GoogleSignin.signOut();
      } catch (e) {
        // Ignore
      }
      
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken;
      
      if (!idToken) {
        throw new Error('No ID token received from Google');
      }

      // Send to backend for login
      const backendResponse = await axios.post(`${API_URL}/auth/driver/google/login`, {
        idToken,
      });

      // Store tokens
      await AsyncStorage.setItem('accessToken', backendResponse.data.accessToken);
      await AsyncStorage.setItem('refreshToken', backendResponse.data.refreshToken);
      await AsyncStorage.setItem('userRole', 'DRIVER');
      await saveLoginTimestamp();

      // Get driver profile to extract IDs
      const profileResponse = await axios.get(`${API_URL}/drivers/me`, {
        headers: {
          Authorization: `Bearer ${backendResponse.data.accessToken}`,
        },
      });

      await AsyncStorage.setItem('userId', profileResponse.data.user.id);
      await AsyncStorage.setItem('driverId', profileResponse.data.id);
      await persistDriverIdentityFromMe(profileResponse.data);

      await restoreOrderTrackingForDriver();

      // Navigate to driver home
      router.replace('/(driver)/home');
    } catch (error: any) {
      console.error('Google Sign-In error:', error);

      let errorMessage = 'Failed to sign in with Google';
      const setupHint = describeGoogleSignInSetupError(error);
      if (setupHint) {
        errorMessage = setupHint;
      } else if (error.code === 'SIGN_IN_CANCELLED') {
        errorMessage = 'Sign-in was cancelled';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Google Sign-In Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.scrollInner,
        { paddingBottom: Math.max(40, insets.bottom + 24) },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.heroCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
        <View style={[styles.heroIcon, { backgroundColor: '#7c3aed' }]}>
          <Ionicons name="car-sport" size={34} color="#fff" />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Driver sign in</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Access deliveries, earnings, and your schedule.</Text>
      </View>

      {/* Phone Input */}
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Phone Number</Text>
        <View style={[styles.phoneRow, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}>
          <TouchableOpacity
            style={[styles.countryCodeBtn, { borderRightColor: colors.inputBorder }]}
            onPress={() => {
              setLoginError(null);
              setLoginLockUntil(0);
              setShowPhoneCountryModal(true);
            }}
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
            value={phone}
            onChangeText={(text) => {
              setLoginError(null);
              setLoginLockUntil(0);
              setPhone(text.replace(/[^\d\s]/g, ''));
            }}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
        </View>
      </View>

      {/* Password Input */}
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: colors.text }]}>Password</Text>
        <View style={[styles.passwordContainer, { borderColor: colors.inputBorder, backgroundColor: colors.inputBg }]}>
          <TextInput
            style={[styles.passwordInput, { color: colors.text }]}
            placeholder="Enter your password"
            placeholderTextColor={colors.textTertiary}
            value={password}
            onChangeText={(text) => {
              setLoginError(null);
              setLoginLockUntil(0);
              setPassword(text);
            }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeIcon}
          >
            <Ionicons
              name={showPassword ? 'eye-off' : 'eye'}
              size={24}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
        {loginError ? (
          <View style={styles.loginErrorBlock} accessibilityLiveRegion="polite">
            <Text style={[styles.loginErrorTitle, { color: colors.danger }]}>Login failed</Text>
            <Text style={[styles.loginErrorBody, { color: colors.danger }]}>{loginError}</Text>
            {loginLockUntil > Date.now() ? (
              <Text style={[styles.loginErrorBody, { color: colors.textSecondary, marginTop: 4 }]}>
                Remaining wait: {'\u2212'}
                {formatMsAsMmSs(loginLockUntil - Date.now())}
              </Text>
            ) : null}
          </View>
        ) : null}
        <TouchableOpacity
          style={styles.forgotPassword}
          onPress={() =>
            router.push({
              pathname: '/(auth)/driver-forgot-password',
              params: {
                prefillPhone: phone.trim(),
                prefillDialCode: selectedPhoneCountry?.dialCode ?? '',
                prefillIso: selectedPhoneCountry?.isoCode ?? '',
              },
            })
          }
          disabled={loading}
        >
          <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>Forgot Password?</Text>
        </TouchableOpacity>
      </View>

      {/* Login Button */}
      <TouchableOpacity
        style={[styles.loginButton, { backgroundColor: colors.primary }, loading && styles.loginButtonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.loginButtonText}>Login</Text>
        )}
      </TouchableOpacity>

      {/* Divider */}
      <View style={styles.divider}>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        <Text style={[styles.dividerText, { color: colors.textTertiary }]}>OR</Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>

      {/* Google Login Button */}
      <TouchableOpacity
        style={[styles.googleButton, { borderColor: colors.border, backgroundColor: colors.card }]}
        onPress={handleGoogleLogin}
      >
        <Ionicons name="logo-google" size={24} color="#DB4437" />
        <Text style={[styles.googleButtonText, { color: colors.text }]}>Continue with Google</Text>
      </TouchableOpacity>

      {/* Register Link */}
      <TouchableOpacity
        style={styles.registerLink}
        onPress={() => router.push('/(auth)/driver-register-step1')}
      >
        <Text style={[styles.registerLinkText, { color: colors.textSecondary }]}>
          Don't have an account? <Text style={[styles.registerLinkBold, { color: colors.primary }]}>Register</Text>
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
                    setLoginError(null);
                    setLoginLockUntil(0);
                    setSelectedPhoneCountry(country);
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
  container: {
    flex: 1,
  },
  scrollInner: {
    paddingHorizontal: 22,
    paddingTop: 8,
  },
  heroCard: {
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 24,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  phoneRow: {
    borderWidth: 1,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
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
  phoneInput: { flex: 1, fontSize: 16, paddingHorizontal: 12, paddingVertical: 14 },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
  },
  eyeIcon: {
    padding: 12,
  },
  loginErrorBlock: {
    marginTop: 10,
    gap: 4,
  },
  loginErrorTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  loginErrorBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  loginButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 30,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderRadius: 8,
    gap: 12,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  registerLink: {
    marginTop: 30,
    alignItems: 'center',
  },
  registerLinkText: {
    fontSize: 16,
  },
  registerLinkBold: {
    fontWeight: '600',
  },
  forgotPassword: {
    marginTop: 12,
    alignSelf: 'flex-end',
  },
  forgotPasswordText: {
    fontSize: 15,
    fontWeight: '600',
  },
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
