import type {
  AdminBugReportQueueDto,
  AdminBugReportStatus,
  BugReportResolution,
  MonitoringSnapshotDto,
  AdminExploitFlagDto,
  AdminExploitFlagsDto,
  AdminCasinoDto,
  AdminLawDto,
  AdminLawPlayerDto,
  AdminMarketsDto,
  AdminPlayerStoresDto,
  AdminRoundBattlesDto,
  AdminShipmentsDto,
  AdminSuspiciousDto,
  AdminTurfDto,
  AdminTurfHistoryDto,
  AdminTurfRepair,
  ExploitFlagResolution,
  AdminAccountDeleteResultDto,
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
  AdminQuestContentDto,
  AdminRoundHealthDto,
  AdminRoundResultDto,
  AdminRoundsDto,
  AdminRulesetViewDto,
  AdminScheduleRoundInput,
  AdminSignalsDto,
  AdminSuspensionLength,
  AdminCommsMuteLength,
  AdminReportDetailDto,
  AdminReportQueueDto,
  AdminReportResolution,
  AdminReportStatus,
  AdminSiteBannersDto,
  AdminUpdateNewsInput,
  AdminUpdateRoundInput,
  AdminVoidBattleResultDto,
  AdminSurveyDefinitionInput,
  AdminSurveyDetailDto,
  AdminSurveyResultsDto,
  AdminSurveysDto,
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
  pauseRound: (roundId: string, reason: string) => api.post<AdminRoundResultDto>(roundPath(roundId, 'pause'), { reason }),
  resumeRound: (roundId: string, extend: boolean) => api.post<AdminRoundResultDto>(roundPath(roundId, 'resume'), { extend }),
  updateRound: (roundId: string, input: AdminUpdateRoundInput) => api.post<AdminRoundResultDto>(roundPath(roundId, 'update'), input),
  roundHealth: (roundId: string) => api.get<AdminRoundHealthDto>(roundPath(roundId, 'health')),
  closeExpiredRounds: () => api.post<AdminCloseExpiredResultDto>('/admin/rounds/close-expired'),

  questContent: (roundId: string) =>
    api.get<AdminQuestContentDto>(`/admin/quest-content${queryString({ roundId })}`),
  setQuestEnabled: (roundId: string, key: string, enabled: boolean, reason: string) =>
    api.post<AdminQuestContentDto>(
      `/admin/quest-content/quests/${enc(key)}${queryString({ roundId })}`,
      { enabled, reason },
    ),
  setFavorEnabled: (roundId: string, key: string, enabled: boolean, reason: string) =>
    api.post<AdminQuestContentDto>(
      `/admin/quest-content/favors/${enc(key)}${queryString({ roundId })}`,
      { enabled, reason },
    ),

  surveys: () => api.get<AdminSurveysDto>('/admin/surveys'),
  survey: (surveyId: string) => api.get<AdminSurveyDetailDto>(`/admin/surveys/${enc(surveyId)}`),
  surveyResults: (surveyId: string, params: { q?: string; questionId?: string; page?: number; pageSize?: number } = {}) =>
    api.get<AdminSurveyResultsDto>(`/admin/surveys/${enc(surveyId)}/results${queryString(params)}`),
  createSurvey: (input: AdminSurveyDefinitionInput) => api.post<AdminSurveyDetailDto>('/admin/surveys', input),
  updateSurvey: (surveyId: string, input: AdminSurveyDefinitionInput) =>
    api.post<AdminSurveyDetailDto>(`/admin/surveys/${enc(surveyId)}/update`, input),
  publishSurvey: (surveyId: string) => api.post<AdminSurveyDetailDto>(`/admin/surveys/${enc(surveyId)}/publish`, {}),
  closeSurvey: (surveyId: string, reason: string) =>
    api.post<AdminSurveyDetailDto>(`/admin/surveys/${enc(surveyId)}/close`, { reason }),

  news: () => api.get<AdminNewsDto>('/admin/news'),
  createNews: (input: AdminCreateNewsInput) => api.post<AdminNewsDto>('/admin/news', input),
  updateNews: (newsId: string, input: AdminUpdateNewsInput) => api.post<AdminNewsDto>(`/admin/news/${enc(newsId)}/update`, input),
  deleteNews: (newsId: string, reason: string) => api.post<AdminNewsDto>(`/admin/news/${enc(newsId)}/delete`, { reason }),
  mirrorNews: (newsId: string) => api.post<AdminNewsDto>(`/admin/news/${enc(newsId)}/mirror`),
  resendNewsToDiscord: (newsId: string) => api.post<AdminNewsDto>(`/admin/news/${enc(newsId)}/discord`),

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
  banAccount: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'ban'), { reason }),
  unbanAccount: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'unban'), { reason }),
  deactivateAccount: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'deactivate'), { reason }),
  reactivateAccount: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'reactivate'), { reason }),
  suspendAccount: (accountId: string, length: AdminSuspensionLength, reason: string) =>
    api.post<AdminAccountDetailDto>(accountPath(accountId, 'suspend'), { length, reason }),
  liftSuspension: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'suspend/lift'), { reason }),
  // 0.9.0-H moderation.
  muteComms: (accountId: string, length: AdminCommsMuteLength, reason: string) =>
    api.post<AdminAccountDetailDto>(accountPath(accountId, 'comms-mute'), { length, reason }),
  unmuteComms: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'comms-mute/lift'), { reason }),
  addNote: (accountId: string, body: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'notes'), { body }),
  reports: (status: AdminReportStatus, page = 1) => api.get<AdminReportQueueDto>(`/admin/reports${queryString({ status, page })}`),
  openReport: (reportId: string) => api.post<AdminReportDetailDto>(`/admin/reports/${encodeURIComponent(reportId)}/open`, {}),
  resolveReport: (reportId: string, resolution: AdminReportResolution, note: string) =>
    api.post<AdminReportQueueDto>(`/admin/reports/${encodeURIComponent(reportId)}/resolve`, { resolution, note }),
  // rc.2: bugs players reported from the game.
  bugReports: (status: AdminBugReportStatus, page = 1) => api.get<AdminBugReportQueueDto>(`/admin/bug-reports${queryString({ status, page })}`),
  resolveBugReport: (reportId: string, resolution: BugReportResolution, note: string) =>
    api.post<AdminBugReportQueueDto>(`/admin/bug-reports/${encodeURIComponent(reportId)}/resolve`, { resolution, note }),
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
  resetTwoFactor: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, '2fa/reset'), { reason }),
  markEmailVerified: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'email/verify'), { reason }),
  unlinkForum: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'forum/unlink'), { reason }),
  deleteAccount: (accountId: string, reason: string, confirmation: string) =>
    api.post<AdminAccountDeleteResultDto>(accountPath(accountId, 'delete'), { reason, confirmation }),

  players: (params: { query: string; roundId?: string | undefined; limit?: number | undefined }) =>
    api.get<AdminPlayerSearchDto>(`/admin/players${queryString(params)}`),
  player: (roundPlayerId: string) => api.get<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}`),
  grantToPlayer: (roundPlayerId: string, input: AdminGrantInput) => api.post<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}/grant`, input),
  grantQuest: (roundPlayerId: string, key: string, reason: string) =>
    api.post<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}/quests/grant`, { key, reason }),
  resetQuest: (roundPlayerId: string, playerQuestId: string, reason: string) =>
    api.post<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}/quests/${enc(playerQuestId)}/reset`, { reason }),
  completeQuest: (roundPlayerId: string, playerQuestId: string, reason: string) =>
    api.post<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}/quests/${enc(playerQuestId)}/complete`, { reason }),
  adjustFavor: (roundPlayerId: string, key: string, delta: number, reason: string) =>
    api.post<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}/favors/adjust`, { key, delta, reason }),
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
  // 1.0.0-E: economy, fights, exploit flags and turf.
  markets: (roundId: string) => api.get<AdminMarketsDto>(roundPath(roundId, 'markets')),
  casino: (roundId: string) => api.get<AdminCasinoDto>(roundPath(roundId, 'casino')),
  // 1.3.0-G: law health, one player's Case, and an audited correction.
  law: (roundId: string) => api.get<AdminLawDto>(roundPath(roundId, 'law')),
  playerLaw: (roundPlayerId: string) => api.get<AdminLawPlayerDto>(`/admin/players/${enc(roundPlayerId)}/law`),
  adjustPlayerCase: (roundPlayerId: string, input: { citySlug: string; points: number; reason: string }) =>
    api.post<AdminLawPlayerDto>(`/admin/players/${enc(roundPlayerId)}/law/adjust`, input),
  suspicious: (roundId: string, hours = 24) => api.get<AdminSuspiciousDto>(`${roundPath(roundId, 'suspicious')}?hours=${hours}`),
  shipments: (roundId: string) => api.get<AdminShipmentsDto>(roundPath(roundId, 'shipments')),
  playerStores: (roundPlayerId: string) => api.get<AdminPlayerStoresDto>(`/admin/players/${encodeURIComponent(roundPlayerId)}/stores`),
  roundBattles: (roundId: string, playerId?: string) => api.get<AdminRoundBattlesDto>(`${roundPath(roundId, 'battles')}${playerId ? `?playerId=${encodeURIComponent(playerId)}` : ''}`),
  exploitFlags: (status: 'open' | 'reviewed' | 'all' = 'open') => api.get<AdminExploitFlagsDto>(`/admin/exploit-flags?status=${status}`),
  reviewFlag: (flagId: string, resolution: ExploitFlagResolution, note: string) =>
    api.post<{ flag: AdminExploitFlagDto }>(`/admin/exploit-flags/${encodeURIComponent(flagId)}/review`, { resolution, note }),
  turf: (roundId: string) => api.get<AdminTurfDto>(roundPath(roundId, 'turf')),
  turfHistory: (turfId: string) => api.get<AdminTurfHistoryDto>(`/admin/turf/${encodeURIComponent(turfId)}/history`),
  turfRepair: (input: { action: AdminTurfRepair; turfId?: string; roundPlayerId?: string; pushId?: string; reason: string }) =>
    api.post<{ done: string }>('/admin/turf/repair', input),
  // 1.0.0-F.
  monitoring: () => api.get<MonitoringSnapshotDto>('/admin/monitoring'),
};
