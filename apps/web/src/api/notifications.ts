import type { NotificationSettingsDto, PushSubscribeInput, UpdateNotificationSettingsInput } from '@streets/shared';
import { api } from './client.js';

export const notificationsApi = {
  settings: () => api.get<NotificationSettingsDto>('/notifications/settings'),

  update: (input: UpdateNotificationSettingsInput) =>
    api.put<NotificationSettingsDto>('/notifications/settings', input),

  subscribe: (input: PushSubscribeInput) =>
    api.post<NotificationSettingsDto>('/notifications/push/subscriptions', input),

  removeDevice: (id: string) =>
    api.delete<NotificationSettingsDto>(`/notifications/push/subscriptions/${encodeURIComponent(id)}`),

  forget: (endpoint: string) => api.post<{ ok: true }>('/notifications/push/forget', { endpoint }),

  test: () => api.post<{ ok: true; devices: number; delivered: number }>('/notifications/push/test'),
};
