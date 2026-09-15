import type { ActivityDto, RoundDto, RoundStatus } from './api.js';
import type { BattleReportDto } from './combat.js';

/** 0.3.0-B. Lifecycle moves an admin can make on a round in its current status. */
export type AdminRoundAction = 'open-registration' | 'start' | 'end-early' | 'archive';

export interface AdminRoundDto extends RoundDto {
  createdAt: string;
  actions: AdminRoundAction[];
}

export interface AdminRulesetOptionDto {
  id: string;
  version: string;
  name: string;
}

export interface AdminRoundsDto {
  now: string;
  rounds: AdminRoundDto[];
  /** Newest first. */
  rulesets: AdminRulesetOptionDto[];
}

export interface AdminRoundResultDto {
  round: AdminRoundDto;
}

export interface AdminScheduleRoundInput {
  name: string;
  slug?: string;
  rulesetId: string;
  startsAt: string;
  /** Defaults to the ruleset's season length after startsAt. */
  endsAt?: string;
  registrationOpensAt?: string | null;
}

export interface AdminAuditEntryDto {
  id: string;
  actorAccountId: string | null;
  actorUsername: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface AdminAuditLogDto {
  entries: AdminAuditEntryDto[];
  /** Pass back as `before` for the next, older page. */
  nextBefore: string | null;
}

export interface AdminAuditFilters {
  actor?: string | undefined;
  /** Matches the start of the action, so `account.` finds every account action. */
  action?: string | undefined;
  targetType?: string | undefined;
  targetId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  before?: string | undefined;
  limit?: number | undefined;
}

export type AdminAccountStatusFilter = 'all' | 'active' | 'inactive' | 'admin';

export type AdminAccountAction =
  | 'deactivate'
  | 'reactivate'
  | 'revoke-sessions'
  | 'rename'
  | 'reset-profile'
  | 'grant-admin'
  | 'revoke-admin';

export interface AdminAccountSummaryDto {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  isActive: boolean;
  isAdmin: boolean;
  discordUsername: string | null;
  forumUsername: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  activeSessions: number;
  roundsPlayed: number;
}

export interface AdminAccountSearchDto {
  accounts: AdminAccountSummaryDto[];
}

/** No IP address or raw browser string: only a coarse device label. */
export interface AdminSessionDto {
  id: string;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface AdminAccountRoundDto {
  roundPlayerId: string;
  roundId: string;
  roundName: string;
  roundStatus: RoundStatus;
  publicPimpId: number;
  displayName: string;
  netWorthCents: number;
  nationalRank: number | null;
  localRank: number | null;
  joinedAt: string;
}

export interface AdminAccountDetailDto {
  account: AdminAccountSummaryDto;
  profile: {
    activeTitleKey: string | null;
    profileAccent: string;
    featuredBadgeKeys: string[];
  };
  sessions: AdminSessionDto[];
  rounds: AdminAccountRoundDto[];
  /** Latest admin actions on this account. */
  audit: AdminAuditEntryDto[];
}

/** Read-only player state as stored. Turns are as of the last settlement, not regenerated. */
export interface AdminPlayerDto {
  roundPlayerId: string;
  account: { id: string; username: string; isActive: boolean };
  round: { id: string; name: string; status: RoundStatus; rulesetVersion: string };
  publicPimpId: number;
  displayName: string;
  city: string;
  netWorthCents: number;
  cashCents: number;
  turns: number;
  lastTurnCalculationAt: string;
  lastActiveAt: string;
  payoutPercent: number;
  crew: { whores: number; thugs: number; woundedThugs: number; lowRiders: number };
  supplies: { condoms: number; medicine: number; crack: number; beer: number };
  weapons: { pistols: number; shotguns: number; tek9s: number; ak47s: number };
  unlocks: { shotgun: boolean; tek9: boolean; ak47: boolean };
  happiness: { whores: number; thugs: number };
  ranks: { national: number | null; local: number | null };
  timers: {
    raidProtectedUntil: string | null;
    raidCooldownUntil: string | null;
    lastRaidedAt: string | null;
    driveByProtectedUntil: string | null;
    driveByCooldownUntil: string | null;
    lastDrivenByAt: string | null;
  };
  hideout: { safeRoom: number; lookouts: number; workshop: number; backOffice: number };
  reputation: Array<{ trader: string; points: number; questDone: boolean }>;
  injuries: Array<{ id: string; thugs: number; recoverAt: string; battleId: string | null }>;
  intel: { observing: number; observedBy: number };
  activity: ActivityDto[];
}

export interface AdminPlayerBattlesDto {
  reports: BattleReportDto[];
  nextBefore: string | null;
}

export type SiteBannerTone = 'info' | 'warning' | 'critical';

/** A short site-wide notice. Public: GET /api/site/banner. */
export interface SiteBannerDto {
  id: string;
  message: string;
  tone: SiteBannerTone;
  startsAt: string;
  endsAt: string;
  createdByUsername: string;
}

export interface SiteBannerResponseDto {
  banner: SiteBannerDto | null;
}

export interface AdminSiteBannersDto {
  current: SiteBannerDto | null;
  /** Newest first, live and ended. */
  banners: SiteBannerDto[];
}

export interface AdminCreateBannerInput {
  message: string;
  tone: SiteBannerTone;
  startsAt?: string;
  endsAt: string;
}

export interface AdminNewsPostDto {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  publishedAt: string;
  /** Null for a global announcement shown in every round. */
  roundId: string | null;
  roundName: string | null;
  authorName: string | null;
  discordPostedAt: string | null;
  forumDiscussionId: string | null;
  forumUrl: string | null;
  forumPostedAt: string | null;
  forumError: string | null;
  updatedAt: string;
}

export interface AdminNewsDto {
  posts: AdminNewsPostDto[];
  /** Rounds a post can be attached to, newest first. */
  rounds: Array<{ id: string; name: string; status: RoundStatus }>;
  forumMirrorEnabled: boolean;
}

export interface AdminCreateNewsInput {
  title: string;
  body: string;
  pinned: boolean;
  roundId: string | null;
  /** Defaults to now. A future time schedules the post. */
  publishedAt?: string;
  mirrorToForum: boolean;
}

export interface AdminUpdateNewsInput {
  title?: string;
  body?: string;
  pinned?: boolean;
}

export interface AdminUpdateRoundInput {
  reason: string;
  name?: string;
  startsAt?: string;
  endsAt?: string;
  registrationOpensAt?: string | null;
}

export interface AdminCloseExpiredResultDto {
  closed: AdminRoundDto[];
}

export interface AdminRoundHealthDayDto {
  /** UTC calendar day, YYYY-MM-DD. */
  day: string;
  joins: number;
  /** Players with at least one action that day. */
  activePlayers: number;
  turnsSpent: number;
  raids: number;
  driveBys: number;
  specialRaids: number;
  recon: number;
}

export interface AdminRoundHealthDto {
  round: AdminRoundDto;
  players: { total: number; active24h: number; active7d: number; neverActed: number };
  /** Newest first, up to the last 14 days of the round. */
  days: AdminRoundHealthDayDto[];
  topPlayers: Array<{
    roundPlayerId: string;
    displayName: string;
    publicPimpId: number;
    netWorthCents: number;
    nationalRank: number | null;
    lastActiveAt: string;
  }>;
}
