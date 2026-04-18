import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  notificationService,
  type Notification,
  type NotificationPreviewGroup,
} from '../services/api/notification.service';
import { shouldSuppressDriverOrderDetailNavigation } from '../utils/driverInboxNavigation';
import { useTheme } from '../contexts/ThemeContext';

type Variant = 'customer' | 'driver';

function navigateFromNotification(router: ReturnType<typeof useRouter>, item: Notification, variant: Variant) {
  if (variant === 'driver' && shouldSuppressDriverOrderDetailNavigation(item)) {
    return;
  }
  if (item.relatedEntityType === 'Order' && item.relatedEntityId) {
    if (variant === 'driver' && item.type === 'NEW_ORDER_AVAILABLE') {
      router.push(`/(driver)/available-orders?urgentOrderId=${item.relatedEntityId}` as any);
    } else if (variant === 'customer') {
      router.push(`/(customer)/order-detail?orderId=${item.relatedEntityId}` as any);
    } else if (variant === 'driver' && item.type === 'NEW_MESSAGE_FROM_CUSTOMER') {
      router.push(`/(driver)/order-chat?orderId=${item.relatedEntityId}` as any);
    } else {
      router.push(`/(driver)/order-detail?orderId=${item.relatedEntityId}` as any);
    }
    return;
  }
  if (item.relatedEntityType === 'ChatRoom' && item.relatedEntityId) {
    router.push(
      (variant === 'customer'
        ? `/(customer)/order-chat?orderId=${item.relatedEntityId}`
        : `/(driver)/order-chat?orderId=${item.relatedEntityId}`) as any,
    );
    return;
  }
  if (item.relatedEntityType === 'SupportTicket' && item.relatedEntityId) {
    router.push(
      (variant === 'customer'
        ? `/(customer)/support-chat?ticketId=${item.relatedEntityId}`
        : `/(driver)/support-chat?ticketId=${item.relatedEntityId}`) as any,
    );
    return;
  }
  if (item.relatedEntityType === 'Wallet' && variant === 'customer') {
    router.push('/(customer)/wallet' as any);
    return;
  }
  if (item.relatedEntityType === 'Rating' && variant === 'driver') {
    router.push('/(driver)/my-ratings' as any);
  }
}

type Props = {
  visible: boolean;
  onClose: () => void;
  variant: Variant;
  onOpenFullInbox: () => void;
  /** Called after mark-all-read succeeds so parent can clear header badge immediately. */
  onMarkAllRead?: () => void;
};

export function NotificationPreviewModal({ visible, onClose, variant, onOpenFullInbox, onMarkAllRead }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [groups, setGroups] = useState<NotificationPreviewGroup[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationService.getPreview(8);
      setGroups(res.data || []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return date.toLocaleDateString();
  };

  const onRowPress = (g: NotificationPreviewGroup) => {
    const item = g.latest;
    if (g.unreadCount > 0) {
      const now = new Date().toISOString();
      setGroups((prev) =>
        prev.map((row) =>
          row.groupKey === g.groupKey
            ? { ...row, unreadCount: 0, latest: { ...row.latest, readAt: row.latest.readAt || now } }
            : row,
        ),
      );
      notificationService.markThreadAsRead(g.groupKey).catch(() => {});
    }
    onClose();
    navigateFromNotification(router, item, variant);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={[
            s.sheet,
            {
              paddingBottom: insets.bottom + 16,
              backgroundColor: colors.card,
              borderTopColor: colors.border,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={s.grabberWrap}>
            <View style={[s.grabber, { backgroundColor: colors.border }]} />
          </View>
          <View style={s.sheetHeader}>
            <Text style={[s.sheetTitle, { color: colors.text }]}>Recent activity</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity
                onPress={async () => {
                  try {
                    await notificationService.markAllAsRead();
                  } catch {
                    /* ignore */
                  }
                  const now = new Date().toISOString();
                  setGroups((prev) =>
                    prev.map((g) => ({
                      ...g,
                      unreadCount: 0,
                      latest: { ...g.latest, readAt: g.latest.readAt || now },
                    })),
                  );
                  onMarkAllRead?.();
                  void load();
                }}
                hitSlop={12}
              >
                <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>Mark all read</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={26} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={[s.sheetHint, { color: colors.textSecondary }]}>
            Grouped by conversation & order. Open the full inbox for your complete history.
          </Text>

          {loading ? (
            <View style={s.loading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={groups}
              keyExtractor={(g) => g.groupKey}
              style={{ maxHeight: 360 }}
              ListEmptyComponent={
                <Text style={[s.empty, { color: colors.textTertiary }]}>{"You're all caught up."}</Text>
              }
              renderItem={({ item: g }) => {
                const unread = g.unreadCount > 0;
                return (
                  <TouchableOpacity
                    style={[s.row, { borderBottomColor: colors.border }, unread && { backgroundColor: isDark ? '#0c4a6e22' : '#eff6ff' }]}
                    onPress={() => onRowPress(g)}
                  >
                    <View style={[s.iconCircle, { backgroundColor: colors.primary + '22' }]}>
                      <Ionicons name="notifications" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.rowTitle, { color: colors.text }]} numberOfLines={1}>
                        {g.latest.title}
                      </Text>
                      <Text style={[s.rowBody, { color: colors.textSecondary }]} numberOfLines={2}>
                        {g.latest.body}
                      </Text>
                      <Text style={[s.rowMeta, { color: colors.textTertiary }]}>
                        {formatTime(g.latest.sentAt)}
                        {g.itemCount > 1 ? ` · ${g.itemCount} updates` : ''}
                      </Text>
                    </View>
                    {unread ? (
                      <View style={[s.badge, { backgroundColor: colors.primary }]}>
                        <Text style={s.badgeText}>{g.unreadCount > 99 ? '99+' : g.unreadCount}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <TouchableOpacity
            style={[s.cta, { backgroundColor: colors.primary }]}
            onPress={() => {
              onClose();
              onOpenFullInbox();
            }}
          >
            <Text style={s.ctaText}>View all notifications</Text>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    maxHeight: '88%',
  },
  grabberWrap: { alignItems: 'center', paddingVertical: 10 },
  grabber: { width: 40, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  sheetHint: { fontSize: 12, lineHeight: 17, marginBottom: 12 },
  loading: { paddingVertical: 32, alignItems: 'center' },
  empty: { textAlign: 'center', paddingVertical: 28, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowBody: { fontSize: 13, marginTop: 2 },
  rowMeta: { fontSize: 11, marginTop: 4 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cta: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
  ctaText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
