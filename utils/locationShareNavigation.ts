/** Resolve location-share request id from notification / FCM payload fields. */
export function resolveLocationShareRequestId(fields: {
  relatedEntityId?: string | null;
  groupKey?: string | null;
}): string | null {
  const direct = (fields.relatedEntityId || '').trim();
  if (direct) return direct;
  const gk = (fields.groupKey || '').trim();
  const prefix = 'LocationShareRequest:';
  if (gk.startsWith(prefix)) {
    const id = gk.slice(prefix.length).trim();
    return id || null;
  }
  return null;
}

/** User B — incoming request to share GPS. */
export function isLocationShareIncomingRequest(item: {
  type?: string | null;
  relatedEntityType?: string | null;
}): boolean {
  const type = (item.type || '').trim();
  if (type === 'LOCATION_SHARE_FULFILLED' || type === 'LOCATION_SHARE_DECLINED') return false;
  return (
    type === 'LOCATION_SHARE_REQUEST' ||
    item.relatedEntityType === 'LocationShareRequest'
  );
}

/** User A — contact shared or declined (create-order flow). */
export function isLocationShareRequesterOutcome(item: {
  type?: string | null;
}): boolean {
  const type = (item.type || '').trim();
  return type === 'LOCATION_SHARE_FULFILLED' || type === 'LOCATION_SHARE_DECLINED';
}

export function isLocationShareNotification(item: {
  type?: string | null;
  relatedEntityType?: string | null;
}): boolean {
  return isLocationShareIncomingRequest(item) || isLocationShareRequesterOutcome(item);
}

export function locationShareRequesterRoute(): string {
  return '/(customer)/create-order';
}

export function locationShareRequestRoute(
  requestId: string,
  role: 'customer' | 'driver' = 'customer',
): string {
  const q = encodeURIComponent(requestId);
  if (role === 'driver') return `/(driver)/share-location-request?id=${q}`;
  return `/(customer)/share-location-request?id=${q}`;
}
