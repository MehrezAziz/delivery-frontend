import type { Notification } from '../services/api/notification.service';

export type NotificationGroup = {
  groupKey: string;
  latest: Notification;
  unreadCount: number;
  itemCount: number;
};

export function inboxGroupKey(n: Notification): string {
  if (n.groupKey?.trim()) return n.groupKey.trim();
  if (n.relatedEntityType && n.relatedEntityId) {
    return `${n.relatedEntityType}:${n.relatedEntityId}`;
  }
  return `singleton:${n.id}`;
}

/** Same grouping rules as the backend inbox preview (stable threads). */
export function groupNotificationsByThread(items: Notification[]): NotificationGroup[] {
  const map = new Map<string, Notification[]>();
  for (const n of items) {
    const key = inboxGroupKey(n);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(n);
  }
  const rows: NotificationGroup[] = [];
  for (const [groupKey, list] of map.entries()) {
    list.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
    const latest = list[0];
    const unreadCount = list.filter((x) => !x.readAt).length;
    rows.push({ groupKey, latest, unreadCount, itemCount: list.length });
  }
  return rows;
}

export function sortGroups(
  groups: NotificationGroup[],
  sortBy: 'sentAt' | 'type',
): NotificationGroup[] {
  const copy = [...groups];
  if (sortBy === 'type') {
    copy.sort((a, b) => {
      const t = a.latest.type.localeCompare(b.latest.type);
      if (t !== 0) return t;
      return new Date(b.latest.sentAt).getTime() - new Date(a.latest.sentAt).getTime();
    });
  } else {
    copy.sort((a, b) => new Date(b.latest.sentAt).getTime() - new Date(a.latest.sentAt).getTime());
  }
  return copy;
}
