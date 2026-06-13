import notifee, { AndroidImportance } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';
import i18n, { initI18n } from '../i18n';
import { resolveLocationShareRequestId } from '../utils/locationShareNavigation';
import { locationRequestService } from './api/locationRequest.service';
import { appAlert } from '../utils/appAlert';
import { ApiError } from './api/client';

const CHANNEL_ORDER = 'order-updates';
const ACTION_LOCK_PREFIX = 'locShareActionLock:';
const ACTION_LOCK_TTL_MS = 120_000;

export type LocationShareTerminal = 'accepted' | 'declined' | 'cancelled';

async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return;
  try {
    await notifee.createChannel({
      id: CHANNEL_ORDER,
      name: 'Order Updates',
      importance: AndroidImportance.HIGH,
      vibration: true,
    });
  } catch {
    /* channel may already exist */
  }
}

export function stableLocationShareNotifId(requestId: string): string {
  return `loc_share_${requestId.replace(/[^a-zA-Z0-9_-]/g, '_')}`.slice(0, 64);
}

/** Remove the tray notification for a location-share request (Notifee id + Android tag). */
export async function dismissLocationShareNotification(requestId: string) {
  const id = (requestId || '').trim();
  if (!id) return;
  const stableId = stableLocationShareNotifId(id);
  try {
    await notifee.cancelNotification(stableId);
    if (Platform.OS === 'android') {
      await notifee.cancelNotification(stableId, stableId);
    }
  } catch {
    /* notification may already be gone */
  }

  try {
    const displayed = await notifee.getDisplayedNotifications();
    for (const entry of displayed) {
      const data = entry.notification?.data as Record<string, string> | undefined;
      const dataReqId = resolveLocationShareRequestId({
        relatedEntityId: data?.relatedEntityId,
        groupKey: data?.groupKey,
      });
      if (dataReqId !== id) continue;
      const notifType = (data?.type || '').trim();
      const isIncomingRequestNotif =
        notifType === 'LOCATION_SHARE_REQUEST' ||
        ((data?.relatedEntityType || '') === 'LocationShareRequest' &&
          notifType !== 'LOCATION_SHARE_FULFILLED' &&
          notifType !== 'LOCATION_SHARE_DECLINED');
      if (!isIncomingRequestNotif) continue;
      const nid = entry.id || stableId;
      await notifee.cancelNotification(nid);
      const tag = entry.notification?.android?.tag;
      if (Platform.OS === 'android' && tag) {
        await notifee.cancelNotification(nid, tag);
      }
    }
  } catch {
    /* ignore scan failures */
  }
}

function requesterNameFromNotifData(data: Record<string, string>): string {
  const fromField = (data.requesterName || '').trim();
  if (fromField) return fromField;
  const title = (data.title || '').trim();
  const match = title.match(/^(.+?)\s+wants to send/i);
  if (match?.[1]) return match[1].trim();
  return '';
}

async function ensureI18nReady() {
  try {
    await initI18n();
  } catch {
    /* use i18n fallbacks */
  }
}

function displayNameOrFallback(data: Record<string, string>, fromApi?: string | null): string {
  return (
    (fromApi || '').trim() ||
    requesterNameFromNotifData(data) ||
    i18n.t('locationShare.themFallback')
  );
}

function terminalCopy(terminal: LocationShareTerminal, requesterName: string) {
  if (terminal === 'accepted') {
    return {
      title: i18n.t('locationShare.notifAcceptedTitle'),
      body: i18n.t('locationShare.notifAcceptedBody', { name: requesterName }),
    };
  }
  if (terminal === 'declined') {
    return {
      title: i18n.t('locationShare.notifDeclinedTitle'),
      body: i18n.t('locationShare.notifDeclinedBody', { name: requesterName }),
    };
  }
  return {
    title: i18n.t('locationShare.notifCancelledTitle'),
    body: i18n.t('locationShare.notifCancelledBody', { name: requesterName }),
  };
}

async function tryAcquireActionLock(reqId: string): Promise<boolean> {
  const key = `${ACTION_LOCK_PREFIX}${reqId}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const ts = Number(raw);
      if (!Number.isNaN(ts) && Date.now() - ts < ACTION_LOCK_TTL_MS) return false;
    }
    await AsyncStorage.setItem(key, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

async function releaseActionLock(reqId: string) {
  try {
    await AsyncStorage.removeItem(`${ACTION_LOCK_PREFIX}${reqId}`);
  } catch {
    /* ignore */
  }
}

export async function refreshLocationShareNotificationAsTerminal(
  data: Record<string, string>,
  terminal: LocationShareTerminal,
  requesterName: string,
) {
  await ensureI18nReady();
  const reqId = resolveLocationShareRequestId({
    relatedEntityId: data.relatedEntityId,
    groupKey: data.groupKey,
  });
  if (!reqId) return;

  const androidId = stableLocationShareNotifId(reqId);
  const groupKey = (data.groupKey || '').trim() || `LocationShareRequest:${reqId}`;
  const { title, body } = terminalCopy(terminal, requesterName);

  const notifeeData: Record<string, string> = {
    ...data,
    groupKey,
    relatedEntityId: reqId,
    relatedEntityType: data.relatedEntityType || 'LocationShareRequest',
    type: data.type || 'LOCATION_SHARE_REQUEST',
    locationShareTerminal: terminal,
    actionButtons: '',
    title,
    body,
  };

  await ensureAndroidChannels();
  await notifee.displayNotification({
    id: androidId,
    title,
    body,
    android: {
      channelId: CHANNEL_ORDER,
      importance: AndroidImportance.DEFAULT,
      pressAction: { id: 'default', launchActivity: 'default' },
      tag: androidId,
    },
    ios: {
      sound: 'default',
      threadId: groupKey,
    },
    data: notifeeData,
  });
}

export async function revertLocationShareNotificationToPending(data: Record<string, string>) {
  const reqId = resolveLocationShareRequestId({
    relatedEntityId: data.relatedEntityId,
    groupKey: data.groupKey,
  });
  if (!reqId) return;

  const androidId = stableLocationShareNotifId(reqId);
  const groupKey = (data.groupKey || '').trim() || `LocationShareRequest:${reqId}`;
  const title = (data.title || '').trim() || `${requesterNameFromNotifData(data) || 'Someone'} wants to send you a package`;
  const slot = (data.slot || 'pickup').trim();
  const body =
    (data.body || '').trim() ||
    i18n.t('locationShare.incomingBodyShort', { slot, defaultValue: `Share your exact ${slot} location so they can complete the order.` });

  const restored: Record<string, string> = {
    ...data,
    groupKey,
    relatedEntityId: reqId,
    relatedEntityType: 'LocationShareRequest',
    type: 'LOCATION_SHARE_REQUEST',
    locationShareTerminal: '',
    actionButtons: JSON.stringify([
      { id: 'location_share_accept', title: 'Accept', action: 'foreground' },
      { id: 'location_share_decline', title: 'Reject', action: 'background' },
    ]),
    title,
    body,
  };

  await ensureAndroidChannels();
  await notifee.displayNotification({
    id: androidId,
    title,
    body,
    android: {
      channelId: CHANNEL_ORDER,
      importance: AndroidImportance.HIGH,
      pressAction: { id: 'default', launchActivity: 'default' },
      tag: androidId,
      actions: [
        { title: 'Accept', pressAction: { id: 'location_share_accept', launchActivity: 'default' } },
        { title: 'Reject', pressAction: { id: 'location_share_decline', launchActivity: 'none' } as any },
      ],
    },
    ios: { sound: 'default', threadId: groupKey },
    data: restored,
  });
}

async function ensureLocationReadyForShare(): Promise<{ ok: true } | { ok: false }> {
  await ensureI18nReady();

  let { status } = await Location.getForegroundPermissionsAsync();
  if (status !== 'granted') {
    const req = await Location.requestForegroundPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') {
    appAlert(i18n.t('common.permission'), i18n.t('locationShare.permissionBody'), [
      { text: i18n.t('common.cancel'), style: 'cancel' },
      { text: i18n.t('common.openSettings'), onPress: () => void Linking.openSettings() },
    ]);
    return { ok: false };
  }

  const servicesOn = await Location.hasServicesEnabledAsync();
  if (!servicesOn) {
    appAlert(i18n.t('locationShare.locationOffTitle'), i18n.t('locationShare.locationOffBody'), [
      { text: i18n.t('common.cancel'), style: 'cancel' },
      { text: i18n.t('common.openSettings'), onPress: () => void Linking.openSettings() },
    ]);
    return { ok: false };
  }

  return { ok: true };
}

/** Share current GPS for a location-share request (in-app Accept button). */
export async function acceptLocationShareWithCurrentGps(requestId: string) {
  const req = await fetchRequestStatus(requestId);
  if (req?.status === 'CANCELLED') {
    await ensureI18nReady();
    appAlert(
      i18n.t('locationShare.notifCancelledTitle'),
      i18n.t('locationShare.requestCancelled', { name: req.requester.displayName }),
    );
    return { ok: false as const, reason: 'cancelled' as const };
  }
  if (req?.status === 'DECLINED') {
    await ensureI18nReady();
    appAlert(
      i18n.t('locationShare.declinedTitle'),
      i18n.t('locationShare.declinedNoReaccept', { name: req.requester.displayName }),
    );
    return { ok: false as const, reason: 'declined' as const };
  }

  const loc = await ensureLocationReadyForShare();
  if (!loc.ok) return { ok: false as const, reason: 'permission' as const };

  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const result = await locationRequestService.accept(requestId, {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
  });
  await dismissLocationShareNotification(requestId);
  return { ok: true as const, result };
}

async function fetchRequestStatus(reqId: string) {
  try {
    return await locationRequestService.getById(reqId);
  } catch {
    return null;
  }
}

export async function handleLocationShareCancelledInteraction(
  data: Record<string, string>,
  options?: { showAlert?: boolean },
) {
  await ensureI18nReady();
  const reqId = resolveLocationShareRequestId({
    relatedEntityId: data.relatedEntityId,
    groupKey: data.groupKey,
  });
  if (!reqId) return false;

  const req = await fetchRequestStatus(reqId);
  if (!req || req.status !== 'CANCELLED') return false;

  const name = displayNameOrFallback(data, req.requester.displayName);
  await refreshLocationShareNotificationAsTerminal(data, 'cancelled', name);
  if (options?.showAlert !== false && Platform.OS !== 'web') {
    appAlert(i18n.t('locationShare.notifCancelledTitle'), i18n.t('locationShare.notifCancelledBody', { name }));
  }
  return true;
}

export async function handleLocationShareAcceptFromNotification(data: Record<string, string>) {
  const reqId = resolveLocationShareRequestId({
    relatedEntityId: data.relatedEntityId,
    groupKey: data.groupKey,
  });
  if (!reqId) return;

  if (data.locationShareTerminal === 'accepted' || data.locationShareTerminal === 'declined' || data.locationShareTerminal === 'cancelled') {
    return;
  }

  if (!(await tryAcquireActionLock(reqId))) return;

  await ensureI18nReady();
  const optimisticName = displayNameOrFallback(data);

  if (await handleLocationShareCancelledInteraction(data, { showAlert: true })) {
    await releaseActionLock(reqId);
    return;
  }

  const existing = await fetchRequestStatus(reqId);
  if (existing?.status === 'DECLINED') {
    await ensureI18nReady();
    appAlert(
      i18n.t('locationShare.declinedTitle'),
      i18n.t('locationShare.declinedNoReaccept', { name: existing.requester.displayName }),
    );
    await releaseActionLock(reqId);
    return;
  }

  await refreshLocationShareNotificationAsTerminal(data, 'accepted', optimisticName);

  const loc = await ensureLocationReadyForShare();
  if (!loc.ok) {
    await revertLocationShareNotificationToPending(data);
    await releaseActionLock(reqId);
    return;
  }

  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const result = await locationRequestService.accept(reqId, {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    });
    const name = displayNameOrFallback(data, result.requester.displayName);
    await refreshLocationShareNotificationAsTerminal(data, 'accepted', name);
  } catch (e) {
    const req = await fetchRequestStatus(reqId);
    if (req?.status === 'CANCELLED') {
      const name = displayNameOrFallback(data, req.requester.displayName);
      await refreshLocationShareNotificationAsTerminal(data, 'cancelled', name);
      appAlert(i18n.t('locationShare.notifCancelledTitle'), i18n.t('locationShare.notifCancelledBody', { name: name }));
    } else {
      await revertLocationShareNotificationToPending(data);
      const msg = e instanceof ApiError || e instanceof Error ? e.message : i18n.t('common.error');
      if (Platform.OS !== 'web') {
        appAlert(i18n.t('common.error'), msg);
      }
    }
    await releaseActionLock(reqId);
    return;
  }

  await releaseActionLock(reqId);
}

export async function handleLocationShareDeclineFromNotification(data: Record<string, string>) {
  const reqId = resolveLocationShareRequestId({
    relatedEntityId: data.relatedEntityId,
    groupKey: data.groupKey,
  });
  if (!reqId) return;

  if (data.locationShareTerminal === 'accepted' || data.locationShareTerminal === 'declined' || data.locationShareTerminal === 'cancelled') {
    return;
  }

  if (!(await tryAcquireActionLock(reqId))) return;

  await ensureI18nReady();
  const optimisticName = displayNameOrFallback(data);

  if (await handleLocationShareCancelledInteraction(data, { showAlert: false })) {
    await releaseActionLock(reqId);
    return;
  }

  await refreshLocationShareNotificationAsTerminal(data, 'declined', optimisticName);

  try {
    const result = await locationRequestService.decline(reqId);
    const name = displayNameOrFallback(data, result.requester.displayName);
    await refreshLocationShareNotificationAsTerminal(data, 'declined', name);
  } catch (e) {
    const req = await fetchRequestStatus(reqId);
    if (req?.status === 'CANCELLED') {
      const name = displayNameOrFallback(data, req.requester.displayName);
      await refreshLocationShareNotificationAsTerminal(data, 'cancelled', name);
    } else {
      await revertLocationShareNotificationToPending(data);
      console.error('Location share decline failed:', e);
    }
    await releaseActionLock(reqId);
    return;
  }

  await releaseActionLock(reqId);
}

export async function guardLocationShareBodyNavigation(data: Record<string, string>): Promise<boolean> {
  if (data.locationShareTerminal === 'cancelled') return true;
  const cancelled = await handleLocationShareCancelledInteraction(data, { showAlert: true });
  return cancelled;
}
