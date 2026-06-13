import { View, Text, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, ActivityIndicator, Modal, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useGoogleAuth } from '../../hooks/useGoogleAuth';
import { saveLoginTimestamp } from '../../services/auth-session';
import { restoreOrderTrackingForCustomer } from '../../services/notifications';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ensurePhoneCountriesLoaded,
  cachePhoneCountries,
  getCachedPreferredPhoneCountryIso,
  detectAndCachePreferredPhoneCountryIso,
  validateNationalPhoneForCountry,
  type PhoneCountry,
} from '../../services/phone-countries';

// Must match services/api/client.ts — use EXPO_PUBLIC_API_URL in dev/prod; localhost only as fallback.
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

function toE164(dialCode: string, localPhoneRaw: string): string {
  const localDigits = localPhoneRaw.replace(/\D/g, '');
  const noTrunkPrefix = localDigits.replace(/^0+/, '');
  const national = noTrunkPrefix.length > 0 ? noTrunkPrefix : localDigits;
  return `+${dialCode}${national}`;
}

export default function CustomerRegisterScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [phoneCountries, setPhoneCountries] = useState<PhoneCountry[]>([]);
  const [selectedPhoneCountry, setSelectedPhoneCountry] = useState<PhoneCountry | null>(null);
  const [showPhoneCountryModal, setShowPhoneCountryModal] = useState(false);
  const [phoneCountrySearch, setPhoneCountrySearch] = useState('');
  const [resolvingPhoneCountry, setResolvingPhoneCountry] = useState(true);
  const [formData, setFormData] = useState({
    firstName: '',
    secondName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
    userGender: '', // 'MALE' or 'FEMALE'
    referralCode: '',
  });

  const [referralValidation, setReferralValidation] = useState<{
    isValidating: boolean;
    isValid: boolean | null;
    validatedCode: any | null;
    error: string | null;
  }>({
    isValidating: false,
    isValid: null,
    validatedCode: null,
    error: null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showAccountExistsModal, setShowAccountExistsModal] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

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
        const preferredIso = cachedIso || 'TN';

        const detected = enriched.find((c) => c.isoCode === preferredIso);
        const fallbackTunisia = enriched.find((c) => c.isoCode === 'TN');
        setSelectedPhoneCountry(detected || fallbackTunisia || enriched[0] || null);

        // Do not block UI on geolocation: only refine in background when ISO is not cached yet.
        if (!cachedIso) {
          void detectAndCachePreferredPhoneCountryIso().then((detectedIso) => {
            if (!detectedIso) return;
            const matched = enriched.find((c) => c.isoCode === detectedIso);
            if (matched) setSelectedPhoneCountry(matched);
          });
        }
      } catch {
        // Last-resort fallback ensures registration stays usable.
        const fallbackTunisia = {
          id: 'fallback-tn',
          name: 'Tunisia',
          isoCode: 'TN',
          dialCode: '216',
          flag: '🇹🇳',
        };
        setPhoneCountries([fallbackTunisia]);
        setSelectedPhoneCountry(fallbackTunisia);
      } finally {
        setResolvingPhoneCountry(false);
      }
    };

    void bootstrapPhoneCountry();
  }, []);

  // Google Auth hook
  const { handleGoogleSignIn, isLoading: isGoogleLoading, error: googleError } = useGoogleAuth(
    'CUSTOMER',
    formData.referralCode.trim() || undefined,
    false,
    acceptTerms,
  );

  const handleValidateReferralCode = async () => {
    const code = formData.referralCode.trim();
    
    if (!code) {
      setReferralValidation({
        isValidating: false,
        isValid: null,
        validatedCode: null,
        error: null,
      });
      return;
    }

    setReferralValidation({
      isValidating: true,
      isValid: null,
      validatedCode: null,
      error: null,
    });

    try {
      const response = await fetch(`${API_BASE_URL}/referral/validate/${code}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || t('auth.invalidReferralCode'));
      }

      setReferralValidation({
        isValidating: false,
        isValid: true,
        validatedCode: data,
        error: null,
      });
    } catch (error: any) {
      setReferralValidation({
        isValidating: false,
        isValid: false,
        validatedCode: null,
        error: error.message || t('auth.invalidReferralCode'),
      });
    }
  };

  const handleRegister = async () => {
    // Reset error
    setSubmitError(null);

    // Basic validation
    if (!formData.phone || !formData.password) {
      setSubmitError(t('auth.phoneAndPasswordRequired'));
      return;
    }
    if (!selectedPhoneCountry) {
      setSubmitError(t('auth.selectCountryRequired'));
      return;
    }
    const phoneCheck = validateNationalPhoneForCountry(
      selectedPhoneCountry.isoCode,
      selectedPhoneCountry.dialCode,
      formData.phone,
    );
    if (!phoneCheck.ok) {
      setSubmitError(phoneCheck.message);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setSubmitError(t('auth.passwordsDoNotMatch'));
      return;
    }

    if (formData.password.length < 8) {
      setSubmitError(t('auth.passwordMinLength'));
      return;
    }

    if (!acceptTerms) {
      setSubmitError(t('auth.mustAcceptApplicationTerms'));
      return;
    }

    // Start submission
    setIsSubmitting(true);

    try {
      // Prepare registration data
      const fullInternationalPhone = toE164(selectedPhoneCountry.dialCode, formData.phone);
      const registrationData = {
        phone: fullInternationalPhone,
        password: formData.password,
        firstName: formData.firstName || undefined,
        secondName: formData.secondName || undefined,
        myEmail: formData.email || undefined,
        userGender: formData.userGender ? (formData.userGender as 'MALE' | 'FEMALE') : undefined,
        referralCode: formData.referralCode.trim() || undefined,
        acceptTerms: true,
      };

      // Call registration API using fetch
      const response = await fetch(`${API_BASE_URL}/auth/customer/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registrationData),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle error response
        let errorMessage = data.message || t('auth.registrationFailedRetry');
        
        // Check if account already exists (phone conflict)
        if (response.status === 409) {
          errorMessage = t('auth.phoneAlreadyExists');
        }
        
        // Map error codes to user-friendly messages
        if (data.errorCode) {
          switch (data.errorCode) {
            case 'INVALID_REFERRAL_CODE':
              errorMessage = t('auth.referralExpired');
              break;
            case 'USAGE_LIMIT_EXCEEDED':
              errorMessage = t('auth.referralUsageLimit');
              break;
            case 'CANNOT_USE_OWN_CODE':
              errorMessage = t('auth.cannotUseOwnReferral');
              break;
            case 'REFERRAL_CODE_EXPIRED':
              errorMessage = t('auth.referralCodeExpired');
              break;
            case 'REFERRAL_CODE_NOT_YET_VALID':
              errorMessage = t('auth.referralNotYetValid');
              break;
          }
        }
        
        throw new Error(errorMessage);
      }

      // Store JWT token in AsyncStorage
      await AsyncStorage.setItem('accessToken', data.accessToken);

      // Store user and customer data
      await AsyncStorage.setItem('user', JSON.stringify(data.user));
      await AsyncStorage.setItem('customer', JSON.stringify(data.customer));
      await AsyncStorage.setItem('userRole', 'CUSTOMER');
      await saveLoginTimestamp();

      // Push token: (customer)/_layout registers after navigation (avoids double getToken on Android).
      await restoreOrderTrackingForCustomer();

      // Navigate to customer home (setup country/wallet is optional, done from profile)
      router.replace('/(customer)/home');
    } catch (error: any) {
      console.error('Registration error:', error);
      setSubmitError(error.message || t('auth.registrationFailedRetry'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleRegister = async () => {
    setSubmitError(null);
    if (!acceptTerms) {
      setSubmitError(t('auth.mustAcceptApplicationTerms'));
      return;
    }
    const result = await handleGoogleSignIn();
    
    if (result.success) {
      router.replace('/(customer)/home');
    } else if (result.errorCode === 'ACCOUNT_EXISTS' || result.error === 'ACCOUNT_EXISTS') {
      setShowAccountExistsModal(true);
    } else if (result.error) {
      setSubmitError(result.error);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      {/* Account Exists Modal */}
      <Modal
        visible={showAccountExistsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAccountExistsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('auth.accountExists')}</Text>
            <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
              {t('auth.accountExistsCustomerBody')}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtnSecondary, { backgroundColor: colors.surfaceVariant }]}
                onPress={() => setShowAccountExistsModal(false)}
              >
                <Text style={[styles.modalBtnSecondaryText, { color: colors.text }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnPrimary, { backgroundColor: colors.primary }]}
                onPress={() => {
                  setShowAccountExistsModal(false);
                  router.replace('/(auth)/customer-login');
                }}
              >
                <Text style={styles.modalBtnPrimaryText}>{t('auth.goToLogin')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(40, insets.bottom + 24) }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <View style={[styles.heroCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
            <View style={[styles.iconContainer, { backgroundColor: colors.primary }]}>
              <Text style={styles.iconText}>📦</Text>
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{t('auth.createAccount')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('auth.customerRegisterSubtitle')}</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>{t('auth.firstName')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder={t('auth.enterFirstName')}
                placeholderTextColor={colors.textTertiary}
                value={formData.firstName}
                onChangeText={(text) => setFormData({...formData, firstName: text})}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>{t('auth.secondName')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder={t('auth.enterLastName')}
                placeholderTextColor={colors.textTertiary}
                value={formData.secondName}
                onChangeText={(text) => setFormData({...formData, secondName: text})}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>{t('auth.phoneNumber')}</Text>
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
                  placeholder={t('auth.phoneNumberPlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="phone-pad"
                  value={formData.phone}
                  onChangeText={(text) => setFormData({ ...formData, phone: text.replace(/[^\d\s]/g, '') })}
                />
              </View>
              <Text style={[styles.phoneHint, { color: colors.textTertiary }]}>
                {t('auth.phoneHint')}
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>{t('auth.emailOptional')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder={t('auth.emailPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                value={formData.email}
                onChangeText={(text) => setFormData({...formData, email: text})}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>{t('auth.genderOptional')}</Text>
              <View style={styles.genderContainer}>
                <TouchableOpacity
                  style={[
                    styles.genderButton,
                    { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
                    formData.userGender === 'MALE' && [styles.genderButtonActive, { backgroundColor: colors.primary, borderColor: colors.primary }]
                  ]}
                  onPress={() => setFormData({...formData, userGender: 'MALE'})}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.genderButtonText,
                    { color: colors.textSecondary },
                    formData.userGender === 'MALE' && styles.genderButtonTextActive
                  ]}>{t('auth.male')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.genderButton,
                    { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
                    formData.userGender === 'FEMALE' && [styles.genderButtonActive, { backgroundColor: colors.primary, borderColor: colors.primary }]
                  ]}
                  onPress={() => setFormData({...formData, userGender: 'FEMALE'})}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.genderButtonText,
                    { color: colors.textSecondary },
                    formData.userGender === 'FEMALE' && styles.genderButtonTextActive
                  ]}>{t('auth.female')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>{t('auth.referralCodeOptional')}</Text>
              <View style={styles.referralCodeContainer}>
                <TextInput
                  style={[styles.input, styles.referralCodeInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                  placeholder={t('auth.enterReferralCode')}
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="characters"
                  value={formData.referralCode}
                  onChangeText={(text) => {
                    setFormData({...formData, referralCode: text.toUpperCase()});
                    // Reset validation when code changes
                    setReferralValidation({
                      isValidating: false,
                      isValid: null,
                      validatedCode: null,
                      error: null,
                    });
                  }}
                />
                <TouchableOpacity
                  style={[
                    styles.validateButton,
                    { backgroundColor: colors.primary },
                    !formData.referralCode.trim() && styles.validateButtonDisabled
                  ]}
                  onPress={handleValidateReferralCode}
                  disabled={!formData.referralCode.trim() || referralValidation.isValidating}
                  activeOpacity={0.7}
                >
                  {referralValidation.isValidating ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.validateButtonText}>{t('auth.validate')}</Text>
                  )}
                </TouchableOpacity>
              </View>
              
              {/* Validation Result */}
              {referralValidation.isValid === true && referralValidation.validatedCode && (
                <View style={styles.validationSuccess}>
                  <Text style={styles.validationSuccessIcon}>✓</Text>
                  <View style={styles.validationSuccessContent}>
                    <Text style={styles.validationSuccessTitle}>{t('auth.validCode')}</Text>
                    <Text style={styles.validationSuccessText}>
                      {referralValidation.validatedCode.type === 'PERCENTAGE'
                        ? t('auth.getDiscountPct', { value: referralValidation.validatedCode.value })
                        : t('auth.getDiscountAmount', { value: referralValidation.validatedCode.value })}
                      {referralValidation.validatedCode.minOrderAmount &&
                        t('auth.onOrdersOver', { amount: referralValidation.validatedCode.minOrderAmount })}
                    </Text>
                  </View>
                </View>
              )}
              
              {referralValidation.isValid === false && (
                <View style={styles.validationError}>
                  <Text style={styles.validationErrorIcon}>✕</Text>
                  <Text style={styles.validationErrorText}>
                    {referralValidation.error || t('auth.invalidReferralCode')}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>{t('auth.password')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder={t('auth.createPassword')}
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                value={formData.password}
                onChangeText={(text) => setFormData({...formData, password: text})}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>{t('auth.confirmPassword')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder={t('auth.confirmYourPassword')}
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                value={formData.confirmPassword}
                onChangeText={(text) => setFormData({...formData, confirmPassword: text})}
              />
            </View>

            <TouchableOpacity
              style={styles.termsRow}
              onPress={() => setAcceptTerms(!acceptTerms)}
              activeOpacity={0.7}
            >
              <View style={[styles.termsBox, acceptTerms && styles.termsBoxOn]}>
                {acceptTerms ? <Text style={{ color: '#fff' }}>✓</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.termsText, { color: colors.text }]}>
                  {t('auth.iAgreeTerms')}{' '}
                  <Text
                    style={{ color: colors.primary, fontWeight: '700' }}
                    onPress={() => router.push('/(auth)/terms')}
                  >
                    {t('auth.applicationTerms')}
                  </Text>
                  {t('auth.iAgreeTermsSuffix')}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Error Display */}
            {(submitError || googleError) && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorIcon}>⚠</Text>
                <Text style={styles.errorText}>{submitError || googleError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.registerButton,
                { backgroundColor: colors.primary, shadowColor: colors.primary },
                isSubmitting && styles.registerButtonDisabled
              ]}
              onPress={handleRegister}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <View style={styles.registerButtonContent}>
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text style={styles.registerButtonText}>{t('auth.creatingAccount')}</Text>
                </View>
              ) : (
                <Text style={styles.registerButtonText}>{t('auth.createAccount')}</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textTertiary }]}>{t('auth.or')}</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            {/* Google Sign-In Button */}
            <TouchableOpacity
              style={[
                styles.googleButton,
                { backgroundColor: colors.card, borderColor: colors.border },
                isGoogleLoading && [styles.googleButtonDisabled, { backgroundColor: colors.surfaceVariant }]
              ]}
              onPress={handleGoogleRegister}
              disabled={isGoogleLoading}
              activeOpacity={0.8}
            >
              {isGoogleLoading ? (
                <View style={styles.googleButtonContent}>
                  <ActivityIndicator size="small" color={colors.text} />
                  <Text style={[styles.googleButtonText, { color: colors.text }]}>{t('auth.signingInWithGoogle')}</Text>
                </View>
              ) : (
                <View style={styles.googleButtonContent}>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={[styles.googleButtonText, { color: colors.text }]}>{t('auth.continueWithGoogle')}</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Login Link */}
            <View style={styles.loginContainer}>
              <Text style={[styles.loginText, { color: colors.textSecondary }]}>{t('auth.alreadyHaveAccount')} </Text>
              <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
                <Text style={[styles.loginLink, { color: colors.primary }]}>{t('auth.login')}</Text>
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
              <Text style={[styles.pickerTitle, { color: colors.text }]}>{t('auth.selectCountryCode')}</Text>
              <TouchableOpacity onPress={() => setShowPhoneCountryModal(false)} style={styles.pickerCloseBtn}>
                <Text style={[styles.pickerCloseText, { color: colors.textTertiary }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.pickerSearchWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <Text style={styles.pickerSearchIcon}>🔍</Text>
              <TextInput
                style={[styles.pickerSearchInput, { color: colors.text }]}
                placeholder={t('auth.searchCountryISO')}
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
                    <Text style={[styles.pickerItemSub, { color: colors.textSecondary }]}>
                      {country.isoCode} · +{country.dialCode}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={[styles.pickerEmpty, { color: colors.textTertiary }]}>{t('auth.noMatchingCountries')}</Text>}
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
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 24,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
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
  countryFlag: {
    fontSize: 20,
  },
  countryMeta: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  countryArrow: {
    fontSize: 13,
    fontWeight: '700',
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  phoneHint: {
    marginTop: 6,
    fontSize: 12,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 8,
  },
  termsBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  termsBoxOn: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  termsText: {
    fontSize: 14,
    lineHeight: 20,
  },
  registerButton: {
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
  registerButtonDisabled: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0,
  },
  registerButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  registerButtonText: {
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
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
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  loginText: {
    fontSize: 15,
  },
  loginLink: {
    fontWeight: '600',
    fontSize: 15,
  },
  genderContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  genderButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  genderButtonActive: {},
  genderButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  genderButtonTextActive: {
    color: '#ffffff',
  },
  referralCodeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  referralCodeInput: {
    flex: 1,
  },
  validateButton: {
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 100,
  },
  validateButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  validateButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  validationSuccess: {
    flexDirection: 'row',
    backgroundColor: '#d1fae5',
    borderWidth: 1,
    borderColor: '#10b981',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    alignItems: 'flex-start',
  },
  validationSuccessIcon: {
    fontSize: 20,
    color: '#10b981',
    fontWeight: 'bold',
  },
  validationSuccessContent: {
    flex: 1,
    gap: 4,
  },
  validationSuccessTitle: {
    color: '#065f46',
    fontSize: 16,
    fontWeight: '600',
  },
  validationSuccessText: {
    color: '#047857',
    fontSize: 14,
  },
  validationError: {
    flexDirection: 'row',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    alignItems: 'center',
  },
  validationErrorIcon: {
    fontSize: 20,
    color: '#ef4444',
    fontWeight: 'bold',
  },
  validationErrorText: {
    flex: 1,
    color: '#991b1b',
    fontSize: 14,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 14,
    fontWeight: '500',
    paddingHorizontal: 16,
  },
  googleButton: {
    borderWidth: 1,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  googleIcon: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4285f4',
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    gap: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  modalBtnSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalBtnSecondaryText: {
    fontWeight: '600',
    fontSize: 15,
  },
  modalBtnPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalBtnPrimaryText: {
    color: '#fff',
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
  pickerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  pickerCloseBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pickerCloseText: {
    fontSize: 18,
    fontWeight: '700',
  },
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
  pickerSearchIcon: {
    fontSize: 14,
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  pickerList: {
    paddingBottom: 18,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  pickerItemFlag: {
    fontSize: 20,
  },
  pickerItemTextWrap: {
    flex: 1,
  },
  pickerItemTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  pickerItemSub: {
    fontSize: 12,
    marginTop: 2,
  },
  pickerEmpty: {
    textAlign: 'center',
    paddingVertical: 20,
    fontSize: 13,
  },
});
