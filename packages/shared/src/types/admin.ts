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


/** One click can never try to stream the whole table into a browser. */
export const AUDIT_EXPORT_MAX_ROWS = 10_000;

export interface AdminAuditRetentionDto {
  /** How many days of history this server keeps. 0 means forever. */
  days: number;
  /** Entries older than this would be removed by a purge, or null when nothing expires. */
  cutoff: string | null;
  total: number;
  expired: number;
  oldestAt: string | null;
}

export interface AdminAuditPurgeResultDto {
  removed: number;
  cutoff: string;
  retention: AdminAuditRetentionDto;
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

export type AdminAccountStatusFilter = 'all' | 'active' | 'inactive' | 'admin' | 'suspended' | 'beta-pending';

export type AdminAccountAction =
  | 'deactivate'
  | 'reactivate'
  | 'suspend'
  | 'lift-suspension'
  | 'revoke-sessions'
  | 'rename'
  | 'reset-profile'
  | 'grant-admin'
  | 'revoke-admin'
  | 'approve-beta'
  | 'revoke-beta'
  | 'resend-verification'
  | 'mark-email-verified'
  | 'unlink-forum'
  | 'resync-discord';

/** A timed suspension. Null once it is lifted or has run out. */
export interface AdminSuspensionDto {
  until: string;
  reason: string;
  byUsername: string | null;
}

export interface AdminAccountSummaryDto {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  isActive: boolean;
  isAdmin: boolean;
  betaApproved: boolean;
  suspension: AdminSuspensionDto | null;
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

/** How long a suspension runs. Admins pick a length, never a raw date. */
export const ADMIN_SUSPENSION_LENGTHS = [
  { key: '1d', label: '1 day', hours: 24 },
  { key: '3d', label: '3 days', hours: 24 * 3 },
  { key: '7d', label: '7 days', hours: 24 * 7 },
  { key: '14d', label: '14 days', hours: 24 * 14 },
  { key: '30d', label: '30 days', hours: 24 * 30 },
  { key: '90d', label: '90 days', hours: 24 * 90 },
] as const;

export type AdminSuspensionLength = (typeof ADMIN_SUSPENSION_LENGTHS)[number]['key'];

/** One player in one round, found by name or public id rather than by account. */
export interface AdminPlayerSearchRowDto {
  roundPlayerId: string;
  displayName: string;
  publicPimpId: number;
  roundId: string;
  roundName: string;
  roundStatus: RoundStatus;
  city: string;
  netWorthCents: number;
  nationalRank: number | null;
  lastActiveAt: string;
  account: { id: string; username: string; isActive: boolean; suspended: boolean };
}

export interface AdminPlayerSearchDto {
  players: AdminPlayerSearchRowDto[];
  /** True when more players matched than the limit returned. */
  truncated: boolean;
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
  email: {
    verifiedAt: string | null;
    /** False when the server has no mailer configured, so resending cannot work. */
    sendingEnabled: boolean;
  };
  forumLink: {
    forumUserId: string;
    forumUsername: string;
    profileUrl: string;
    linkedAt: string;
  } | null;
  discord: {
    linked: boolean;
    username: string | null;
    /** False when the bot API is not configured, so a resync request would never be picked up. */
    botApiEnabled: boolean;
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
  /** The ruleset turn cap: grants and void refunds never push turns past it. */
  turnCap: number;
  /** Registration or active: corrections are refused once standings are frozen. */
  live: boolean;
  lastTurnCalculationAt: string;
  lastActiveAt: string;
  payoutPercent: number;
  crew: { whores: number; thugs: number; woundedThugs: number; lowRiders: number };
  supplies: { condoms: number; medicine: number; crack: number; beer: number };
  /** 0.4.0-A. Every product in the round's catalog, crack included. Empty on single-product rounds. */
  /** `valueCents` since 0.4.0-E: what the holding adds to net worth, where products are valued. */
  products: Array<{ key: string; name: string; quantity: number; valueCents?: number }>;
  weapons: { pistols: number; shotguns: number; tek9s: number; ak47s: number };
  unlocks: { shotgun: boolean; tek9: boolean; ak47: boolean };
  happiness: { whores: number; thugs: number };
  /** 0.4.0-C. Stored Heat, as of the player's last settle. Null on rounds without Heat. */
  heat: number | null;
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
  reputation: Array<{ trader: string; points: number; legacyFavorDone: boolean }>;
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

/** What the Discord bot still has to pick up. Growing oldest items mean push or polling is not clearing the queue. */
export interface AdminDiscordStatusDto {
  botApiEnabled: boolean;
  linkedAccounts: number;
  queues: {
    news: { pending: number; oldestAt: string | null };
    battles: { pending: number; oldestAt: string | null };
    /** Alert DMs collected but not yet picked up by the bot. */
    dms: { pending: number; oldestAt: string | null };
    roundEndings: number;
    resyncs: number;
  };
  recentResyncs: Array<{
    id: string;
    everyone: boolean;
    requestedByUsername: string;
    createdAt: string;
    claimedAt: string | null;
  }>;
}

export interface AdminRulesetRowDto {
  /** Dotted path such as `turns.cap` or `hideout.rooms.SAFE_ROOM.costsCents`. */
  path: string;
  /** JSON-encoded value, or null when the path does not exist in this ruleset. */
  value: string | null;
  compareValue: string | null;
  changed: boolean;
}

export interface AdminRulesetViewDto {
  ruleset: AdminRulesetOptionDto;
  compareTo: AdminRulesetOptionDto | null;
  /** Every loadable ruleset, newest first. */
  rulesets: AdminRulesetOptionDto[];
  sections: Array<{ key: string; rows: AdminRulesetRowDto[]; changed: number }>;
  changedCount: number;
}

export interface AdminDevBotsDto {
  /** Why dev bots are refused on this server, or null when they are allowed. */
  blockedReason: string | null;
  currentRound: { id: string; name: string; rulesetVersion: string } | null;
  bots: Array<{
    accountId: string;
    username: string;
    isActive: boolean;
    roundsPlayed: number;
    inCurrentRound: { roundPlayerId: string; displayName: string; publicPimpId: number; netWorthCents: number } | null;
  }>;
}

/** Most an admin can give in one compensation grant. Turns are capped by the round's ruleset instead. */
export const ADMIN_GRANT_CAPS = {
  cashCents: 10_000_000,
  whores: 50,
  thugs: 50,
  condoms: 500,
  medicine: 500,
  crack: 500,
  beer: 500,
  pistols: 25,
  shotguns: 10,
  tek9s: 10,
  ak47s: 10,
  lowRiders: 5,
} as const;

export type AdminGrantItem = keyof typeof ADMIN_GRANT_CAPS;

/** 0.4.0-B. Most of any one non-crack product a single grant can include. Crack uses its own cap above. */
export const ADMIN_PRODUCT_GRANT_CAP = 500;

export type AdminGrantInput = { reason: string; turns?: number; products?: Record<string, number> } & Partial<Record<AdminGrantItem, number>>;

export interface AdminVoidSideDto {
  roundPlayerId: string;
  displayName: string;
  /** Signed change applied to each field of this player. */
  changes: Record<string, number>;
  /** What could not be taken back from this player because they no longer had it. */
  shortfall: Record<string, number>;
}

export interface AdminVoidBattleResultDto {
  battleId: string;
  kind: string;
  attacker: AdminVoidSideDto;
  defender: AdminVoidSideDto;
}

export type AdminSignal = 'shared-network' | 'same-device' | 'created-together';

export interface AdminSignalAccountDto {
  id: string;
  username: string;
  isActive: boolean;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** Coarse label only, never the raw browser string. */
  device: string;
  sightings: number;
}

export interface AdminSignalClusterDto {
  /** Opaque and stable on this server; never the IP address. */
  key: string;
  signals: AdminSignal[];
  /** 0.5.0-E. Convoy hits that landed between accounts in this cluster: a way goods could move between them. */
  convoyHits?: Array<{ tailId: string; attacker: string; owner: string; at: string; voided: boolean }>;
  firstSeenAt: string;
  lastSeenAt: string;
  accounts: AdminSignalAccountDto[];
}

export interface AdminSignalsDto {
  windowDays: number;
  generatedAt: string;
  clusters: AdminSignalClusterDto[];
}

/** 0.3.0-E. One matchup in the alliance balance report. */
export interface AllianceBalanceCellDto {
  battles: number;
  attackerWins: number;
  /** Null when there were no battles. */
  attackerWinPercent: number | null;
}

/** 0.3.0-E. What an alliance round actually did, for the balance pass. */
export interface AllianceBalanceDto {
  roundId: string;
  roundName: string;
  rulesetId: string;
  alliancesEnabled: boolean;
  sharedIntelEnabled: boolean;
  players: { total: number; inAlliances: number; alliances: number };
  standings: {
    topCount: number;
    topInAlliances: number;
    medianSoloNetWorthCents: number;
    medianMemberNetWorthCents: number;
    alliances: Array<{ name: string; tag: string; members: number; inTopCount: number; netWorthSharePercent: number }>;
  };
  battles: {
    all: AllianceBalanceCellDto;
    soloIntoSolo: AllianceBalanceCellDto;
    soloIntoAlliance: AllianceBalanceCellDto;
    allianceIntoSolo: AllianceBalanceCellDto;
    allianceIntoAlliance: AllianceBalanceCellDto;
    revenge: AllianceBalanceCellDto;
    withOwnIntel: AllianceBalanceCellDto;
    withAllyIntel: AllianceBalanceCellDto;
    withoutIntel: AllianceBalanceCellDto;
    byKind: Array<AllianceBalanceCellDto & { kind: string }>;
  };
}
