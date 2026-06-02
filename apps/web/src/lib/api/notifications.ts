import { apiGet, apiPatch, apiPost } from './client';

export interface Notification {
  id: string;
  type: string;
  title: string;
  content: string;
  level: string;
  readAt: string | null;
  actionUrl: string | null;
  createdAt: string;
}

export function listNotifications(): Promise<Notification[]> {
  return apiGet<Notification[]>('/api/notifications');
}

export function getUnreadCount(): Promise<{ count: number }> {
  return apiGet<{ count: number }>('/api/notifications/unread-count');
}

export function markNotificationRead(id: string): Promise<void> {
  return apiPatch(`/api/notifications/${id}/read`);
}

export function markAllNotificationsRead(): Promise<void> {
  return apiPost('/api/notifications/mark-all-read');
}
