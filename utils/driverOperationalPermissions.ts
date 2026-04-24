import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';

export interface DriverOperationalPermissionStatus {
  notificationsOk: boolean;
  foregroundLocationOk: boolean;
  backgroundLocationOk: boolean;
}

/**
 * Permissions required before a driver can accept an order (matches `available-orders` gate).
 */
export async function getDriverOperationalPermissionStatus(): Promise<DriverOperationalPermissionStatus> {
  const notif = await Notifications.getPermissionsAsync();
  const notificationsOk =
    notif.granted || notif.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

  const fg = await Location.getForegroundPermissionsAsync();
  const foregroundLocationOk = fg.status === 'granted';

  let backgroundLocationOk = false;
  try {
    const bg = await Location.getBackgroundPermissionsAsync();
    backgroundLocationOk = bg.status === 'granted';
  } catch {
    backgroundLocationOk = false;
  }

  return { notificationsOk, foregroundLocationOk, backgroundLocationOk };
}

export function allDriverOperationalPermissionsGranted(s: DriverOperationalPermissionStatus): boolean {
  return s.notificationsOk && s.foregroundLocationOk && s.backgroundLocationOk;
}
