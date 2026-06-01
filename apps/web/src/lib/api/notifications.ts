import { apiGet } from './client';

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  metadata: unknown;
}

export function listNotifications(): Promise<Notification[]> {
  return apiGet<Notification[]>('/api/notifications');
}

export function getUnreadCount(): Promise<{ count: number }> {
  return apiGet<{ count: number }>('/api/notifications/unread-count');
}
