import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidStyle,
  AndroidVisibility,
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
  registerDeviceForRemoteMessages,
  requestPermission,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import { AppState, Platform } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoNotifications from 'expo-notifications';
import { runAfterNextPaint } from '../utils/scheduleIdle';
import { notificationService } from './api/notification.service';
import { api } from './api/client';
import { orderService, Order } from './api/order.service';

// Channel IDs
const CHANNEL_ORDER = 'order-updates';
const CHANNEL_DEFAULT = 'default';
const CHANNEL_CHAT = 'chat-messages';
/** Stable Notifee id + Android tray grouping per order chat thread */
const CHAT_THREAD_STORAGE_KEY = 'nativeChatThreadLines:v1';
/** Last FCM payload fields per order — used to redraw the tray after inline reply without losing peer names. */
const CHAT_THREAD_META_KEY = 'nativeChatThreadMeta:v1';
const MAX_CHAT_THREAD_LINES = 25;
const ORDER_CHAT_REPLY_ACTION = 'chat_reply';
const IOS_CHAT_REPLY_CATEGORY = 'ORDER_CHAT_REPLY';
const CHAT_NOTIF_ID_PREFIX = 'chat-thread-';
/** Matches `ThemeContext` light `primary` (#0284c7) — Android tints icons, title accent, reply/send controls. */
const CHAT_NOTIFICATION_ACCENT = '#0284c7';

/** Inline reply row: incoming (FCM) vs outgoing (quick reply). */
type ChatQueuedLine = {
  messageId: string;
  text: string;
  timestamp: number;
  direction: 'incoming' | 'outgoing';
  /** Display name for incoming bubble (driver/customer). */
  peerLabel?: string;
};

let iosChatCategoriesRegistered = false;

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

/** Home header (and similar) can subscribe to refresh inbox unread count when FCM arrives. */
const unreadBadgeListeners = new Set<() => void>();
let unreadBadgeDebounce: ReturnType<typeof setTimeout> | null = null;

export function subscribeUnreadBadgeRefresh(listener: () => void): () => void {
  unreadBadgeListeners.add(listener);
  return () => {
    unreadBadgeListeners.delete(listener);
  };
}

/** Bell badge / unread inbox — call after local actions that create notification rows without waiting for FCM (e.g. order created). */
export function requestNotificationBadgeRefresh() {
  emitUnreadBadgeRefreshDebounced();
}

function emitUnreadBadgeRefreshDebounced() {
  if (unreadBadgeDebounce) clearTimeout(unreadBadgeDebounce);
  unreadBadgeDebounce = setTimeout(() => {
    unreadBadgeDebounce = null;
    unreadBadgeListeners.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
  }, 350);
}

const ORDER_ACTIVE_STATUSES = [
  'PENDING_PUBLISH',
  'SEARCHING_DRIVER',
  'PENDING_CUSTOMER_APPROVAL',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVED',
  'PICKED_UP',
  'DELIVERING',
];

/** Customer tray must end when API shows terminal (stale map used to block cleanup). */
const CUSTOMER_TERMINAL_TRAY_STATUSES = new Set([
  'CANCELLED',
  'AUTO_CANCELLED',
  'DELIVERED',
  'FAILED',
  'REFUNDED',
  'DISPUTED',
]);

/** Inferred / API `orderStatus` on shared order FCM path that must not keep `ongoing` tracking. */
const ORDER_TRACKING_FCM_TERMINAL_STATUSES = new Set([
  ...CUSTOMER_TERMINAL_TRAY_STATUSES,
  'RETURN_DEPOSIT',
]);

/** `type` when `ongoing` is missing or wrong — still detach foreground / persistent tray. */
const ORDER_FCM_TERMINAL_TYPES = new Set([
  'ORDER_CANCELLED',
  'ORDER_DELIVERED',
  'NO_DRIVER_FOUND',
  'DISPUTE_OPENED',
  'REFUND_PROCESSED',
  'DISPUTE_RESOLVED',
  'ORDER_CANCELLED_BY_CUSTOMER',
]);

/** Driver foreground tracking includes return flow before return deposit is recorded. */
const DRIVER_ORDER_TRACKING_STATUSES = [...ORDER_ACTIVE_STATUSES, 'RETURNED'];

/**
 * After create/accept we show a tray notification immediately; `getMyOrders` / `getDriverMyOrders`
 * can briefly omit that order. Without this, restore clears the notification and stops the FGS.
 */
function shouldPreserveTrackedOrderDespiteMissingFromApi(
  role: 'CUSTOMER' | 'DRIVER',
  statusInMap: string | undefined,
): boolean {
  const st = statusInMap || 'UNKNOWN';
  if (st === 'UNKNOWN') return true;
  const allowed =
    role === 'DRIVER' ? DRIVER_ORDER_TRACKING_STATUSES : ORDER_ACTIVE_STATUSES;
  return allowed.includes(st);
}

const STATUS_BY_NOTIFICATION_TYPE: Record<string, string> = {
  ORDER_CREATED: 'SEARCHING_DRIVER',
  PENDING_PUBLISH: 'PENDING_PUBLISH',
  DRIVER_ASSIGNED: 'DRIVER_ASSIGNED',
  DRIVER_ARRIVED: 'DRIVER_ARRIVED',
  PACKAGE_PICKED_UP: 'PICKED_UP',
  DELIVERY_IN_PROGRESS: 'DELIVERING',
  ORDER_DELIVERED: 'DELIVERED',
  ORDER_CANCELLED: 'CANCELLED',
  ORDER_CANCELLED_BY_CUSTOMER: 'FAILED',
  NO_DRIVER_FOUND: 'AUTO_CANCELLED',
  DISPUTE_OPENED: 'DISPUTED',
  REFUND_PROCESSED: 'REFUNDED',
  DISPUTE_RESOLVED: 'DISPUTED',
};

function statusLabelForTracking(status: string): string {
  switch (status) {
    case 'SEARCHING_DRIVER':
      return 'Searching driver';
    case 'PENDING_CUSTOMER_APPROVAL':
      return 'Driver found';
    case 'DRIVER_ASSIGNED':
      return 'Driver assigned';
    case 'DRIVER_ARRIVED':
      return 'Driver arrived';
    case 'PICKED_UP':
      return 'Package picked up';
    case 'DELIVERING':
      return 'Delivery in progress';
    case 'DELIVERED':
      return 'Delivered';
    case 'CANCELLED':
      return 'Cancelled';
    case 'AUTO_CANCELLED':
      return 'Auto-cancelled';
    case 'FAILED':
      return 'Failed';
    case 'DISPUTED':
      return 'Disputed';
    default:
      return 'Order update';
  }
}

let backgroundHandlersRegistered = false;
let foregroundServiceRegistered = false;

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

/**
 * FCM hybrid messages put title/body on `notification`; foreground handlers often only read `data`.
 * Merge so Notifee always has strings to display.
 */
function mergeFcmNotificationIntoData(
  remoteMessage: {
    data?: Record<string, unknown>;
    notification?: { title?: string | null; body?: string | null } | null;
  },
  data: Record<string, string>,
): Record<string, string> {
  const out = { ...data };
  const n = remoteMessage.notification;
  const t = (out.title || '').trim();
  const b = (out.body || '').trim();
  if (!t && n?.title != null && String(n.title).trim()) {
    out.title = String(n.title).trim();
  }
  if (!b && n?.body != null && String(n.body).trim()) {
    out.body = String(n.body).trim();
  }
  return out;
}

function extractOrderIdFromOrderGroupKey(groupKey?: string): string {
  const key = String(groupKey || '').trim();
  if (!key.toLowerCase().startsWith('order:')) return '';
  const rest = key.slice(6);
  const firstSegment = rest.split(':')[0]?.trim();
  return firstSegment || '';
}

export async function getStoredUserRole(): Promise<string | null> {
  const direct = await AsyncStorage.getItem('userRole');
  if (direct) return direct;
  const rawUser = await AsyncStorage.getItem('user');
  if (!rawUser) return null;
  try {
    const parsed = JSON.parse(rawUser);
    return parsed?.role ? String(parsed.role) : null;
  } catch {
    return null;
  }
}

/** Screens showing a single order can subscribe; refetch when FCM or notification actions change that order. */
const orderDetailRefreshListeners = new Map<string, Set<() => void>>();

export function subscribeOrderDetailRefresh(orderId: string, listener: () => void) {
  let set = orderDetailRefreshListeners.get(orderId);
  if (!set) {
    set = new Set();
    orderDetailRefreshListeners.set(orderId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) orderDetailRefreshListeners.delete(orderId);
  };
}

function emitOrderDetailRefresh(orderId: string) {
  if (!orderId) return;
  const set = orderDetailRefreshListeners.get(orderId);
  if (!set) return;
  set.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

/** Driver "My deliveries" list: refetch when notification actions or order FCM change an assignment. */
const driverMyOrdersRefreshListeners = new Set<() => void>();

export function subscribeDriverMyOrdersRefresh(listener: () => void) {
  driverMyOrdersRefreshListeners.add(listener);
  return () => {
    driverMyOrdersRefreshListeners.delete(listener);
  };
}

function emitDriverMyOrdersRefresh() {
  driverMyOrdersRefreshListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

/** Order detail + driver deliveries list (not used for customer-only flows like accept_driver). */
function emitOrderDetailAndDriverListRefresh(orderId: string) {
  emitOrderDetailRefresh(orderId);
  emitDriverMyOrdersRefresh();
}

async function resolveOrderTrackingText(
  data: Record<string, string>,
  oid: string,
): Promise<{ title: string; body: string } | null> {
  let title = data.title?.trim() || '';
  let body = data.body?.trim() || '';
  if (title && body) return { title, body };

  const statusFromPayload =
    data.orderStatus || (data.type ? STATUS_BY_NOTIFICATION_TYPE[data.type] : undefined);
  if (statusFromPayload) {
    return {
      title: `Order status: ${statusLabelForTracking(statusFromPayload)}`,
      body: title || body || 'Your order status was updated.',
    };
  }

  try {
    const order = await orderService.getOrder(oid);
    if (!order) return title && body ? { title, body } : null;
    if (data.trackingAudience === 'DRIVER') {
      return getDriverTrackingNotificationFromOrder(order);
    }
    return getTrackingNotificationFromOrder(order);
  } catch {
    return title && body ? { title, body } : null;
  }
}

/**
 * Create Android notification channels
 */
export async function createNotificationChannels() {
  if (Platform.OS === 'android') {
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

    await notifee.createChannel({
      id: CHANNEL_CHAT,
      name: 'Chat Messages',
      importance: AndroidImportance.HIGH,
      vibration: true,
    });
  }

  if (Platform.OS === 'ios' && !iosChatCategoriesRegistered) {
    iosChatCategoriesRegistered = true;
    try {
      await notifee.setNotificationCategories([
        {
          id: IOS_CHAT_REPLY_CATEGORY,
          actions: [
            {
              id: ORDER_CHAT_REPLY_ACTION,
              title: 'Reply',
              input: { placeholderText: 'Message', buttonText: 'Send' },
              foreground: false,
            },
          ],
        },
      ]);
    } catch {
      iosChatCategoriesRegistered = false;
    }
  }
}

async function postFcmTokenToBackendWithRetry(
  token: string,
  platform: 'android' | 'ios',
  attempts = 4,
): Promise<boolean> {
  let delayMs = 400;
  for (let i = 0; i < attempts; i++) {
    try {
      await notificationService.registerToken(token, platform);
      await AsyncStorage.setItem('pushToken', token);
      return true;
    } catch (error) {
      console.warn(`register-token attempt ${i + 1}/${attempts} failed`, error);
      if (i === attempts - 1) break;
      await new Promise<void>((r) => setTimeout(r, delayMs));
      delayMs = Math.min(delayMs * 2, 4000);
    }
  }
  console.error('Failed to register push token with backend after retries');
  return false;
}

/** Coalesces overlapping callers (e.g. login + tabs layout mount) — avoids Android Play services races on getToken. */
let registerForPushInFlight: Promise<string | null> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Android: `getToken` can throw SERVICE_NOT_AVAILABLE when invoked twice in quick succession
 * or before Play services is ready — exponential backoff retries usually succeed.
 */
async function getFcmTokenResilient(): Promise<string | null> {
  const maxAttempts = Platform.OS === 'android' ? 6 : 2;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        await sleep(Math.min(400 * 2 ** (attempt - 1), 6000));
      }
      const token = await getToken(firebaseMessaging);
      if (token) return token;
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError) {
    console.warn(
      'FCM getToken failed after retries (Google Play services busy or offline). Will retry on next foreground/register.',
      lastError,
    );
  }
  return null;
}

async function registerForPushNotificationsImpl(): Promise<string | null> {
  try {
    if (Platform.OS === 'android') {
      const current = await ExpoNotifications.getPermissionsAsync();
      if (!current.granted) {
        const requested = await ExpoNotifications.requestPermissionsAsync();
        /** Tray permission is separate from FCM: still register token so data pushes (order updates) work. */
        if (!requested.granted) {
          console.warn(
            'Notification display permission denied; still registering FCM token for server pushes if possible.',
          );
        }
      }
    }

    await registerDeviceForRemoteMessages(firebaseMessaging);
    const authStatus = await requestPermission(firebaseMessaging);
    const enabled =
      authStatus === AuthorizationStatus.AUTHORIZED ||
      authStatus === AuthorizationStatus.PROVISIONAL;
    /** iOS needs explicit messaging permission for a useful token; Android can still obtain FCM token for data messages. */
    if (Platform.OS === 'ios' && !enabled) return null;

    const token = await getFcmTokenResilient();
    if (!token) return null;

    const platform = Platform.OS as 'android' | 'ios';
    await postFcmTokenToBackendWithRetry(token, platform);

    if (!fcmTokenRefreshRegistered) {
      fcmTokenRefreshRegistered = true;
      onTokenRefresh(firebaseMessaging, async (newToken) => {
        try {
          const p = Platform.OS as 'android' | 'ios';
          await postFcmTokenToBackendWithRetry(newToken, p);
        } catch {}
      });
    }

    return token;
  } catch (error) {
    console.warn('Error registering for push notifications:', error);
    return null;
  }
}

/**
 * Register for push notifications and send FCM token to backend.
 * Concurrent calls share one in-flight attempt (prevents duplicate getToken right after phone login).
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (registerForPushInFlight) return registerForPushInFlight;
  registerForPushInFlight = registerForPushNotificationsImpl().finally(() => {
    registerForPushInFlight = null;
  });
  return registerForPushInFlight;
}


// ============================================================
// ORDER TRACKING FOREGROUND SERVICE
// ============================================================

/**
 * Register the foreground service runner.
 * MUST be called at module level (outside React components).
 */
export function registerOrderForegroundService() {
  if (foregroundServiceRegistered) return;
  foregroundServiceRegistered = true;
  notifee.registerForegroundService(() => {
    return new Promise(() => {});
  });
}

function getOrderNotificationId(orderId: string) {
  return `order-track-${orderId}`;
}

function extractOrderIdFromTrackingNotificationId(notificationId: string): string | null {
  const prefix = 'order-track-';
  if (!notificationId || !notificationId.startsWith(prefix)) return null;
  const orderId = notificationId.slice(prefix.length).trim();
  return orderId || null;
}

function dedupeOrdersByIdNewest(orders: Order[]): Order[] {
  const byId = new Map<string, Order>();
  for (const order of orders) {
    const existing = byId.get(order.id);
    if (!existing) {
      byId.set(order.id, order);
      continue;
    }
    const existingTs = new Date(existing.createdAt).getTime();
    const incomingTs = new Date(order.createdAt).getTime();
    if (incomingTs >= existingTs) byId.set(order.id, order);
  }
  return Array.from(byId.values());
}

async function cancelDisplayedTrackingNotifications(predicate?: (orderId: string) => boolean) {
  if (Platform.OS !== 'android') return;
  try {
    const displayed = await notifee.getDisplayedNotifications();
    await Promise.all(
      displayed.map((entry) => {
        const id = String(entry.notification?.id || '');
        const orderId = extractOrderIdFromTrackingNotificationId(id);
        if (!orderId) return Promise.resolve();
        if (predicate && !predicate(orderId)) return Promise.resolve();
        return notifee.cancelNotification(id).catch(() => {});
      }),
    );
  } catch {
    // Ignore platform/notifee read errors and continue with map cleanup fallback.
  }
}

async function getDisplayedTrackingOrderIds(): Promise<Set<string>> {
  const out = new Set<string>();
  if (Platform.OS !== 'android') return out;
  try {
    const displayed = await notifee.getDisplayedNotifications();
    for (const entry of displayed) {
      const id = String(entry.notification?.id || '');
      const orderId = extractOrderIdFromTrackingNotificationId(id);
      if (orderId) out.add(orderId);
    }
  } catch {
    // Ignore read errors and fallback to map-based restore checks.
  }
  return out;
}

export async function resetOrderTrackingNotifications() {
  if (Platform.OS !== 'android') return;
  await notifee.stopForegroundService().catch(() => {});
  await cancelDisplayedTrackingNotifications();
  await AsyncStorage.removeItem(TRACKING_STATUS_MAP_KEY);
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

/** Android: only one `asForegroundService` tray slot — extras stack as separate ongoing notifications so later accepts/creates still appear. */
async function shouldUseAndroidTrackingForegroundService(): Promise<boolean> {
  const map = await getTrackingStatusMap();
  return Object.keys(map).length <= 1;
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
const SILENT_NOTIFICATION_ACTION_IDS = new Set([
  'accept_driver',
  'driver_mark_arrived',
  'driver_mark_picked_up',
  'driver_mark_delivering',
  'driver_open_return_deposit',
]);

function buildNotifeeActions(data: Record<string, string>) {
  const buttons = parseActionButtons(data);
  if (buttons.length > 0) {
    return buttons.map((btn) => ({
      title: btn.title,
      pressAction:
        SILENT_NOTIFICATION_ACTION_IDS.has(btn.id)
          ? ({ id: btn.id, launchActivity: 'none' } as any)
          : { id: btn.id, launchActivity: 'default' },
    }));
  }
  if (isDriverTrackingData(data) && data.orderStatus === 'DRIVER_ASSIGNED') {
    return [
      {
        title: "📍 I'm arrived",
        pressAction: { id: 'driver_mark_arrived', launchActivity: 'none' } as any,
      },
    ];
  }
  const mainId = isDriverTrackingData(data) ? 'view_order_driver' : 'view_order';
  const mainTitle = isDriverTrackingData(data) ? '📋 View order' : '📍 View Order';
  return [{ title: mainTitle, pressAction: { id: mainId, launchActivity: 'default' } }];
}

// Total steps in the order progress (0-6)
const PROGRESS_TOTAL = 7;

function getDismissCopyForTrackingStatus(status: string): { title: string; body: string } {
  switch (status) {
    case 'DELIVERED':
      return { title: '✅ Delivered', body: 'Order completed — thank you!' };
    case 'CANCELLED':
      return { title: '⊘ Order cancelled', body: 'This order is no longer active.' };
    case 'AUTO_CANCELLED':
      return { title: '⊘ Order auto-cancelled', body: 'No driver was found in time.' };
    case 'FAILED':
      return { title: 'Order ended', body: 'This order is no longer active.' };
    case 'REFUNDED':
      return { title: 'Order refunded', body: 'This order is no longer active.' };
    case 'DISPUTED':
      return { title: 'Order update', body: 'This order was updated.' };
    case 'RETURN_DEPOSIT':
      return { title: 'Order update', body: 'This order is no longer active.' };
    default:
      return { title: 'Order update', body: 'This order is no longer active.' };
  }
}

function getCustomerTerminalTrackingDismiss(order: Order): { title: string; body: string } {
  return getDismissCopyForTrackingStatus(order.status);
}

function getTrackingNotificationFromOrder(order: Order): { title: string; body: string } {
  const driverName =
    order.driverAssignment?.driver?.user?.firstName ||
    order.driverAssignment?.driver?.user?.secondName ||
    'Driver';

  switch (order.status) {
    case 'PENDING_PUBLISH': {
      const when = order.scheduledPublishAt
        ? new Date(order.scheduledPublishAt).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : '';
      return {
        title: '📅 Order scheduled',
        body: when ? `Drivers will see your order at ${when}` : 'Waiting for scheduled publish time',
      };
    }
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

/** Driver persistent notification — primary tap opens driver order detail. */
function getDriverOrderRoute(orderId: string, scrollTo?: 'proof' | 'return_deposit') {
  if (scrollTo === 'proof') {
    return `/(driver)/order-detail?orderId=${orderId}&scrollTo=proof`;
  }
  if (scrollTo === 'return_deposit') {
    return `/(driver)/order-detail?orderId=${orderId}&scrollTo=return_deposit`;
  }
  return `/(driver)/order-detail?orderId=${orderId}`;
}

function getDriverTrackingNotificationFromOrder(order: Order): { title: string; body: string } {
  switch (order.status) {
    case 'PENDING_CUSTOMER_APPROVAL':
      return {
        title: '⏳ Waiting for customer approval',
        body: '◉———⛟———⌖———⌖———⌖———⌖———⌖',
      };
    case 'DRIVER_ASSIGNED':
      return {
        title: '✅ Approved — Head to pickup',
        body: '◉———◉———⛟———⌖———⌖———⌖———⌖',
      };
    case 'DRIVER_ARRIVED':
      return {
        title: '📍 At pickup — Confirm pickup',
        body: '◉———◉———◉———⛟———⌖———⌖———⌖',
      };
    case 'PICKED_UP':
      return {
        title: '📦 Picked up — Go to dropoff',
        body: '◉———◉———◉———◉———⛟———⌖———⌖',
      };
    case 'DELIVERING':
      return {
        title: '🚚 Delivering — Add proof to finish',
        body: '◉———◉———◉———◉———◉———⛟———⌖',
      };
    case 'DELIVERED':
      return {
        title: '✅ Delivered',
        body: 'Order completed — great job!',
      };
    case 'RETURNED':
      return {
        title: '📦 Returned — Confirm return deposit',
        body: '◉———◉———◉———◉———◉———⛟———⌖',
      };
    default:
      return {
        title: '📦 Active order',
        body: '⛟———⌖———⌖———⌖———⌖———⌖———⌖',
      };
  }
}

function getDriverActionButtonsForStatus(status: string): Array<{ id: string; title: string; action: string }> | null {
  switch (status) {
    case 'PENDING_CUSTOMER_APPROVAL':
      return [{ id: 'driver_contact_customer', title: '💬 Contact customer', action: 'contact_customer' }];
    case 'DRIVER_ASSIGNED':
      return [{ id: 'driver_mark_arrived', title: "📍 I've arrived", action: 'mark_arrived' }];
    case 'DRIVER_ARRIVED':
      return [{ id: 'driver_mark_picked_up', title: '📦 Package picked up', action: 'mark_picked_up' }];
    case 'PICKED_UP':
      return [{ id: 'driver_mark_delivering', title: '🚚 Start delivering', action: 'mark_delivering' }];
    case 'DELIVERING':
      return [{ id: 'driver_open_deliver', title: '✅ Delivered (add proof)', action: 'open_deliver_proofs' }];
    case 'RETURNED':
      return [
        { id: 'driver_open_return_deposit', title: 'Return deposited', action: 'open_return_deposit' },
        { id: 'view_order_driver', title: '📋 View order', action: 'view_order_driver' },
      ];
    default:
      return null;
  }
}

function isDriverTrackingData(data?: Record<string, string>) {
  return data?.trackingAudience === 'DRIVER';
}

/**
 * Start the order tracking notification (Android: ongoing foreground service tray; iOS: local notification so it appears immediately without relying on push timing).
 */
export async function startOrderTracking(orderId: string, title: string, body: string, data?: Record<string, string>) {
  await createNotificationChannels();

  await setTrackedOrderStatus(orderId, data?.orderStatus);

  const driverAssignedFallback = isDriverTrackingData(data) && data?.orderStatus === 'DRIVER_ASSIGNED';
  const mainPressId = driverAssignedFallback
    ? 'driver_mark_arrived'
    : isDriverTrackingData(data)
      ? 'view_order_driver'
      : 'view_order';
  const mainTitle = driverAssignedFallback
    ? "📍 I'm arrived"
    : isDriverTrackingData(data)
      ? '📋 View order'
      : '📍 View Order';

  const payloadData: Record<string, string> = {
    orderId,
    relatedEntityType: 'Order',
    relatedEntityId: orderId,
    ...(data || {}),
  };

  if (Platform.OS === 'ios') {
    await notifee.displayNotification({
      id: getOrderNotificationId(orderId),
      title,
      body,
      data: payloadData,
      ios: {
        sound: 'default',
        foregroundPresentationOptions: {
          banner: true,
          list: true,
          sound: true,
          badge: true,
        },
      },
    });
    return;
  }

  if (Platform.OS !== 'android') return;

  const attachForegroundService = await shouldUseAndroidTrackingForegroundService();

  await notifee.displayNotification({
    id: getOrderNotificationId(orderId),
    title,
    body,
    android: {
      channelId: CHANNEL_ORDER,
      asForegroundService: attachForegroundService,
      ongoing: true,
      autoCancel: false,
      importance: AndroidImportance.HIGH,
      pressAction: { id: mainPressId, launchActivity: 'default' },
      actions: data ? buildNotifeeActions(data) : [
        { title: mainTitle, pressAction: { id: mainPressId, launchActivity: 'default' } },
      ],
    },
    data: payloadData,
  });
}

/**
 * Update the order tracking foreground service notification.
 */
export async function updateOrderTracking(title: string, body: string, data?: Record<string, string>) {
  if (Platform.OS !== 'android') return;

  const orderIdFromGroupKey = extractOrderIdFromOrderGroupKey(data?.groupKey);
  const orderId =
    orderIdFromGroupKey ||
    data?.orderId ||
    data?.relatedEntityId ||
    '';
  if (!orderId) return;
  await setTrackedOrderStatus(orderId, data?.orderStatus);

  const driverAssignedFallback = isDriverTrackingData(data) && data?.orderStatus === 'DRIVER_ASSIGNED';
  const mainPressId = driverAssignedFallback
    ? 'driver_mark_arrived'
    : isDriverTrackingData(data)
      ? 'view_order_driver'
      : 'view_order';
  const mainTitle = driverAssignedFallback
    ? "📍 I'm arrived"
    : isDriverTrackingData(data)
      ? '📋 View order'
      : '📍 View Order';

  const attachForegroundService = await shouldUseAndroidTrackingForegroundService();

  await notifee.displayNotification({
    id: getOrderNotificationId(orderId),
    title,
    body,
    android: {
      channelId: CHANNEL_ORDER,
      asForegroundService: attachForegroundService,
      ongoing: true,
      autoCancel: false,
      importance: AndroidImportance.HIGH,
      pressAction: { id: mainPressId, launchActivity: 'default' },
      actions: data ? buildNotifeeActions(data) : [
        { title: mainTitle, pressAction: { id: mainPressId, launchActivity: 'default' } },
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
    await resetOrderTrackingNotifications();
    return;
  }

  const targetOrderId = orderId || '';
  if (!targetOrderId) return;
  await clearTrackedOrder(targetOrderId);

  if (!showFinalNotification) return;

  const role = await getStoredUserRole();
  const pressId = role === 'DRIVER' ? 'view_order_driver' : 'view_order';

  await notifee.displayNotification({
    id: getOrderNotificationId(targetOrderId),
    title,
    body,
    android: {
      channelId: CHANNEL_ORDER,
      /** Must detach from foreground service or OEMs keep it non-dismissible like live tracking. */
      asForegroundService: false,
      ongoing: false,
      importance: AndroidImportance.HIGH,
      autoCancel: true,
      pressAction: { id: pressId, launchActivity: 'default' },
    },
    data: {
      orderId: targetOrderId,
      relatedEntityType: 'Order',
      relatedEntityId: targetOrderId,
    },
  });
}

/**
 * Company/department rejected the driver: keep the same Notifee id as live order tracking, show FAILED,
 * and make the notification removable (not ongoing). Matches customer-reject UX without a second tray entry.
 */
async function replaceOrderTrackingWithDismissibleFailed(
  orderId: string,
  title: string,
  body: string,
  extraData: Record<string, string>,
) {
  if (Platform.OS !== 'android') return;
  await clearTrackedOrder(orderId);
  await notifee.displayNotification({
    id: getOrderNotificationId(orderId),
    title,
    body,
    android: {
      channelId: CHANNEL_ORDER,
      ongoing: false,
      autoCancel: true,
      importance: AndroidImportance.HIGH,
      pressAction: { id: 'view_order_driver', launchActivity: 'default' },
    },
    data: {
      orderId,
      relatedEntityType: 'Order',
      relatedEntityId: orderId,
      orderStatus: 'FAILED',
      ongoing: 'false',
      trackingAudience: 'DRIVER',
      ...extraData,
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
    const role = await getStoredUserRole();
    if (role && role !== 'CUSTOMER') {
      await stopOrderTrackingSilently();
      return;
    }

    const orders = await orderService.getMyOrders();
    const activeOrders = dedupeOrdersByIdNewest(
      orders
      .filter((order) => ORDER_ACTIVE_STATUSES.includes(order.status))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    );

    const orderById = new Map(orders.map((o) => [o.id, o]));

    let map = await getTrackingStatusMap();

    for (const trackedOrderId of [...Object.keys(map)]) {
      const apiOrder = orderById.get(trackedOrderId);
      if (!apiOrder || !CUSTOMER_TERMINAL_TRAY_STATUSES.has(apiOrder.status)) continue;
      const { title, body } = getCustomerTerminalTrackingDismiss(apiOrder);
      await stopOrderTracking(title, body, trackedOrderId);
    }
    map = await getTrackingStatusMap();

    if (!activeOrders.length) {
      const keepForListLag = Object.values(map).some((st) =>
        shouldPreserveTrackedOrderDespiteMissingFromApi('CUSTOMER', st),
      );
      if (keepForListLag) return;
      await stopOrderTrackingSilently();
      return;
    }
    const displayedOrderIds = await getDisplayedTrackingOrderIds();
    const activeIdSet = new Set(activeOrders.map((o) => o.id));
    await cancelDisplayedTrackingNotifications((orderId) => {
      if (activeIdSet.has(orderId)) return false;
      if (shouldPreserveTrackedOrderDespiteMissingFromApi('CUSTOMER', map[orderId])) return false;
      return true;
    });

    for (const trackedOrderId of Object.keys(map)) {
      if (!activeIdSet.has(trackedOrderId)) {
        if (shouldPreserveTrackedOrderDespiteMissingFromApi('CUSTOMER', map[trackedOrderId])) continue;
        await notifee.cancelNotification(getOrderNotificationId(trackedOrderId)).catch(() => {});
        delete map[trackedOrderId];
      }
    }

    for (const order of activeOrders) {
      if (map[order.id] === order.status && displayedOrderIds.has(order.id)) continue;
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

/**
 * Force-sync customer persistent tracking notification from one fresh order payload.
 * Useful on order-detail where status can change before FCM arrives.
 */
export async function syncCustomerOrderTrackingFromOrder(order: Order | null | undefined) {
  if (Platform.OS !== 'android' || !order) return;
  const role = await getStoredUserRole();
  if (role && role !== 'CUSTOMER') return;

  if (!ORDER_ACTIVE_STATUSES.includes(order.status)) {
    if (CUSTOMER_TERMINAL_TRAY_STATUSES.has(order.status)) {
      const { title, body } = getCustomerTerminalTrackingDismiss(order);
      await stopOrderTracking(title, body, order.id);
    }
    return;
  }

  const map = await getTrackingStatusMap();
  const displayed = await getDisplayedTrackingOrderIds();
  if (map[order.id] === order.status && displayed.has(order.id)) {
    return;
  }

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
}

/**
 * Driver tray: assignment ended — cancel ongoing tracking (DELIVERED shows a short “done” notification).
 */
const DRIVER_TERMINAL_TRAY_STATUSES = new Set([
  'DELIVERED',
  'RETURN_DEPOSIT',
  'CANCELLED',
  'AUTO_CANCELLED',
  'FAILED',
  'REFUNDED',
  'DISPUTED',
]);

/**
 * Restore driver order tracking (ongoing notification + status actions) after login/reopen.
 */
export async function restoreOrderTrackingForDriver() {
  if (Platform.OS !== 'android') return;

  try {
    const role = await getStoredUserRole();
    if (role !== 'DRIVER') return;

    const orders = dedupeOrdersByIdNewest(await orderService.getDriverMyOrders());
    const orderById = new Map(orders.map((o) => [o.id, o]));

    const activeOrders = dedupeOrdersByIdNewest(
      orders
      .filter((order) => DRIVER_ORDER_TRACKING_STATUSES.includes(order.status))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    );

    let map = await getTrackingStatusMap();

    /** Map often still says DELIVERING while API is already terminal — reconcile before list-lag early exit. */
    for (const trackedOrderId of [...Object.keys(map)]) {
      const apiOrder = orderById.get(trackedOrderId);
      if (!apiOrder || !DRIVER_TERMINAL_TRAY_STATUSES.has(apiOrder.status)) continue;
      if (apiOrder.status === 'DELIVERED') {
        const { title, body } = getDriverTrackingNotificationFromOrder(apiOrder);
        await stopOrderTracking(title, body, trackedOrderId);
      } else {
        await notifee.cancelNotification(getOrderNotificationId(trackedOrderId)).catch(() => {});
        await clearTrackedOrder(trackedOrderId);
      }
    }
    map = await getTrackingStatusMap();

    if (!activeOrders.length) {
      const keepForListLag = Object.values(map).some((st) =>
        shouldPreserveTrackedOrderDespiteMissingFromApi('DRIVER', st),
      );
      if (keepForListLag) return;
      await stopOrderTrackingSilently();
      return;
    }

    map = await getTrackingStatusMap();
    const displayedOrderIds = await getDisplayedTrackingOrderIds();
    const activeIdSet = new Set(activeOrders.map((o) => o.id));
    await cancelDisplayedTrackingNotifications((orderId) => {
      if (activeIdSet.has(orderId)) return false;
      const apiOrder = orderById.get(orderId);
      if (apiOrder && DRIVER_TERMINAL_TRAY_STATUSES.has(apiOrder.status)) return true;
      if (shouldPreserveTrackedOrderDespiteMissingFromApi('DRIVER', map[orderId])) return false;
      return true;
    });

    for (const trackedOrderId of Object.keys(map)) {
      if (!activeIdSet.has(trackedOrderId)) {
        if (shouldPreserveTrackedOrderDespiteMissingFromApi('DRIVER', map[trackedOrderId])) continue;
        await notifee.cancelNotification(getOrderNotificationId(trackedOrderId)).catch(() => {});
        delete map[trackedOrderId];
      }
    }

    for (const order of activeOrders) {
      if (map[order.id] === order.status && displayedOrderIds.has(order.id)) continue;
      const { title, body } = getDriverTrackingNotificationFromOrder(order);
      const actionButtons = getDriverActionButtonsForStatus(order.status);

      await startOrderTracking(order.id, title, body, {
        orderId: order.id,
        groupKey: `order:${order.id}`,
        relatedEntityType: 'Order',
        relatedEntityId: order.id,
        ongoing: 'true',
        orderStatus: order.status,
        trackingAudience: 'DRIVER',
        ...(actionButtons?.length ? { actionButtons: JSON.stringify(actionButtons) } : {}),
      });
      map[order.id] = order.status;
    }

    await setTrackingStatusMap(map);
  } catch (error) {
    console.error('Failed to restore driver order tracking notification:', error);
  }
}

/**
 * Show/update driver order-tracking tray immediately after accepting an order (status becomes `PENDING_CUSTOMER_APPROVAL`),
 * without relying on order-detail mount or FCM timing.
 */
export async function presentDriverTrackingAfterAccept(orderId: string) {
  const pendingOrder = { status: 'PENDING_CUSTOMER_APPROVAL' } as Order;
  const { title, body } = getDriverTrackingNotificationFromOrder(pendingOrder);
  const actionButtons = getDriverActionButtonsForStatus('PENDING_CUSTOMER_APPROVAL');
  try {
    await startOrderTracking(orderId, title, body, {
      orderId,
      groupKey: `order:${orderId}`,
      relatedEntityType: 'Order',
      relatedEntityId: orderId,
      ongoing: 'true',
      orderStatus: 'PENDING_CUSTOMER_APPROVAL',
      trackingAudience: 'DRIVER',
      ...(actionButtons?.length ? { actionButtons: JSON.stringify(actionButtons) } : {}),
    });
  } catch (e) {
    console.warn('presentDriverTrackingAfterAccept:', e);
  }
  requestNotificationBadgeRefresh();
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

    emitOrderDetailRefresh(orderId);
    // The backend will emit order.driver_assigned which sends a new FCM
    // that will update the foreground service notification
    console.log('Driver approved successfully from notification');
  } catch (error) {
    console.error('Failed to approve driver from notification:', error);
  }
}

/** Foreground / in-process: navigate or PATCH status from driver tracking notification actions. */
async function handleDriverNotificationPress(orderId: string, actionId: string | undefined) {
  if (!orderId || !actionId) return;
  try {
    const token = await AsyncStorage.getItem('accessToken');
    if (!token) return;

    switch (actionId) {
      case 'driver_contact_customer':
        router.push(`/(driver)/order-chat?orderId=${orderId}` as any);
        return;
      case 'view_order_driver':
        router.push(getDriverOrderRoute(orderId) as any);
        return;
      case 'driver_open_deliver':
        router.push(getDriverOrderRoute(orderId, 'proof') as any);
        return;
      case 'driver_open_return_deposit':
        await orderService.updateOrderStatus(orderId, 'RETURN_DEPOSIT');
        emitOrderDetailAndDriverListRefresh(orderId);
        await restoreOrderTrackingForDriver();
        return;
      case 'driver_mark_arrived':
        await orderService.updateOrderStatus(orderId, 'DRIVER_ARRIVED');
        emitOrderDetailAndDriverListRefresh(orderId);
        return;
      case 'driver_mark_picked_up':
        await orderService.updateOrderStatus(orderId, 'PICKED_UP');
        emitOrderDetailAndDriverListRefresh(orderId);
        return;
      case 'driver_mark_delivering':
        await orderService.updateOrderStatus(orderId, 'DELIVERING');
        emitOrderDetailAndDriverListRefresh(orderId);
        return;
      default:
        return;
    }
  } catch (e) {
    console.error('Driver notification action failed:', e);
  }
}

/** Headless background: same API calls; navigation is queued for next launch. */
async function handleDriverNotificationPressBackground(orderId: string, actionId: string | undefined) {
  if (!orderId || !actionId) return;
  try {
    const token = await AsyncStorage.getItem('accessToken');
    if (!token) return;

    switch (actionId) {
      case 'driver_mark_arrived':
        await orderService.updateOrderStatus(orderId, 'DRIVER_ARRIVED');
        emitOrderDetailAndDriverListRefresh(orderId);
        return;
      case 'driver_mark_picked_up':
        await orderService.updateOrderStatus(orderId, 'PICKED_UP');
        emitOrderDetailAndDriverListRefresh(orderId);
        return;
      case 'driver_mark_delivering':
        await orderService.updateOrderStatus(orderId, 'DELIVERING');
        emitOrderDetailAndDriverListRefresh(orderId);
        return;
      case 'driver_contact_customer':
        await savePendingNotificationRoute(`/(driver)/order-chat?orderId=${orderId}`);
        return;
      case 'view_order_driver':
        await savePendingNotificationRoute(getDriverOrderRoute(orderId));
        return;
      case 'driver_open_deliver':
        await savePendingNotificationRoute(getDriverOrderRoute(orderId, 'proof'));
        return;
      case 'driver_open_return_deposit':
        await orderService.updateOrderStatus(orderId, 'RETURN_DEPOSIT');
        emitOrderDetailAndDriverListRefresh(orderId);
        await restoreOrderTrackingForDriver();
        return;
      default:
        return;
    }
  } catch (e) {
    console.error('Driver background notification action failed:', e);
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

/** Resolve order id from FCM data (payloads differ: ChatRoom uses relatedEntityId; some builds only send groupKey chat:<id>). */
function effectiveOrderIdFromChatPayload(data: Record<string, string>): string {
  const rel = (data.relatedEntityId || '').trim();
  if (rel) return rel;
  const oid = (data.orderId || '').trim();
  if (oid) return oid;
  const gk = (data.groupKey || '').trim();
  if (gk.toLowerCase().startsWith('chat:')) return gk.slice(5).trim();
  return '';
}

function shouldSuppressChatNotification(data: Record<string, string>): boolean {
  const type = data.type || '';
  const relType = data.relatedEntityType || '';
  const orderId = effectiveOrderIdFromChatPayload(data);
  if (!activeChatContext || !orderId) return false;

  const ctxId = activeChatContext.id.trim().toLowerCase();
  const targetId = orderId.trim().toLowerCase();

  if (
    (relType === 'ChatRoom' || relType === 'Order') &&
    (type === 'NEW_MESSAGE_FROM_DRIVER' || type === 'NEW_MESSAGE_FROM_CUSTOMER')
  ) {
    return activeChatContext.kind === 'order' && ctxId === targetId;
  }
  /** Title/body-only heuristics still carry type + groupKey chat:<orderId> from backend. */
  if (
    !relType &&
    (data.groupKey || '').toLowerCase().startsWith('chat:') &&
    (type === 'NEW_MESSAGE_FROM_DRIVER' || type === 'NEW_MESSAGE_FROM_CUSTOMER')
  ) {
    return activeChatContext.kind === 'order' && ctxId === targetId;
  }
  if (relType === 'SupportTicket' && type === 'SUPPORT_TICKET_REPLY') {
    const ticketId = (data.relatedEntityId || '').trim().toLowerCase();
    return activeChatContext.kind === 'support' && activeChatContext.id.trim().toLowerCase() === ticketId;
  }
  return false;
}

function parseSentAtMs(raw?: string): number {
  if (!raw?.trim()) return NaN;
  const t = Date.parse(raw.trim());
  return Number.isNaN(t) ? NaN : t;
}

function stableChatNotificationId(orderId: string): string {
  return `${CHAT_NOTIF_ID_PREFIX}${orderId}`;
}

async function readChatThreadMap(): Promise<Record<string, ChatQueuedLine[]>> {
  try {
    const raw = await AsyncStorage.getItem(CHAT_THREAD_STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    if (typeof p !== 'object' || !p || Array.isArray(p)) return {};
    const out: Record<string, ChatQueuedLine[]> = {};
    for (const [orderId, arr] of Object.entries(p)) {
      if (!Array.isArray(arr)) continue;
      const normalized = arr
        .map((line) => normalizeQueuedLine(line))
        .filter((x): x is ChatQueuedLine => x != null);
      if (normalized.length > 0) out[orderId] = normalized;
    }
    return out;
  } catch {
    return {};
  }
}

async function writeChatThreadMap(map: Record<string, ChatQueuedLine[]>) {
  await AsyncStorage.setItem(CHAT_THREAD_STORAGE_KEY, JSON.stringify(map));
}

function normalizeQueuedLine(raw: unknown): ChatQueuedLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const messageId = String(o.messageId ?? '');
  const text = String(o.text ?? '');
  if (!messageId || !text) return null;
  const timestamp =
    typeof o.timestamp === 'number' && Number.isFinite(o.timestamp) ? o.timestamp : Date.now();
  const direction = o.direction === 'outgoing' ? 'outgoing' : 'incoming';
  const peerLabel = typeof o.peerLabel === 'string' ? o.peerLabel : undefined;
  return { messageId, text, timestamp, direction, peerLabel };
}

async function readChatThreadMeta(): Promise<Record<string, Record<string, string>>> {
  try {
    const raw = await AsyncStorage.getItem(CHAT_THREAD_META_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    return typeof p === 'object' && p && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}

async function writeChatThreadMeta(meta: Record<string, Record<string, string>>) {
  await AsyncStorage.setItem(CHAT_THREAD_META_KEY, JSON.stringify(meta));
}

function pickChatMetaFields(data: Record<string, string>): Record<string, string> {
  const keys = [
    'title',
    'body',
    'type',
    'driverName',
    'customerName',
    'messagePreview',
    'sentAt',
    'messageId',
    'notificationId',
    'relatedEntityType',
    'relatedEntityId',
    'groupKey',
    'orderId',
  ];
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = data[k];
    if (v != null && String(v).length > 0) out[k] = String(v);
  }
  return out;
}

async function upsertChatThreadMetaFromPayload(orderId: string, data: Record<string, string>) {
  const meta = await readChatThreadMeta();
  const prev = meta[orderId] || {};
  meta[orderId] = { ...prev, ...pickChatMetaFields(data) };
  await writeChatThreadMeta(meta);
}

async function getMergedPayloadForOrder(orderId: string): Promise<Record<string, string>> {
  const meta = await readChatThreadMeta();
  const m = meta[orderId] || {};
  return {
    orderId,
    relatedEntityId: orderId,
    relatedEntityType: 'ChatRoom',
    groupKey: `chat:${orderId}`,
    ...m,
  };
}

/**
 * After inbox marks `chat:<orderId>` read — drop cached bubbles + cancel tray so read messages do not reappear.
 */
export async function syncNativeChatPreviewAfterThreadRead(groupKey: string): Promise<void> {
  const raw = (groupKey || '').trim();
  if (!raw.toLowerCase().startsWith('chat:')) return;
  const orderId = raw.slice(5).trim();
  if (!orderId) return;
  await clearNativeChatThreadForOrder(orderId);
}

async function clearNativeChatThreadForOrder(orderId: string): Promise<void> {
  const map = await readChatThreadMap();
  delete map[orderId];
  await writeChatThreadMap(map);
  const meta = await readChatThreadMeta();
  delete meta[orderId];
  await writeChatThreadMeta(meta);
  try {
    await notifee.cancelNotification(stableChatNotificationId(orderId));
  } catch {
    /* ignore */
  }
}

function senderLabelFromChatData(data: Record<string, string>): string {
  const t = (data.title || '').trim();
  if (t) return t;
  if (data.type === 'NEW_MESSAGE_FROM_DRIVER') {
    return (data.driverName || '').trim() || 'Driver';
  }
  return (data.customerName || '').trim() || 'Customer';
}

/**
 * Merge one server chat line into the per-order queue (sorted by time, capped).
 */
async function mergeIncomingChatLine(orderId: string, data: Record<string, string>): Promise<ChatQueuedLine[]> {
  const preview =
    (data.messagePreview || '').trim() ||
    (data.body || '').trim() ||
    'Message';
  let rawId = (data.messageId || '').trim();
  if (!rawId) {
    rawId = `legacy_${parseSentAtMs(data.sentAt) || Date.now()}_${preview.slice(0, 48)}`;
  }
  let ts = parseSentAtMs(data.sentAt);
  if (!Number.isFinite(ts)) ts = Date.now();

  const peerLabel = senderLabelFromChatData(data);

  const map = await readChatThreadMap();
  let lines = map[orderId] ? [...map[orderId]] : [];
  if (!lines.some((l) => l.messageId === rawId)) {
    lines.push({
      messageId: rawId,
      text: preview,
      timestamp: ts,
      direction: 'incoming',
      peerLabel,
    });
  }
  lines.sort((a, b) => a.timestamp - b.timestamp);
  if (lines.length > MAX_CHAT_THREAD_LINES) {
    lines = lines.slice(-MAX_CHAT_THREAD_LINES);
  }
  map[orderId] = lines;
  await writeChatThreadMap(map);
  await upsertChatThreadMetaFromPayload(orderId, data);
  return lines;
}

async function mergeOutgoingChatLine(orderId: string, text: string): Promise<ChatQueuedLine[]> {
  const map = await readChatThreadMap();
  let lines = map[orderId] ? [...map[orderId]] : [];
  const messageId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  lines.push({
    messageId,
    text,
    timestamp: Date.now(),
    direction: 'outgoing',
  });
  lines.sort((a, b) => a.timestamp - b.timestamp);
  if (lines.length > MAX_CHAT_THREAD_LINES) {
    lines = lines.slice(-MAX_CHAT_THREAD_LINES);
  }
  map[orderId] = lines;
  await writeChatThreadMap(map);
  return lines;
}

async function handleChatQuickReply(orderId: string, input: string | undefined) {
  const text = (input || '').trim();
  if (!text || !orderId) return;
  try {
    const role = await getStoredUserRole();
    if (role === 'DRIVER') {
      await orderService.driverSendChatMessage(orderId, text);
    } else {
      await orderService.sendChatMessage(orderId, text);
    }
    emitOrderDetailRefresh(orderId);
    emitUnreadBadgeRefreshDebounced();
    const lines = await mergeOutgoingChatLine(orderId, text);
    const payload = await getMergedPayloadForOrder(orderId);
    await displayGroupedChatNotification(payload, lines);
  } catch (e) {
    console.error('Chat quick reply failed:', e);
  }
}

/** Build an expo-router path from FCM / Notifee notification data. */
export async function notificationDataToRoute(
  data: Record<string, string> | undefined,
): Promise<string | null> {
  if (!data) return null;

  /** Order chat: always route from `groupKey` / `orderId` (Notifee on Android may omit `relatedEntityType` in `data`). */
  const gk = (data.groupKey || '').trim();
  if (gk.toLowerCase().startsWith('chat:')) {
    const oid =
      (data.orderId || '').trim() ||
      (data.relatedEntityId || '').trim() ||
      gk.replace(/^chat:/i, '').trim();
    if (oid) {
      const role = await getStoredUserRole();
      if (role === 'DRIVER') return `/(driver)/order-chat?orderId=${oid}`;
      return `/(customer)/order-chat?orderId=${oid}`;
    }
  }

  /** Support ticket thread (CS / bot) — same screen as tapping the ticket in Support list. */
  if (gk.toLowerCase().startsWith('support:')) {
    const ticketId =
      (data.relatedEntityId || '').trim() ||
      gk.replace(/^support:/i, '').trim();
    if (ticketId) {
      const role = await getStoredUserRole();
      const q = encodeURIComponent(ticketId);
      if (role === 'DRIVER') return `/(driver)/support-chat?ticketId=${q}`;
      return `/(customer)/support-chat?ticketId=${q}`;
    }
  }
  if ((data.type || '') === 'SUPPORT_TICKET_REPLY') {
    const ticketId = (data.relatedEntityId || '').trim();
    if (ticketId) {
      const role = await getStoredUserRole();
      const q = encodeURIComponent(ticketId);
      if (role === 'DRIVER') return `/(driver)/support-chat?ticketId=${q}`;
      return `/(customer)/support-chat?ticketId=${q}`;
    }
  }

  const { relatedEntityType, relatedEntityId, type } = data;
  if (!relatedEntityType || !relatedEntityId) return null;

  switch (relatedEntityType) {
    case 'Order': {
      /** Backend sets this when the driver was removed before arrival — they no longer have API access to the order. */
      if (data.suppressDriverTapNavigation === 'true') {
        /** Delivery-company pre-arrival rejection: `orderStatus` is FAILED (see delivery-company.service). */
        if (
          (data.type || '') === 'ORDER_CANCELLED_BY_CUSTOMER' &&
          (data.orderStatus || '') === 'FAILED'
        ) {
          return '/(driver)/available-orders?declinedFlash=1';
        }
        return null;
      }
      const driverTypes = [
        'NEW_ORDER_AVAILABLE',
        'ORDER_EXPIRED',
        'ORDER_CANCELLED_BY_CUSTOMER',
        'PICKUP_REMINDER',
        'PAYMENT_RECEIVED_COD',
        'PAYMENT_CREDITED_WALLET',
        'NEW_MESSAGE_FROM_CUSTOMER',
      ];
      // Foreground order-tracking (Notifee) — no `type`; must not fall through to generic driver routing.
      if (data.trackingAudience === 'DRIVER') {
        return getDriverOrderRoute(relatedEntityId);
      }
      if (driverTypes.includes(type || '')) {
        if (type === 'NEW_ORDER_AVAILABLE') {
          return `/(driver)/available-orders?urgentOrderId=${relatedEntityId}`;
        }
        if (
          type === 'ORDER_CANCELLED_BY_CUSTOMER' &&
          data.orderStatus === 'SEARCHING_DRIVER' &&
          data.suppressDriverTapNavigation !== 'true'
        ) {
          return '/(driver)/available-orders';
        }
        /** Delivery-company portal sends chat with relatedEntityType Order + NEW_MESSAGE_FROM_CUSTOMER (see delivery-company.service). */
        if (type === 'NEW_MESSAGE_FROM_CUSTOMER') {
          return `/(driver)/order-chat?orderId=${relatedEntityId}`;
        }
        return `/(driver)/order-detail?orderId=${relatedEntityId}`;
      }
      let role: string | undefined;
      const u = await AsyncStorage.getItem('user');
      if (u) {
        try {
          role = JSON.parse(u).role;
        } catch {
          role = undefined;
        }
      }
      if (!role) role = (await AsyncStorage.getItem('userRole')) || 'CUSTOMER';
      if (role === 'DRIVER') {
        // Specific order id: open that order (tracking / status pushes often omit `type`).
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
    case 'CoinTransfer': {
      if (type === 'COIN_TRANSFER_RECEIVED') {
        const role = (await getStoredUserRole()) || 'CUSTOMER';
        const amountEnc = encodeURIComponent((data.amount || '').trim());
        const giftRaw = (data.giftMessage || '').trim();
        const giftEnc = giftRaw ? `&gift=${encodeURIComponent(giftRaw)}` : '';
        if (role === 'DRIVER') {
          return `/(driver)/send-coins?celebrate=1&amount=${amountEnc}${giftEnc}`;
        }
        return `/(customer)/wallet?tab=coin&celebrate=1&amount=${amountEnc}${giftEnc}`;
      }
      if (type === 'COIN_TRANSFER_OUTBOUND_COMPLETED') {
        const role = (await getStoredUserRole()) || 'CUSTOMER';
        if (role === 'DRIVER') return `/(driver)/send-coins?sendsOnly=1`;
        return `/(customer)/wallet?tab=coin&sendsOnly=1`;
      }
      return null;
    }
    default:
      return null;
  }
}

type NotifeeInitial = NonNullable<Awaited<ReturnType<typeof notifee.getInitialNotification>>>;

async function routeFromNotifeeInitialForNavigation(initial: NotifeeInitial): Promise<string | null> {
  const actionId = initial.pressAction?.id;
  const data = coerceFcmData(initial.notification?.data as Record<string, unknown>);
  if (data.suppressDriverTapNavigation === 'true') {
    const r = await notificationDataToRoute(data);
    if (r) return r;
    return null;
  }
  const orderId = data.orderId || data.relatedEntityId || '';
  let role: string | undefined;
  try {
    const u = await AsyncStorage.getItem('user');
    if (u) role = JSON.parse(u).role;
  } catch {
    role = undefined;
  }
  if (!role) role = (await AsyncStorage.getItem('userRole')) || 'CUSTOMER';

  if (actionId === 'see_driver' && orderId) return getOrderRoute(orderId, true);
  if (actionId === 'view_order' && orderId) {
    if (role === 'DRIVER' && data.type === 'NEW_ORDER_AVAILABLE') {
      return `/(driver)/available-orders?urgentOrderId=${orderId}`;
    }
    return role === 'DRIVER' ? getDriverOrderRoute(orderId) : getOrderRoute(orderId);
  }
  if (actionId === 'view_order_driver' && orderId) return getDriverOrderRoute(orderId);
  if (actionId === 'driver_open_deliver' && orderId) return getDriverOrderRoute(orderId, 'proof');
  if (actionId === 'driver_contact_customer' && orderId) {
    return `/(driver)/order-chat?orderId=${orderId}`;
  }
  if (actionId === 'accept_driver') return null;
  if (
    actionId &&
    ['driver_mark_arrived', 'driver_mark_picked_up', 'driver_mark_delivering'].includes(actionId)
  ) {
    return null;
  }

  if ((data.groupKey || '').toLowerCase().startsWith('chat:')) {
    const oid =
      (data.orderId || '').trim() ||
      (data.relatedEntityId || '').trim() ||
      String(data.groupKey || '')
        .replace(/^chat:/i, '')
        .trim();
    if (oid) {
      return role === 'DRIVER' ? `/(driver)/order-chat?orderId=${oid}` : `/(customer)/order-chat?orderId=${oid}`;
    }
  }

  if ((data.groupKey || '').toLowerCase().startsWith('support:')) {
    const ticketId =
      (data.relatedEntityId || '').trim() ||
      String(data.groupKey || '')
        .replace(/^support:/i, '')
        .trim();
    if (ticketId) {
      const q = encodeURIComponent(ticketId);
      return role === 'DRIVER'
        ? `/(driver)/support-chat?ticketId=${q}`
        : `/(customer)/support-chat?ticketId=${q}`;
    }
  }
  if ((data.type || '') === 'SUPPORT_TICKET_REPLY' && (data.relatedEntityId || '').trim()) {
    const ticketId = (data.relatedEntityId || '').trim();
    const q = encodeURIComponent(ticketId);
    return role === 'DRIVER'
      ? `/(driver)/support-chat?ticketId=${q}`
      : `/(customer)/support-chat?ticketId=${q}`;
  }

  if (data.relatedEntityType && data.relatedEntityId) {
    return notificationDataToRoute(data);
  }
  if (orderId && data.groupKey?.startsWith('order:')) {
    return data.trackingAudience === 'DRIVER' ? getDriverOrderRoute(orderId) : getOrderRoute(orderId);
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
  if (n?.pressAction?.id === 'driver_open_return_deposit') {
    const data = coerceFcmData(n.notification?.data as Record<string, unknown>);
    const orderId = data.orderId || data.relatedEntityId;
    if (orderId) await handleDriverNotificationPress(orderId, 'driver_open_return_deposit');
    return null;
  }
  if (
    n?.pressAction?.id &&
    ['driver_mark_arrived', 'driver_mark_picked_up', 'driver_mark_delivering'].includes(n.pressAction.id)
  ) {
    const data = coerceFcmData(n.notification?.data as Record<string, unknown>);
    const orderId = data.orderId || data.relatedEntityId;
    if (orderId) await handleDriverNotificationPress(orderId, n.pressAction.id);
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
  if (Platform.OS === 'android') {
    try {
      await createNotificationChannels();
    } catch {
      /* notifee may be unavailable in rare headless cases */
    }
  }
  const data = coerceFcmData(rawData);
  const { orderId, groupKey, ongoing } = data;

  const inferredOrderStatus =
    data.orderStatus ||
    (data.type ? STATUS_BY_NOTIFICATION_TYPE[data.type] : undefined);

  const ongoingNorm = String(ongoing ?? '').toLowerCase();
  const isTerminal =
    ongoingNorm === 'false' ||
    ongoingNorm === '0' ||
    (Boolean(inferredOrderStatus) && ORDER_TRACKING_FCM_TERMINAL_STATUSES.has(String(inferredOrderStatus))) ||
    (Boolean(data.orderStatus) && ORDER_TRACKING_FCM_TERMINAL_STATUSES.has(String(data.orderStatus))) ||
    (Boolean(data.type) && ORDER_FCM_TERMINAL_TYPES.has(String(data.type)));

  const oid = extractOrderIdFromOrderGroupKey(groupKey) || orderId || '';

  let resolved = await resolveOrderTrackingText(data, oid);
  if (!resolved && isTerminal) {
    const st = inferredOrderStatus || data.orderStatus;
    if (st && ORDER_TRACKING_FCM_TERMINAL_STATUSES.has(st)) {
      resolved = getDismissCopyForTrackingStatus(st);
    } else {
      resolved = { title: 'Order update', body: 'This order is no longer active.' };
    }
  }
  if (!resolved) return;

  if (isTerminal) {
    const isCompanyDriverRemoval =
      isDriverTrackingData(data) &&
      data.type === 'ORDER_CANCELLED_BY_CUSTOMER' &&
      data.orderStatus === 'FAILED';
    if (isCompanyDriverRemoval && oid) {
      if (Platform.OS === 'android') {
        await replaceOrderTrackingWithDismissibleFailed(oid, resolved.title, resolved.body, {
          type: data.type || '',
          groupKey: data.groupKey || `order:${oid}`,
          ...(data.notificationId ? { notificationId: data.notificationId } : {}),
          ...(data.suppressDriverTapNavigation ? { suppressDriverTapNavigation: data.suppressDriverTapNavigation } : {}),
        });
      } else {
        await displayRegularNotification({
          title: resolved.title,
          body: resolved.body,
          type: data.type || '',
        });
      }
    } else if (oid) {
      await stopOrderTracking(resolved.title, resolved.body, oid);
    } else {
      await stopOrderTrackingSilently();
    }
    emitOrderDetailAndDriverListRefresh(oid);
    return;
  }
  if (!oid) return;
  await updateOrderTracking(resolved.title, resolved.body, {
    ...data,
    orderId: oid,
    ...(inferredOrderStatus ? { orderStatus: inferredOrderStatus } : {}),
  });
  emitOrderDetailAndDriverListRefresh(oid);
}

function isOrderTrackingPayload(data: Record<string, string>): boolean {
  const gk = (data.groupKey || '').toLowerCase();
  /** Chat/support threads must never be routed through order-tracking (some payloads still carry orderStatus/progressStep). */
  if (gk.startsWith('chat:') || gk.startsWith('support:')) return false;
  if (data.groupKey?.startsWith('order:')) return true;
  if (Boolean(data.orderStatus)) return true;
  if (Boolean(data.type) && Boolean(STATUS_BY_NOTIFICATION_TYPE[data.type])) return true;
  return false;
}

/**
 * Order chat: one tray slot per thread, Messaging-style lines on Android, inline reply where supported.
 */
async function displayGroupedChatNotification(data: Record<string, string>, lines: ChatQueuedLine[]) {
  const orderId = effectiveOrderIdFromChatPayload(data);
  if (!orderId || lines.length === 0) return;
  if (shouldSuppressChatNotification(data)) return;

  const convTitle = senderLabelFromChatData(data);
  const lastText = lines[lines.length - 1]?.text || '';

  try {
    await createNotificationChannels();
  } catch {
    /* ignore */
  }

  const baseData = {
    ...data,
    orderId,
    relatedEntityType: data.relatedEntityType || 'ChatRoom',
    relatedEntityId: data.relatedEntityId || orderId,
    groupKey: data.groupKey || `chat:${orderId}`,
  };

  /** Visible label so OEMs show the RemoteInput row (ZWSP titles are often hidden). */
  const replyAction = {
    title: 'Reply',
    pressAction: { id: ORDER_CHAT_REPLY_ACTION, launchActivity: 'none' as const },
    input: { placeholder: 'Message', allowFreeFormInput: true },
  };

  if (Platform.OS === 'android') {
    const localSelf = { name: 'You', id: `local_self_${orderId}` };
    const messagingMessages = lines.map((ln) => {
      const incomingPeer = ((ln.peerLabel || '').trim() || convTitle).slice(0, 64);
      return {
        text: ln.text,
        timestamp: ln.timestamp,
        person:
          ln.direction === 'outgoing'
            ? localSelf
            : { name: incomingPeer || convTitle, id: `peer_${orderId}` },
      };
    });

    await notifee.displayNotification({
      id: stableChatNotificationId(orderId),
      title: convTitle,
      body: lastText,
      data: baseData,
      android: {
        channelId: CHANNEL_CHAT,
        importance: AndroidImportance.HIGH,
        category: AndroidCategory.MESSAGE,
        color: CHAT_NOTIFICATION_ACCENT,
        visibility: AndroidVisibility.PUBLIC,
        pressAction: { id: 'default', launchActivity: 'default' },
        /** Matches backend FCM `chat_thread_${orderId}` so merged Notifee replaces the system chat banner. */
        tag: `chat_thread_${orderId}`.slice(0, 64),
        style: {
          type: AndroidStyle.MESSAGING,
          person: localSelf,
          title: convTitle,
          messages: messagingMessages,
        },
        actions: [replyAction],
      },
      ios: { sound: 'default', threadId: `chat:${orderId}`, categoryId: IOS_CHAT_REPLY_CATEGORY },
    });
    return;
  }

  const iosBody = lines.map((l) => l.text).join('\n');
  await notifee.displayNotification({
    id: stableChatNotificationId(orderId),
    title: convTitle,
    body: iosBody,
    data: baseData,
    ios: {
      sound: 'default',
      threadId: `chat:${orderId}`,
      categoryId: IOS_CHAT_REPLY_CATEGORY,
      summaryArgument: convTitle,
      summaryArgumentCount: lines.length,
    },
  });
}

function stableSupportTicketNotificationId(ticketId: string): string {
  const safe = ticketId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `support_ntf_${safe}`.slice(0, 64);
}

async function displayRegularNotification(data: Record<string, string>, androidId?: string) {
  const { title, body } = data;
  if (!title || !body) return;
  if (shouldSuppressChatNotification(data)) return;

  const isSupportReply = data.type === 'SUPPORT_TICKET_REPLY' && Boolean((data.relatedEntityId || '').trim());
  const isCoinTransferDeepLink =
    data.relatedEntityType === 'CoinTransfer' &&
    (data.type === 'COIN_TRANSFER_RECEIVED' || data.type === 'COIN_TRANSFER_OUTBOUND_COMPLETED');
  const resolvedAndroidId =
    androidId ||
    (isSupportReply ? stableSupportTicketNotificationId(String(data.relatedEntityId || '').trim()) : undefined);

  if (Platform.OS === 'android') {
    try {
      await createNotificationChannels();
    } catch {
      /* ignore */
    }
  }

  const threadIdIos = (data.groupKey || '').trim() || (isSupportReply ? `support:${data.relatedEntityId}`.trim() : '');

  await notifee.displayNotification({
    ...(resolvedAndroidId ? { id: resolvedAndroidId } : {}),
    title,
    body,
    android: {
      channelId: CHANNEL_DEFAULT,
      importance: AndroidImportance.DEFAULT,
      /** `launchActivity` helps cold-start: open app then deep-link to support ticket chat. */
      pressAction:
        (isSupportReply || isCoinTransferDeepLink) && Platform.OS === 'android'
          ? { id: 'default', launchActivity: 'default' }
          : { id: 'default' },
      /** One tray slot per ticket; no Messaging-style UI or inline reply (unlike order chat). */
      ...(isSupportReply && resolvedAndroidId
        ? { tag: resolvedAndroidId, category: AndroidCategory.STATUS }
        : {}),
    },
    ios: {
      sound: 'default',
      ...(threadIdIos ? { threadId: threadIdIos } : {}),
    },
    data,
  });
}

// ============================================================
// NOTIFICATION LISTENERS
// ============================================================

export function setupNotificationListeners() {
  // Do not flush pending routes here: RootContent mounts before/with index.tsx; consuming
  // AsyncStorage too early races resolveLaunchRouteAfterLogin() and home replace wins.

  const unsubOpened = onNotificationOpenedApp(firebaseMessaging, async (remoteMessage) => {
    const raw = remoteMessage?.data as Record<string, unknown> | undefined;
    const data = mergeFcmNotificationIntoData(
      remoteMessage,
      coerceFcmData(raw && typeof raw === 'object' ? raw : undefined),
    );
    const route = await notificationDataToRoute(data);
    if (route) {
      runAfterNextPaint(() => router.push(route as any));
    }
  });

  // Foreground FCM is registered in setupBackgroundHandler() as soon as the
  // bundle loads (see index.js), so messages are not missed before React mounts.

  const unsubscribeNotifee = notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.ACTION_PRESS) {
      const actionId = detail.pressAction?.id;
      const data = detail.notification?.data as Record<string, string> | undefined;
      if (data?.suppressDriverTapNavigation === 'true') return;
      const orderId = data?.orderId || data?.relatedEntityId || '';

      if (actionId === 'accept_driver' && orderId) {
        handleAcceptDriver(orderId);
        return;
      }
      if (actionId === ORDER_CHAT_REPLY_ACTION) {
        const merged = coerceFcmData(detail.notification?.data as Record<string, unknown>);
        const oid = effectiveOrderIdFromChatPayload(merged);
        void handleChatQuickReply(oid, detail.input);
        return;
      }
      if (
        orderId &&
        (actionId === 'view_order_driver' ||
          actionId === 'driver_contact_customer' ||
          actionId === 'driver_open_deliver' ||
          actionId === 'driver_open_return_deposit' ||
          actionId === 'driver_mark_arrived' ||
          actionId === 'driver_mark_picked_up' ||
          actionId === 'driver_mark_delivering')
      ) {
        void handleDriverNotificationPress(orderId, actionId);
        return;
      }
      if (actionId === 'see_driver' && orderId) {
        router.push(getOrderRoute(orderId, true) as any);
        return;
      }
      if (actionId === 'view_order' && orderId) {
        (async () => {
          let role: string | undefined;
          try {
            const u = await AsyncStorage.getItem('user');
            if (u) role = JSON.parse(u).role;
          } catch {
            role = undefined;
          }
          if (!role) role = (await AsyncStorage.getItem('userRole')) || 'CUSTOMER';
          if (role === 'DRIVER' && data?.type === 'NEW_ORDER_AVAILABLE') {
            router.push(`/(driver)/available-orders?urgentOrderId=${orderId}` as any);
            return;
          }
          router.push(
            (role === 'DRIVER' ? getDriverOrderRoute(orderId) : getOrderRoute(orderId)) as any,
          );
        })();
        return;
      }
      /** Android often reports a body tap as ACTION_PRESS with id `default` (not EventType.PRESS). */
      if (actionId === 'default' && data) {
        void notificationDataToRoute(coerceFcmData(data as Record<string, unknown>)).then((route) => {
          if (route) runAfterNextPaint(() => router.push(route as any));
        });
        return;
      }
    }
    if (type === EventType.PRESS) {
      const data = detail.notification?.data as Record<string, string> | undefined;
      void notificationDataToRoute(coerceFcmData(data as Record<string, unknown>)).then((route) => {
        if (route) runAfterNextPaint(() => router.push(route as any));
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
    const rawUnknown = remoteMessage?.data as Record<string, unknown> | undefined;
    if (rawUnknown != null && typeof rawUnknown !== 'object') return;
    const raw = rawUnknown && typeof rawUnknown === 'object' ? rawUnknown : {};
    const data = mergeFcmNotificationIntoData(remoteMessage, coerceFcmData(raw));
    emitUnreadBadgeRefreshDebounced();

    /** Driver/customer in order chat: skip banner for the open thread (see activeChatContext). */
    if (
      (data.type === 'NEW_MESSAGE_FROM_DRIVER' || data.type === 'NEW_MESSAGE_FROM_CUSTOMER') &&
      shouldSuppressChatNotification(data)
    ) {
      return;
    }

    const { groupKey } = data;

    /** Chat before order-tracking routing — avoids swallowing chat when payload also has orderStatus/type heuristics. */
    if (groupKey?.startsWith('chat:')) {
      const oid =
        (data.orderId || '').trim() ||
        groupKey.replace(/^chat:/i, '').trim() ||
        effectiveOrderIdFromChatPayload(data);
      if (!oid) return;
      if (shouldSuppressChatNotification(data)) return;
      const lines = await mergeIncomingChatLine(oid, data);
      await displayGroupedChatNotification(data, lines);
      return;
    }

    if (isOrderTrackingPayload(data)) {
      await handleOrderFCMData(raw);
      return;
    }

    // Non-chat pushes with notification+data: OS shows tray when backgrounded; foreground needs Notifee (no system banner).
    if (fcmHasNativeNotificationTrayPayload(remoteMessage) && AppState.currentState !== 'active') {
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
      if (data?.suppressDriverTapNavigation === 'true') return;
      const orderId = data?.orderId || data?.relatedEntityId || '';

      if (actionId === 'accept_driver' && orderId) {
        await handleAcceptDriver(orderId);
        return;
      }
      if (actionId === ORDER_CHAT_REPLY_ACTION) {
        const merged = coerceFcmData(detail.notification?.data as Record<string, unknown>);
        const oid = effectiveOrderIdFromChatPayload(merged);
        await handleChatQuickReply(oid, detail.input);
        return;
      }
      if (
        orderId &&
        (actionId === 'view_order_driver' ||
          actionId === 'driver_contact_customer' ||
          actionId === 'driver_open_deliver' ||
          actionId === 'driver_open_return_deposit' ||
          actionId === 'driver_mark_arrived' ||
          actionId === 'driver_mark_picked_up' ||
          actionId === 'driver_mark_delivering')
      ) {
        await handleDriverNotificationPressBackground(orderId, actionId);
        return;
      }
      if (actionId === 'see_driver' && orderId) {
        await savePendingNotificationRoute(getOrderRoute(orderId, true));
        return;
      }
      if (actionId === 'view_order' && orderId) {
        let role: string | undefined;
        try {
          const u = await AsyncStorage.getItem('user');
          if (u) role = JSON.parse(u).role;
        } catch {
          role = undefined;
        }
        if (!role) role = (await AsyncStorage.getItem('userRole')) || 'CUSTOMER';
        if (role === 'DRIVER' && data?.type === 'NEW_ORDER_AVAILABLE') {
          await savePendingNotificationRoute(`/(driver)/available-orders?urgentOrderId=${orderId}`);
          return;
        }
        await savePendingNotificationRoute(
          role === 'DRIVER' ? getDriverOrderRoute(orderId) : getOrderRoute(orderId),
        );
        return;
      }
      if (actionId === 'default' && data) {
        const merged = coerceFcmData(data as Record<string, unknown>);
        const route = await notificationDataToRoute(merged);
        if (route) await savePendingNotificationRoute(route);
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
registerOrderForegroundService();


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
  const rawUnknown = remoteMessage?.data as Record<string, unknown> | undefined;
  if (rawUnknown != null && typeof rawUnknown !== 'object') return;
  const raw = rawUnknown && typeof rawUnknown === 'object' ? rawUnknown : {};
  const data = mergeFcmNotificationIntoData(remoteMessage, coerceFcmData(raw));
  emitUnreadBadgeRefreshDebounced();
  if (
    (data.type === 'NEW_MESSAGE_FROM_DRIVER' || data.type === 'NEW_MESSAGE_FROM_CUSTOMER') &&
    shouldSuppressChatNotification(data)
  ) {
    return;
  }
  if (data.groupKey?.startsWith('order:')) await handleOrderFCMData(raw);
  else if (data.groupKey?.startsWith('chat:')) {
    const oid =
      (data.orderId || '').trim() ||
      (data.groupKey || '').replace(/^chat:/i, '').trim() ||
      effectiveOrderIdFromChatPayload(data);
    if (!oid) return;
    if (shouldSuppressChatNotification(data)) return;
    const lines = await mergeIncomingChatLine(oid, data);
    await displayGroupedChatNotification(data, lines);
  } else if (
    !fcmHasNativeNotificationTrayPayload(remoteMessage) ||
    AppState.currentState === 'active'
  ) {
    await displayRegularNotification(data);
  }
}
export async function handleDataMessage(data: Record<string, string>) {
  await handleFCMMessage({ data });
}
export async function registerDriverActionCategories() {}
