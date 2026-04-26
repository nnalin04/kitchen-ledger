import { apiClient } from './client';

export interface AppNotification {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

export interface UnreadCountResponse {
  count: number;
}

export interface NotificationsListResponse {
  data: AppNotification[];
}

export const notificationsApi = {
  getUnreadCount: (): Promise<UnreadCountResponse> =>
    apiClient.get('/api/notifications/unread-count').then((r) => r.data),

  list: (params?: { limit?: number }): Promise<NotificationsListResponse> =>
    apiClient.get('/api/notifications', { params }).then((r) => r.data),

  markAllRead: (): Promise<void> =>
    apiClient.post('/api/notifications/mark-all-read').then((r) => r.data),
};
