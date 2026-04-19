import type { Notification } from '../services/api/notification.service';

/** True when inbox row was stored with backend flag — driver no longer has API access to this order. */
export function shouldSuppressDriverOrderDetailNavigation(item: Notification): boolean {
  const meta = item.notificationMetadata as { suppressDriverOrderNavigation?: boolean } | null | undefined;
  return meta?.suppressDriverOrderNavigation === true;
}

/**
 * Company portal removed the driver before arrival (`Removed from company order`).
 * Order detail would 403 — go to available orders with a short "Declined" banner instead.
 */
export function routeWhenDriverCannotOpenOrderDetail(item: Notification): string | null {
  if (!shouldSuppressDriverOrderDetailNavigation(item)) return null;
  if (item.type === 'ORDER_CANCELLED_BY_CUSTOMER' && item.title === 'Removed from company order') {
    return '/(driver)/available-orders?declinedFlash=1';
  }
  return null;
}
