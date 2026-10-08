import type { ActivityDto, RoundDto, RoundStatus } from './api.js';
import type { BattleReportDto } from './combat.js';
import type { LawPageDto, WantedStageDto } from './law.js';

/** 0.3.0-B. Lifecycle moves an admin can make on a round in its current status. */
export type AdminRoundAction = 'open-registration' | 'start' | 'pause' | 'resume' | 'end-early' | 'archive';

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
  | 'ban'
  | 'unban'
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
  | 'reset-2fa'
  | 'unlink-forum'
  | 'resync-discord'
  | 'delete-account'
  | 'comms-mute'
  | 'comms-unmute'
  | 'add-note';

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
  /** rc.3. Signs in with an authenticator code. */
  twoFactorEnabled: boolean;
  isActive: boolean;
  isAdmin: boolean;
  betaApproved: boolean;
  suspension: AdminSuspensionDto | null;
  /** 1.0.0-E. Set while the account is banned. */
  ban: { at: string; reason: string; byUsername: string | null } | null;
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

/**
 * 0.9.0-H. Communication mute lengths: no private messages, wire posts or forum
 * recruitment threads. The player keeps playing. `permanent` lasts until lifted.
 */
export const ADMIN_COMMS_MUTE_LENGTHS = [
  { key: '1h', label: '1 hour', hours: 1 },
  { key: '1d', label: '1 day', hours: 24 },
  { key: '3d', label: '3 days', hours: 24 * 3 },
  { key: '7d', label: '7 days', hours: 24 * 7 },
  { key: '30d', label: '30 days', hours: 24 * 30 },
  { key: 'permanent', label: 'Permanent', hours: null },
] as const;

export type AdminCommsMuteLength = (typeof ADMIN_COMMS_MUTE_LENGTHS)[number]['key'];

/** 0.9.0-H. A communication mute in force. */
export interface AdminCommsMuteDto {
  permanent: boolean;
  until: string | null;
  reason: string;
  byUsername: string | null;
}

/** 0.9.0-H. A private admin note on an account. */
export interface AdminModerationNoteDto {
  id: string;
  authorUsername: string;
  body: string;
  createdAt: string;
}

export const ADMIN_NOTE_MAX = 2_000;

export type AdminReportStatus = 'open' | 'resolved';
export type AdminReportResolution = 'DISMISSED' | 'ACTIONED';

export interface AdminReportPartyDto {
  accountId: string;
  username: string;
  displayName: string;
  publicPimpId: number;
}

/**
 * 0.9.0-H. One report in the queue. The queue never carries message text: an
 * admin opens a report on purpose, and that view is audited.
 */
export interface AdminReportSummaryDto {
  id: string;
  source: 'PLAYER' | 'AUTO';
  reason: string;
  createdAt: string;
  reporterUsername: string | null;
  roundName: string;
  messageId: string;
  messageAt: string;
  sender: AdminReportPartyDto;
  recipient: AdminReportPartyDto;
  /** Every report on this message, the automated flag included. */
  reportsOnMessage: number;
  /** Open reports or flags against this sender's messages. */
  openAgainstSender: number;
  senderRestricted: boolean;
  resolvedAt: string | null;
  resolvedByUsername: string | null;
  resolution: AdminReportResolution | null;
  resolutionNote: string | null;
}

export interface AdminReportQueueDto {
  status: AdminReportStatus;
  page: number;
  totalPages: number;
  total: number;
  counts: { open: number; resolved: number };
  reports: AdminReportSummaryDto[];
}

export interface AdminReportMessageDto {
  id: string;
  fromSender: boolean;
  subject: string;
  body: string;
  createdAt: string;
  reported: boolean;
}

/** 0.9.0-H. An opened report: the reported message plus a few around it in the same thread. */
export interface AdminReportDetailDto {
  report: AdminReportSummaryDto;
  thread: AdminReportMessageDto[];
  /** How many messages of the thread were left out on each side of what is shown. */
  omitted: { before: number; after: number };
  senderComms: AdminCommsMuteDto | null;
}

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
    titlePlacement: 'prefix' | 'suffix';
    activeProfileFrameKey: string | null;
    activeSiteThemeKey: string | null;
    profileBio: string | null;
    profileImageUrl: string | null;
    profileBannerUrl: string | null;
    profileEffect: string;
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
  /** 0.9.0-H. Communication mute in force, if any. */
  comms: AdminCommsMuteDto | null;
  /** 0.9.0-H. Private moderation notes, newest first. */
  notes: AdminModerationNoteDto[];
  /** 0.9.0-H. Reports and flags against messages this account sent. */
  reportsAgainst: { open: number; total: number };
}

export interface AdminAccountDeleteResultDto {
  accountId: string;
  formerUsername: string;
  /** Accounts with round history are anonymized; unused accounts are removed outright. */
  mode: 'anonymized' | 'deleted';
  roundsPreserved: number;
  sessionsRevoked: number;
}

export type AdminQuestStatus = 'LOCKED' | 'AVAILABLE' | 'ACTIVE' | 'READY_TO_TURN_IN' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

export interface AdminPlayerQuestDto {
  id: string;
  key: string;
  title: string;
  type: string;
  category: string;
  attempt: number;
  status: AdminQuestStatus;
  isTracked: boolean;
  isEnabled: boolean;
  objectiveProgress: unknown;
  bonusProgress: unknown;
  chosenBranch: string | null;
  rewardState: unknown;
  acceptedAt: string | null;
  completedAt: string | null;
  claimedAt: string | null;
  failedAt: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

export interface AdminQuestCatalogRowDto {
  key: string;
  title: string;
  description: string;
  type: string;
  category: string;
  difficulty: string;
  repeatability: string;
  isEnabled: boolean;
  attempts: number;
  openAttempts: number;
}

export interface AdminFavorCatalogRowDto {
  key: string;
  name: string;
  description: string;
  contactKey: string;
  activationKind: 'TIMED' | 'SINGLE_USE';
  category: string;
  durationMinutes: number | null;
  effectKind: string | null;
  isEnabled: boolean;
}

export interface AdminQuestContentDto {
  now: string;
  round: { id: string; name: string; status: RoundStatus; rulesetVersion: string };
  rotations: {
    daily: { keys: string[]; resetAt: string | null; slots: number };
    weekly: { keys: string[]; resetAt: string | null; slots: number };
    /** 1.4.0-B2. This round's season board; absent on rulesets without one. */
    season?: { keys: string[]; resetAt: string | null; slots: number };
  };
  quests: AdminQuestCatalogRowDto[];
  favors: AdminFavorCatalogRowDto[];
}

export interface AdminFactionStandingDto {
  factionKey: string;
  factionName: string;
  points: number;
  tier: string;
  tierName: string;
  receiptPoints: number;
  receipts: number;
  lastReceiptAt: string | null;
  updatedAt: string | null;
}

export interface AdminFactionRoundDto {
  roundId: string;
  generatedAt: string;
  enabled: boolean;
  rulesetId: string;
  standings: Array<AdminFactionStandingDto & { roundPlayerId: string; displayName: string }>;
  receipts24h: Array<{ source: string; entries: number; standing: number }>;
  integrity: {
    checked: number;
    mismatches: Array<{ roundPlayerId: string; displayName: string; factionKey: string; stored: number; receipts: number }>;
  };
  adjustments7d: number;
}

export interface AdminFactionAdjustmentInput {
  factionKey: string;
  points: number;
  reason: string;
}

/** 1.5.0-E. One vehicle class's whereabouts: home and ready, on runs, or waiting on the garage. */
export interface AdminVehicleClassDto {
  classId: 'LOW_RIDER' | 'SEDAN' | 'VAN';
  name: string;
  ready: number;
  away: number;
  damaged: number;
  disabled: number;
}

/** 1.5.0-E. A player's fleet, for support and corrections. */
export interface AdminPlayerFleetDto {
  classes: AdminVehicleClassDto[];
  /** Active runs, with what each will bring home to the garage. */
  runs: Array<{
    runId: string;
    loadout: { LOW_RIDER: number; SEDAN: number; VAN: number };
    damaged: { LOW_RIDER: number; SEDAN: number; VAN: number };
    disabled: { LOW_RIDER: number; SEDAN: number; VAN: number };
  }>;
  /** Garage repairs and recoveries this round. */
  service: { entries: number; spentCents: number };
}

/** 1.5.0-E. Vehicle health for a round: the fleet, the garage, and runs that do not add up. */
export interface AdminVehicleRoundDto {
  roundId: string;
  generatedAt: string;
  enabled: boolean;
  rulesetId: string;
  fleet: AdminVehicleClassDto[];
  /** Largest fleets first. */
  players: Array<{ roundPlayerId: string; displayName: string; ready: number; away: number; damaged: number; disabled: number }>;
  service24h: { entries: number; spentCents: number };
  service7d: { entries: number; spentCents: number };
  purchases7d: { entries: number; spentCents: number };
  adjustments7d: number;
  integrity: {
    checked: number;
    problems: Array<{ runId: string; roundPlayerId: string; displayName: string; problem: string }>;
  };
}

export interface AdminVehicleAdjustmentInput {
  classId: 'LOW_RIDER' | 'SEDAN' | 'VAN';
  ready: number;
  damaged: number;
  disabled: number;
  reason: string;
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
  unlocks: {
    shotgun: boolean;
    tek9: boolean;
    ak47: boolean;
    permanent: Array<{ key: string; sourceQuestKey: string | null; awardedAt: string }>;
  };
  favors: Array<{
    key: string;
    quantity: number;
    totalGranted: number;
    lastSourceQuestKey: string | null;
    updatedAt: string;
  }>;
  activeFavors: Array<{
    favorKey: string;
    category: string;
    startedAt: string;
    expiresAt: string;
  }>;
  armedFavors: Array<{
    favorKey: string;
    category: string;
    armedAt: string;
  }>;
  /** Latest-first support view of every quest attempt for this player. */
  quests: AdminPlayerQuestDto[];
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
  /** 1.4.0-G. Staff-only standing with receipt totals for audit and correction. */
  factions: AdminFactionStandingDto[];
  /** 1.5.0-E. Null on rounds without vehicle classes. */
  fleet: AdminPlayerFleetDto | null;
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
  /** 1.0.0-E. A maintenance notice carries the outage window it announces. */
  kind: 'notice' | 'maintenance';
  maintenance: { startsAt: string; endsAt: string } | null;
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
  /** 1.0.0-E. A maintenance notice: the window it announces, and whether to tell every player now. */
  kind?: 'notice' | 'maintenance';
  maintenanceStartsAt?: string;
  maintenanceEndsAt?: string;
  announce?: boolean;
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
  /** Why Discord refused the post, as the bot reported it. Resend clears it. */
  discordError: string | null;
  /** Why the post is not on Discord yet, in words for the admin; null once it is. */
  discordWaiting: string | null;
  forumDiscussionId: string | null;
  forumUrl: string | null;
  forumPostedAt: string | null;
  forumError: string | null;
  updatedAt: string;
  /** 1.0.0-E. Sent to every player's bell and alert channels once published. */
  broadcast: boolean;
  broadcastAt: string | null;
}

export interface AdminNewsDto {
  posts: AdminNewsPostDto[];
  /** Rounds a post can be attached to, newest first. */
  rounds: Array<{ id: string; name: string; status: RoundStatus }>;
  forumMirrorEnabled: boolean;
  /** What the bot last reported about its news channel; null before it ever did. */
  discordBot: { lastSeenAt: string; channel: string | null; problem: string | null } | null;
}

export interface AdminCreateNewsInput {
  title: string;
  body: string;
  pinned: boolean;
  roundId: string | null;
  /** Defaults to now. A future time schedules the post. */
  publishedAt?: string;
  mirrorToForum: boolean;
  /** 1.0.0-E. Also send it to every player of the season. */
  broadcast?: boolean;
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

/** Something moving a round onto another ruleset could break. Each one has to be confirmed. */
export interface AdminRulesetChangeWarningDto {
  code: 'ROUND_LIVE' | 'CURRENT_RULESET_MISSING' | 'SECTIONS_REMOVED' | 'KEYS_REMOVED' | 'STREET_PASS_TRACK_CHANGED' | 'STREET_PASS_EDITS_DROPPED';
  message: string;
}

export interface AdminRulesetChangeDto {
  /** What the round is pinned to; `available` is false when the code no longer ships it. */
  current: { id: string; version: string; available: boolean };
  /** False once the round has finished: its ruleset is frozen. */
  editable: boolean;
  /** Newest first. */
  rulesets: AdminRulesetOptionDto[];
  /** Present when a target ruleset was asked about. */
  target: {
    ruleset: AdminRulesetOptionDto;
    /** Values that differ from the current ruleset, or null when it could not be compared. */
    changedCount: number | null;
    warnings: AdminRulesetChangeWarningDto[];
  } | null;
}

export interface AdminChangeRulesetInput {
  rulesetId: string;
  reason: string;
  /** Required when the change has warnings. */
  confirm?: boolean;
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

/**
 * Reward kinds a Street Pass tier can hold, as streetPassProblems accepts them.
 * Buying access (WEAPON_ACCESS, PERMANENT_UNLOCK) is never a Street Pass reward.
 */
export const ADMIN_STREET_PASS_REWARD_KINDS = ['CASH', 'TURNS', 'ITEM', 'PRODUCT', 'FAVOR_ITEM', 'CONTACT_REP', 'COSMETIC_UNLOCK'] as const;

export interface AdminStreetPassRewardDto {
  kind: typeof ADMIN_STREET_PASS_REWARD_KINDS[number];
  amount?: number;
  key?: string;
}

export interface AdminStreetPassDto {
  name: string;
  tiers: Array<{ tier: number; rewards: AdminStreetPassRewardDto[] }>;
  catalogs: { items: string[]; products: string[]; favors: string[]; contacts: string[]; cosmetics: string[] };
  editable: boolean;
}

export interface AdminStreetPassUpdateInput {
  reason: string;
  tiers: Array<{ tier: number; rewards: AdminStreetPassRewardDto[] }>;
}

export interface AdminRoundHealthDto {
  round: AdminRoundDto;
  /**
   * Set when the code no longer ships the round's pinned ruleset. Ruleset-backed
   * sections are then left out, and Change ruleset is the way to repair it.
   */
  rulesetProblem: string | null;
  streetPass?: AdminStreetPassDto | null;
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
  /** 0.8.0-H. Read-only operator view of the pinned Store economy. */
  storeEconomy: null | {
    pressureLimitPercent: number;
    markets: Array<{
      city: string;
      productKey: string;
      pushPercent: number;
      updatedAt: string;
    }>;
    shelves: {
      emptyStandard: number;
      emptyProduct: number;
    };
    shipments: {
      enabled: boolean;
      delayChancePercent: number;
      partialChancePercent: number;
      largeChancePercent: number;
    };
    specialOrders: {
      last24h: number;
      pendingByReceipt: number;
    };
    reservationsEnabled: boolean;
    blackMarketEnabled: boolean;
  };
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
  /** Phase O. What the controls can set, and the seedable crews with whether each is in this round. */
  controls: {
    personalities: Array<{ key: string; label: string }>;
    tiers: string[];
    rivals: Array<{ slug: string; displayName: string; personality: string; inRound: boolean }>;
  };
  /** Phase I. Read-only operator view of server-run gang pressure. */
  npcGangSummary: {
    generatedAt: string;
    active: number;
    dueNow: number;
    acted24h: number;
    blocked24h: number;
    /** Phase I. Grudges still open across all gangs, and NPC paybacks that landed in 24h. */
    openGrudges: number;
    revenge24h: number;
    /** Phase J. Blocks NPC gangs hold across the round right now. */
    heldBlocks: number;
    /** Phase K. Gangs packing up or on the road. */
    migrating: number;
    /** Phase L. Gangs on a run, and gangs gone to ground. */
    hot: number;
    dormant: number;
    /** Phase N. Bounties paid in the last day, gangs broken up this round. */
    bounties24h: { count: number; cents: number };
    retired: number;
    cities: Array<{
      city: string;
      activeGangs: number;
      dueNow: number;
      recentHits: number;
      recentDriveBys: number;
      recentSpecialRaids: number;
      recentRevengeHits: number;
      heldBlocks: string[];
      /** Phase K. NPC trucks on the road into this city. */
      inbound: number;
      nextActionAt: string | null;
    }>;
  };
  bots: Array<{
    accountId: string;
    username: string;
    isActive: boolean;
    roundsPlayed: number;
    inCurrentRound: {
      roundPlayerId: string;
      displayName: string;
      publicPimpId: number;
      netWorthCents: number;
      npcGang: {
        archetype: string;
        tier: string;
        aggression: number;
        ambition: number;
        discipline: number;
        nextActionAt: string;
        lastActionAt: string | null;
        dormantUntil: string | null;
        homeCity: string;
        lastIntent: string | null;
        lastOutcome: string | null;
        lastTarget: string | null;
        lastError: string | null;
        /** Phase O. The gang id, its personality key, and an operator pause if one is on. */
        gangId: string;
        personalityKey: string;
        paused: { by: string; at: string; reason: string; until: string } | null;
        /** Phase I. Humans this gang remembers, newest first; expired grudges are dropped. */
        grudges: Array<{
          targetName: string;
          publicPimpId: number;
          hits: number;
          lastHitAt: string;
          expiresAt: string;
          settledAt: string | null;
        }>;
        lastRevenge: { targetName: string; at: string; won: boolean | null } | null;
        /** Phase J. The gang's turf as of its last tick. */
        turf: {
          held: Array<{ districtName: string; cornerThugs: number; minimum: number; pushLandsAt: string | null }>;
          prospect: { districtName: string; presence: number; needed: number; locals: number } | null;
          recentLosses: number;
          pressure: number;
          lastMove: { kind: string; districtName: string; at: string; detail: string | null } | null;
        } | null;
        /** Phase K. Where the gang lives now, and any move it is packing for or driving. */
        currentCity: string;
        migration: { status: 'PACKING' | 'MOVING'; toName: string; reason: string; since: string; arrivesAt: string | null } | null;
        lastMigration: { fromName: string; toName: string; reason: string; at: string } | null;
        /** Phase M. Public identity and record. */
        personality: string;
        crewName: string;
        crewTag: string;
        record: { wins: number; losses: number; favoriteMove: string | null; biggestHitCents: number | null; biggestHitTarget: string | null; lastLossTo: string | null };
        /** Phase L. Momentum as of the last tick, how it reads, and the current or last dormancy. */
        momentum: number;
        mood: 'HOT' | 'STEADY' | 'COOLED' | 'DORMANT';
        dormancy: { reason: string; since: string; until: string; wokeAt: string | null } | null;
        /** Phase N. Times grounded this round, and the break-up if it happened. */
        dormancies: number;
        retired: { reason: string; at: string } | null;
      } | null;
    } | null;
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

export type AdminSignal = 'shared-network' | 'same-device' | 'created-together'
  /** 1.0.0-C. Value moved between them: raids, turf pushes, convoy hits or turf tax. */
  | 'value-between'
  /** 1.0.0-C. Two or more of them in one alliance this season. */
  | 'same-alliance'
  /** 1.0.0-C. Opposite trades of one product on one high market within an hour. */
  | 'market-pairing';

/** 1.0.0-C. A way value moved between two accounts in a match. */
export interface AdminSignalTransferDto {
  kind: 'RAID' | 'DRIVE_BY' | 'SPECIAL' | 'TURF_PUSH' | 'TURF_TAX' | 'MARKET_PAIR';
  from: string;
  to: string;
  at: string;
  /** Cash that moved, where the record says. */
  cashCents: number | null;
  voided: boolean;
}

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
  /** 1.0.0-C. Every other way value moved between them in the window, newest first. */
  transfers?: AdminSignalTransferDto[];
  /** 1.0.0-C. Alliances holding two or more of them this season. */
  alliances?: Array<{ tag: string; name: string; members: string[] }>;
  firstSeenAt: string;
  lastSeenAt: string;
  accounts: AdminSignalAccountDto[];
}

/** 1.0.0-C. Someone repeatedly hitting the API rate limits: scripts, bots or a stuck client. */
export interface AdminApiAbuseDto {
  /** An account when signed in; otherwise an opaque network key, never the address. */
  account: { id: string; username: string } | null;
  networkKey: string | null;
  /** Requests refused in the last 24 hours on this server process. */
  refused: number;
  buckets: string[];
  firstAt: string;
  lastAt: string;
}

export interface AdminSignalsDto {
  windowDays: number;
  generatedAt: string;
  clusters: AdminSignalClusterDto[];
  /** 1.0.0-C. Since this server process started, at most the last 24 hours. */
  apiAbuse: AdminApiAbuseDto[];
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

// --- 1.0.0-E administration ----------------------------------------------------------

export type ExploitFlagKind = 'STATE_GUARD' | 'INVARIANT' | 'LINKED_ATTACK' | 'ACTION_REPLAY' | 'API_ABUSE' | 'SIGNUP_ABUSE';
export type ExploitFlagResolution = 'dismissed' | 'actioned';

export interface AdminExploitFlagDto {
  id: string;
  kind: ExploitFlagKind;
  severity: 'info' | 'warning' | 'critical';
  account: { id: string; username: string } | null;
  roundPlayerId: string | null;
  roundId: string | null;
  route: string | null;
  message: string;
  detail: unknown;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  review: { at: string; byUsername: string | null; resolution: ExploitFlagResolution; note: string | null } | null;
}

export interface AdminExploitFlagsDto {
  open: number;
  openCritical: number;
  flags: AdminExploitFlagDto[];
}

export interface AdminPlayerRefDto {
  id: string;
  displayName: string;
  publicPimpId: number;
  accountId: string;
}

/** 1.0.0-E. Every high market and Pip counter in a round, priced the way players see them now. */
export interface AdminMarketsDto {
  roundId: string;
  generatedAt: string;
  cities: Array<{
    city: string;
    name: string;
    products: Array<{
      product: string;
      supply: string | null;
      event: string | null;
      baselineCents: number | null;
      buyCents: number | null;
      sellCents: number | null;
      pushPercent: number;
      pip: { buyCents: number; sellCents: number } | null;
    }>;
  }>;
}

/** 1.0.0-E. Money worth a second look in a window. */
export interface AdminSuspiciousDto {
  roundId: string;
  windowHours: number;
  /** The largest single ledger lines, either way. */
  largest: Array<{ id: string; player: AdminPlayerRefDto; source: string; label: string; amountCents: number; at: string }>;
  /** Players whose net cash flow in the window is a large share of their net worth. */
  surges: Array<{ player: AdminPlayerRefDto; netCents: number; netWorthCents: number; sharePercent: number }>;
  /** Admin grants in the window: compensation should be visible next to everything else. */
  grants: Array<{ id: string; actorUsername: string; targetId: string | null; reason: string | null; at: string }>;
  openFlags: number;
}

/** 1.2.0-H. Read-only casino operations and anti-abuse telemetry for admins. */
export interface AdminCasinoDto {
  roundId: string;
  generatedAt: string;
  windowHours: number;
  rating: { players: number; ratedWagers: number; wageredCents: number; theoCents: number; compsSpentCents: number; vipWagers: number; jackpots: number };
  ledger: Array<{ kind: string; entries: number; cashDeltaCents: number; walletChipDeltaCents: number; sessionChipDeltaCents: number }>;
  operations: { openSessions: number; duplicateOpenSessions: Array<{ playerId: string; displayName: string; count: number }>; activeBlackjack: number; activeDiceRounds: number; activeSoloPoker: number; activeTableHands: number; gamesOnClosedSessions: number; staleGames: number };
  rapidPlayThreshold: number;
  rapidPlay: Array<{ playerId: string; displayName: string; entries: number; lastAt: string }>;
  openCasinoFlags: Array<{ id: string; kind: string; severity: string; playerId: string | null; message: string; occurrences: number; lastAt: string }>;
}

/** 1.0.0-E. Stock on its way: special orders and the shelves waiting on them. */
export interface AdminShipmentsDto {
  roundId: string;
  pending: Array<{ player: AdminPlayerRefDto; store: string; item: string; dueAt: string; orderedAt: string }>;
  delivered: Array<{ player: AdminPlayerRefDto; store: string; item: string; dueAt: string; deliveredAt: string | null }>;
}

/** 1.0.0-E. One player's shelves, settled as the store would show them now. */
export interface AdminPlayerStoresDto {
  player: AdminPlayerRefDto;
  shelves: Array<{ field: string; stock: number; cap: number; perInterval: number; intervalMinutes: number; nextAt: string | null; shipment: string | null }>;
  productShelves: Array<{ product: string; stock: number; at: string }>;
  cityShelves: Array<{ city: string; product: string; stock: number; at: string }>;
  specialOrders: Array<{ store: string; item: string; dueAt: string }>;
}

/** 1.0.0-E. Recent fights across a round. */
export interface AdminRoundBattlesDto {
  roundId: string;
  battles: Array<{
    id: string;
    kind: string;
    attacker: AdminPlayerRefDto;
    defender: AdminPlayerRefDto;
    winner: 'ATTACKER' | 'DEFENDER' | null;
    lootCents: number;
    at: string;
    voided: { at: string; byUsername: string | null; reason: string | null } | null;
  }>;
  tails: Array<{ id: string; attacker: string; owner: string; status: string; startedAt: string; voided: boolean }>;
}

/** 1.0.0-E. Turf in a round: every block, what stands on it, and what is in flight. */
export interface AdminTurfDto {
  roundId: string;
  blocks: Array<{
    id: string;
    city: string;
    district: string;
    holder: AdminPlayerRefDto | null;
    cornerThugs: number;
    guns: { pistols: number; shotguns: number; tek9s: number; ak47s: number };
    localsThugs: number;
    heldSince: string | null;
    shieldUntil: string | null;
    upkeepAt: string;
    outpost: { cashCents: number; beer: number; products: Record<string, number> } | null;
    pendingPushes: Array<{ id: string; attacker: string; squad: number; landsAt: string; overdue: boolean }>;
  }>;
  /** Holders whose posted thugs do not match what stands on their corners. */
  drift: Array<{ player: AdminPlayerRefDto; postedThugs: number; onCorners: number }>;
}

export interface AdminTurfHistoryDto {
  turfId: string;
  city: string;
  district: string;
  segments: Array<{ holderName: string; holderPublicPimpId: number; allianceTag: string | null; startedAt: string; endedAt: string | null }>;
  pushes: Array<{ id: string; attacker: string; defender: string; squad: number; status: string; captured: boolean; startedAt: string; settledAt: string | null }>;
}

export type AdminTurfRepair = 'release-block' | 'sync-posted' | 'settle-push';

/**
 * 1.3.0-G. Law health for one round: where Cases sit, what warrants and officials did lately,
 * and whether every stored Case still adds up to its receipts. Admin-only; a player's Case is
 * private to everyone else.
 */
export interface AdminLawDto {
  roundId: string;
  generatedAt: string;
  /** False when the round's ruleset keeps no Case; everything else is then empty. */
  enabled: boolean;
  rulesetId: string;
  /** Players by Wanted stage in each city, Cases read as they stand now (cooling included). */
  stages: Array<{ citySlug: string; cityName: string; counts: Record<WantedStageDto, number> }>;
  /** The highest Cases in the round, for review. */
  highest: Array<{ playerId: string; displayName: string; cityName: string; case: number; stage: WantedStageDto }>;
  warrants: { open: number; waiting: number; served24h: number; lawyered24h: number; quashed24h: number };
  payroll: { working: Record<string, number>; underInvestigation: number; stung24h: number };
  tips24h: number;
  /** Case receipts written in the last 24 hours, by source. */
  receipts24h: Array<{ source: string; entries: number; caseChange: number }>;
  /** Cases whose receipts do not add up to the stored Case: a bug or a hand edit to review. */
  integrity: { checked: number; mismatches: Array<{ playerId: string; displayName: string; cityName: string; stored: number; receipts: number }> };
  /** Audited staff adjustments in the last 7 days. */
  adjustments7d: number;
}

/** 1.3.0-G. One player's Case as they see it, for staff. */
export interface AdminLawPlayerDto {
  playerId: string;
  displayName: string;
  roundId: string;
  roundName: string;
  /** Cities a correction can name: every city on the map. Empty when the round keeps no Case. */
  cities: Array<{ slug: string; name: string }>;
  /** Null when the round's ruleset keeps no Case. */
  page: LawPageDto | null;
}

/** Phase O. One operator correction to an NPC gang. Every action needs a reason for the audit log. */
export type AdminNpcGangControlInput =
  | { action: 'ACT_NOW'; reason: string }
  | { action: 'DELAY'; minutes: number; reason: string }
  | { action: 'PAUSE'; hours?: number; reason: string }
  | { action: 'WAKE'; reason: string }
  | { action: 'TUNE'; aggression?: number; ambition?: number; discipline?: number; tier?: string; archetype?: string; reason: string }
  | { action: 'RESET'; scope: 'MOMENTUM' | 'GRUDGES' | 'MIGRATION'; reason: string };

/** Phase O. Everything an operator needs to see about one gang. */
export interface AdminNpcGangInspectDto {
  gangId: string;
  roundPlayerId: string;
  displayName: string;
  crewName: string;
  tier: string;
  archetype: string;
  personality: string;
  aggression: number;
  ambition: number;
  discipline: number;
  nextActionAt: string;
  dormantUntil: string | null;
  paused: { by: string; at: string; reason: string; until: string } | null;
  decisions: Array<{ at: string; intent: string; outcome: string; about: string | null; won: boolean | null; error: string | null }>;
  /** The raw scheduler memory, for anything the panel does not summarize. */
  memory: unknown;
  audit: Array<{ at: string; actor: string; action: string; reason: string | null }>;
}

export interface AdminNpcGangControlResultDto {
  message: string;
  gang: AdminNpcGangInspectDto;
}
