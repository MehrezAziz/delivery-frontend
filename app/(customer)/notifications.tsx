import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationService, Notification } from '../../services/api/notification.service';
import { useTheme } from '../../contexts/ThemeContext';

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

const GROUP_UNSEEN_TYPES = new Set(['SUPPORT_TICKET_REPLY', 'NEW_MESSAGE_FROM_DRIVER']);

type DisplayNotification = Notification & {
  unseenCount?: number;
};

export default function CustomerNotifications() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const displayedNotifications = useMemo<DisplayNotification[]>(() => {
    const grouped: DisplayNotification[] = [];
    const groupedByConversation = new Map<string, DisplayNotification>();
    for (const item of notifications) {
      const canGroup = !item.readAt && GROUP_UNSEEN_TYPES.has(item.type);
      if (!canGroup) {
        grouped.push(item);
        continue;
      }
      const conversationKey = `${item.type}:${item.relatedEntityType || 'none'}:${item.relatedEntityId || item.id}`;
      const existing = groupedByConversation.get(conversationKey);
      if (!existing) {
        const first: DisplayNotification = { ...item, unseenCount: 1 };
        groupedByConversation.set(conversationKey, first);
        grouped.push(first);
      } else {
        existing.unseenCount = (existing.unseenCount || 1) + 1;
      }
    }
    return grouped;
  }, [notifications]);

  const loadNotifications = useCallback(async (pageNum = 1, append = false) => {
    try {
      const result = await notificationService.getNotifications(pageNum, 20);
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
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNotifications(1);
      // Mark all as read when opening
      notificationService.markAllAsRead().catch(() => {});
    }, [loadNotifications]),
  );

  const handleNotificationPress = (item: Notification) => {
    if (!item.readAt) {
      notificationService.markAsRead(item.id).catch(() => {});
    }
    if (item.relatedEntityType === 'Order' && item.relatedEntityId) {
      router.push(`/(customer)/order-detail?orderId=${item.relatedEntityId}`);
    } else if (item.relatedEntityType === 'ChatRoom' && item.relatedEntityId) {
      router.push(`/(customer)/order-chat?orderId=${item.relatedEntityId}`);
    } else if (item.relatedEntityType === 'SupportTicket' && item.relatedEntityId) {
      router.push(`/(customer)/support-chat?ticketId=${item.relatedEntityId}`);
    } else if (item.relatedEntityType === 'Wallet') {
      router.push('/(customer)/wallet');
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  };

  const renderItem = ({ item }: { item: DisplayNotification }) => {
    const iconName = TYPE_ICONS[item.type] || 'notifications-outline';
    const priorityColor = PRIORITY_COLORS[item.priority] || '#6b7280';
    const isUnread = !item.readAt;

    return (
      <TouchableOpacity
        style={[s.notifItem, { backgroundColor: colors.card, borderBottomColor: colors.border }, isUnread && s.unread]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View style={[s.iconCircle, { backgroundColor: priorityColor + '18' }]}>
          <Ionicons name={iconName as any} size={22} color={priorityColor} />
        </View>
        <View style={s.notifContent}>
          <Text style={[s.notifTitle, { color: colors.text }, isUnread && s.boldText]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[s.notifBody, { color: colors.textSecondary }]} numberOfLines={2}>{item.body}</Text>
          <Text style={[s.notifTime, { color: colors.textTertiary }]}>{formatTime(item.sentAt)}</Text>
        </View>
        {isUnread && item.unseenCount && item.unseenCount > 1 ? (
          <View style={[s.countBadge, { backgroundColor: colors.primary }]}>
            <Text style={s.countBadgeText}>{item.unseenCount}</Text>
          </View>
        ) : isUnread ? (
          <View style={[s.unreadDot, { backgroundColor: colors.primary }]} />
        ) : null}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(customer)/home')} style={[s.backBtn, { backgroundColor: colors.surfaceVariant }]}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Notifications</Text>
        <TouchableOpacity
          onPress={() => {
            notificationService.markAllAsRead();
            setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
          }}
        >
          <Text style={[s.markAllText, { color: colors.primary }]}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={displayedNotifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={displayedNotifications.length === 0 ? s.emptyContainer : { paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadNotifications(1); }} />
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#f3f4f6',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  markAllText: { fontSize: 13, color: '#0284c7', fontWeight: '600' },
  notifItem: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  unread: { backgroundColor: '#eff6ff' },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22, justifyContent: 'center',
    alignItems: 'center', marginRight: 12,
  },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: 15, color: '#111', marginBottom: 2 },
  boldText: { fontWeight: '700' },
  notifBody: { fontSize: 13, color: '#6b7280', lineHeight: 18 },
  notifTime: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  unreadDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: '#0284c7', marginLeft: 8,
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
  emptyText: { fontSize: 16, color: '#9ca3af', marginTop: 12 },
});
