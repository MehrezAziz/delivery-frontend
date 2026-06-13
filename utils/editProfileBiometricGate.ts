import { Platform } from 'react-native';
import i18n from '../i18n';

/** Same numeric values as expo-local-authentication `AuthenticationType` (no static native import at bundle load). */
export const BIO_FINGERPRINT = 1;
export const BIO_FACIAL = 2;
export const BIO_IRIS = 3;

export function getBiometricPrimaryLabel(types: readonly number[]): string {
  const hasFace = types.includes(BIO_FACIAL);
  const hasFinger = types.includes(BIO_FINGERPRINT);
  const hasIris = types.includes(BIO_IRIS);
  if (hasFace && !hasFinger && !hasIris) return i18n.t('biometric.verifyWithFaceId');
  if (hasFinger && !hasFace && !hasIris) return i18n.t('biometric.verifyWithFingerprint');
  if (hasFace && hasFinger) return i18n.t('biometric.verifyWithFaceOrFingerprint');
  if (hasIris) return i18n.t('biometric.verifyWithBiometrics');
  return i18n.t('biometric.verifyWithBiometrics');
}

/** Label for switching from password back to biometric prompt */
export function getBiometricSwitchLinkLabel(types: readonly number[]): string {
  const hasFace = types.includes(BIO_FACIAL);
  const hasFinger = types.includes(BIO_FINGERPRINT);
  if (hasFace && hasFinger) return i18n.t('biometric.useFaceOrFingerprint');
  if (hasFace) return i18n.t('biometric.useFaceId');
  if (hasFinger) return i18n.t('biometric.useFingerprint');
  return i18n.t('biometric.useBiometrics');
}

type ExpoLocalAuthModule = typeof import('expo-local-authentication');
let cachedLocalAuth: ExpoLocalAuthModule | null | undefined;

/**
 * Dynamic import so a missing native module does not crash route evaluation.
 * Cached so a failed load does not retry every tap.
 */
export async function getLocalAuthentication(): Promise<ExpoLocalAuthModule | null> {
  if (Platform.OS === 'web') return null;
  if (cachedLocalAuth !== undefined) return cachedLocalAuth;
  try {
    cachedLocalAuth = await import('expo-local-authentication');
  } catch {
    cachedLocalAuth = null;
  }
  return cachedLocalAuth;
}
