import type {
  AdminPlayerBoardDto,
  AdminEventCalendarInput,
  AdminEventPreviewDto,
  AdminEventReleaseReportDto,
  AdminEventTuneInput,
  SportsbookLeagueKey,
  AdminSportsbookActionDto,
  AdminSportsbookProviderCheckDto,
  AdminSportsbookDto,
  AdminCrewCorrectionInput,
  AdminCrewCorrectionResult,
  AdminCrewPlayerDto,
  AdminCrewRosterDto,
  AdminCrewReleaseHealthDto,
  AdminCrewProvenanceDto,
  AdminCrewLoyaltyRepairResultDto,
  AdminCrewRosterRepairResultDto,
  AdminLoanCorrectionInput,
  AdminLoanCorrectionResult,
  AdminLoanPlayerDto,
  AdminLoansDto,
  AdminBugReportQueueDto,
  AdminBugReportStatus,
  AdminStaffDto,
  StaffRole,
  BugReportResolution,
  MonitoringSnapshotDto,
  AdminExploitFlagDto,
  AdminExploitFlagsDto,
  AdminFactionAdjustmentInput,
  AdminVehicleAdjustmentInput,
  AdminVehicleRoundDto,
  AdminArmoryPlayerDto,
  AdminFactionRoundDto,
  AdminCasinoDto,
  AdminLawDto,
  AdminLawPlayerDto,
  AdminMarketsDto,
  AdminSupplyDto,
  AdminSupplyCorrectionResult,
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
  AdminSupporterGrantResultDto,
  AdminSupportersDto,
  SupporterPollDto,
  SupporterPollStageInput,
  AdminAuditPurgeResultDto,
  AdminAuditRetentionDto,
  AdminCloseExpiredResultDto,
  AdminCreateBannerInput,
  AdminChangeRulesetInput,
  AdminCreateNewsInput,
  AdminDevBotsDto,
  AdminDiscordStatusDto,
  AdminGrantInput,
  AdminNewsDto,
  AdminPlayerBattlesDto,
  AdminPlayerDto,
  AdminPlayerSearchDto,
  AdminQuestContentDto,
  AdminStoryCampaignDto,
  AdminRoundHealthDto,
  AdminStreetPassUpdateInput,
  AdminRoundResultDto,
  AdminRoundsDto,
  AdminRulesetChangeDto,
  AdminRulesetViewDto,
  AdminScheduleRoundInput,
  AdminSignalsDto,
  AdminSuspensionLength,
  AdminCommsMuteLength,
  AdminCommunityDto,
  AdminDiscordTimeoutLength,
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
  crewRoster: (roundId: string) => api.get<AdminCrewRosterDto>(roundPath(roundId, 'crew')),
  crewReleaseHealth: (roundId: string) =>
    api.get<AdminCrewReleaseHealthDto>(roundPath(roundId, 'crew/release-health')),
  crewReceiptProvenance: (roundPlayerId: string, memberId: string) =>
    api.get<AdminCrewProvenanceDto>(`/admin/players/${enc(roundPlayerId)}/crew/${enc(memberId)}/provenance`),
  reconcileCrewLoyalty: (roundPlayerId: string, memberId: string, reason: string, expectedPoints: number) =>
    api.post<AdminCrewLoyaltyRepairResultDto>(`/admin/players/${enc(roundPlayerId)}/crew/${enc(memberId)}/loyalty/reconcile`, { reason, expectedPoints }),
  repairCrewRoster: (roundPlayerId: string, reason: string) =>
    api.post<AdminCrewRosterRepairResultDto>(`/admin/players/${enc(roundPlayerId)}/crew/reconcile`, { reason }),
  updateStreetPass: (roundId: string, input: AdminStreetPassUpdateInput) => api.post<AdminRoundHealthDto>(roundPath(roundId, 'street-pass'), input),
  rulesetChange: (roundId: string, rulesetId?: string) =>
    api.get<AdminRulesetChangeDto>(`${roundPath(roundId, 'ruleset-change')}${queryString({ rulesetId })}`),
  changeRuleset: (roundId: string, input: AdminChangeRulesetInput) => api.post<AdminRoundResultDto>(roundPath(roundId, 'ruleset'), input),
  closeExpiredRounds: () => api.post<AdminCloseExpiredResultDto>('/admin/rounds/close-expired'),
  territoryEncounterTester: () => api.get<{ enabled: true; accounts: Array<{ id: string; username: string; territoryTestAccount: boolean }>; pools: Record<string, Array<{ key: string; title: string; territory?: unknown }>> }>('/admin/territory-encounter-tester'),
  setTerritoryTestAccount: (accountId: string, enabled: boolean, reason: string) => api.post('/admin/territory-encounter-tester/accounts/' + enc(accountId), { enabled, reason }),
  territoryTestReward: (roundPlayerId: string, key: string, grant: boolean, reason: string) => api.post('/admin/territory-encounter-tester/rewards', { roundPlayerId, key, grant, reason }),
  simulateTerritoryEncounter: (input: { roundPlayerId: string; trigger: string; district?: string; seed: string }) => api.post<unknown>('/admin/territory-encounter-tester/simulate', input),

  questContent: (roundId: string) =>
    api.get<AdminQuestContentDto>(`/admin/quest-content${queryString({ roundId })}`),
  storyCampaign: (roundId: string) =>
    api.get<AdminStoryCampaignDto>(`/admin/story-campaign${queryString({ roundId })}`),
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
  seedDevBot: (slug: string) => api.post<AdminDevBotsDto>(`/admin/dev-bots/rivals/${enc(slug)}/seed`),
  removeDevBot: (accountId: string, reason: string) => api.post<AdminDevBotsDto>(`/admin/dev-bots/accounts/${enc(accountId)}/remove`, { reason }),
  encounterGangSummary: () => api.get<AdminDevBotsDto['encounterGangSummary']>('/admin/encounter-gangs/summary'),

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
  /** The player on the forum and Discord, plus support tickets. Loads apart from the account. */
  community: (accountId: string) => api.get<AdminCommunityDto>(accountPath(accountId, 'community')),
  forumSuspend: (accountId: string, length: AdminSuspensionLength, reason: string) =>
    api.post<AdminCommunityDto>(accountPath(accountId, 'forum-suspend'), { length, reason }),
  forumUnsuspend: (accountId: string, reason: string) => api.post<AdminCommunityDto>(accountPath(accountId, 'forum-suspend/lift'), { reason }),
  discordTimeout: (accountId: string, length: AdminDiscordTimeoutLength, reason: string) =>
    api.post<AdminCommunityDto>(accountPath(accountId, 'discord-timeout'), { length, reason }),
  discordUntimeout: (accountId: string, reason: string) => api.post<AdminCommunityDto>(accountPath(accountId, 'discord-timeout/lift'), { reason }),
  addNote: (accountId: string, body: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'notes'), { body }),
  reports: (status: AdminReportStatus, page = 1) => api.get<AdminReportQueueDto>(`/admin/reports${queryString({ status, page })}`),
  openReport: (reportId: string) => api.post<AdminReportDetailDto>(`/admin/reports/${encodeURIComponent(reportId)}/open`, {}),
  resolveReport: (reportId: string, resolution: AdminReportResolution, note: string) =>
    api.post<AdminReportQueueDto>(`/admin/reports/${encodeURIComponent(reportId)}/resolve`, { resolution, note }),
  // rc.2: bugs players reported from the game.
  bugReports: (status: AdminBugReportStatus, page = 1) => api.get<AdminBugReportQueueDto>(`/admin/bug-reports${queryString({ status, page })}`),
  resolveBugReport: (reportId: string, resolution: BugReportResolution, note: string, playerReply?: string) =>
    api.post<AdminBugReportQueueDto>(`/admin/bug-reports/${encodeURIComponent(reportId)}/resolve`, { resolution, note, ...(playerReply ? { playerReply } : {}) }),
  revokeSessions: (accountId: string, reason: string, sessionId?: string) =>
    api.post<AdminAccountDetailDto>(accountPath(accountId, 'sessions/revoke'), { reason, ...(sessionId ? { sessionId } : {}) }),
  renameAccount: (accountId: string, username: string, reason: string) =>
    api.post<AdminAccountDetailDto>(accountPath(accountId, 'rename'), { username, reason }),
  resetProfile: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'reset-profile'), { reason }),
  /** Give, change or take away (null) a staff role. */
  setStaffRole: (accountId: string, role: StaffRole | null, reason: string) =>
    api.post<AdminAccountDetailDto>(accountPath(accountId, 'staff-role'), { role, reason }),
  staff: () => api.get<AdminStaffDto>('/admin/staff'),
  setBetaApproved: (accountId: string, approved: boolean, reason: string) =>
    api.post<AdminAccountDetailDto>(accountPath(accountId, 'beta-access'), { approved, reason }),
  grantSupporter: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'supporter'), { reason }),
  /** Supporters tab: the roster, a bulk grant by username and a backfill of rewards added later. dryRun previews. */
  supporters: () => api.get<AdminSupportersDto>('/admin/supporters'),
  supporterBenefits: () => api.get<import('@streets/shared').AdminSupporterBenefitsDiagnosticsDto>('/admin/supporters/benefits'),
  stageSupporterPoll: (input: SupporterPollStageInput) => api.post<SupporterPollDto>('/admin/supporters/polls', input),
  grantSupporters: (usernames: string[], reason: string, dryRun: boolean) =>
    api.post<AdminSupporterGrantResultDto>('/admin/supporters/grant', dryRun ? { usernames, dryRun } : { usernames, reason, dryRun }),
  /** Gives this month's supporter drop to everyone supporting now. */
  releaseSupporterDrop: () => api.post<{ month: string; granted: number }>('/admin/supporters/drops/release', {}),
  backfillSupporters: (reason: string, dryRun: boolean) =>
    api.post<AdminSupporterGrantResultDto>('/admin/supporters/backfill', dryRun ? { dryRun } : { reason, dryRun }),
  resendVerification: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'email/resend'), { reason }),
  resetTwoFactor: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, '2fa/reset'), { reason }),
  markEmailVerified: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'email/verify'), { reason }),
  unlinkForum: (accountId: string, reason: string) => api.post<AdminAccountDetailDto>(accountPath(accountId, 'forum/unlink'), { reason }),
  deleteAccount: (accountId: string, reason: string, confirmation: string) =>
    api.post<AdminAccountDeleteResultDto>(accountPath(accountId, 'delete'), { reason, confirmation }),

  players: (params: { query: string; roundId?: string | undefined; limit?: number | undefined }) =>
    api.get<AdminPlayerSearchDto>(`/admin/players${queryString(params)}`),
  player: (roundPlayerId: string) => api.get<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}`),
  playerCrew: (roundPlayerId: string) => api.get<AdminCrewPlayerDto>(`/admin/players/${enc(roundPlayerId)}/crew`),
  correctPlayerCrew: (roundPlayerId: string, memberId: string, input: AdminCrewCorrectionInput) =>
    api.post<AdminCrewCorrectionResult>(`/admin/players/${enc(roundPlayerId)}/crew/${enc(memberId)}/correct`, input),
  grantToPlayer: (roundPlayerId: string, input: AdminGrantInput) => api.post<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}/grant`, input),
  grantQuest: (roundPlayerId: string, key: string, reason: string) =>
    api.post<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}/quests/grant`, { key, reason }),
  resetQuest: (roundPlayerId: string, playerQuestId: string, reason: string) =>
    api.post<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}/quests/${enc(playerQuestId)}/reset`, { reason }),
  completeQuest: (roundPlayerId: string, playerQuestId: string, reason: string) =>
    api.post<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}/quests/${enc(playerQuestId)}/complete`, { reason }),
  adjustFavor: (roundPlayerId: string, key: string, delta: number, reason: string) =>
    api.post<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}/favors/adjust`, { key, delta, reason }),
  /** Quest Recipe Unlocks E. */
  setUnlock: (roundPlayerId: string, key: string, held: boolean, reason: string) =>
    api.post<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}/unlocks`, { key, held, reason }),
  voidBattle: (battleId: string, reason: string) => api.post<AdminVoidBattleResultDto>(`/admin/battles/${enc(battleId)}/void`, { reason }),
  signals: () => api.get<AdminSignalsDto>('/admin/signals'),
  /** 0.5.0-E. */
  voidConvoy: (tailId: string, reason: string) => api.post<{ tailId: string }>(`/admin/convoys/${enc(tailId)}/void`, { reason }),
  playerBattles: (roundPlayerId: string, before?: string) =>
    api.get<AdminPlayerBattlesDto>(`/admin/players/${enc(roundPlayerId)}/battles${queryString({ before })}`),

  audit: (filters: AdminAuditFilters = {}) => api.get<AdminAuditLogDto>(`/admin/audit${queryString({ ...filters })}`),
  eventOps: () => api.get<AdminEventReleaseReportDto>('/admin/events'),
  eventPreview: (rulesetId: string) => api.get<AdminEventPreviewDto>(`/admin/events/preview${queryString({ rulesetId })}`),
  createEventDraft: (input: AdminEventTuneInput & { rulesetId: string; rulesetVersion: string; key: string; type: string; scope: string }) =>
    api.post<{ draft: unknown }>('/admin/events/drafts', input),
  tuneEventDraft: (definitionId: string, input: AdminEventTuneInput) =>
    api.patch<{ draft: unknown }>(`/admin/events/drafts/${enc(definitionId)}`, input),
  eventCalendar: (occurrenceId: string, input: AdminEventCalendarInput) =>
    api.patch<{ occurrence: unknown }>(`/admin/events/occurrences/${enc(occurrenceId)}/calendar`, input),
  auditRetention: () => api.get<AdminAuditRetentionDto>('/admin/audit/retention'),
  purgeAudit: (reason: string) => api.post<AdminAuditPurgeResultDto>('/admin/audit/purge', { reason }),
  /** A plain link: the browser downloads it with the session cookie it already has. */
  auditExportUrl: (filters: AdminAuditFilters = {}) => `/api/admin/audit/export${queryString({ ...filters, before: undefined })}`,
  // 1.0.0-E: economy, fights, exploit flags and turf.
  markets: (roundId: string) => api.get<AdminMarketsDto>(roundPath(roundId, 'markets')),
  supply: (roundId: string) => api.get<AdminSupplyDto>(roundPath(roundId, 'supply')),
  /** 1.6.0-I. Set one warehouse's or crew's stock to a counted figure, audited. */
  adjustPlayerSupply: (roundPlayerId: string, input: { target: 'WAREHOUSE' | 'CREW'; targetId: string; productKey: string; quantity: number; reason: string }) =>
    api.post<AdminSupplyCorrectionResult>(`/admin/players/${enc(roundPlayerId)}/supply/adjust`, input),
  casino: (roundId: string) => api.get<AdminCasinoDto>(roundPath(roundId, 'casino')),
  /** 1.8.0-C. Sportsbook feed health (global, not per round), an on-demand result check and an audited void. */
  sportsbook: () => api.get<AdminSportsbookDto>('/admin/sportsbook'),
  sportsbookRecheck: (eventId: string) => api.post<AdminSportsbookActionDto>(`/admin/sportsbook/events/${enc(eventId)}/recheck`, {}),
  /** Pulls all league odds into the shared player cache now, using normal lease and quota guards. */
  sportsbookPull: () => api.post<AdminSportsbookActionDto>('/admin/sportsbook/pull', {}),
  /** 1.8.0-E release gate: parse one league's live provider snapshot without storing it. */
  sportsbookProviderCheck: (league: SportsbookLeagueKey, provider: string) => api.post<AdminSportsbookProviderCheckDto>('/admin/sportsbook/provider-check', { league, provider }),
  sportsbookPinProvider: (league: SportsbookLeagueKey, provider: string, reason?: string) =>
    api.post<AdminSportsbookActionDto>(`/admin/sportsbook/leagues/${enc(league)}/pin`, { provider, ...(reason ? { reason } : {}) }),
  sportsbookClearProviderPin: (league: SportsbookLeagueKey) =>
    api.post<AdminSportsbookActionDto>(`/admin/sportsbook/leagues/${enc(league)}/clear-pin`, {}),
  sportsbookVoid: (eventId: string, reason: string) =>
    api.post<AdminSportsbookActionDto>(`/admin/sportsbook/events/${enc(eventId)}/void`, { reason }),
  sportsbookResolve: (eventId: string, input: { action: 'SETTLE'; provider: string; reason: string } | { action: 'VOID'; reason: string }) =>
    api.post<AdminSportsbookActionDto>(`/admin/sportsbook/events/${enc(eventId)}/resolve`, input),
  /** 1.6.5-F. Loan shark health for a round, one player's loans, and an audited correction. */
  loans: (roundId: string) => api.get<AdminLoansDto>(roundPath(roundId, 'loans')),
  playerLoans: (roundPlayerId: string) => api.get<AdminLoanPlayerDto>(`/admin/players/${enc(roundPlayerId)}/loans`),
  correctPlayerLoans: (roundPlayerId: string, input: AdminLoanCorrectionInput) =>
    api.post<AdminLoanCorrectionResult>(`/admin/players/${enc(roundPlayerId)}/loans/correct`, input),
  // 1.4.0-G: faction standing health and audited correction.
  factions: (roundId: string) => api.get<AdminFactionRoundDto>(roundPath(roundId, 'factions')),
  adjustPlayerFaction: (roundPlayerId: string, input: AdminFactionAdjustmentInput) =>
    api.post<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}/factions/adjust`, input),
  /** 1.5.0-E. Vehicle health for a round, and audited fleet corrections. */
  vehicles: (roundId: string) => api.get<AdminVehicleRoundDto>(roundPath(roundId, 'vehicles')),
  armory: (roundPlayerId: string) => api.get<AdminArmoryPlayerDto>(`/admin/players/${enc(roundPlayerId)}/armory`),
  adjustPlayerVehicles: (roundPlayerId: string, input: AdminVehicleAdjustmentInput) =>
    api.post<AdminPlayerDto>(`/admin/players/${enc(roundPlayerId)}/vehicles/adjust`, input),
  // 1.3.0-G: law health, one player's Case, and an audited correction.
  law: (roundId: string) => api.get<AdminLawDto>(roundPath(roundId, 'law')),
  playerLaw: (roundPlayerId: string) => api.get<AdminLawPlayerDto>(`/admin/players/${enc(roundPlayerId)}/law`),
  adjustPlayerCase: (roundPlayerId: string, input: { citySlug: string; points: number; reason: string }) =>
    api.post<AdminLawPlayerDto>(`/admin/players/${enc(roundPlayerId)}/law/adjust`, input),
  suspicious: (roundId: string, hours = 24) => api.get<AdminSuspiciousDto>(`${roundPath(roundId, 'suspicious')}?hours=${hours}`),
  shipments: (roundId: string) => api.get<AdminShipmentsDto>(roundPath(roundId, 'shipments')),
  /** The Board H. Posts, fills, cancels and expiries in the window, with an escrow check. */
  playerBoard: (roundId: string, hours = 24) => api.get<AdminPlayerBoardDto>(`${roundPath(roundId, 'board')}?hours=${hours}`),
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
