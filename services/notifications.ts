import notifee, {
  AndroidImportance,
  EventType,
} from '@notifee/react-native';
import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationService } from './api/notification.service';
import { api } from './api/client';

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
    if (!enabled) return null;

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
 */
export function registerOrderForegroundService() {
  notifee.registerForegroundService(() => {
    return new Promise(() => {});
  });
}

/**
 * Parse action buttons from FCM data
 */
function parseActionButtons(data: Record<string, string>): Array<{ id: string; title: string; action: string }> {
  try {
    if (data.actionButtons) {
      return JSON.parse(data.actionButtons);
    }
  } catch {}
  return [];
}

/**
 * Build Notifee actions from FCM action buttons
 */
function buildNotifeeActions(data: Record<string, string>) {
  const buttons = parseActionButtons(data);
  if (buttons.length > 0) {
    return buttons.map((btn) => ({
      title: btn.title,
      pressAction: { id: btn.id, launchActivity: 'default' },
    }));
  }
  // Default action
  return [{ title: '📍 View Order', pressAction: { id: 'view_order', launchActivity: 'default' } }];
}

// Total steps in the order progress (0-6)
const PROGRESS_TOTAL = 7;

/**
 * Start the order tracking foreground service.
 */
export async function startOrderTracking(orderId: string, title: string, body: string, data?: Record<string, string>) {
  if (Platform.OS !== 'android') return;

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
      pressAction: { id: 'view_order', launchActivity: 'default' },
      actions: data ? buildNotifeeActions(data) : [
        { title: '📍 View Order', pressAction: { id: 'view_order', launchActivity: 'default' } },
      ],
    },
    data: { orderId, relatedEntityType: 'Order', relatedEntityId: orderId, ...(data || {}) },
  });
}

/**
 * Update the order tracking foreground service notification.
 */
export async function updateOrderTracking(title: string, body: string, data?: Record<string, string>) {
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
      pressAction: { id: 'view_order', launchActivity: 'default' },
      actions: data ? buildNotifeeActions(data) : [
        { title: '📍 View Order', pressAction: { id: 'view_order', launchActivity: 'default' } },
      ],
    },
    data: { orderId: orderId || '', relatedEntityType: 'Order', relatedEntityId: orderId || '', ...(data || {}) },
  });
}

/**
 * Stop the order tracking foreground service.
 */
export async function stopOrderTracking(title: string, body: string) {
  if (Platform.OS !== 'android') return;

  await AsyncStorage.removeItem('trackingOrderId');

  try {
    await notifee.stopForegroundService();
  } catch {}

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
// ACTION BUTTON HANDLERS
// ============================================================

/**
 * Handle "Accept Driver" action from notification button.
 * Calls the approve-driver API without opening the app.
 */
async function handleAcceptDriver(orderId: string) {
  try {
    const token = await AsyncStorage.getItem('accessToken');
    if (!token) return;

    await api.post(`/orders/${orderId}/approve-driver`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // The backend will emit order.driver_assigned which sends a new FCM
    // that will update the foreground service notification
    console.log('Driver approved successfully from notification');
  } catch (error) {
    console.error('Failed to approve driver from notification:', error);
  }
}

// ============================================================
// FCM MESSAGE HANDLERS
// ============================================================

async function handleOrderFCMData(data: Record<string, string>) {
  const { title, body, orderId, groupKey, ongoing } = data;
  if (!title || !body) return;

  const isTerminal = ongoing === 'false';

  if (isTerminal) {
    await stopOrderTracking(title, body);
    return;
  }

  const trackingOrderId = await AsyncStorage.getItem('trackingOrderId');
  const oid = orderId || groupKey?.replace('order:', '') || '';

  if (trackingOrderId) {
    await updateOrderTracking(title, body, data);
  } else if (oid) {
    await startOrderTracking(oid, title, body, data);
  }
}

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

// ============================================================
// NOTIFICATION LISTENERS
// ============================================================

export function setupNotificationListeners() {
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

  const unsubscribeNotifee = notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.ACTION_PRESS) {
      const actionId = detail.pressAction?.id;
      const data = detail.notification?.data as Record<string, string> | undefined;
      const orderId = data?.orderId || data?.relatedEntityId || '';

      if (actionId === 'accept_driver' && orderId) {
        handleAcceptDriver(orderId);
        return;
      }
      if (actionId === 'see_driver' && orderId) {
        router.push(`/(customer)/order-detail?orderId=${orderId}`);
        return;
      }
      if (actionId === 'view_order' && orderId) {
        router.push(`/(customer)/order-detail?orderId=${orderId}`);
        return;
      }
    }
    if (type === EventType.PRESS) {
      const data = detail.notification?.data as Record<string, string> | undefined;
      if (data?.relatedEntityType === 'Order' && data?.relatedEntityId) {
        router.push(`/(customer)/order-detail?orderId=${data.relatedEntityId}`);
      } else if (data) {
        handleNotificationTap(data);
      }
    }
  });

  return () => {
    unsubscribeForeground();
    unsubscribeNotifee();
  };
}

export function setupBackgroundHandler() {
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

  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.ACTION_PRESS) {
      const actionId = detail.pressAction?.id;
      const data = detail.notification?.data as Record<string, string> | undefined;
      const orderId = data?.orderId || data?.relatedEntityId || '';

      if (actionId === 'accept_driver' && orderId) {
        await handleAcceptDriver(orderId);
        return;
      }
      if (actionId === 'see_driver' && orderId) {
        router.push(`/(customer)/order-detail?orderId=${orderId}`);
        return;
      }
      if (actionId === 'view_order' && orderId) {
        router.push(`/(customer)/order-detail?orderId=${orderId}`);
        return;
      }
    }
    if (type === EventType.PRESS) {
      const data = detail.notification?.data as Record<string, string> | undefined;
      if (data?.relatedEntityType === 'Order' && data?.relatedEntityId) {
        router.push(`/(customer)/order-detail?orderId=${data.relatedEntityId}`);
      } else if (data) {
        handleNotificationTap(data);
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
          if (user.role === 'DRIVER') router.push(`/(driver)/order-chat?orderId=${relatedEntityId}`);
          else router.push(`/(customer)/order-chat?orderId=${relatedEntityId}`);
        }
      });
      break;
    case 'SupportTicket':
      AsyncStorage.getItem('user').then((u) => {
        if (u) {
          const user = JSON.parse(u);
          if (user.role === 'DRIVER') router.push(`/(driver)/support-chat?ticketId=${relatedEntityId}`);
          else router.push(`/(customer)/support-chat?ticketId=${relatedEntityId}`);
        }
      });
      break;
    case 'Rating':
      router.push('/(driver)/my-ratings');
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
  if (data.groupKey?.startsWith('order:')) await handleOrderFCMData(data);
  else await displayRegularNotification(data);
}
export async function handleDataMessage(data: Record<string, string>) {
  await handleFCMMessage({ data });
}
export async function registerDriverActionCategories() {}
