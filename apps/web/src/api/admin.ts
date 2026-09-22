import type {
  AdminAccountDetailDto,
  AdminAccountSearchDto,
  AdminAccountStatusFilter,
  AdminAuditFilters,
  AdminAuditLogDto,
  AdminAuditPurgeResultDto,
  AdminAuditRetentionDto,
  AdminCloseExpiredResultDto,
  AdminCreateBannerInput,
  AdminCreateNewsInput,
  AdminDevBotsDto,
  AdminDiscordStatusDto,
  AdminGrantInput,
  AdminNewsDto,
  AdminPlayerBattlesDto,
  AdminPlayerDto,
  AdminPlayerSearchDto,
  AdminRoundHealthDto,
  AdminRoundResultDto,
  AdminRoundsDto,
  AdminRulesetViewDto,
  AdminScheduleRoundInput,
  AdminSignalsDto,
  AdminSuspensionLength,
  AdminSiteBannersDto,
  AdminUpdateNewsInput,
  AdminUpdateRoundInput,
  AdminVoidBattleResultDto,
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

  discord: () => api.get<AdminDiscordStatusDto>('/admin/discord'),
  requestDiscordResync: (input: { accountId?: string; reason?: string } = {}) => api.post<AdminDiscordStatusDto>('/admin/discord/resync', input),
  ruleset: (rulesetId: string, compare?: string) =>
    api.get<AdminRulesetViewDto>(`/admin/rulesets/${enc(rulesetId)}${queryString({ compare })}`),
  devBots: () => api.get<AdminDevBotsDto>('/admin/dev-bots'),
  seedDevBots: () => api.post<AdminDevBotsDto>('/admin/dev-bots/seed'),
  removeDevBots: (reason: string) => api.post<AdminDevBotsDto>('/admin/dev-bots/remove', { reason }),

  accounts: (params: { query?: string | undefined; status?: AdminAccountStatusFilter | undefined; limit?: number | undefined } = {}) =>
    api.get<AdminAccountSearchDto>(`/admin/accounts${queryString(params)}`),
  account: (accountId: string) => api.get<AdminAccountDetailDto>(accountPath(accountId)),
  deactivateAccount: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'deactivate'), { reason }),
  reactivateAccount: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'reactivate'), { reason }),
  suspendAccount: (accountId: string, length: AdminSuspensionLength, reason: string) =>
    api.post<AdminAccountDetailDto>(accountPath(accountId, 'suspend'), { length, reason }),
  liftSuspension: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'suspend/lift'), { reason }),
  revokeSessions: (accountId: string, reason: string, sessionId?: string) =>
    api.post<AdminAccountDetailDto>(accountPath(accountId, 'sessions/revoke'), { reason, ...(sessionId ? { sessionId } : {}) }),
  renameAccount: (accountId: string, username: string, reason: string) =>
    api.post<AdminAccountDetailDto>(accountPath(accountId, 'rename'), { username, reason }),
  resetProfile: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'reset-profile'), { reason }),
  setAdmin: (accountId: string, isAdmin: boolean, reason: string) =>
    api.post<AdminAccountDetailDto>(accountPath(accountId, 'admin'), { isAdmin, reason }),
  setBetaApproved: (accountId: string, approved: boolean, reason: string) =>
    api.post<AdminAccountDetailDto>(accountPath(accountId, 'beta-access'), { approved, reason }),
  resendVerification: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'email/resend'), { reason }),
  markEmailVerified: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'email/verify'), { reason }),
  unlinkForum: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'forum/unlink'), { reason }),

  players: (params: { query: string; roundId?: string | undefined; limit?: number | undefined }) =>
    api.get<AdminPlayerSearchDto>(`/admin/players${queryString(params)}`),
  player: (roundPlayerId: string) => api.get<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}`),
  grantToPlayer: (roundPlayerId: string, input: AdminGrantInput) => api.post<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}/grant`, input),
  voidBattle: (battleId: string, reason: string) => api.post<AdminVoidBattleResultDto>(`/admin/battles/${enc(battleId)}/void`, { reason }),
  signals: () => api.get<AdminSignalsDto>('/admin/signals'),
  /** 0.5.0-E. */
  voidConvoy: (tailId: string, reason: string) => api.post<{ tailId: string }>(`/admin/convoys/${enc(tailId)}/void`, { reason }),
  playerBattles: (roundPlayerId: string, before?: string) =>
    api.get<AdminPlayerBattlesDto>(`/admin/players/${enc(roundPlayerId)}/battles${queryString({ before })}`),

  audit: (filters: AdminAuditFilters = {}) => api.get<AdminAuditLogDto>(`/admin/audit${queryString({ ...filters })}`),
  auditRetention: () => api.get<AdminAuditRetentionDto>('/admin/audit/retention'),
  purgeAudit: (reason: string) => api.post<AdminAuditPurgeResultDto>('/admin/audit/purge', { reason }),
  /** A plain link: the browser downloads it with the session cookie it already has. */
  auditExportUrl: (filters: AdminAuditFilters = {}) => `/api/admin/audit/export${queryString({ ...filters, before: undefined })}`,
};
