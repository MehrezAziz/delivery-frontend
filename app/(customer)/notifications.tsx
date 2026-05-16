import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { notificationService, Notification } from '../../services/api/notification.service';
import { syncNativeChatPreviewAfterThreadRead } from '../../services/notifications';
import { useTheme } from '../../contexts/ThemeContext';
import {
  groupNotificationsByThread,
  inboxGroupKey,
  sortGroups,
  type NotificationGroup,
} from '../../utils/notificationGrouping';

const PRIORITY_COLORS: Record<string, string> = {
  LOW: '#6b7280',
  MEDIUM: '#2563eb',
  HIGH: '#ea580c',
  CRITICAL: '#dc2626',
};

const TYPE_ICONS: Record<string, string> = {
  ORDER_CREATED: 'cube-outline',
  DRIVER_ASSIGNED: 'person-outline',
  DRIVER_ARRIVED: 'flag-outline',
  PACKAGE_PICKED_UP: 'cube',
  DELIVERY_IN_PROGRESS: 'bicycle-outline',
  ORDER_DELIVERED: 'checkmark-circle',
  ORDER_CANCELLED: 'close-circle-outline',
  NO_DRIVER_FOUND: 'alert-circle-outline',
  WALLET_TOPUP_SUCCESS: 'wallet-outline',
  WALLET_TOPUP_FAILED: 'wallet-outline',
  LOW_WALLET_BALANCE: 'warning-outline',
  REFUND_PROCESSED: 'arrow-undo-outline',
  REFERRAL_BONUS: 'gift-outline',
  ACCOUNT_SUSPENDED: 'lock-closed-outline',
  DISPUTE_OPENED: 'alert-outline',
  DISPUTE_RESOLVED: 'checkmark-done-outline',
  SUPPORT_TICKET_REPLY: 'chatbubble-outline',
  NEW_MESSAGE_FROM_DRIVER: 'chatbubble-ellipses-outline',
};

export default function CustomerNotifications() {
  const router = useRouter();
  const { colors } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [sortBy, setSortBy] = useState<'sentAt' | 'type'>('sentAt');

  const grouped = useMemo(() => {
    const g = groupNotificationsByThread(notifications);
    return sortGroups(g, sortBy);
  }, [notifications, sortBy]);

  const loadNotifications = useCallback(async (pageNum = 1, append = false) => {
    try {
      const result = await notificationService.getNotifications(pageNum, 25, 'all', sortBy);
      if (append) {
        setNotifications((prev) => [...prev, ...result.data]);
      } else {
        setNotifications(result.data);
      }
      setHasMore(pageNum < result.meta.totalPages);
      setPage(pageNum);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sortBy]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications(1, false);
    }, [loadNotifications]),
  );

  const handleGroupPress = (g: NotificationGroup) => {
    const item = g.latest;
    if (g.unreadCount > 0) {
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => (inboxGroupKey(n) === g.groupKey && !n.readAt ? { ...n, readAt: now } : n)),
      );
      notificationService
        .markThreadAsRead(g.groupKey)
        .then(() => syncNativeChatPreviewAfterThreadRead(g.groupKey))
        .catch(() => {});
    }
    if (item.type === 'REFERRAL_BONUS') {
      const match = item.body?.match(/([\d.,]+)\s*coins/i);
      const amount = match?.[1] ? encodeURIComponent(match[1]) : '';
      router.push(
        amount
          ? (`/(customer)/wallet?referralBonus=1&amount=${amount}` as never)
          : ('/(customer)/wallet?referralBonus=1' as never),
      );
    } else if (item.relatedEntityType === 'Order' && item.relatedEntityId) {
      router.push(`/(customer)/order-detail?orderId=${item.relatedEntityId}`);
    } else if (item.relatedEntityType === 'ChatRoom' && item.relatedEntityId) {
      router.push(`/(customer)/order-chat?orderId=${item.relatedEntityId}`);
    } else if (item.relatedEntityType === 'SupportTicket' && item.relatedEntityId) {
      router.push(`/(customer)/support-chat?ticketId=${item.relatedEntityId}`);
    } else if (item.relatedEntityType === 'Wallet') {
      router.push('/(customer)/wallet');
    } else if (
      item.type === 'WITHDRAWAL_PROCESSED' ||
      item.relatedEntityType === 'WithdrawalRequest'
    ) {
      router.push('/(customer)/wallet?tab=transactions' as never);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  };

  const renderItem = ({ item: g }: { item: NotificationGroup }) => {
    const item = g.latest;
    const iconName = TYPE_ICONS[item.type] || 'notifications-outline';
    const priorityColor = PRIORITY_COLORS[item.priority] || '#6b7280';
    const unread = g.unreadCount > 0;

    return (
      <TouchableOpacity
        style={[s.notifItem, { backgroundColor: colors.card, borderBottomColor: colors.border }, unread && s.unread]}
        onPress={() => handleGroupPress(g)}
        activeOpacity={0.7}
      >
        <View style={[s.iconCircle, { backgroundColor: priorityColor + '18' }]}>
          <Ionicons name={iconName as any} size={22} color={priorityColor} />
        </View>
        <View style={s.notifContent}>
          <Text style={[s.notifTitle, { color: colors.text }, unread && s.boldText]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[s.notifBody, { color: colors.textSecondary }]} numberOfLines={2}>{item.body}</Text>
          <Text style={[s.notifTime, { color: colors.textTertiary }]}>
            {formatTime(item.sentAt)}
            {g.itemCount > 1 ? ` · ${g.itemCount} in thread` : ''}
          </Text>
        </View>
        {unread && g.unreadCount > 1 ? (
          <View style={[s.countBadge, { backgroundColor: colors.primary }]}>
            <Text style={s.countBadgeText}>{g.unreadCount > 99 ? '99+' : g.unreadCount}</Text>
          </View>
        ) : unread ? (
          <View style={[s.unreadDot, { backgroundColor: colors.primary }]} />
        ) : null}
      </TouchableOpacity>
    );
  };

  if (loading && notifications.length === 0) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.notifToolbar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.toolbarHint, { color: colors.textSecondary }]} numberOfLines={2}>
          Grouped by chat, order, ticket…
        </Text>
        <TouchableOpacity
          onPress={() => {
            notificationService.markAllAsRead();
            setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
          }}
          hitSlop={8}
        >
          <Text style={[s.markAllText, { color: colors.primary }]}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      <View style={[s.sortRow, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={[s.sortLabel, { color: colors.textSecondary }]}>Sort</Text>
        <TouchableOpacity
          style={[s.sortChip, sortBy === 'sentAt' && { backgroundColor: colors.primary + '22' }]}
          onPress={() => setSortBy('sentAt')}
        >
          <Text style={[s.sortChipText, { color: sortBy === 'sentAt' ? colors.primary : colors.text }]}>Time</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.sortChip, sortBy === 'type' && { backgroundColor: colors.primary + '22' }]}
          onPress={() => setSortBy('type')}
        >
          <Text style={[s.sortChipText, { color: sortBy === 'type' ? colors.primary : colors.text }]}>Type</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={grouped}
        keyExtractor={(g) => g.groupKey}
        renderItem={renderItem}
        contentContainerStyle={grouped.length === 0 ? s.emptyContainer : { paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadNotifications(1, false); }} />
        }
        onEndReached={() => {
          if (hasMore && !loading) loadNotifications(page + 1, true);
        }}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Ionicons name="notifications-off-outline" size={64} color={colors.border} />
            <Text style={[s.emptyText, { color: colors.textTertiary }]}>No notifications yet</Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  notifToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toolbarHint: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 16 },
  markAllText: { fontSize: 12, fontWeight: '700' },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  sortLabel: { fontSize: 12, fontWeight: '600', marginRight: 4 },
  sortChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: '#f3f4f6' },
  sortChipText: { fontSize: 13, fontWeight: '600' },
  notifItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 14, borderBottomWidth: 1,
  },
  unread: { backgroundColor: '#eff6ff' },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22, justifyContent: 'center',
    alignItems: 'center', marginRight: 12,
  },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: 15, marginBottom: 2 },
  boldText: { fontWeight: '700' },
  notifBody: { fontSize: 13, lineHeight: 18 },
  notifTime: { fontSize: 11, marginTop: 4 },
  unreadDot: {
    width: 10, height: 10, borderRadius: 5, marginLeft: 8,
  },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 100 },
  emptyText: { fontSize: 16, marginTop: 12 },
});
