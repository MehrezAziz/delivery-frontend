import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  FlatList,
  AppState,
  Alert,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import auth, { type FirebaseAuthTypes } from '@react-native-firebase/auth';
import {
  ensurePhoneCountriesLoaded,
  cachePhoneCountries,
  getCachedPreferredPhoneCountryIso,
  detectAndCachePreferredPhoneCountryIso,
  resolvePreferredPhoneCountry,
  toE164Phone,
  type PhoneCountry,
} from '../../services/phone-countries';

const RAW_API =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android' ? 'http://localhost:3000' : 'http://localhost:3000');
const API_BASE_URL = RAW_API.replace(/\/$/, '').endsWith('/api')
  ? RAW_API.replace(/\/$/, '')
  : `${RAW_API.replace(/\/$/, '')}/api`;

const FORGOT_PW_ROLE = 'DRIVER' as const;

type Step = 'method' | 'identifier' | 'emailConfirm' | 'otp' | 'newPassword';

function extractSixDigits(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  if (digits.length === 6) return digits;
  return null;
}

export default function DriverForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    prefillPhone?: string;
    prefillDialCode?: string;
    prefillIso?: string;
  }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('method');
  const [contactKind, setContactKind] = useState<'email' | 'phone' | null>(null);
  const [phoneChannel, setPhoneChannel] = useState<'sms' | 'whatsapp' | null>(null);

  const [phoneCountries, setPhoneCountries] = useState<PhoneCountry[]>([]);
  const [selectedPhoneCountry, setSelectedPhoneCountry] = useState<PhoneCountry | null>(null);
  const [showPhoneCountryModal, setShowPhoneCountryModal] = useState(false);
  const [phoneCountrySearch, setPhoneCountrySearch] = useState('');
  const [resolvingPhoneCountry, setResolvingPhoneCountry] = useState(true);

  const [phoneLocal, setPhoneLocal] = useState('');
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [emailRecoveryE164, setEmailRecoveryE164] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [, bumpResendUi] = useState(0);

  const firebaseConfirmationRef = useRef<FirebaseAuthTypes.ConfirmationResult | null>(null);
  const resetTokenRef = useRef<string | null>(null);

  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState(false);
  const otpRefs = useRef<Array<TextInput | null>>([]);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submittingOtpRef = useRef(false);
  const loginPrefillAppliedRef = useRef(false);

  const filteredPhoneCountries = useMemo(() => {
    const q = phoneCountrySearch.trim().toLowerCase();
    if (!q) return phoneCountries;
    return phoneCountries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.isoCode.toLowerCase().includes(q) ||
        c.dialCode.includes(q),
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
    if (loginPrefillAppliedRef.current || resolvingPhoneCountry || phoneCountries.length === 0) return;

    const p =
      typeof params.prefillPhone === 'string'
        ? params.prefillPhone
        : Array.isArray(params.prefillPhone)
          ? params.prefillPhone[0]
          : '';
    const dial =
      typeof params.prefillDialCode === 'string'
        ? params.prefillDialCode
        : Array.isArray(params.prefillDialCode)
          ? params.prefillDialCode[0]
          : '';
    const iso =
      typeof params.prefillIso === 'string'
        ? params.prefillIso
        : Array.isArray(params.prefillIso)
          ? params.prefillIso[0]
          : '';

    if (!p?.trim()) return;

    const matched =
      (dial && phoneCountries.find((c) => c.dialCode === dial)) ||
      (iso ? resolvePreferredPhoneCountry(phoneCountries, iso) : null);

    if (matched) setSelectedPhoneCountry(matched);
    setPhoneLocal(p.replace(/[^\d\s]/g, ''));
    loginPrefillAppliedRef.current = true;
  }, [
    params.prefillPhone,
    params.prefillDialCode,
    params.prefillIso,
    phoneCountries,
    resolvingPhoneCountry,
  ]);

  const otpComplete = otpDigits.every((d) => d.length === 1 && /\d/.test(d));

  const verifyOtpWithCode = useCallback(
    async (code: string) => {
      if (submittingOtpRef.current) return;
      submittingOtpRef.current = true;
      setLoading(true);
      setError(null);
      try {
        if (sessionId) {
          const res = await fetch(`${API_BASE_URL}/auth/user/forgot-password/verify-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, code }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setOtpError(true);
            setOtpDigits(['', '', '', '', '', '']);
            otpRefs.current[0]?.focus();
            throw new Error(data.message || 'Invalid code');
          }
          resetTokenRef.current = data.resetToken;
          setStep('newPassword');
          return;
        }

        const conf = firebaseConfirmationRef.current;
        if (!conf) throw new Error('Session expired. Go back and request again.');
        await conf.confirm(code);
        const user = auth().currentUser;
        if (!user) throw new Error('Verification incomplete');
        const idToken = await user.getIdToken(true);
        const res = await fetch(`${API_BASE_URL}/auth/user/forgot-password/verify-firebase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, role: FORGOT_PW_ROLE }),
        });
        const data = await res.json().catch(() => ({}));
        await auth().signOut();
        if (!res.ok) {
          setOtpError(true);
          setOtpDigits(['', '', '', '', '', '']);
          otpRefs.current[0]?.focus();
          throw new Error(data.message || 'Verification failed');
        }
        resetTokenRef.current = data.resetToken;
        setStep('newPassword');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Something went wrong';
        setError(msg);
      } finally {
        setLoading(false);
        submittingOtpRef.current = false;
      }
    },
    [sessionId],
  );

  const applyPasteSix = useCallback(
    async (raw: string, autoSubmit: boolean) => {
      const six = extractSixDigits(raw);
      if (!six) return false;
      setOtpError(false);
      setOtpDigits(six.split(''));
      if (autoSubmit && !submittingOtpRef.current) {
        await verifyOtpWithCode(six);
      }
      return true;
    },
    [verifyOtpWithCode],
  );

  useEffect(() => {
    const tryClipboard = async () => {
      try {
        const t = await Clipboard.getStringAsync();
        const six = extractSixDigits(t);
        if (six) await applyPasteSix(t, true);
      } catch {
        /* ignore */
      }
    };

    if (step !== 'otp') return;

    const sub = Clipboard.addClipboardListener(() => {
      void Clipboard.getStringAsync().then((t) => {
        const six = extractSixDigits(t);
        if (six) void applyPasteSix(t, true);
      });
    });

    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void tryClipboard();
    });

    void tryClipboard();

    return () => {
      sub.remove();
      appSub.remove();
    };
  }, [step, applyPasteSix]);

  useEffect(() => {
    if (!resendAvailableAt || resendAvailableAt <= Date.now()) return;
    const id = setInterval(() => bumpResendUi((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [resendAvailableAt]);

  const resendWaitSeconds =
    resendAvailableAt && resendAvailableAt > Date.now()
      ? Math.ceil((resendAvailableAt - Date.now()) / 1000)
      : 0;

  const submitEmailPhoneForPreview = async () => {
    setError(null);
    if (!selectedPhoneCountry || !phoneLocal.trim()) {
      setError('Enter your account phone number');
      return;
    }
    const e164 = toE164Phone(selectedPhoneCountry.dialCode, phoneLocal);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/user/forgot-password/email-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: e164, role: FORGOT_PW_ROLE }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'Could not check your account');
      }
      if (!data.ok) {
        if (data.reason === 'NO_SAVED_EMAIL') {
          Alert.alert(
            'No saved email',
            'Your profile does not have an email address. Sign in with another method and add one in your profile, or use phone recovery.',
            [{ text: 'OK', onPress: () => setStep('method') }],
          );
        } else {
          Alert.alert(
            'Account not found',
            'No driver account with this phone number and a saved password.',
            [{ text: 'OK', onPress: () => setStep('method') }],
          );
        }
        return;
      }
      setEmailRecoveryE164(e164);
      setMaskedEmail(data.maskedEmail);
      setStep('emailConfirm');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const sendEmailVerificationCode = async () => {
    if (!emailRecoveryE164) {
      setError('Session expired. Go back and try again.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/user/forgot-password/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'EMAIL', phone: emailRecoveryE164, role: FORGOT_PW_ROLE }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Request failed');
      if (data.mode !== 'SESSION') throw new Error('Unexpected response');
      setSessionId(data.sessionId);
      setResendAvailableAt(Date.now() + (data.resendAfterSeconds ?? 300) * 1000);
      setStep('otp');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async () => {
    setError(null);

    if (!selectedPhoneCountry || !phoneLocal.trim()) {
      setError('Enter your phone number');
      return;
    }
    const e164 = toE164Phone(selectedPhoneCountry.dialCode, phoneLocal);

    if (phoneChannel === 'whatsapp') {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/auth/user/forgot-password/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: 'WHATSAPP', phone: e164, role: FORGOT_PW_ROLE }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Request failed');
        if (data.mode !== 'SESSION') throw new Error('Unexpected response');
        setSessionId(data.sessionId);
        setResendAvailableAt(Date.now() + (data.resendAfterSeconds ?? 300) * 1000);
        setStep('otp');
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Request failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (phoneChannel === 'sms') {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/auth/user/forgot-password/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: 'SMS', phone: e164, role: FORGOT_PW_ROLE }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Request failed');
        if (data.mode !== 'FIREBASE_SMS') throw new Error('SMS setup error');
        const confirmation = await auth().signInWithPhoneNumber(data.phoneE164);
        firebaseConfirmationRef.current = confirmation;
        setSessionId(null);
        setStep('otp');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'SMS failed';
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleResend = async () => {
    if (!sessionId || !resendAvailableAt || resendAvailableAt > Date.now()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/user/forgot-password/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Resend failed');
      setResendAvailableAt(Date.now() + (data.resendAfterSeconds ?? 300) * 1000);
      setOtpDigits(['', '', '', '', '', '']);
      setOtpError(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Resend failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError(null);
    if (newPassword.length < 8 || confirmPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    const token = resetTokenRef.current;
    if (!token) {
      setError('Session expired. Start again.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/user/forgot-password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resetToken: token,
          newPassword,
          confirmPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not update password');
      router.replace('/(auth)/driver-login');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not update password');
    } finally {
      setLoading(false);
    }
  };

  const updateOtpCell = (index: number, char: string) => {
    const c = char.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[index] = c;
    setOtpDigits(next);
    setOtpError(false);
    if (c && index < 5) otpRefs.current[index + 1]?.focus();

    const joined = next.join('');
    if (joined.length === 6 && /^\d{6}$/.test(joined)) {
      void verifyOtpWithCode(joined);
    }
  };

  const onOtpKeyPress = (index: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const onContinueOtp = () => {
    const code = otpDigits.join('');
    if (!/^\d{6}$/.test(code)) return;
    void verifyOtpWithCode(code);
  };

  const continueDisabled =
    step === 'otp' ? !otpComplete || loading : step === 'newPassword' ? loading : false;

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
          <Text style={[styles.title, { color: colors.text }]}>Forgot password</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {step === 'method' && 'Reset using your email or phone number.'}
            {step === 'identifier' &&
              contactKind === 'email' &&
              'Enter the phone number on your account. We will check if you have a saved email.'}
            {step === 'emailConfirm' &&
              'Confirm this is the email where you want to receive the code.'}
            {step === 'identifier' &&
              contactKind === 'phone' &&
              !phoneChannel &&
              'Choose how you want to receive the code.'}
            {step === 'identifier' &&
              contactKind === 'phone' &&
              phoneChannel &&
              'Enter your phone number with country code.'}
            {step === 'otp' && 'Enter the 6-digit code we sent you.'}
            {step === 'newPassword' && 'Choose a new password.'}
          </Text>

          {step === 'method' && (
            <View style={styles.cardGap}>
              <TouchableOpacity
                style={[styles.choiceBtn, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                onPress={() => {
                  setContactKind('email');
                  setMaskedEmail(null);
                  setEmailRecoveryE164(null);
                  setStep('identifier');
                }}
              >
                <Text style={[styles.choiceTitle, { color: colors.text }]}>Email</Text>
                <Text style={[styles.choiceSub, { color: colors.textSecondary }]}>
                  Receive a code by email
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.choiceBtn, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                onPress={() => {
                  setContactKind('phone');
                  setPhoneChannel(null);
                  setStep('identifier');
                }}
              >
                <Text style={[styles.choiceTitle, { color: colors.text }]}>Phone</Text>
                <Text style={[styles.choiceSub, { color: colors.textSecondary }]}>
                  SMS (Firebase)
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'identifier' && contactKind === 'phone' && !phoneChannel && (
            <View style={styles.cardGap}>
              <TouchableOpacity
                style={[styles.choiceBtn, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}
                onPress={() => setPhoneChannel('sms')}
              >
                <Text style={[styles.choiceTitle, { color: colors.text }]}>SMS</Text>
                <Text style={[styles.choiceSub, { color: colors.textSecondary }]}>
                  Code via Firebase (your device receives the SMS)
                </Text>
              </TouchableOpacity>
              <View
                style={[
                  styles.choiceBtn,
                  styles.choiceDisabled,
                  { backgroundColor: colors.surfaceVariant, borderColor: colors.border, opacity: 0.55 },
                ]}
              >
                <Text style={[styles.choiceTitle, { color: colors.text }]}>WhatsApp</Text>
                <Text style={[styles.choiceSoon, { color: colors.primary }]}>Coming soon</Text>
                <Text style={[styles.choiceSub, { color: colors.textSecondary }]}>
                  WhatsApp Business recovery is not available yet
                </Text>
              </View>
              <TouchableOpacity onPress={() => setStep('method')}>
                <Text style={{ color: colors.primary, textAlign: 'center', marginTop: 8 }}>Back</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'identifier' && contactKind === 'email' && (
            <View style={styles.form}>
              <Text style={[styles.label, { color: colors.text }]}>Account phone number</Text>
              <View style={[styles.phoneRow, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                <TouchableOpacity
                  style={[styles.countryCodeBtn, { borderRightColor: colors.inputBorder }]}
                  onPress={() => setShowPhoneCountryModal(true)}
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
                  value={phoneLocal}
                  onChangeText={(t) => setPhoneLocal(t.replace(/[^\d\s]/g, ''))}
                />
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }, loading && styles.btnDisabled]}
                onPress={submitEmailPhoneForPreview}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Check email</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep('method')}>
                <Text style={{ color: colors.primary, textAlign: 'center' }}>Back</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'emailConfirm' && maskedEmail && (
            <View style={styles.form}>
              <View
                style={[
                  styles.emailPickCard,
                  { backgroundColor: colors.surfaceVariant, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.emailPickLabel, { color: colors.textSecondary }]}>
                  Code will be sent to:
                </Text>
                <Text style={[styles.emailPickValue, { color: colors.text }]}>{maskedEmail}</Text>
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }, loading && styles.btnDisabled]}
                onPress={sendEmailVerificationCode}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send code</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setStep('identifier');
                  setMaskedEmail(null);
                  setEmailRecoveryE164(null);
                }}
              >
                <Text style={{ color: colors.primary, textAlign: 'center' }}>Back</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'identifier' && contactKind === 'phone' && phoneChannel && (
            <View style={styles.form}>
              <Text style={[styles.label, { color: colors.text }]}>Phone number</Text>
              <View style={[styles.phoneRow, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                <TouchableOpacity
                  style={[styles.countryCodeBtn, { borderRightColor: colors.inputBorder }]}
                  onPress={() => setShowPhoneCountryModal(true)}
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
                  value={phoneLocal}
                  onChangeText={(t) => setPhoneLocal(t.replace(/[^\d\s]/g, ''))}
                />
              </View>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }, loading && styles.btnDisabled]}
                onPress={handleSendCode}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Send code</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setPhoneChannel(null);
                  firebaseConfirmationRef.current = null;
                }}
              >
                <Text style={{ color: colors.primary, textAlign: 'center' }}>Back</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'otp' && (
            <View style={styles.form}>
              <View style={styles.otpRow}>
                {otpDigits.map((d, i) => (
                  <TextInput
                    key={i}
                    ref={(r) => {
                      otpRefs.current[i] = r;
                    }}
                    style={[
                      styles.otpCell,
                      {
                        backgroundColor: colors.inputBg,
                        borderColor: otpError ? '#ef4444' : colors.inputBorder,
                        color: colors.text,
                      },
                    ]}
                    keyboardType="number-pad"
                    maxLength={1}
                    value={d}
                    onChangeText={(t) => {
                      if (t.length > 1) {
                        const pasted = extractSixDigits(t);
                        if (pasted) {
                          setOtpDigits(pasted.split(''));
                          setOtpError(false);
                          void verifyOtpWithCode(pasted);
                        }
                        return;
                      }
                      updateOtpCell(i, t);
                    }}
                    onKeyPress={(e) => onOtpKeyPress(i, e)}
                  />
                ))}
              </View>
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  { backgroundColor: colors.primary },
                  (continueDisabled || loading) && styles.btnDisabled,
                ]}
                onPress={onContinueOtp}
                disabled={continueDisabled || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Continue</Text>
                )}
              </TouchableOpacity>

              {sessionId ? (
                <TouchableOpacity
                  onPress={handleResend}
                  disabled={!!resendWaitSeconds || loading}
                  style={{ alignSelf: 'center', marginTop: 12 }}
                >
                  <Text
                    style={{
                      color: resendWaitSeconds ? colors.textTertiary : colors.primary,
                      fontWeight: '600',
                    }}
                  >
                    {resendWaitSeconds ? `Resend in ${resendWaitSeconds}s` : 'Resend code'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.hint, { color: colors.textTertiary }]}>
                  Paste works automatically when the clipboard has exactly 6 digits.
                </Text>
              )}

              <TouchableOpacity
                onPress={() => {
                  setOtpDigits(['', '', '', '', '', '']);
                  setOtpError(false);
                  firebaseConfirmationRef.current = null;
                  setSessionId(null);
                  if (contactKind === 'email' && emailRecoveryE164 && maskedEmail) {
                    setStep('emailConfirm');
                  } else {
                    setStep('identifier');
                  }
                }}
              >
                <Text style={{ color: colors.primary, textAlign: 'center', marginTop: 16 }}>Back</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'newPassword' && (
            <View style={styles.form}>
              <Text style={[styles.label, { color: colors.text }]}>New password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <Text style={[styles.label, { color: colors.text }]}>Confirm password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
                placeholder="Repeat password"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }, loading && styles.btnDisabled]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save password</Text>}
              </TouchableOpacity>
            </View>
          )}

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={showPhoneCountryModal} transparent animationType="slide" onRequestClose={() => setShowPhoneCountryModal(false)}>
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>Country code</Text>
              <TouchableOpacity onPress={() => setShowPhoneCountryModal(false)}>
                <Text style={{ color: colors.textTertiary, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.pickerSearchWrap, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <TextInput
                style={[styles.pickerSearchInput, { color: colors.text }]}
                placeholder="Search"
                placeholderTextColor={colors.textTertiary}
                value={phoneCountrySearch}
                onChangeText={setPhoneCountrySearch}
              />
            </View>
            <FlatList
              data={filteredPhoneCountries}
              keyExtractor={(c) => c.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: country }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    setSelectedPhoneCountry(country);
                    setShowPhoneCountryModal(false);
                    setPhoneCountrySearch('');
                  }}
                >
                  <Text style={styles.pickerFlag}>{country.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickerItemTitle, { color: colors.text }]}>{country.name}</Text>
                    <Text style={[styles.pickerItemSub, { color: colors.textSecondary }]}>
                      {country.isoCode} · +{country.dialCode}
                    </Text>
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
  container: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { paddingHorizontal: 22, paddingTop: 8 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 22 },
  cardGap: { gap: 14 },
  choiceBtn: {
    borderRadius: 14,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  choiceDisabled: {},
  choiceSoon: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  choiceTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  choiceSub: { fontSize: 14 },
  form: { gap: 14 },
  label: { fontWeight: '600', fontSize: 15 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
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
    paddingHorizontal: 10,
    paddingVertical: 14,
    borderRightWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countryFlag: { fontSize: 20 },
  countryMeta: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  countryArrow: { fontSize: 13 },
  phoneInput: { flex: 1, fontSize: 16, paddingHorizontal: 12, paddingVertical: 14 },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  otpCell: {
    flex: 1,
    maxWidth: 52,
    aspectRatio: 1,
    borderWidth: 2,
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    padding: 0,
  },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  btnDisabled: { opacity: 0.55 },
  hint: { textAlign: 'center', fontSize: 13, marginTop: 8 },
  errorBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { color: '#991b1b', fontSize: 14 },
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
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerTitle: { fontSize: 17, fontWeight: '700' },
  pickerSearchWrap: {
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerSearchInput: { fontSize: 15 },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  pickerFlag: { fontSize: 20 },
  pickerItemTitle: { fontSize: 15, fontWeight: '600' },
  pickerItemSub: { fontSize: 12, marginTop: 2 },
  emailPickCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    marginBottom: 4,
  },
  emailPickLabel: { fontSize: 13, marginBottom: 8, fontWeight: '600' },
  emailPickValue: { fontSize: 17, fontWeight: '700' },
});
