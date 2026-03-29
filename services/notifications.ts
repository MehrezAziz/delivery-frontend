import notifee, {
  AndroidImportance,
  AndroidColor,
  AndroidForegroundServiceType,
  EventType,
  Event,
} from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationService } from './api/notification.service';

// Channel IDs
const CHANNEL_ORDER = 'order-updates';
const CHANNEL_DEFAULT = 'default';

// Fixed notification ID for the order tracking foreground service
const ORDER_FGS_ID = 'order-fgs';

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

// ============================================================
// ORDER TRACKING FOREGROUND SERVICE
// ============================================================

/**
 * Register the foreground service runner.
 * MUST be called at module level (outside React components).
 * This only registers the handler — it does NOT start the service.
 */
export function registerOrderForegroundService() {
  notifee.registerForegroundService(() => {
    // Return a promise that never resolves — keeps the service alive
    // The service will be stopped explicitly via stopOrderTracking()
    return new Promise(() => {});
  });
}

/**
 * Start the order tracking foreground service.
 * Call this ONLY when a customer creates a new order.
 */
export async function startOrderTracking(orderId: string, title: string, body: string) {
  if (Platform.OS !== 'android') return;

  // Save the tracking order ID
  await AsyncStorage.setItem('trackingOrderId', orderId);

  await notifee.displayNotification({
    id: ORDER_FGS_ID,
    title,
    body,
    android: {
      channelId: CHANNEL_ORDER,
      asForegroundService: true,
      ongoing: true,
      autoCancel: false,
      importance: AndroidImportance.HIGH,
      color: AndroidColor.BLUE,
      colorized: true,
      pressAction: { id: 'view_order', launchActivity: 'default' },
      actions: [
        {
          title: '📍 View Order',
          pressAction: { id: 'view_order', launchActivity: 'default' },
        },
      ],
    },
    data: { orderId, relatedEntityType: 'Order', relatedEntityId: orderId },
  });
}

/**
 * Update the order tracking foreground service notification.
 * Call this when order status changes via FCM data message.
 */
export async function updateOrderTracking(title: string, body: string) {
  if (Platform.OS !== 'android') return;

  const orderId = await AsyncStorage.getItem('trackingOrderId');

  await notifee.displayNotification({
    id: ORDER_FGS_ID,
    title,
    body,
    android: {
      channelId: CHANNEL_ORDER,
      asForegroundService: true,
      ongoing: true,
      autoCancel: false,
      importance: AndroidImportance.HIGH,
      color: AndroidColor.BLUE,
      colorized: true,
      pressAction: { id: 'view_order', launchActivity: 'default' },
      actions: [
        {
          title: '📍 View Order',
          pressAction: { id: 'view_order', launchActivity: 'default' },
        },
      ],
    },
    data: { orderId: orderId || '', relatedEntityType: 'Order', relatedEntityId: orderId || '' },
  });
}

/**
 * Stop the order tracking foreground service.
 * Call this when order is delivered or cancelled.
 * Shows a final dismissible notification before stopping.
 */
export async function stopOrderTracking(title: string, body: string) {
  if (Platform.OS !== 'android') return;

  await AsyncStorage.removeItem('trackingOrderId');

  // Stop the foreground service (removes the ongoing notification)
  try {
    await notifee.stopForegroundService();
  } catch {}

  // Show a final regular (dismissible) notification
  await notifee.displayNotification({
    title,
    body,
    android: {
      channelId: CHANNEL_ORDER,
      importance: AndroidImportance.HIGH,
      autoCancel: true,
      pressAction: { id: 'default' },
    },
  });
}


// ============================================================
// FCM MESSAGE HANDLERS
// ============================================================

/**
 * Handle an order notification from FCM data message.
 * Updates the foreground service or starts it if needed.
 */
async function handleOrderFCMData(data: Record<string, string>) {
  const { title, body, orderId, groupKey, ongoing } = data;
  if (!title || !body) return;

  const isTerminal = ongoing === 'false'; // delivered or cancelled

  if (isTerminal) {
    await stopOrderTracking(title, body);
    return;
  }

  // Check if foreground service is already running for this order
  const trackingOrderId = await AsyncStorage.getItem('trackingOrderId');
  const oid = orderId || groupKey?.replace('order:', '') || '';

  if (trackingOrderId) {
    // Service is running — just update the notification
    await updateOrderTracking(title, body);
  } else if (oid) {
    // Service not running — start it (e.g. app was killed and restarted by FCM)
    await startOrderTracking(oid, title, body);
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
 */
export function setupNotificationListeners() {
  // Foreground FCM messages — data-only for orders, regular for others
  const unsubscribeForeground = messaging().onMessage(async (remoteMessage) => {
    const data = remoteMessage?.data as Record<string, string> | undefined;
    if (!data) return;

    const { groupKey } = data;

    if (groupKey?.startsWith('order:')) {
      await handleOrderFCMData(data);
    } else {
      await displayRegularNotification(data);
    }
  });

  // Notifee foreground events (taps on notifications)
  const unsubscribeNotifee = notifee.onForegroundEvent(({ type, detail }) => {
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

  return () => {
    unsubscribeForeground();
    unsubscribeNotifee();
  };
}

/**
 * Set up background message handler (must be called outside component)
 */
export function setupBackgroundHandler() {
  // FCM background/killed messages — data-only for orders
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    const data = remoteMessage?.data as Record<string, string> | undefined;
    if (!data) return;

    const { groupKey } = data;

    if (groupKey?.startsWith('order:')) {
      await handleOrderFCMData(data);
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


// ============================================================
// NOTIFICATION TAP HANDLER
// ============================================================

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

// ============================================================
// LEGACY EXPORTS
// ============================================================

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
    await handleOrderFCMData(data);
  } else {
    await displayRegularNotification(data);
  }
}

export async function handleDataMessage(data: Record<string, string>) {
  await handleFCMMessage({ data });
}

export async function registerDriverActionCategories() {}
