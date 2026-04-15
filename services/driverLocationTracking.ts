import * as Location from 'expo-location';
import { orderService, type Order } from './api/order.service';

const TRACKING_STATUSES = new Set([
  'PENDING_CUSTOMER_APPROVAL',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVED',
  'PICKED_UP',
  'DELIVERING',
]);

let watchSub: Location.LocationSubscription | null = null;
let trackedOrderId: string | null = null;

/**
 * Request foreground location permission and stream GPS for this order to the backend.
 * Call after the driver accepts an order (and when resuming an active delivery).
 */
export async function startDriverLocationTracking(orderId: string): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return false;
  }

  if (trackedOrderId === orderId && watchSub) {
    return true;
  }

  await stopDriverLocationTracking();
  trackedOrderId = orderId;

  watchSub = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15000,
      distanceInterval: 30,
    },
    async ({ coords }) => {
      try {
        await orderService.updateDriverLocation(
          orderId,
          coords.latitude,
          coords.longitude,
          coords.accuracy ?? undefined,
        );
      } catch {
        /* offline */
      }
    },
  );

  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await orderService.updateDriverLocation(
      orderId,
      pos.coords.latitude,
      pos.coords.longitude,
      pos.coords.accuracy ?? undefined,
    );
  } catch {
    /* first fix may fail briefly */
  }

  return true;
}

export async function stopDriverLocationTracking(): Promise<void> {
  trackedOrderId = null;
  if (watchSub) {
    watchSub.remove();
    watchSub = null;
  }
}

function pickOrderIdForTracking(orders: Order[]): string | null {
  const active = orders.filter((o) => TRACKING_STATUSES.has(o.status));
  return active[0]?.id ?? null;
}

/** Keeps GPS upload aligned with the driver’s current assignments. */
export function syncDriverLocationTracking(orders: Order[]): void {
  const id = pickOrderIdForTracking(orders);
  void (async () => {
    if (!id) {
      await stopDriverLocationTracking();
      return;
    }
    if (trackedOrderId === id && watchSub) return;
    await startDriverLocationTracking(id);
  })();
}
