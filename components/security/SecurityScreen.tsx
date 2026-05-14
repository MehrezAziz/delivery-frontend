import { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { ApiError } from '../../services/api/client';
import { securityService, type SecuritySummary } from '../../services/api/security.service';
import { coinsService } from '../../services/api/coins.service';
import { EightDigitPinInput } from './EightDigitPinInput';

function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

type Phase = 'bio' | 'credential' | 'content';

export type SecurityScreenVariant = 'customer' | 'driver';

export default function SecurityScreen({ variant }: { variant: SecurityScreenVariant }) {
  const router = useRouter();
  const { colors } = useTheme();
  const supportPath = variant === 'customer' ? '/(customer)/support' : '/(driver)/support';

  const [phase, setPhase] = useState<Phase>('bio');
  const [summary, setSummary] = useState<SecuritySummary | null>(null);
  const [bioBusy, setBioBusy] = useState(false);
  const [credBusy, setCredBusy] = useState(false);
  const [password, setPassword] = useState('');
  /** With biometrics: PIN by default when a transfer PIN exists. Without biometrics and both factors: null until the user picks password or PIN. */
  const [credentialMode, setCredentialMode] = useState<'password' | 'pin' | null>(null);
  const [gatePin, setGatePin] = useState('');
  /** Bumped to refocus PIN input (e.g. after wrong PIN or switching from password). */
  const [gatePinFocusNonce, setGatePinFocusNonce] = useState(0);

  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSaving, setPinSaving] = useState(false);

  const [nextPwd, setNextPwd] = useState('');
  const [nextPwd2, setNextPwd2] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  const [docBusy, setDocBusy] = useState(false);
  /** Progressive disclosure on the content screen */
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [showPinChange, setShowPinChange] = useState(false);
  const [showDocPanel, setShowDocPanel] = useState(false);
  /** No Face ID / fingerprint hardware or nothing enrolled — gate uses password/PIN only. */
  const [skippedBiometrics, setSkippedBiometrics] = useState(false);
  /** Until we know if biometrics apply and optional summary is loaded for skip path. */
  const [gateBootstrapping, setGateBootstrapping] = useState(true);

  const mountedRef = useRef(true);
  /** Device has enrolled Face ID / fingerprint and user passed it this session (before PIN/password). */
  const bioCompletedRef = useRef(false);
  /** User passed PIN or password gate this session (required before content when a second factor exists). */
  const credentialCompletedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    bioCompletedRef.current = false;
    credentialCompletedRef.current = false;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadSummary = useCallback(async () => {
    const s = await securityService.getSummary();
    setSummary(s);
    return s;
  }, []);

  const finalizeToContent = useCallback((s: SecuritySummary) => {
    if (!mountedRef.current) return;
    const needsSecond = s.hasPassword || s.hasTransferPin;
    if (!needsSecond) {
      if (skippedBiometrics || bioCompletedRef.current) {
        setPhase('content');
      }
      return;
    }
    if (!credentialCompletedRef.current) return;
    if (!skippedBiometrics && !bioCompletedRef.current) return;
    setPhase('content');
  }, [skippedBiometrics]);

  const enterCredentialFromSummary = useCallback(
    (s: SecuritySummary, opts?: { preferPinAfterBio?: boolean }) => {
      setPassword('');
      setGatePin('');
      if (!s.hasPassword && !s.hasTransferPin) {
        finalizeToContent(s);
        return;
      }
      let mode: 'password' | 'pin' | null = null;
      if (s.hasPassword && s.hasTransferPin) {
        mode = opts?.preferPinAfterBio ? 'pin' : null;
      } else if (s.hasPassword) {
        mode = 'password';
      } else {
        mode = 'pin';
      }
      setCredentialMode(mode);
      if (mode === 'pin') {
        setGatePinFocusNonce((n) => n + 1);
      }
      setPhase('credential');
    },
    [finalizeToContent],
  );

  const performBiometricUnlock = useCallback(async (): Promise<void> => {
    setBioBusy(true);
    try {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!has || !enrolled) {
        setSkippedBiometrics(true);
        const s = await loadSummary();
        if (!mountedRef.current) return;
        enterCredentialFromSummary(s);
        return;
      }
      const r = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Security',
        cancelLabel: 'Cancel',
        disableDeviceFallback: true,
      });
      if (!r.success) return;
      bioCompletedRef.current = true;
      const s = await loadSummary();
      if (!mountedRef.current) return;
      enterCredentialFromSummary(s, { preferPinAfterBio: true });
    } catch (e) {
      Alert.alert('Error', errMsg(e));
    } finally {
      setBioBusy(false);
    }
  }, [loadSummary, enterCredentialFromSummary]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const has = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (cancelled) return;
        if (!has || !enrolled) {
          setSkippedBiometrics(true);
          const s = await loadSummary();
          if (cancelled) return;
          enterCredentialFromSummary(s);
        } else {
          setSkippedBiometrics(false);
          if (!cancelled) await performBiometricUnlock();
        }
      } catch (e) {
        if (cancelled) return;
        try {
          const has2 = await LocalAuthentication.hasHardwareAsync();
          const enrolled2 = await LocalAuthentication.isEnrolledAsync();
          if (has2 && enrolled2) {
            setSkippedBiometrics(false);
            Alert.alert('Error', errMsg(e));
            return;
          }
        } catch {
          /* fall through to password/PIN-only gate */
        }
        setSkippedBiometrics(true);
        try {
          const s = await loadSummary();
          if (!cancelled) enterCredentialFromSummary(s);
        } catch (err) {
          Alert.alert('Error', errMsg(err));
        }
      } finally {
        if (!cancelled) setGateBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSummary, enterCredentialFromSummary, performBiometricUnlock]);

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const normalized = (pin || '').replace(/\D/g, '').slice(0, 8);
      if (normalized.length !== 8 || !/^\d{8}$/.test(normalized)) return;
      setCredBusy(true);
      try {
        const s = summary ?? (await loadSummary());
        if (!s.hasTransferPin) {
          Alert.alert('Security', 'No transfer PIN is configured.');
          return;
        }
        await coinsService.establishTransferPinSecuritySession(normalized);
        const fresh = await loadSummary();
        if (mountedRef.current) {
          credentialCompletedRef.current = true;
          finalizeToContent(fresh);
        }
      } catch (e) {
        Alert.alert('Could not unlock', errMsg(e));
        if (mountedRef.current) {
          setGatePin('');
          setGatePinFocusNonce((n) => n + 1);
        }
      } finally {
        if (mountedRef.current) setCredBusy(false);
      }
    },
    [summary, loadSummary, finalizeToContent],
  );

  const submitCredential = async () => {
    try {
      const s = summary ?? (await loadSummary());
      const mode =
        credentialMode ??
        (s.hasPassword && !s.hasTransferPin ? 'password' : !s.hasPassword && s.hasTransferPin ? 'pin' : null);
      if (mode === null) {
        if (skippedBiometrics) {
          Alert.alert('Choose a method', 'Select account password or transfer PIN to continue.');
        }
        return;
      }
      if (mode === 'pin' && s.hasTransferPin) {
        if (gatePin.length !== 8) {
          Alert.alert('PIN', 'Enter your 8-digit transfer PIN.');
          return;
        }
        await unlockWithPin(gatePin);
        return;
      }
      if (mode === 'password' && s.hasPassword) {
        if (!password.trim()) {
          Alert.alert('Password', 'Enter your account password.');
          return;
        }
        setCredBusy(true);
        try {
          await securityService.establishSecuritySession(password.trim());
          const fresh = await loadSummary();
          if (mountedRef.current) {
            credentialCompletedRef.current = true;
            finalizeToContent(fresh);
          }
        } catch (e) {
          Alert.alert('Could not unlock', errMsg(e));
        } finally {
          if (mountedRef.current) setCredBusy(false);
        }
        return;
      }
      Alert.alert('Security', 'No password or PIN is configured.');
    } catch (e) {
      Alert.alert('Could not unlock', errMsg(e));
    }
  };

  const savePin = async () => {
    if (newPin.length !== 8 || !/^\d{8}$/.test(newPin)) {
      Alert.alert('PIN', 'New PIN must be exactly 8 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert('PIN', 'Confirmation does not match.');
      return;
    }
    setPinSaving(true);
    try {
      await coinsService.setTransferPin({ transferPin: newPin });
      setNewPin('');
      setConfirmPin('');
      await loadSummary();
      setShowPinChange(false);
      Alert.alert('Saved', 'Your transfer PIN has been updated.');
    } catch (e) {
      Alert.alert('Could not save PIN', errMsg(e));
    } finally {
      setPinSaving(false);
    }
  };

  const removePin = () => {
    Alert.alert('Remove transfer PIN?', 'Coin sends will only use biometrics until you set a PIN again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setPinSaving(true);
          try {
            await coinsService.clearTransferPin();
            await loadSummary();
            setShowPinChange(false);
            Alert.alert('Removed', 'Transfer PIN cleared.');
          } catch (e) {
            Alert.alert('Error', errMsg(e));
          } finally {
            setPinSaving(false);
          }
        },
      },
    ]);
  };

  const savePassword = async () => {
    if (nextPwd.length < 8) {
      Alert.alert('Password', 'New password must be at least 8 characters.');
      return;
    }
    if (nextPwd !== nextPwd2) {
      Alert.alert('Password', 'New password and confirmation do not match.');
      return;
    }
    setPwdSaving(true);
    try {
      await securityService.changePassword(nextPwd);
      setNextPwd('');
      setNextPwd2('');
      setShowPasswordChange(false);
      await loadSummary();
      Alert.alert('Saved', 'Your password has been changed.');
    } catch (e) {
      Alert.alert('Could not change password', errMsg(e));
    } finally {
      setPwdSaving(false);
    }
  };

  const pickDocument = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission', 'Allow photo library access to attach a document.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.65,
      base64: true,
      allowsEditing: true,
    });
    if (res.canceled || !res.assets[0]?.base64) return;
    const uri = res.assets[0].uri;
    const mime = uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const dataUrl = `data:${mime};base64,${res.assets[0].base64}`;
    setDocBusy(true);
    try {
      await securityService.setVerificationDocument(dataUrl);
      await loadSummary();
      setShowDocPanel(false);
      Alert.alert('Uploaded', 'Your verification document was saved.');
    } catch (e) {
      Alert.alert('Upload failed', errMsg(e));
    } finally {
      setDocBusy(false);
    }
  };

  const tierLabel = summary?.securityTier ?? 'LOW';
  const tierHint =
    tierLabel === 'HIGH'
      ? 'Password, transfer PIN, and verification document are set.'
      : tierLabel === 'MEDIUM'
        ? 'Add PIN or a verification document (with password) to reach High.'
        : 'Add a transfer PIN and/or verification document to raise your tier.';

  if (gateBootstrapping) {
    return (
      <View style={[styles.root, styles.bootstrap, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.bootstrapHint, { color: colors.textSecondary }]}>Preparing secure access…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.pad}
    >
      {phase === 'bio' && !skippedBiometrics && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Security</Text>
          {bioBusy ? (
            <>
              <Text style={[styles.p, { color: colors.textSecondary }]}>
                Follow the Face ID or fingerprint prompt on your device.
              </Text>
              <ActivityIndicator style={{ marginTop: 16 }} size="large" color={colors.primary} />
            </>
          ) : (
            <>
              <Text style={[styles.p, { color: colors.textSecondary }]}>
                We could not verify with Face ID or fingerprint. You can try again or go back.
              </Text>
              <TouchableOpacity
                style={[styles.primary, { backgroundColor: colors.primary, marginTop: 8 }]}
                onPress={() => void performBiometricUnlock()}
                activeOpacity={0.88}
              >
                <Text style={styles.primaryText}>Try Face ID / fingerprint again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.gateFooterBtn,
                  { borderColor: colors.border, backgroundColor: colors.surfaceVariant ?? colors.card, marginTop: 16 },
                ]}
                onPress={() => router.back()}
                activeOpacity={0.85}
              >
                <Ionicons name="close-outline" size={20} color={colors.text} />
                <Text style={[styles.gateFooterBtnText, { color: colors.text }]}>Close</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {phase === 'credential' && summary && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Confirm it’s you</Text>
          <Text style={[styles.p, { color: colors.textSecondary, marginBottom: 4 }]}>
            {skippedBiometrics
              ? summary.hasPassword && summary.hasTransferPin && credentialMode === null
                ? 'This device has no Face ID or fingerprint (or none is set up). Choose your account password or your 8-digit transfer PIN.'
                : 'This device has no Face ID or fingerprint (or none is set up). Enter your account password or transfer PIN below.'
              : summary.hasPassword && summary.hasTransferPin && credentialMode === null
                ? 'Choose how to confirm.'
                : summary.hasTransferPin && credentialMode === 'pin'
                  ? 'Enter your 8-digit transfer PIN to open Security settings.'
                  : 'Enter your account password to open Security settings.'}
          </Text>

          {skippedBiometrics && summary.hasPassword && summary.hasTransferPin && credentialMode === null && (
            <View style={styles.methodChoiceRow}>
              <TouchableOpacity
                style={[
                  styles.methodChoiceCard,
                  { borderColor: colors.primary, backgroundColor: colors.surfaceVariant },
                ]}
                onPress={() => {
                  setCredentialMode('password');
                  setGatePin('');
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="key-outline" size={28} color={colors.primary} />
                <Text style={[styles.methodChoiceTitle, { color: colors.text }]}>Account password</Text>
                <Text style={[styles.methodChoiceSub, { color: colors.textSecondary }]}>
                  Use the password you sign in with
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.methodChoiceCard,
                  { borderColor: colors.primary, backgroundColor: colors.surfaceVariant },
                ]}
                onPress={() => {
                  setCredentialMode('pin');
                  setPassword('');
                  setGatePinFocusNonce((n) => n + 1);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="keypad-outline" size={28} color={colors.primary} />
                <Text style={[styles.methodChoiceTitle, { color: colors.text }]}>Transfer PIN</Text>
                <Text style={[styles.methodChoiceSub, { color: colors.textSecondary }]}>8 digits for coin sends</Text>
              </TouchableOpacity>
            </View>
          )}

          {credentialMode === 'password' && summary.hasPassword && (
            <>
              {skippedBiometrics && summary.hasTransferPin && (
                <TouchableOpacity
                  style={[
                    styles.methodChangeBtn,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceVariant ?? colors.card,
                    },
                  ]}
                  onPress={() => {
                    setCredentialMode(null);
                    setPassword('');
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
                  <Text style={[styles.methodChangeBtnText, { color: colors.primary }]}>Change method</Text>
                </TouchableOpacity>
              )}
              <Text style={[styles.label, { color: colors.textSecondary }]}>Account password</Text>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textTertiary}
              />
              {!skippedBiometrics && summary.hasTransferPin && (
                <TouchableOpacity
                  style={{ marginTop: 12, alignSelf: 'center', paddingVertical: 6 }}
                  onPress={() => {
                    setCredentialMode('pin');
                    setPassword('');
                    setGatePinFocusNonce((n) => n + 1);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                >
                  <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>Use transfer PIN instead</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {credentialMode === 'pin' && summary.hasTransferPin && (
            <>
              {skippedBiometrics && summary.hasPassword && (
                <TouchableOpacity
                  style={[
                    styles.methodChangeBtn,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceVariant ?? colors.card,
                    },
                  ]}
                  onPress={() => {
                    setCredentialMode(null);
                    setGatePin('');
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="swap-horizontal-outline" size={18} color={colors.primary} />
                  <Text style={[styles.methodChangeBtnText, { color: colors.primary }]}>Change method</Text>
                </TouchableOpacity>
              )}
              {!skippedBiometrics &&
                (summary.hasPassword ? (
                  <TouchableOpacity
                    style={[
                      styles.altMethodPill,
                      {
                        borderColor: colors.primary,
                        backgroundColor: colors.surfaceVariant ?? colors.card,
                      },
                    ]}
                    onPress={() => {
                      setCredentialMode('password');
                      setGatePin('');
                    }}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Complete with account password instead of transfer PIN"
                  >
                    <Ionicons name="key-outline" size={16} color={colors.primary} />
                    <Text style={[styles.altMethodPillText, { color: colors.primary }]}>Complete with password instead</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.noPasswordHint, { backgroundColor: colors.surfaceVariant ?? colors.card, borderColor: colors.border }]}>
                    <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
                    <Text style={[styles.noPasswordHintText, { color: colors.textSecondary }]}>No password exists</Text>
                  </View>
                ))}
              <Text style={[styles.label, { color: colors.textSecondary }]}>Transfer PIN (8 digits)</Text>
              <EightDigitPinInput
                value={gatePin}
                onChange={setGatePin}
                colors={colors}
                disabled={credBusy}
                autoFocus
                focusNonce={gatePinFocusNonce}
                onFilled={(p) => void unlockWithPin(p)}
              />
            </>
          )}

          {credentialMode !== null && !(credentialMode === 'pin' && summary.hasTransferPin) && (
            <TouchableOpacity
              style={[styles.primary, { backgroundColor: colors.primary, marginTop: 16 }]}
              onPress={() => void submitCredential()}
              disabled={credBusy}
            >
              {credBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Unlock</Text>}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.gateFooterBtn,
              { borderColor: colors.border, backgroundColor: colors.surfaceVariant ?? colors.card },
            ]}
            onPress={() => {
              if (skippedBiometrics) {
                router.back();
              } else {
                bioCompletedRef.current = false;
                credentialCompletedRef.current = false;
                setCredentialMode(null);
                setPhase('bio');
                void performBiometricUnlock();
              }
            }}
            activeOpacity={0.85}
          >
            <Ionicons name={skippedBiometrics ? 'close-outline' : 'arrow-back-outline'} size={20} color={colors.text} />
            <Text style={[styles.gateFooterBtnText, { color: colors.text }]}>
              {skippedBiometrics ? 'Close' : 'Back'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'content' && summary && (
        <>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Security level</Text>
            <View style={styles.tierRow}>
              <View style={[styles.tierBadge, { backgroundColor: colors.surfaceVariant }]}>
                <Text style={[styles.tierText, { color: colors.primary }]}>{tierLabel}</Text>
              </View>
            </View>
            <Text style={[styles.p, { color: colors.textSecondary }]}>{tierHint}</Text>
            <TouchableOpacity
              style={[styles.outlineBtn, { borderColor: colors.border }]}
              onPress={() => {
                void (async () => {
                  try {
                    await securityService.revokeSecuritySession();
                  } catch {
                    /* still lock UI locally */
                  }
                  setShowPasswordChange(false);
                  setShowPinChange(false);
                  setShowDocPanel(false);
                  setNextPwd('');
                  setNextPwd2('');
                  setNewPin('');
                  setConfirmPin('');
                  if (skippedBiometrics) {
                    const s = await loadSummary();
                    enterCredentialFromSummary(s);
                  } else {
                    bioCompletedRef.current = false;
                    credentialCompletedRef.current = false;
                    setPhase('bio');
                    setSummary(null);
                    setCredentialMode(null);
                    void performBiometricUnlock();
                  }
                })();
              }}
            >
              <Ionicons name="lock-closed-outline" size={18} color={colors.text} />
              <Text style={[styles.outlineBtnText, { color: colors.text }]}>Lock Security</Text>
            </TouchableOpacity>
          </View>

          {summary.hasPassword ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.title, { color: colors.text }]}>Account password</Text>
              <Text style={[styles.p, { color: colors.textSecondary }]}>
                You already unlocked this screen. To change your password, use the fields below — you do not need to
                enter your current password again here.
              </Text>
              {!showPasswordChange ? (
                <TouchableOpacity
                  style={[styles.sectionCta, { borderColor: colors.border, backgroundColor: colors.surfaceVariant ?? colors.card }]}
                  onPress={() => setShowPasswordChange(true)}
                  activeOpacity={0.88}
                >
                  <Text style={[styles.sectionCtaText, { color: colors.text, flex: 1 }]}>Change password</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : (
                <>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>New password (min 8)</Text>
                  <TextInput
                    style={[
                      styles.input,
                      { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
                    ]}
                    secureTextEntry
                    value={nextPwd}
                    onChangeText={setNextPwd}
                    placeholder="New"
                    placeholderTextColor={colors.textTertiary}
                  />
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Confirm new password</Text>
                  <TextInput
                    style={[
                      styles.input,
                      { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
                    ]}
                    secureTextEntry
                    value={nextPwd2}
                    onChangeText={setNextPwd2}
                    placeholder="Repeat"
                    placeholderTextColor={colors.textTertiary}
                  />
                  <TouchableOpacity
                    style={[styles.primary, { backgroundColor: colors.primary, marginTop: 12 }]}
                    onPress={() => void savePassword()}
                    disabled={pwdSaving}
                  >
                    {pwdSaving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryText}>Update password</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ marginTop: 12, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12 }}
                    onPress={() => {
                      setShowPasswordChange(false);
                      setNextPwd('');
                      setNextPwd2('');
                    }}
                  >
                    <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.title, { color: colors.text }]}>Account password</Text>
              <Text style={[styles.p, { color: colors.textSecondary }]}>
                You signed in without a password. Use “Forgot password” on the sign-in screen if you want to add one.
              </Text>
            </View>
          )}

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Transfer PIN (optional)</Text>
            <Text style={[styles.p, { color: colors.textSecondary }]}>
              Exactly 8 digits. If set, you’ll enter it when sending coins (after biometrics). You can remove it anytime.
            </Text>
            {!showPinChange ? (
              <TouchableOpacity
                style={[styles.sectionCta, { borderColor: colors.border, backgroundColor: colors.surfaceVariant ?? colors.card }]}
                onPress={() => setShowPinChange(true)}
                activeOpacity={0.88}
              >
                <Text style={[styles.sectionCtaText, { color: colors.text, flex: 1 }]}>
                  {summary.hasTransferPin ? 'Change transfer PIN' : 'Set transfer PIN'}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>New PIN</Text>
                <EightDigitPinInput value={newPin} onChange={setNewPin} colors={colors} disabled={pinSaving} />
                <Text style={[styles.label, { color: colors.textSecondary }]}>Confirm new PIN</Text>
                <EightDigitPinInput value={confirmPin} onChange={setConfirmPin} colors={colors} disabled={pinSaving} />
                <TouchableOpacity
                  style={[styles.primary, { backgroundColor: colors.primary, marginTop: 12 }]}
                  onPress={() => void savePin()}
                  disabled={pinSaving}
                >
                  {pinSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryText}>Save transfer PIN</Text>
                  )}
                </TouchableOpacity>
                {summary.hasTransferPin ? (
                  <TouchableOpacity style={{ marginTop: 14 }} onPress={() => removePin()} disabled={pinSaving}>
                    <Text style={{ color: colors.danger, fontWeight: '700', textAlign: 'center' }}>Remove transfer PIN</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={{ marginTop: 12, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12 }}
                  onPress={() => {
                    setShowPinChange(false);
                    setNewPin('');
                    setConfirmPin('');
                  }}
                >
                  <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Verification document</Text>
            {summary.hasVerificationDocument && !showDocPanel ? (
              <>
                <Text style={{ color: colors.success, fontWeight: '600', marginBottom: 10 }}>Document on file</Text>
                <TouchableOpacity
                  style={[styles.sectionCta, { borderColor: colors.primary, backgroundColor: colors.surfaceVariant ?? colors.card }]}
                  onPress={() => setShowDocPanel(true)}
                  activeOpacity={0.88}
                >
                  <View style={styles.sectionCtaLeading}>
                    <Ionicons name="create-outline" size={20} color={colors.primary} />
                    <Text style={[styles.sectionCtaText, { color: colors.primary, flex: 1 }]}>Update document</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.primary} />
                </TouchableOpacity>
              </>
            ) : !summary.hasVerificationDocument && !showDocPanel ? (
              <TouchableOpacity
                style={[styles.sectionCta, { borderColor: colors.border, backgroundColor: colors.surfaceVariant ?? colors.card }]}
                onPress={() => setShowDocPanel(true)}
                activeOpacity={0.88}
              >
                <View style={styles.sectionCtaLeading}>
                  <Ionicons name="document-attach-outline" size={20} color={colors.primary} />
                  <Text style={[styles.sectionCtaText, { color: colors.text, flex: 1 }]}>Add verification document</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : (
              <>
                <Text style={[styles.p, { color: colors.textSecondary }]}>
                  Upload a photo of an ID or other document for account verification (stored on the server).
                </Text>
                <TouchableOpacity
                  style={[styles.outlineBtn, { borderColor: colors.border }]}
                  onPress={() => void pickDocument()}
                  disabled={docBusy}
                >
                  {docBusy ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="image-outline" size={20} color={colors.primary} />
                      <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Choose document image</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ marginTop: 12, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12 }}
                  onPress={() => setShowDocPanel(false)}
                >
                  <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <TouchableOpacity style={[styles.outlineBtn, { borderColor: colors.border, marginBottom: 8 }]} onPress={() => router.push(supportPath as never)}>
            <Ionicons name="help-circle-outline" size={20} color={colors.text} />
            <Text style={[styles.outlineBtnText, { color: colors.text }]}>Help & support</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.gateFooterBtn,
              { borderColor: colors.border, backgroundColor: colors.surfaceVariant ?? colors.card, marginTop: 4 },
            ]}
            onPress={() => {
              void (async () => {
                try {
                  await securityService.revokeSecuritySession();
                } catch {
                  /* ignore */
                }
                router.back();
              })();
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="close-outline" size={22} color={colors.text} />
            <Text style={[styles.gateFooterBtnText, { color: colors.text }]}>Close</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bootstrap: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  bootstrapHint: { marginTop: 16, fontSize: 15, textAlign: 'center' },
  pad: { padding: 20, paddingBottom: 48, gap: 16 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 18 },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  p: { fontSize: 14, lineHeight: 21, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  primary: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  tierRow: { flexDirection: 'row', marginBottom: 8 },
  tierBadge: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  tierText: { fontWeight: '900', letterSpacing: 1 },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  outlineBtnText: { fontWeight: '700', fontSize: 15 },
  methodChoiceRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  methodChoiceCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 6,
  },
  methodChoiceTitle: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  methodChoiceSub: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
  altMethodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 14,
    marginTop: 4,
  },
  altMethodPillText: { fontWeight: '700', fontSize: 14 },
  noPasswordHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
    marginTop: 4,
  },
  noPasswordHintText: { fontWeight: '600', fontSize: 14 },
  methodChangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 14,
  },
  methodChangeBtnText: { fontWeight: '700', fontSize: 14 },
  gateFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
    borderWidth: 1.5,
    alignSelf: 'center',
    minWidth: 200,
  },
  gateFooterBtnText: { fontWeight: '700', fontSize: 15 },
  sectionCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    gap: 10,
  },
  sectionCtaLeading: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  sectionCtaText: { fontWeight: '700', fontSize: 15 },
});
