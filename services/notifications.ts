import notifee, {
  AndroidImportance,
  EventType,
} from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationService } from './api/notification.service';

// Channel IDs
const CHANNEL_ORDER = 'order-updates';
const CHANNEL_DEFAULT = 'default';

/**
 * Create Android notification channels
 */
export async function createNotificationChannels() {
  if (Platform.OS !== 'android') return;

  await notifee.createChannel({
    id: CHANNEL_ORDER,
    name: 'Order Updates',
    importance: AndroidImportance.HIGH,
    vibration: true,
  });

  await notifee.createChannel({
    id: CHANNEL_DEFAULT,
    name: 'General',
    importance: AndroidImportance.DEFAULT,
  });
}

/**
 * Register for push notifications and send FCM token to backend
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      console.log('Push notification permission not granted');
      return null;
    }

    const token = await messaging().getToken();
    if (!token) return null;

    const platform = Platform.OS as 'android' | 'ios';
    try {
      await notificationService.registerToken(token, platform);
      await AsyncStorage.setItem('pushToken', token);
    } catch (error) {
      console.error('Failed to register push token with backend:', error);
    }

    messaging().onTokenRefresh(async (newToken) => {
      try {
        await notificationService.registerToken(newToken, platform);
        await AsyncStorage.setItem('pushToken', newToken);
      } catch {}
    });

    return token;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return null;
  }
}


/**
 * Display a regular (non-order) notification via Notifee
 */
async function displayRegularNotification(data: Record<string, string>) {
  const { title, body } = data;
  if (!title || !body) return;

  await notifee.displayNotification({
    title,
    body,
    android: {
      channelId: CHANNEL_DEFAULT,
      importance: AndroidImportance.DEFAULT,
      pressAction: { id: 'default' },
    },
    ios: { sound: 'default' },
    data,
  });
}

/**
 * Set up all notification listeners (foreground + background + tap)
 * 
 * STRATEGY for order notifications:
 * - Backend sends FCM with notification field + android tag
 * - When app is CLOSED: FCM displays native notification, tag ensures replacement
 * - When app is OPEN: FCM onMessage fires. We do NOT display via Notifee.
 *   Instead, we let the FCM notification (which was suppressed in foreground)
 *   be handled by just doing nothing — the user sees the in-app UI update via websocket.
 *   BUT we still want a notification in the tray, so we use Notifee but with the
 *   same tag as FCM to ensure they replace each other.
 * 
 * IMPORTANT: The key insight is that when app is in foreground, FCM suppresses
 * the native notification. So we MUST display via Notifee in foreground.
 * When app is killed/background, FCM shows native notification with tag.
 * The problem was mixing Notifee and FCM notifications.
 * 
 * SOLUTION: Don't use Notifee for order notifications at all.
 * Only use FCM native notifications with tag for replacement.
 * For foreground, we just skip showing notification (user sees in-app updates).
 */
export function setupNotificationListeners() {
  // Foreground FCM messages
  const unsubscribeForeground = messaging().onMessage(async (remoteMessage) => {
    const data = remoteMessage?.data as Record<string, string> | undefined;
    if (!data) return;

    const { groupKey } = data;

    if (groupKey?.startsWith('order:')) {
      // Order notifications: DO NOT display via Notifee in foreground
      // The user sees real-time updates via websocket in the app UI
      // This avoids the dual-notification problem
      console.log('Order notification received in foreground, skipping display (in-app UI handles it)');
    } else {
      // Non-order notifications: display via Notifee
      await displayRegularNotification(data);
    }
  });

  // Notifee foreground events (for non-order notification taps)
  const unsubscribeNotifee = notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
      const data = detail.notification?.data as Record<string, string> | undefined;
      if (data) {
        handleNotificationTap(data);
      }
    }
  });

  return () => {
    unsubscribeForeground();
    unsubscribeNotifee();
  };
}

/**
 * Set up background message handler (must be called outside component)
 */
export function setupBackgroundHandler() {
  // FCM background/killed messages
  // For order notifications: FCM displays native notification with tag (replacement works)
  // For non-order: display via Notifee
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    const data = remoteMessage?.data as Record<string, string> | undefined;
    if (!data) return;

    const { groupKey } = data;

    if (groupKey?.startsWith('order:')) {
      // Order notifications: FCM already displayed native notification with tag
      // The tag ensures replacement. Nothing to do here.
      console.log('Order notification received in background, FCM handles display with tag');
    } else {
      await displayRegularNotification(data);
    }
  });

  // Notifee background events
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
      const data = detail.notification?.data as Record<string, string> | undefined;
      if (data) {
        handleNotificationTap(data);
      }
    }
  });
}


/**
 * Handle notification tap — navigate to relevant screen
 */
function handleNotificationTap(data: Record<string, string> | undefined) {
  if (!data) return;
  const { relatedEntityType, relatedEntityId, type } = data;

  if (!relatedEntityType || !relatedEntityId) return;

  switch (relatedEntityType) {
    case 'Order': {
      const driverTypes = [
        'NEW_ORDER_AVAILABLE', 'ORDER_EXPIRED', 'ORDER_CANCELLED_BY_CUSTOMER',
        'PICKUP_REMINDER', 'PAYMENT_RECEIVED_COD', 'PAYMENT_CREDITED_WALLET',
        'NEW_MESSAGE_FROM_CUSTOMER',
      ];
      if (driverTypes.includes(type)) {
        router.push(`/(driver)/order-detail?orderId=${relatedEntityId}`);
      } else {
        router.push(`/(customer)/order-detail?orderId=${relatedEntityId}`);
      }
      break;
    }
    case 'ChatRoom':
      AsyncStorage.getItem('user').then((u) => {
        if (u) {
          const user = JSON.parse(u);
          if (user.role === 'DRIVER') {
            router.push(`/(driver)/order-chat?orderId=${relatedEntityId}`);
          } else {
            router.push(`/(customer)/order-chat?orderId=${relatedEntityId}`);
          }
        }
      });
      break;
    case 'SupportTicket':
      AsyncStorage.getItem('user').then((u) => {
        if (u) {
          const user = JSON.parse(u);
          if (user.role === 'DRIVER') {
            router.push(`/(driver)/support-chat?ticketId=${relatedEntityId}`);
          } else {
            router.push(`/(customer)/support-chat?ticketId=${relatedEntityId}`);
          }
        }
      });
      break;
    case 'Rating':
      router.push('/(driver)/my-ratings');
      break;
    default:
      break;
  }
}

// Legacy exports for compatibility
export function setupNotificationResponseListener(callback?: any) {
  return { remove: () => {} };
}

export function setupNotificationReceivedListener(callback?: any) {
  return { remove: () => {} };
}

export async function handleFCMMessage(remoteMessage: any) {
  const data = remoteMessage?.data as Record<string, string> | undefined;
  if (!data) return;
  const { groupKey } = data;
  if (groupKey?.startsWith('order:')) {
    // Handled by FCM native notification with tag
  } else {
    await displayRegularNotification(data);
  }
}

export async function handleDataMessage(data: Record<string, string>) {
  await handleFCMMessage({ data });
}

export async function registerDriverActionCategories() {}
