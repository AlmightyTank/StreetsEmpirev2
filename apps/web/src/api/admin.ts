import type {
  AdminAccountDetailDto,
  AdminAccountSearchDto,
  AdminAccountStatusFilter,
  AdminAuditFilters,
  AdminAuditLogDto,
  AdminCloseExpiredResultDto,
  AdminCreateBannerInput,
  AdminCreateNewsInput,
  AdminNewsDto,
  AdminPlayerBattlesDto,
  AdminPlayerDto,
  AdminRoundHealthDto,
  AdminRoundResultDto,
  AdminRoundsDto,
  AdminScheduleRoundInput,
  AdminSiteBannersDto,
  AdminUpdateNewsInput,
  AdminUpdateRoundInput,
} from '@streets/shared';
import { api } from './client.js';

const enc = encodeURIComponent;
const roundPath = (roundId: string, action: string) => `/admin/rounds/${enc(roundId)}/${action}`;
const accountPath = (accountId: string, action = '') => `/admin/accounts/${enc(accountId)}${action ? `/${action}` : ''}`;

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const adminApi = {
  rounds: () => api.get<AdminRoundsDto>('/admin/rounds'),
  scheduleRound: (input: AdminScheduleRoundInput) => api.post<AdminRoundResultDto>('/admin/rounds', input),
  openRegistration: (roundId: string) => api.post<AdminRoundResultDto>(roundPath(roundId, 'open-registration')),
  startRound: (roundId: string, confirmHandoff: boolean) => api.post<AdminRoundResultDto>(roundPath(roundId, 'start'), { confirmHandoff }),
  endRoundEarly: (roundId: string, reason: string) => api.post<AdminRoundResultDto>(roundPath(roundId, 'end-early'), { reason }),
  archiveRound: (roundId: string) => api.post<AdminRoundResultDto>(roundPath(roundId, 'archive')),
  updateRound: (roundId: string, input: AdminUpdateRoundInput) => api.post<AdminRoundResultDto>(roundPath(roundId, 'update'), input),
  roundHealth: (roundId: string) => api.get<AdminRoundHealthDto>(roundPath(roundId, 'health')),
  closeExpiredRounds: () => api.post<AdminCloseExpiredResultDto>('/admin/rounds/close-expired'),

  news: () => api.get<AdminNewsDto>('/admin/news'),
  createNews: (input: AdminCreateNewsInput) => api.post<AdminNewsDto>('/admin/news', input),
  updateNews: (newsId: string, input: AdminUpdateNewsInput) => api.post<AdminNewsDto>(`/admin/news/${enc(newsId)}/update`, input),
  deleteNews: (newsId: string, reason: string) => api.post<AdminNewsDto>(`/admin/news/${enc(newsId)}/delete`, { reason }),
  mirrorNews: (newsId: string) => api.post<AdminNewsDto>(`/admin/news/${enc(newsId)}/mirror`),

  banners: () => api.get<AdminSiteBannersDto>('/admin/banners'),
  createBanner: (input: AdminCreateBannerInput) => api.post<AdminSiteBannersDto>('/admin/banners', input),
  endBanner: (bannerId: string) => api.post<AdminSiteBannersDto>(`/admin/banners/${enc(bannerId)}/end`),

  accounts: (params: { query?: string | undefined; status?: AdminAccountStatusFilter | undefined; limit?: number | undefined } = {}) =>
    api.get<AdminAccountSearchDto>(`/admin/accounts${queryString(params)}`),
  account: (accountId: string) => api.get<AdminAccountDetailDto>(accountPath(accountId)),
  deactivateAccount: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'deactivate'), { reason }),
  reactivateAccount: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'reactivate'), { reason }),
  revokeSessions: (accountId: string, reason: string, sessionId?: string) =>
    api.post<AdminAccountDetailDto>(accountPath(accountId, 'sessions/revoke'), { reason, ...(sessionId ? { sessionId } : {}) }),
  renameAccount: (accountId: string, username: string, reason: string) =>
    api.post<AdminAccountDetailDto>(accountPath(accountId, 'rename'), { username, reason }),
  resetProfile: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'reset-profile'), { reason }),
  setAdmin: (accountId: string, isAdmin: boolean, reason: string) =>
    api.post<AdminAccountDetailDto>(accountPath(accountId, 'admin'), { isAdmin, reason }),

  player: (roundPlayerId: string) => api.get<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}`),
  playerBattles: (roundPlayerId: string, before?: string) =>
    api.get<AdminPlayerBattlesDto>(`/admin/players/${enc(roundPlayerId)}/battles${queryString({ before })}`),

  audit: (filters: AdminAuditFilters = {}) => api.get<AdminAuditLogDto>(`/admin/audit${queryString({ ...filters })}`),
};
