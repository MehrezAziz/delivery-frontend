/** Merge calendar date from `picked` into `base`, keeping `base`’s time-of-day. */
export function mergeDatePart(base: Date, picked: Date): Date {
  const out = new Date(base.getTime());
  out.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return out;
}

/** Merge clock time from `picked` into `base`, keeping `base`’s calendar date. */
export function mergeTimePart(base: Date, picked: Date): Date {
  const out = new Date(base.getTime());
  out.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return out;
}

/**
 * When pickup is enabled, enforce pickup strictly after publish (publish before pickup).
 * If pickup would be on or before publish, bump pickup to 15 minutes after publish.
 */
export function enforcePickupAfterPublish(
  publish: Date,
  pickup: Date,
  pickupEnabled: boolean,
): { publish: Date; pickup: Date } {
  const p = new Date(publish.getTime());
  const k = new Date(pickup.getTime());
  if (!pickupEnabled) return { publish: p, pickup: k };
  if (k.getTime() <= p.getTime()) {
    k.setTime(p.getTime() + 15 * 60 * 1000);
  }
  return { publish: p, pickup: k };
}
