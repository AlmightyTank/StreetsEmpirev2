import type {
  InAppNotificationFeedDto,
  NotificationSettingsDto,
  PushSubscribeInput,
  UpdateNotificationSettingsInput,
} from '@streets/shared';
import { api } from './client.js';

export const notificationsApi = {
  inbox: () => api.get<InAppNotificationFeedDto>('/notifications/in-app'),

  read: (id: string) =>
    api.post<{ ok: true }>(`/notifications/in-app/${encodeURIComponent(id)}/read`),

  readAll: () => api.post<{ ok: true }>('/notifications/in-app/read-all'),

  settings: () => api.get<NotificationSettingsDto>('/notifications/settings'),

  update: (input: UpdateNotificationSettingsInput) =>
    api.put<NotificationSettingsDto>('/notifications/settings', input),

  subscribe: (input: PushSubscribeInput) =>
    api.post<NotificationSettingsDto>('/notifications/push/subscriptions', input),

  removeDevice: (id: string) =>
    api.delete<NotificationSettingsDto>(`/notifications/push/subscriptions/${encodeURIComponent(id)}`),

  forget: (endpoint: string) => api.post<{ ok: true }>('/notifications/push/forget', { endpoint }),

  test: () => api.post<{
    ok: true;
    devices: number;
    delivered: number;
    failures: Array<{ deviceId: string; label: string | null; status: number | null; reason: string }>;
  }>('/notifications/push/test'),
};
