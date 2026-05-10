import { GoogleSignin } from '@react-native-google-signin/google-signin';

/**
 * Web client ID from Google Cloud → Credentials → OAuth 2.0 → Web application.
 * Local override: set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in `.env` (gitignored).
 * Production / EAS: `eas.json` sets the same env for release builds.
 */
const WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  '899728652084-do58mlm951h1miqque2eh9l8bt3p2nug.apps.googleusercontent.com';

const IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || WEB_CLIENT_ID;

GoogleSignin.configure({
  webClientId: WEB_CLIENT_ID,
  iosClientId: IOS_CLIENT_ID,
  offlineAccess: true,
});

/**
 * Android status code 10 / DEVELOPER_ERROR: app signing cert not registered for this
 * package in Firebase/Google Cloud (common for debug builds).
 */
export function describeGoogleSignInSetupError(err: unknown): string | undefined {
  const e = err as { code?: string | number; message?: string };
  const code = e?.code != null ? String(e.code) : '';
  const message = typeof e?.message === 'string' ? e.message : '';
  if (code === '10' || message.includes('DEVELOPER_ERROR')) {
    return (
      'Google Sign-In is not authorized for this certificate. Firebase → Project settings → ' +
      'Android app `com.localsmartdelivery.app`: add (1) debug SHA-1 (`npm run android:signing-report`, ' +
      'Variant debug), and (2) Play App signing SHA-1 from Play Console → App integrity. ' +
      'Wait several minutes, download fresh `google-services.json`, then rebuild (USB: `expo run:android`; ' +
      'store: new EAS production build). Also ensure Google Cloud has an Android OAuth client for this package ' +
      'with the same SHA-1s if you removed it during cleanup.'
    );
  }
  // SIGN_IN_FAILED — often missing/outdated Firebase Android config or wrong webClientId
  if (code === '12500' || message.includes('non-recoverable sign in failure')) {
    return (
      'Google Sign-In failed (config). Re-add debug + Play SHA-1 on Firebase for `com.localsmartdelivery.app`, ' +
      'download a new `google-services.json` into the project, use Web client ID in the app (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`), ' +
      'then rebuild. Check OAuth consent screen (test users) if app is not in production.'
    );
  }
  return undefined;
}
