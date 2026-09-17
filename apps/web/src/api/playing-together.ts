import type { AdminWireDto, AllianceWireDto, ContactLookupDto, ContactsDto } from '@streets/shared';
import { api } from './client.js';

export const wireApi = {
  list: (before?: string) => api.get<AllianceWireDto>(`/game/alliance/wire${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  post: (body: string) => api.post<AllianceWireDto>('/game/alliance/wire', { body }),
  remove: (postId: string) => api.post<AllianceWireDto>(`/game/alliance/wire/${encodeURIComponent(postId)}/remove`, {}),
};

export const contactsApi = {
  list: () => api.get<ContactsDto>('/game/contacts'),
  lookup: (publicPimpId: number) => api.get<ContactLookupDto>(`/game/contacts/${publicPimpId}`),
  add: (targetPublicPimpId: number, note?: string) => api.post<ContactsDto>('/game/contacts', note === undefined ? { targetPublicPimpId } : { targetPublicPimpId, note }),
  note: (publicPimpId: number, note: string) => api.post<ContactsDto>(`/game/contacts/${publicPimpId}/note`, { note }),
  remove: (publicPimpId: number) => api.post<ContactsDto>(`/game/contacts/${publicPimpId}/remove`, {}),
};

export const adminWireApi = {
  list: (allianceId: string) => api.get<AdminWireDto>(`/admin/alliances/${encodeURIComponent(allianceId)}/wire`),
  remove: (postId: string, reason: string) => api.post<{ ok: true }>(`/admin/wire/${encodeURIComponent(postId)}/remove`, { reason }),
};
