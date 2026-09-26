import type { AdminWireDto, AllianceWireDto, ContactKindDto, ContactLookupDto, ContactsDto, PlayerDirectoryDto, PlayerDirectoryView, WirePostKindDto } from '@streets/shared';
import { api } from './client.js';

export const wireApi = {
  list: (before?: string) => api.get<AllianceWireDto>(`/game/alliance/wire${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  post: (body: string, kind: WirePostKindDto = 'MESSAGE', pinned = false) => api.post<AllianceWireDto>('/game/alliance/wire', { body, kind, pinned }),
  pin: (postId: string, pinned: boolean) => api.post<AllianceWireDto>(`/game/alliance/wire/${encodeURIComponent(postId)}/pin`, { pinned }),
  remove: (postId: string) => api.post<AllianceWireDto>(`/game/alliance/wire/${encodeURIComponent(postId)}/remove`, {}),
};

export const playersApi = {
  list: (view: PlayerDirectoryView = 'all', query = '', page = 1) => {
    const params = new URLSearchParams({ view, page: String(page) });
    if (query.trim()) params.set('q', query.trim());
    return api.get<PlayerDirectoryDto>(`/game/players?${params.toString()}`);
  },
};

export const contactsApi = {
  list: () => api.get<ContactsDto>('/game/contacts'),
  lookup: (publicPimpId: number) => api.get<ContactLookupDto>(`/game/contacts/${publicPimpId}`),
  add: (targetPublicPimpId: number, note?: string, kind: ContactKindDto = 'CONTACT') => api.post<ContactsDto>('/game/contacts', note === undefined ? { targetPublicPimpId, kind } : { targetPublicPimpId, kind, note }),
  note: (publicPimpId: number, note: string) => api.post<ContactsDto>(`/game/contacts/${publicPimpId}/note`, { note }),
  kind: (publicPimpId: number, kind: ContactKindDto) => api.post<ContactsDto>(`/game/contacts/${publicPimpId}/kind`, { kind }),
  remove: (publicPimpId: number) => api.post<ContactsDto>(`/game/contacts/${publicPimpId}/remove`, {}),
};

export const adminWireApi = {
  list: (allianceId: string) => api.get<AdminWireDto>(`/admin/alliances/${encodeURIComponent(allianceId)}/wire`),
  remove: (postId: string, reason: string) => api.post<{ ok: true }>(`/admin/wire/${encodeURIComponent(postId)}/remove`, { reason }),
};
