import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { notificationService } from '../services/api/notification.service';

function chatGroupKey(orderId: string) {
  return `chat:${orderId}`;
}

/** Polls unread notification count for the order chat thread (`chat:<orderId>`). */
export function useOrderChatUnread(orderId: string | undefined, enabled = true) {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!orderId || !enabled) {
      setUnread(0);
      return;
    }
    try {
      const { counts } = await notificationService.getBulkThreadUnreadCounts([chatGroupKey(orderId)]);
      setUnread(counts[chatGroupKey(orderId)] ?? 0);
    } catch {
      setUnread(0);
    }
  }, [orderId, enabled]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!orderId || !enabled) return;
    const t = setInterval(() => void refresh(), 12000);
    return () => clearInterval(t);
  }, [orderId, enabled, refresh]);

  return { unread, refresh };
}

export async function fetchChatUnreadMapForOrders(orderIds: string[]): Promise<Record<string, number>> {
  const keys = orderIds.map((id) => chatGroupKey(id));
  if (keys.length === 0) return {};
  try {
    const { counts } = await notificationService.getBulkThreadUnreadCounts(keys);
    const byOrder: Record<string, number> = {};
    for (const id of orderIds) {
      byOrder[id] = counts[chatGroupKey(id)] ?? 0;
    }
    return byOrder;
  } catch {
    return {};
  }
}
