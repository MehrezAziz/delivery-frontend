import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerForPushNotifications } from './notifications';

/**
 * Ensures notification permission (Expo + FCM) and registers the device token — use for drivers only.
 */
export async function ensureDriverPushNotificationSetup(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      try {
        await Notifications.requestPermissionsAsync();
      } catch {
        /* Some OEM builds can throw before the permission dialog exists */
      }
    }
    await registerForPushNotifications();
  } catch {
    /* ignore */
  }
}
