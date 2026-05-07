import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, Platform, ActivityIndicator, KeyboardAvoidingView, Modal, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import { saveLoginTimestamp } from '../../services/auth-session';
import { registerForPushNotifications, restoreOrderTrackingForCustomer } from '../../services/notifications';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

// Must match services/api/client.ts — use EXPO_PUBLIC_API_URL in dev/prod; localhost only as fallback for bare workflow.
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

export default function CustomerLoginScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [phoneCountries, setPhoneCountries] = useState<PhoneCountry[]>([]);
  const [selectedPhoneCountry, setSelectedPhoneCountry] = useState<PhoneCountry | null>(null);
  const [showPhoneCountryModal, setShowPhoneCountryModal] = useState(false);
  const [phoneCountrySearch, setPhoneCountrySearch] = useState('');
  const [resolvingPhoneCountry, setResolvingPhoneCountry] = useState(true);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginLockUntil, setLoginLockUntil] = useState(0);
  const [, bumpLockCountdown] = useState(0);

  // Google Auth - pass isLogin: true to prevent auto-registration
  const { handleGoogleSignIn, isLoading: isGoogleLoading, error: googleError } = useGoogleAuth('CUSTOMER', undefined, true);

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
    // Reset error
    setError(null);

    // Basic validation
    if (!phone || !password) {
      setError('Phone and password are required');
      return;
    }
    if (!selectedPhoneCountry) {
      setError('Please select a country for the phone number');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    const e164 = toE164Phone(selectedPhoneCountry.dialCode, phone);
    const lock = await getLoginLockStatus('customer', e164);
    if (lock.locked) {
      setLoginLockUntil(lock.lockedUntil);
      setError('Too many failed login attempts. Please wait before trying again.');
      return;
    }

    // Start submission
    setIsSubmitting(true);

    let loginHttpStatus: number | undefined;

    try {
      console.log('API_BASE_URL:', API_BASE_URL);
      console.log('Attempting login to:', `${API_BASE_URL}/auth/user/login`);
      
      // Call login API using fetch
      const response = await fetch(`${API_BASE_URL}/auth/user/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: e164,
          password,
          role: 'CUSTOMER',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        loginHttpStatus = response.status;
        // Handle specific error cases
        if (response.status === 404 || data.message?.includes('not found') || data.message?.includes('does not exist')) {
          throw new Error('Account not found. Please register first.');
        }
        if (response.status === 401 || data.message?.includes('Invalid credentials')) {
          throw new Error('Invalid phone number or password.');
        }
        // Handle error response
        throw new Error(data.message || 'Login failed. Please check your credentials.');
      }

      await clearLoginFailures('customer', e164);
      setLoginLockUntil(0);

      // Store JWT token in AsyncStorage
      await AsyncStorage.setItem('accessToken', data.accessToken);
      if (data.refreshToken) {
        await AsyncStorage.setItem('refreshToken', data.refreshToken);
      }
      await AsyncStorage.setItem('userRole', 'CUSTOMER');
      await saveLoginTimestamp();

      // Fetch user profile to store user and customer data
      const profileResponse = await fetch(`${API_BASE_URL}/customers/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.accessToken}`,
        },
      });

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        
        // profileData structure from CustomerResponseDto:
        // { id, userId, completedOrders, customerStatus, referredByCodeId, user: {...}, myReferralCode: {...} }
        
        // Store user data
        await AsyncStorage.setItem('user', JSON.stringify({
          id: profileData.user.id,
          phone: profileData.user.phone,
          firstName: profileData.user.firstName,
          secondName: profileData.user.secondName,
          image: profileData.user.image,
          myEmail: profileData.user.myEmail,
          role: 'CUSTOMER',
          createdAt: new Date().toISOString(), // We don't have this from the response
        }));
        
        // Store customer data
        await AsyncStorage.setItem('customer', JSON.stringify({
          id: profileData.id,
          userId: profileData.userId,
          completedOrders: profileData.completedOrders,
          customerStatus: profileData.customerStatus || 'ACTIVE',
          referredByCodeId: profileData.referredByCodeId,
        }));
      } else {
        console.error('Failed to fetch profile:', await profileResponse.text());
      }

      // Register for push notifications after successful login
      await registerForPushNotifications();
      await restoreOrderTrackingForCustomer();

      // Navigate to customer home screen
      router.replace('/(customer)/home');
    } catch (error: any) {
      console.error('Login error:', error);
      if (loginHttpStatus === 400 || loginHttpStatus === 401) {
        await recordLoginFailure('customer', e164);
      }
      setError(error.message || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    const result = await handleGoogleSignIn();
    if (result.success) {
      router.replace('/(customer)/home');
    } else if (result.error) {
      setError(result.error);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(40, insets.bottom + 24) }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <View style={[styles.heroCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
            <View style={[styles.iconContainer, { backgroundColor: colors.primary }]}>
              <Text style={styles.iconText}>📦</Text>
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Welcome back</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Sign in to track deliveries and manage orders.</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Phone Number</Text>
              <View style={[styles.phoneRow, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
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
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={(text) => {
                    setError(null);
                    setLoginLockUntil(0);
                    setPhone(text.replace(/[^\d\s]/g, ''));
                  }}
                  editable={!isSubmitting}
                />
              </View>
              <Text style={[styles.phoneHint, { color: colors.textTertiary }]}>International calling code is added automatically.</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>Password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder="Enter your password"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                value={password}
                onChangeText={(t) => {
                  setError(null);
                  setLoginLockUntil(0);
                  setPassword(t);
                }}
                editable={!isSubmitting}
              />
            </View>

            <TouchableOpacity
              style={styles.forgotButton}
              onPress={() =>
                router.push({
                  pathname: '/(auth)/customer-forgot-password',
                  params: {
                    prefillPhone: phone.trim(),
                    prefillDialCode: selectedPhoneCountry?.dialCode ?? '',
                    prefillIso: selectedPhoneCountry?.isoCode ?? '',
                  },
                })
              }
              disabled={isSubmitting}
            >
              <Text style={[styles.forgotText, { color: colors.primary }]}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* Error Display */}
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorIcon}>⚠</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.errorText}>{error}</Text>
                  {loginLockUntil > Date.now() ? (
                    <Text style={[styles.errorText, { marginTop: 6, opacity: 0.9 }]}>
                      Remaining wait: {'\u2212'}
                      {formatMsAsMmSs(loginLockUntil - Date.now())}
                    </Text>
                  ) : null}
                </View>
              </View>
            )}

            <TouchableOpacity 
              style={[
                styles.loginButton,
                { backgroundColor: colors.primary, shadowColor: colors.primary },
                isSubmitting && styles.loginButtonDisabled
              ]}
              onPress={handleLogin}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <View style={styles.loginButtonContent}>
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text style={styles.loginButtonText}>Logging in...</Text>
                </View>
              ) : (
                <Text style={styles.loginButtonText}>Login</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textSecondary }]}>OR</Text>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
            </View>

            {/* Google Sign-In Button */}
            <TouchableOpacity 
              style={[
                styles.googleButton,
                { backgroundColor: colors.card, borderColor: colors.border },
                isGoogleLoading && styles.googleButtonDisabled
              ]}
              onPress={handleGoogleLogin}
              disabled={isGoogleLoading || isSubmitting}
              activeOpacity={0.8}
            >
              {isGoogleLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={[styles.googleButtonText, { color: colors.text }]}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.registerLink}>
              <Text style={[styles.registerText, { color: colors.textSecondary }]}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => router.push('/(auth)/customer-register')}>
                <Text style={[styles.registerLinkText, { color: colors.primary }]}>Register</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
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
            <View style={[styles.pickerSearchWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 24,
  },
  heroCard: {
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 28,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  iconText: {
    fontSize: 36,
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
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontWeight: '600',
    fontSize: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
  },
  phoneRow: {
    borderWidth: 1,
    borderRadius: 12,
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
  phoneInput: { flex: 1, fontSize: 16, paddingHorizontal: 12, paddingVertical: 16 },
  phoneHint: { marginTop: 6, fontSize: 12 },
  forgotButton: {
    alignSelf: 'flex-end',
  },
  forgotText: {
    fontWeight: '500',
    fontSize: 15,
  },
  errorContainer: {
    flexDirection: 'row',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    alignItems: 'center',
  },
  errorIcon: {
    fontSize: 20,
    color: '#ef4444',
  },
  errorText: {
    flex: 1,
    color: '#991b1b',
    fontSize: 14,
    fontWeight: '500',
  },
  loginButton: {
    paddingVertical: 16,
    borderRadius: 12,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginTop: 8,
  },
  loginButtonDisabled: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0,
  },
  loginButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loginButtonText: {
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '500',
  },
  googleButton: {
    borderWidth: 1,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  registerLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  registerText: {
    fontSize: 15,
  },
  registerLinkText: {
    fontWeight: '600',
    fontSize: 15,
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
