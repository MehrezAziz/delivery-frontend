import { api } from './client';

export interface Notification {
  id: string;
  userId: string;
  userType: string;
  title: string;
  body: string;
  type: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  channels: string[];
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  actionButtons: any[] | null;
  expiresAt: string | null;
  groupKey: string | null;
  sentAt: string;
  readAt: string | null;
  deliveryStatus: string;
}

export interface NotificationPage {
  data: Notification[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export const notificationService = {
  registerToken: (token: string, platform: 'android' | 'ios') =>
    api.post('/notifications/register-token', { token, platform }),

  getNotifications: (page = 1, limit = 20, status?: 'read' | 'unread' | 'all') => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status && status !== 'all') params.set('status', status);
    return api.get<NotificationPage>(`/notifications?${params.toString()}`);
  },

  getUnreadCount: () =>
    api.get<{ count: number }>('/notifications/unread-count'),

  markAsRead: (id: string) =>
    api.patch(`/notifications/${id}/read`),

  markAllAsRead: () =>
    api.patch('/notifications/read-all'),
};

// Clear FCM token on logout (call before clearing AsyncStorage)
export async function clearPushToken() {
  try {
    await notificationService.registerToken('', 'android');
  } catch {
    // Ignore errors during logout
  }
}
