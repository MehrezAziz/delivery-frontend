import { Platform } from 'react-native';

/** Same numeric values as expo-local-authentication `AuthenticationType` (no static native import at bundle load). */
export const BIO_FINGERPRINT = 1;
export const BIO_FACIAL = 2;
export const BIO_IRIS = 3;

export function getBiometricPrimaryLabel(types: readonly number[]): string {
  const hasFace = types.includes(BIO_FACIAL);
  const hasFinger = types.includes(BIO_FINGERPRINT);
  const hasIris = types.includes(BIO_IRIS);
  if (hasFace && !hasFinger && !hasIris) return 'Verify with Face ID';
  if (hasFinger && !hasFace && !hasIris) return 'Verify with fingerprint';
  if (hasFace && hasFinger) return 'Verify with Face ID or fingerprint';
  if (hasIris) return 'Verify with biometrics';
  return 'Verify with biometrics';
}

/** Label for switching from password back to biometric prompt */
export function getBiometricSwitchLinkLabel(types: readonly number[]): string {
  const hasFace = types.includes(BIO_FACIAL);
  const hasFinger = types.includes(BIO_FINGERPRINT);
  if (hasFace && hasFinger) return 'Use Face ID or fingerprint';
  if (hasFace) return 'Use Face ID';
  if (hasFinger) return 'Use fingerprint';
  return 'Use biometrics';
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
