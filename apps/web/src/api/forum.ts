import type { ForumCosmeticsDto, ForumLinkDto, ForumLinkStatusDto } from '@streets/shared';
import { api } from './client.js';

export const forumApi = {
  status: () => api.get<ForumLinkStatusDto>('/forum/status'),
  start: () => api.post<{ url: string }>('/forum/start'),
  finish: (proof: string) => api.post<{ link: ForumLinkDto }>('/forum/finish', { proof }),
  unlink: () => api.post<{ ok: true }>('/forum/unlink'),
  setCosmeticsVisibility: (visible: boolean) => api.put<ForumCosmeticsDto>('/forum/cosmetics-visibility', { visible }),
};
