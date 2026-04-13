import { useEffect, useState, useCallback } from 'react';
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
  NEW_ORDER_AVAILABLE: 'notifications-outline',
  ORDER_EXPIRED: 'time-outline',
  ORDER_CANCELLED_BY_CUSTOMER: 'close-circle-outline',
  PICKUP_REMINDER: 'alarm-outline',
  DOCUMENTS_SUBMITTED: 'document-outline',
  VERIFICATION_APPROVED: 'checkmark-circle',
  VERIFICATION_REJECTED: 'close-circle',
  DRIVER_ACCOUNT_SUSPENDED: 'lock-closed-outline',
  PAYMENT_RECEIVED_COD: 'cash-outline',
  PAYMENT_CREDITED_WALLET: 'wallet-outline',
  NEGATIVE_BALANCE_WARNING: 'warning-outline',
  ACCOUNT_BLOCKED_DEBT: 'lock-closed',
  WITHDRAWAL_PROCESSED: 'arrow-down-outline',
  CUSTOMER_RATED_YOU: 'star-outline',
  PERFORMANCE_MILESTONE: 'trophy-outline',
  NEW_MESSAGE_FROM_CUSTOMER: 'chatbubble-ellipses-outline',
};

export default function DriverNotifications() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

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
      notificationService.markAllAsRead().catch(() => {});
    }, [loadNotifications]),
  );

  const handleNotificationPress = (item: Notification) => {
    if (!item.readAt) {
      notificationService.markAsRead(item.id).catch(() => {});
    }
    if (item.relatedEntityType === 'Order' && item.relatedEntityId) {
      if (item.type === 'NEW_ORDER_AVAILABLE') {
        router.push(`/(driver)/available-orders?urgentOrderId=${item.relatedEntityId}`);
      } else {
        router.push(`/(driver)/order-detail?orderId=${item.relatedEntityId}`);
      }
    } else if (item.relatedEntityType === 'ChatRoom' && item.relatedEntityId) {
      router.push(`/(driver)/order-chat?orderId=${item.relatedEntityId}`);
    } else if (item.relatedEntityType === 'SupportTicket' && item.relatedEntityId) {
      router.push(`/(driver)/support-chat?ticketId=${item.relatedEntityId}`);
    } else if (item.relatedEntityType === 'Rating') {
      router.push('/(driver)/my-ratings');
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

  const renderItem = ({ item }: { item: Notification }) => {
    const iconName = TYPE_ICONS[item.type] || 'notifications-outline';
    const priorityColor = PRIORITY_COLORS[item.priority] || '#6b7280';
    const isUnread = !item.readAt;

    return (
      <TouchableOpacity
        style={[s.notifItem, { backgroundColor: colors.card, borderBottomColor: colors.border }, isUnread && { backgroundColor: isDark ? '#0c4a6e' : '#eff6ff' }]}
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
        {isUnread && <View style={[s.unreadDot, { backgroundColor: colors.primary }]} />}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={[s.header, { paddingTop: insets.top + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(driver)/home')} style={[s.backBtn, { backgroundColor: colors.surfaceVariant }]}>
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
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={notifications.length === 0 ? s.emptyContainer : { paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadNotifications(1); }} />
        }
        onEndReached={() => {
          if (hasMore && !loading) loadNotifications(page + 1, true);
        }}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Ionicons name="notifications-off-outline" size={64} color="#d1d5db" />
            <Text style={s.emptyText}>No notifications yet</Text>
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
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 100 },
  emptyText: { fontSize: 16, color: '#9ca3af', marginTop: 12 },
});
