import { getClient } from './client';
import type { Notification } from '@kitchenledger/types';
import type { AxiosResponse } from 'axios';

export const notificationsApi = {
  list: (params?: {
    page?: number;
    size?: number;
    unreadOnly?: boolean;
  }): Promise<AxiosResponse<Notification[]>> =>
    getClient().get('/api/notifications', { params }),

  markRead: (id: string): Promise<AxiosResponse<Notification>> =>
    getClient().patch(`/api/notifications/${id}/read`),

  markAllRead: (): Promise<AxiosResponse<void>> =>
    getClient().post('/api/notifications/mark-all-read'),

  getUnreadCount: (): Promise<AxiosResponse<{ count: number }>> =>
    getClient().get('/api/notifications/unread-count'),

  registerDevice: (data: {
    token: string;
    platform: 'ios' | 'android' | 'web';
  }): Promise<AxiosResponse<void>> =>
    getClient().post('/api/notifications/devices', data),

  unregisterDevice: (token: string): Promise<AxiosResponse<void>> =>
    getClient().delete(`/api/notifications/devices/${encodeURIComponent(token)}`),
};
