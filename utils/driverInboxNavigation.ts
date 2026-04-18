import type { Notification } from '../services/api/notification.service';

/** True when inbox row was stored with backend flag — driver no longer has API access to this order. */
export function shouldSuppressDriverOrderDetailNavigation(item: Notification): boolean {
  const meta = item.notificationMetadata as { suppressDriverOrderNavigation?: boolean } | null | undefined;
  return meta?.suppressDriverOrderNavigation === true;
}
