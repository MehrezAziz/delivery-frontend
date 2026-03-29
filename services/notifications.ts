import notifee, {
  AndroidImportance,
  AndroidCategory,
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

// Fixed notification ID for the active order (one per order)
function getOrderNotifId(orderId: string) {
  return `order_${orderId}`;
}

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
    // Request permission
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      console.log('Push notification permission not granted');
      return null;
    }

    // Get FCM token
    const token = await messaging().getToken();
    if (!token) return null;

    // Send to backend
    const platform = Platform.OS as 'android' | 'ios';
    try {
      await notificationService.registerToken(token, platform);
      await AsyncStorage.setItem('pushToken', token);
    } catch (error) {
      console.error('Failed to register push token with backend:', error);
    }

    // Listen for token refresh
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
 * Display or update the persistent order notification using Notifee.
 * Uses a fixed ID per order so it replaces itself on every status update.
 */
async function displayOrderNotification(data: Record<string, string>) {
  const { title, body, groupKey, ongoing, orderId } = data;
  if (!title || !body) return;

  // Use consistent ID format: "order_<uuid>"
  const id = orderId ? `order_${orderId}` : groupKey?.replace('order:', 'order_') || 'order';
  const isOngoing = ongoing === 'true';

  // Cancel existing notification first to force Android to update ongoing notifications
  try {
    await notifee.cancelNotification(id);
  } catch {}

  // Small delay to ensure cancellation is processed
  await new Promise((resolve) => setTimeout(resolve, 100));

  await notifee.displayNotification({
    id,
    title,
    body,
    android: {
      channelId: CHANNEL_ORDER,
      importance: AndroidImportance.HIGH,
      ongoing: isOngoing,
      autoCancel: !isOngoing,
      asForegroundService: false,
      pressAction: { id: 'view_order', launchActivity: 'default' },
      actions: isOngoing
        ? [{ title: 'View Order', pressAction: { id: 'view_order', launchActivity: 'default' } }]
        : [],
    },
    ios: {
      sound: 'default',
      threadId: groupKey,
    },
    data,
  });
}

/**
 * Display a regular (non-order) notification
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
 * Handle incoming FCM data message — display via Notifee
 */
export async function handleFCMMessage(remoteMessage: any) {
  const data = remoteMessage?.data as Record<string, string> | undefined;
  if (!data) return;

  const { groupKey } = data;

  // Order notifications use persistent single notification
  if (groupKey?.startsWith('order:')) {
    await displayOrderNotification(data);
  } else {
    await displayRegularNotification(data);
  }
}

/**
 * Set up all notification listeners (foreground + background + tap)
 */
export function setupNotificationListeners() {
  // Foreground FCM messages — display via Notifee for better control
  const unsubscribeForeground = messaging().onMessage(async (remoteMessage) => {
    const data = remoteMessage?.data as Record<string, string> | undefined;
    if (!data) return;

    const { groupKey } = data;

    if (groupKey?.startsWith('order:')) {
      await displayOrderNotification(data);
    } else {
      await displayRegularNotification(data);
    }
  });

  // Notifee foreground events (button presses, taps)
  const unsubscribeNotifee = notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
      const data = detail.notification?.data as Record<string, string> | undefined;
      if (data) {
        // For order notifications, navigate to order detail
        if (data.relatedEntityType === 'Order' && data.relatedEntityId) {
          router.push(`/(customer)/order-detail?orderId=${data.relatedEntityId}`);
        } else {
          handleNotificationTap(data);
        }
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
  // FCM background messages — display via Notifee
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    const data = remoteMessage?.data as Record<string, string> | undefined;
    if (!data) return;

    const { groupKey } = data;
    
    if (groupKey?.startsWith('order:')) {
      await displayOrderNotification(data);
    } else {
      await displayRegularNotification(data);
    }
  });

  // Notifee background events
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
      const data = detail.notification?.data as Record<string, string> | undefined;
      if (data) {
        if (data.relatedEntityType === 'Order' && data.relatedEntityId) {
          router.push(`/(customer)/order-detail?orderId=${data.relatedEntityId}`);
        } else {
          handleNotificationTap(data);
        }
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

export async function handleDataMessage(data: Record<string, string>) {
  await handleFCMMessage({ data });
}

export async function registerDriverActionCategories() {}
