import notifee, {
  AndroidImportance,
  EventType,
} from '@notifee/react-native';
import {
  AuthorizationStatus,
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
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

/** While this matches the open chat screen, suppress redundant "new message" pushes. */
export type ActiveChatContext = { kind: 'order' | 'support'; id: string };

let activeChatContext: ActiveChatContext | null = null;

export function setActiveChatContext(ctx: ActiveChatContext | null) {
  activeChatContext = ctx;
}

export function clearActiveChatContextIfMatches(kind: ActiveChatContext['kind'], id: string) {
  if (activeChatContext?.kind === kind && activeChatContext.id === id) {
    activeChatContext = null;
  }
}

const ORDER_ACTIVE_STATUSES = [
  'SEARCHING_DRIVER',
  'PENDING_CUSTOMER_APPROVAL',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVED',
  'PICKED_UP',
  'DELIVERING',
];

const STATUS_BY_NOTIFICATION_TYPE: Record<string, string> = {
  ORDER_CREATED: 'SEARCHING_DRIVER',
  DRIVER_ASSIGNED: 'DRIVER_ASSIGNED',
  DRIVER_ARRIVED: 'DRIVER_ARRIVED',
  PACKAGE_PICKED_UP: 'PICKED_UP',
  DELIVERY_IN_PROGRESS: 'DELIVERING',
  ORDER_DELIVERED: 'DELIVERED',
  ORDER_CANCELLED: 'CANCELLED',
  NO_DRIVER_FOUND: 'FAILED',
  DISPUTE_OPENED: 'DISPUTED',
};

let backgroundHandlersRegistered = false;

const firebaseMessaging = getMessaging();

let fcmTokenRefreshRegistered = false;

/** FCM data values are not always typed as strings at the JS boundary; normalize before use. */
function coerceFcmData(
  raw: Record<string, unknown> | undefined,
): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) continue;
    out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

async function resolveOrderTrackingText(
  data: Record<string, string>,
  oid: string,
): Promise<{ title: string; body: string } | null> {
  let title = data.title?.trim() || '';
  let body = data.body?.trim() || '';
  if (title && body) return { title, body };

  try {
    const order = await orderService.getOrder(oid);
    if (!order) return title && body ? { title, body } : null;
    return getTrackingNotificationFromOrder(order);
  } catch {
    return title && body ? { title, body } : null;
  }
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
    const authStatus = await requestPermission(firebaseMessaging);
    const enabled =
      authStatus === AuthorizationStatus.AUTHORIZED ||
      authStatus === AuthorizationStatus.PROVISIONAL;
    if (!enabled) return null;

    const token = await getToken(firebaseMessaging);
    if (!token) return null;

    const platform = Platform.OS as 'android' | 'ios';
    try {
      await notificationService.registerToken(token, platform);
      await AsyncStorage.setItem('pushToken', token);
    } catch (error) {
      console.error('Failed to register push token with backend:', error);
    }

    if (!fcmTokenRefreshRegistered) {
      fcmTokenRefreshRegistered = true;
      onTokenRefresh(firebaseMessaging, async (newToken) => {
        try {
          const p = Platform.OS as 'android' | 'ios';
          await notificationService.registerToken(newToken, p);
          await AsyncStorage.setItem('pushToken', newToken);
        } catch {}
      });
    }

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

/** Read and clear queued deep link (e.g. notification action while app was headless). */
export async function consumePendingLaunchRoute(): Promise<string | null> {
  try {
    const route = await AsyncStorage.getItem(PENDING_NOTIFICATION_ROUTE_KEY);
    if (!route) return null;
    await AsyncStorage.removeItem(PENDING_NOTIFICATION_ROUTE_KEY);
    return route;
  } catch {
    return null;
  }
}

async function flushPendingNotificationRoute() {
  const route = await consumePendingLaunchRoute();
  if (route) router.push(route as any);
}

function shouldSuppressChatNotification(data: Record<string, string>): boolean {
  const type = data.type || '';
  const relType = data.relatedEntityType || '';
  const relId = data.relatedEntityId || '';
  if (!activeChatContext || !relId) return false;

  if (
    relType === 'ChatRoom' &&
    (type === 'NEW_MESSAGE_FROM_DRIVER' || type === 'NEW_MESSAGE_FROM_CUSTOMER')
  ) {
    return activeChatContext.kind === 'order' && activeChatContext.id === relId;
  }
  if (relType === 'SupportTicket' && type === 'SUPPORT_TICKET_REPLY') {
    return activeChatContext.kind === 'support' && activeChatContext.id === relId;
  }
  return false;
}

/** Build an expo-router path from FCM / Notifee notification data. */
export async function notificationDataToRoute(
  data: Record<string, string> | undefined,
): Promise<string | null> {
  if (!data) return null;
  const { relatedEntityType, relatedEntityId, type } = data;
  if (!relatedEntityType || !relatedEntityId) return null;

  switch (relatedEntityType) {
    case 'Order': {
      const driverTypes = [
        'NEW_ORDER_AVAILABLE',
        'ORDER_EXPIRED',
        'ORDER_CANCELLED_BY_CUSTOMER',
        'PICKUP_REMINDER',
        'PAYMENT_RECEIVED_COD',
        'PAYMENT_CREDITED_WALLET',
        'NEW_MESSAGE_FROM_CUSTOMER',
      ];
      if (driverTypes.includes(type || '')) {
        return `/(driver)/order-detail?orderId=${relatedEntityId}`;
      }
      return `/(customer)/order-detail?orderId=${relatedEntityId}`;
    }
    case 'ChatRoom': {
      const u = await AsyncStorage.getItem('user');
      let role: string | undefined;
      if (u) {
        try {
          role = JSON.parse(u).role;
        } catch {
          role = undefined;
        }
      }
      if (!role) role = (await AsyncStorage.getItem('userRole')) || 'CUSTOMER';
      return role === 'DRIVER'
        ? `/(driver)/order-chat?orderId=${relatedEntityId}`
        : `/(customer)/order-chat?orderId=${relatedEntityId}`;
    }
    case 'SupportTicket': {
      const u = await AsyncStorage.getItem('user');
      let role: string | undefined;
      if (u) {
        try {
          role = JSON.parse(u).role;
        } catch {
          role = undefined;
        }
      }
      if (!role) role = (await AsyncStorage.getItem('userRole')) || 'CUSTOMER';
      return role === 'DRIVER'
        ? `/(driver)/support-chat?ticketId=${relatedEntityId}`
        : `/(customer)/support-chat?ticketId=${relatedEntityId}`;
    }
    case 'Rating':
      return '/(driver)/my-ratings';
    default:
      return null;
  }
}

type NotifeeInitial = NonNullable<Awaited<ReturnType<typeof notifee.getInitialNotification>>>;

async function routeFromNotifeeInitialForNavigation(initial: NotifeeInitial): Promise<string | null> {
  const actionId = initial.pressAction?.id;
  const data = coerceFcmData(initial.notification?.data as Record<string, unknown>);
  const orderId = data.orderId || data.relatedEntityId || '';

  if (actionId === 'see_driver' && orderId) return getOrderRoute(orderId, true);
  if (actionId === 'view_order' && orderId) return getOrderRoute(orderId);
  if (actionId === 'accept_driver') return null;

  if (data.relatedEntityType && data.relatedEntityId) {
    return notificationDataToRoute(data);
  }
  if (orderId && data.groupKey?.startsWith('order:')) {
    return getOrderRoute(orderId);
  }
  return null;
}

/**
 * Non-order FCM from our backend includes `notification` + `data`; Android already shows the system tray message.
 */
function fcmHasNativeNotificationTrayPayload(remoteMessage: {
  notification?: { title?: string | null; body?: string | null } | null;
}): boolean {
  const n = remoteMessage.notification;
  if (!n) return false;
  const t = n.title;
  const b = n.body;
  return (
    (t != null && String(t).trim().length > 0) ||
    (b != null && String(b).trim().length > 0)
  );
}

/**
 * After a valid session on cold start: pending AsyncStorage route, then Notifee/FCM "opened from notification".
 * Notifee initial payload is one-shot — read here only (not again in layout listeners).
 */
export async function resolveLaunchRouteAfterLogin(): Promise<string | null> {
  const pending = await consumePendingLaunchRoute();
  if (pending) return pending;

  // Let native FCM / Notifee bridges finish wiring so getInitialNotification() is reliable on first cold start.
  await new Promise<void>((resolve) => setTimeout(resolve, 160));

  const n = await notifee.getInitialNotification();
  if (n?.pressAction?.id === 'accept_driver') {
    const data = coerceFcmData(n.notification?.data as Record<string, unknown>);
    const orderId = data.orderId || data.relatedEntityId;
    if (orderId) await handleAcceptDriver(orderId);
    return null;
  }
  if (n) {
    const r = await routeFromNotifeeInitialForNavigation(n);
    if (r) return r;
  }

  const fcm = await getInitialNotification(firebaseMessaging);
  if (fcm?.data) {
    const r = await notificationDataToRoute(coerceFcmData(fcm.data as Record<string, unknown>));
    if (r) return r;
  }
  return null;
}

// ============================================================
// FCM MESSAGE HANDLERS
// ============================================================

async function handleOrderFCMData(rawData: Record<string, unknown>) {
  const data = coerceFcmData(rawData);
  const { orderId, groupKey, ongoing } = data;

  const isTerminal = ongoing === 'false';
  const oid = orderId || groupKey?.replace('order:', '') || '';
  const inferredOrderStatus =
    data.orderStatus ||
    (data.type ? STATUS_BY_NOTIFICATION_TYPE[data.type] : undefined);

  const resolved = await resolveOrderTrackingText(data, oid);
  if (!resolved) return;

  if (isTerminal) {
    await stopOrderTracking(resolved.title, resolved.body, oid);
    return;
  }
  if (!oid) return;
  await updateOrderTracking(resolved.title, resolved.body, {
    ...data,
    orderId: oid,
    ...(inferredOrderStatus ? { orderStatus: inferredOrderStatus } : {}),
  });
}

async function displayRegularNotification(data: Record<string, string>) {
  const { title, body } = data;
  if (!title || !body) return;
  if (shouldSuppressChatNotification(data)) return;

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
  // Cold-start deep links are handled in app/index.tsx via resolveLaunchRouteAfterLogin()
  // so the default home redirect does not win over notification targets.
  flushPendingNotificationRoute();

  const unsubOpened = onNotificationOpenedApp(firebaseMessaging, async (remoteMessage) => {
    const route = await notificationDataToRoute(
      coerceFcmData(remoteMessage?.data as Record<string, unknown>),
    );
    if (route) router.push(route as any);
  });

  // Foreground FCM is registered in setupBackgroundHandler() as soon as the
  // bundle loads (see index.js), so messages are not missed before React mounts.

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
      void notificationDataToRoute(coerceFcmData(data as Record<string, unknown>)).then((route) => {
        if (route) router.push(route as any);
      });
    }
  });

  return () => {
    unsubOpened();
    unsubscribeNotifee();
  };
}

export function setupBackgroundHandler() {
  if (backgroundHandlersRegistered) return;
  backgroundHandlersRegistered = true;

  const routeFcmDataMessage = async (remoteMessage: {
    data?: Record<string, unknown>;
    notification?: { title?: string | null; body?: string | null } | null;
  }) => {
    const raw = remoteMessage?.data as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== 'object') return;
    const data = coerceFcmData(raw);
    const { groupKey } = data;
    if (groupKey?.startsWith('order:')) {
      await handleOrderFCMData(raw);
      return;
    }
    // Non-order pushes use notification+data in firebase.service — OS shows native tray; skip Notifee to avoid duplicates.
    if (fcmHasNativeNotificationTrayPayload(remoteMessage)) {
      return;
    }
    await displayRegularNotification(data);
  };

  // Register alongside the background handler, before AppRegistry (index.js),
  // so foreground data messages reliably reach the client while the UI is open.
  onMessage(firebaseMessaging, routeFcmDataMessage);

  setBackgroundMessageHandler(firebaseMessaging, async (remoteMessage) => {
    await routeFcmDataMessage(remoteMessage);
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
      const route = await notificationDataToRoute(coerceFcmData(data as Record<string, unknown>));
      if (route) await savePendingNotificationRoute(route);
    }
  });
}

// IMPORTANT:
// Register background handlers at module load so they are available in headless mode
// (app closed), not only after React layout mounts.
setupBackgroundHandler();


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
  else if (!fcmHasNativeNotificationTrayPayload(remoteMessage))
    await displayRegularNotification(data);
}
export async function handleDataMessage(data: Record<string, string>) {
  await handleFCMMessage({ data });
}
export async function registerDriverActionCategories() {}
