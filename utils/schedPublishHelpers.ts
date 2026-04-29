/** Helpers for Android split date+time publish scheduling (no `datetime` mode on Android). */

export function mergePublishDatePart(base: Date, picked: Date): Date {
  const n = new Date(base);
  n.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return n;
}

export function mergePublishTimePart(base: Date, picked: Date): Date {
  const n = new Date(base);
  n.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return n;
}

export function clampMinSchedule(d: Date): Date {
  const min = new Date(Date.now() + 60 * 1000);
  return d.getTime() < min.getTime() ? new Date(min) : d;
}
