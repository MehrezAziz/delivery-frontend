import AsyncStorage from '@react-native-async-storage/async-storage';

const LOGIN_TIMESTAMP_KEY = 'loginTimestamp';
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Save the current timestamp as the login time.
 * Call this after every successful login/register.
 */
export async function saveLoginTimestamp(): Promise<void> {
  await AsyncStorage.setItem(LOGIN_TIMESTAMP_KEY, Date.now().toString());
}

/**
 * Check if the session is still valid (within 30 days of login).
 * Returns true if valid, false if expired or no timestamp found.
 */
export async function isSessionValid(): Promise<boolean> {
  const token = await AsyncStorage.getItem('accessToken');
  if (!token) return false;

  const timestamp = await AsyncStorage.getItem(LOGIN_TIMESTAMP_KEY);
  if (!timestamp) return false;

  const loginTime = parseInt(timestamp, 10);
  return Date.now() - loginTime < SESSION_DURATION_MS;
}

/**
 * Clear all auth-related data from AsyncStorage.
 * Call this on logout or when session expires.
 */
export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([
    'accessToken',
    'refreshToken',
    'loginTimestamp',
    'user',
    'customer',
    'driver',
    'userRole',
    'userId',
    'driverId',
  ]);
}
