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
import { orderService, Order } from './api/order.service';

// Channel IDs
const CHANNEL_ORDER = 'order-updates';
const CHANNEL_DEFAULT = 'default';
const PENDING_NOTIFICATION_ROUTE_KEY = 'pendingNotificationRoute';
const TRACKING_STATUS_MAP_KEY = 'trackingOrderStatusMap';

const ORDER_ACTIVE_STATUSES = [
  'SEARCHING_DRIVER',
  'PENDING_CUSTOMER_APPROVAL',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVED',
  'PICKED_UP',
  'DELIVERING',
];

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

function getOrderNotificationId(orderId: string) {
  return `order-track-${orderId}`;
}

async function getTrackingStatusMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(TRACKING_STATUS_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setTrackingStatusMap(map: Record<string, string>) {
  await AsyncStorage.setItem(TRACKING_STATUS_MAP_KEY, JSON.stringify(map));
}

async function setTrackedOrderStatus(orderId: string, status?: string) {
  const map = await getTrackingStatusMap();
  // Ensure every displayed order notification is tracked, even before
  // the backend sends a concrete status update.
  map[orderId] = status || map[orderId] || 'UNKNOWN';
  await setTrackingStatusMap(map);
}

async function clearTrackedOrder(orderId: string) {
  const map = await getTrackingStatusMap();
  delete map[orderId];
  await setTrackingStatusMap(map);
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
      pressAction:
        btn.id === 'accept_driver'
          ? ({ id: btn.id, launchActivity: 'none' } as any) // keep app closed for background approval
          : { id: btn.id, launchActivity: 'default' },
    }));
  }
  // Default action
  return [{ title: '📍 View Order', pressAction: { id: 'view_order', launchActivity: 'default' } }];
}

// Total steps in the order progress (0-6)
const PROGRESS_TOTAL = 7;

function getTrackingNotificationFromOrder(order: Order): { title: string; body: string } {
  const driverName =
    order.driverAssignment?.driver?.user?.firstName ||
    order.driverAssignment?.driver?.user?.secondName ||
    'Driver';

  switch (order.status) {
    case 'SEARCHING_DRIVER':
      return {
        title: '📦 Order Confirmed — Searching for a driver...',
        body: '⛟———⌖———⌖———⌖———⌖———⌖———⌖',
      };
    case 'PENDING_CUSTOMER_APPROVAL':
      return {
        title: `🚗 Driver Found! — ${driverName}`,
        body: '◉———⛟———⌖———⌖———⌖———⌖———⌖',
      };
    case 'DRIVER_ASSIGNED':
      return {
        title: `✅ Driver Assigned — ${driverName} is on the way!`,
        body: '◉———◉———⛟———⌖———⌖———⌖———⌖',
      };
    case 'DRIVER_ARRIVED':
      return {
        title: '📍 Driver Arrived — At the pickup location',
        body: '◉———◉———◉———⛟———⌖———⌖———⌖',
      };
    case 'PICKED_UP':
      return {
        title: '📦 Package Picked Up — On its way!',
        body: '◉———◉———◉———◉———⛟———⌖———⌖',
      };
    case 'DELIVERING':
      return {
        title: '🚚 Delivery In Progress',
        body: '◉———◉———◉———◉———◉———⛟———⌖',
      };
    default:
      return {
        title: '📦 Order Update',
        body: '⛟———⌖———⌖———⌖———⌖———⌖———⌖',
      };
  }
}

function getDriverFoundActionButtons() {
  return [
    { id: 'accept_driver', title: '✅ Accept Driver', action: 'accept_driver' },
    { id: 'see_driver', title: '👤 See Driver', action: 'see_driver' },
  ];
}

/**
 * Start the order tracking foreground service.
 */
export async function startOrderTracking(orderId: string, title: string, body: string, data?: Record<string, string>) {
  if (Platform.OS !== 'android') return;

  await setTrackedOrderStatus(orderId, data?.orderStatus);

  await notifee.displayNotification({
    id: getOrderNotificationId(orderId),
    title,
    body,
    android: {
      channelId: CHANNEL_ORDER,
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

  const orderId = data?.orderId || data?.relatedEntityId || data?.groupKey?.replace('order:', '') || '';
  if (!orderId) return;
  await setTrackedOrderStatus(orderId, data?.orderStatus);

  await notifee.displayNotification({
    id: getOrderNotificationId(orderId),
    title,
    body,
    android: {
      channelId: CHANNEL_ORDER,
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
export async function stopOrderTracking(title: string, body: string, orderId?: string) {
  return stopOrderTrackingWithOptions(title, body, true, orderId);
}

export async function stopOrderTrackingSilently() {
  return stopOrderTrackingWithOptions('', '', false);
}

async function stopOrderTrackingWithOptions(title: string, body: string, showFinalNotification: boolean, orderId?: string) {
  if (Platform.OS !== 'android') return;

  if (!orderId && !showFinalNotification) {
    const map = await getTrackingStatusMap();
    const allOrderIds = Object.keys(map);
    await Promise.all(
      allOrderIds.map((id) => notifee.cancelNotification(getOrderNotificationId(id)).catch(() => {})),
    );
    await AsyncStorage.removeItem(TRACKING_STATUS_MAP_KEY);
    return;
  }

  const targetOrderId = orderId || '';
  if (!targetOrderId) return;
  await clearTrackedOrder(targetOrderId);

  if (!showFinalNotification) return;

  await notifee.displayNotification({
    id: getOrderNotificationId(targetOrderId),
    title,
    body,
    android: {
      channelId: CHANNEL_ORDER,
      importance: AndroidImportance.HIGH,
      autoCancel: true,
      pressAction: { id: 'view_order', launchActivity: 'default' },
    },
    data: {
      orderId: targetOrderId,
      relatedEntityType: 'Order',
      relatedEntityId: targetOrderId,
    },
  });
}

/**
 * Restore customer order tracking notification after login/reopen.
 * If there is no active order, foreground service is stopped silently.
 */
export async function restoreOrderTrackingForCustomer() {
  if (Platform.OS !== 'android') return;

  try {
    const role = await AsyncStorage.getItem('userRole');
    if (role !== 'CUSTOMER') {
      await stopOrderTrackingSilently();
      return;
    }

    const orders = await orderService.getMyOrders();
    const activeOrders = orders
      .filter((order) => ORDER_ACTIVE_STATUSES.includes(order.status))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    if (!activeOrders.length) {
      await stopOrderTrackingSilently();
      return;
    }
    const map = await getTrackingStatusMap();
    const activeIdSet = new Set(activeOrders.map((o) => o.id));

    for (const trackedOrderId of Object.keys(map)) {
      if (!activeIdSet.has(trackedOrderId)) {
        await notifee.cancelNotification(getOrderNotificationId(trackedOrderId)).catch(() => {});
        delete map[trackedOrderId];
      }
    }

    for (const order of activeOrders) {
      if (map[order.id] === order.status) continue;
      const { title, body } = getTrackingNotificationFromOrder(order);
      const actionButtons =
        order.status === 'PENDING_CUSTOMER_APPROVAL' ? getDriverFoundActionButtons() : null;

      await startOrderTracking(order.id, title, body, {
        orderId: order.id,
        groupKey: `order:${order.id}`,
        relatedEntityType: 'Order',
        relatedEntityId: order.id,
        ongoing: 'true',
        orderStatus: order.status,
        ...(actionButtons ? { actionButtons: JSON.stringify(actionButtons) } : {}),
      });
      map[order.id] = order.status;
    }

    await setTrackingStatusMap(map);
  } catch (error) {
    console.error('Failed to restore order tracking notification:', error);
  }
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

function getOrderRoute(orderId: string, scrollToDriver: boolean = false) {
  return scrollToDriver
    ? `/(customer)/order-detail?orderId=${orderId}&scrollTo=driver`
    : `/(customer)/order-detail?orderId=${orderId}`;
}

async function savePendingNotificationRoute(route: string) {
  try {
    await AsyncStorage.setItem(PENDING_NOTIFICATION_ROUTE_KEY, route);
  } catch {}
}

async function flushPendingNotificationRoute() {
  try {
    const route = await AsyncStorage.getItem(PENDING_NOTIFICATION_ROUTE_KEY);
    if (!route) return;
    await AsyncStorage.removeItem(PENDING_NOTIFICATION_ROUTE_KEY);
    router.push(route as any);
  } catch {}
}

async function handleInitialNotificationOpen() {
  try {
    const initial = await notifee.getInitialNotification();
    if (!initial) return;

    const actionId = initial.pressAction?.id;
    const data = initial.notification?.data as Record<string, string> | undefined;
    const orderId = data?.orderId || data?.relatedEntityId || '';

    if (!orderId) return;

    if (actionId === 'accept_driver') {
      await handleAcceptDriver(orderId);
      return;
    }

    if (actionId === 'see_driver') {
      router.push(getOrderRoute(orderId, true) as any);
      return;
    }

    router.push(getOrderRoute(orderId) as any);
  } catch {}
}

// ============================================================
// FCM MESSAGE HANDLERS
// ============================================================

async function handleOrderFCMData(data: Record<string, string>) {
  const { title, body, orderId, groupKey, ongoing } = data;
  if (!title || !body) return;

  const isTerminal = ongoing === 'false';
  const oid = orderId || groupKey?.replace('order:', '') || '';

  if (isTerminal) {
    await stopOrderTracking(title, body, oid);
    return;
  }
  if (!oid) return;
  await updateOrderTracking(title, body, { ...data, orderId: oid });
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
  // Handle notification taps that launched the app from killed state
  handleInitialNotificationOpen();
  flushPendingNotificationRoute();

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
        router.push(getOrderRoute(orderId, true) as any);
        return;
      }
      if (actionId === 'view_order' && orderId) {
        router.push(getOrderRoute(orderId) as any);
        return;
      }
    }
    if (type === EventType.PRESS) {
      const data = detail.notification?.data as Record<string, string> | undefined;
      if (data?.relatedEntityType === 'Order' && data?.relatedEntityId) {
        router.push(getOrderRoute(data.relatedEntityId) as any);
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
        await savePendingNotificationRoute(getOrderRoute(orderId, true));
        return;
      }
      if (actionId === 'view_order' && orderId) {
        await savePendingNotificationRoute(getOrderRoute(orderId));
        return;
      }
    }
    if (type === EventType.PRESS) {
      const data = detail.notification?.data as Record<string, string> | undefined;
      if (data?.relatedEntityType === 'Order' && data?.relatedEntityId) {
        await savePendingNotificationRoute(getOrderRoute(data.relatedEntityId));
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
