import type { AllianceDetailDto, AllianceTagDto } from './alliance.js';
import type { NoticeCategory, NotificationCategory } from '../notifications.js';
import type { ActivityDto, CityDto, ProfileAccent, RoundDto, SeasonHideoutDto } from './api.js';

export type PublicAchievementCategory =
  | 'rank'
  | 'wealth'
  | 'street'
  | 'combat'
  | 'intel'
  | 'turf'
  | 'travel'
  | 'economy'
  | 'reputation'
  | 'hideout'
  | 'quest'
  | 'legacy';
export type PublicAchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface PublicAchievementProgressDto {
  current: number;
  target: number;
  label: string;
  /** 0.9.0-F. Money progress, in cents. Absent for plain counts. */
  unit?: 'cents';
}

export interface PublicAwardDto {
  key: string;
  title: string;
  description: string;
  category: PublicAchievementCategory;
  rarity: PublicAchievementRarity;
  unlocked: boolean;
  earnedAt: string | null;
  /** 0.9.0-F. Null when a sealed live-season stat would be revealed by it. */
  progress: PublicAchievementProgressDto | null;
  /**
   * 0.9.0-F. Season feats are earned in one season and kept for good: the
   * season that earned it (the current one when it did), absent for other awards.
   */
  earnedSeason?: string | null;
}

/** A compact profile badge: an earned achievement, shown on game and forum profiles. */
export interface ProfileBadgeDto {
  key: string;
  title: string;
  description: string;
  category: PublicAchievementCategory;
  rarity: PublicAchievementRarity;
  /** Legacy and quest-earned cosmetic badges carry across rounds. */
  permanent: boolean;
}

/** A visible Flarum group (e.g. Admin) of a linked forum account. */
export interface ForumGroupBadgeDto {
  name: string;
  /** Validated #rgb/#rrggbb, or null when the forum has none. */
  color: string | null;
}

export interface PublicLegacyDto {
  roundsPlayed: number;
  roundWins: number;
  topTenFinishes: number;
  /** 0.9.0-F. Finished seasons on the national podium (top three). */
  podiumFinishes: number;
  bestNationalRank: number | null;
  bestLocalRank: number | null;
  totalFinalNetWorthCents: number;
}

export interface PublicSeasonStatsDto {
  raidAttacks: number;
  raidAttackWins: number;
  raidDefenses: number;
  raidDefenseWins: number;
  driveByAttacks: number;
  driveByWins: number;
  reconRuns: number;
  jobsCompleted: number;
}

/**
 * 0.9.0-F. One season's public stat sheet, built from the durable history of
 * that season. While a season is live, numbers that would work as free intel on
 * cash, crew or product flow are null for everyone but the player themselves;
 * finished seasons show everything.
 */
export interface PublicStatSheetDto {
  /** True when at least one number below is withheld from this viewer. */
  sealed: boolean;
  street: {
    turnsWorked: number;
    streetEarningsCents: number | null;
    recruitsFound: number | null;
    peakCrew: number | null;
  };
  combat: {
    raidsWon: number;
    raidsLost: number;
    defensesHeld: number;
    defensesLost: number;
    driveBysLanded: number;
    thugsDefeated: number;
    cashStolenCents: number | null;
    biggestRaidCents: number | null;
  };
  turf: {
    blocksCaptured: number;
    blocksLost: number;
    /** Held block time, in hours with one decimal. */
    blockHours: number;
    /** Cities the player's alliance took control of while they held blocks there. */
    citiesControlled: number;
  };
  travel: {
    runsCompleted: number;
    /** Real interstate drive hours of every leg already driven. */
    driveHours: number;
    cargoMoved: number | null;
    convoyAttacksWon: number;
  };
  economy: {
    productProduced: number | null;
    productSold: number | null;
    largestTransactionCents: number | null;
    traderReputation: number;
  };
}

/** 0.9.0-F. A finished season where the player made the Hall of Fame top ten. */
export interface PublicHallOfFameAppearanceDto {
  round: { name: string; slug: string; endedAt: string };
  nationalRank: number;
  podium: boolean;
}

export interface PublicSeasonResultDto {
  round: {
    id: string;
    name: string;
    slug: string;
    status: RoundDto['status'];
    rulesetId: string;
    rulesetVersion: string;
    startsAt: string;
    endedAt: string;
  };
  publicPimpId: number;
  displayName: string;
  city: CityDto;
  finalNetWorthCents: number;
  finalCashCents: number;
  rank: {
    local: number | null;
    national: number | null;
  };
  stats: PublicSeasonStatsDto;
  /** 0.9.0-F. Full stat sheet; finished seasons are never sealed. */
  statSheet: PublicStatSheetDto;
  hideout: SeasonHideoutDto;
  joinedAt: string;
  lastActiveAt: string;
}

export interface PublicCareerDto {
  legacy: PublicLegacyDto;
  seasons: PublicSeasonResultDto[];
  /** 0.9.0-F. Every finished top-ten season, newest first. */
  hallOfFame: PublicHallOfFameAppearanceDto[];
}

export interface RankingEntryDto {
  rank: number;
  publicPimpId: number;
  displayName: string;
  city: CityDto;
  netWorthCents: number;
  rankHeldSinceAt: string;
  rankMovement: number | null;
  legacy: PublicLegacyDto;
  awards: PublicAwardDto[];
  isYou: boolean;
  intelRequired: boolean;
  /** 0.3.0-C. Null for solo players and on rounds without alliances. */
  alliance: AllianceTagDto | null;
}

export interface TerritoryCrewStandingDto {
  rank: number;
  publicPimpId: number;
  displayName: string;
  alliance: AllianceTagDto | null;
  heldSeconds: number;
  currentBlocks: number;
  isYou: boolean;
  hallOfFameLeader: boolean;
}

export interface TerritoryAllianceStandingDto {
  rank: number;
  name: string;
  tag: string;
  heldSeconds: number;
  currentBlocks: number;
  isYours: boolean;
  hallOfFameLeader: boolean;
}

export interface TerritoryBoardDto {
  enabled: true;
  asOf: string;
  crews: TerritoryCrewStandingDto[];
  alliances: TerritoryAllianceStandingDto[];
}

export interface RankingsDto {
  national: RankingEntryDto[];
  local: RankingEntryDto[];
  localCity: CityDto;
  me: {
    publicPimpId: number;
    localRank: number;
    nationalRank: number;
  };
  /** 0.6.0-E. Block-time board; null/absent on older rulesets or older servers. */
  territory?: TerritoryBoardDto | null;
}

export interface PublicPlayerProfileDto {
  forumProfileUrl: string | null;
  badges: ProfileBadgeDto[];
  forumGroups: ForumGroupBadgeDto[];
  cosmetics: {
    title: string | null;
    accent: ProfileAccent;
    frame: string | null;
  };
  publicPimpId: number;
  displayName: string;
  /** 0.9.0-F. Optional account-level crew name. */
  crewName: string | null;
  /** 0.9.0-F. The live season this profile belongs to. */
  seasonName: string;
  /** 0.3.0-C. Null for solo players and on rounds without alliances. */
  alliance: AllianceTagDto | null;
  city: CityDto;
  netWorthCents: number;
  rank: {
    local: number;
    national: number;
    localHeldSinceAt: string;
    nationalHeldSinceAt: string;
    localMovement: number | null;
    nationalMovement: number | null;
  };
  legacy: PublicLegacyDto;
  career: PublicCareerDto;
  awards: PublicAwardDto[];
  /** 0.9.0-F. The player's featured achievements, in their chosen order. */
  showcase: PublicAwardDto[];
  /** 0.9.0-F. This season's stat sheet, sealed where it would be free intel. */
  statSheet: PublicStatSheetDto;
  crew: {
    whores: number;
    thugs: number;
  } | null;
  weapons: {
    pistols: number;
    shotguns: number;
    tek9s: number;
    ak47s: number;
    total: number;
  } | null;
  lowRiders: number | null;
  intelRequired: boolean;
  joinedAt: string;
  lastActiveAt: string;
  isYou: boolean;
}

export interface PublicPlayerProfileResponseDto {
  player: PublicPlayerProfileDto;
}

export interface PublicCareerResponseDto {
  career: PublicCareerDto;
}

export interface ActivityHistoryDto {
  activity: ActivityDto[];
}

/** Internal Discord bot API: role keys per Discord member ID (linked, active accounts only). */
export interface DiscordRoleSyncDto {
  members: Record<string, string[]>;
}

/** Internal Discord bot API: public profile card. Never crew, weapons or cash. */
export interface DiscordProfileCardDto {
  roundName: string;
  displayName: string;
  publicPimpId: number;
  city: string;
  netWorthCents: number;
  rank: { local: number; national: number; nationalMovement: number | null };
  legacy: PublicLegacyDto;
  badges: ProfileBadgeDto[];
  profileUrl: string;
  forumProfileUrl: string | null;
}

export interface DiscordRankingEntryDto {
  rank: number;
  publicPimpId: number;
  displayName: string;
  city: string;
  netWorthCents: number;
  movement: number | null;
  profileUrl: string;
}

export interface DiscordRankingsDto {
  round: { name: string; status: string; endsAt: string } | null;
  /** Set for a city's rankings; null for national. */
  city: DiscordCityDto | null;
  entries: DiscordRankingEntryDto[];
}

export interface DiscordCityDto {
  slug: string;
  name: string;
}

export interface DiscordHallOfFameDto {
  rounds: Array<{
    name: string;
    endedAt: string;
    podium: Array<{ rank: number; displayName: string; netWorthCents: number; city: string }>;
  }>;
}

export interface HallOfFamePlayerDto {
  rank: number;
  publicPimpId: number;
  displayName: string;
  /** 0.3.0-C. The alliance they finished the season in. */
  alliance: AllianceTagDto | null;
  netWorthCents: number;
  cashCents: number;
  city: string;
  hideout: SeasonHideoutDto;
  joinedAt: string;
  lastActiveAt: string;
}

export interface HallOfFameRoundDto {
  id: string;
  name: string;
  slug: string;
  status: RoundDto['status'];
  rulesetId: string;
  rulesetVersion: string;
  startsAt: string;
  endedAt: string;
  playerCount: number;
  podium: HallOfFamePlayerDto[];
  topTen: HallOfFamePlayerDto[];
  /** 0.6.0-E. Final block-time leaders for this season, when Territory was enabled. */
  territory?: {
    crews: Array<Pick<TerritoryCrewStandingDto, 'publicPimpId' | 'displayName' | 'alliance' | 'heldSeconds'>>;
    alliances: Array<Pick<TerritoryAllianceStandingDto, 'name' | 'tag' | 'heldSeconds'>>;
  } | null;
}

export interface HallOfFameDto {
  rounds: HallOfFameRoundDto[];
}

/** Internal Discord bot API: a player's full achievement list for /badges. */
export interface DiscordBadgesDto {
  roundName: string;
  displayName: string;
  publicPimpId: number;
  profileUrl: string;
  awards: PublicAwardDto[];
}

/** A published news post the bot has claimed for its news channel. */
export interface DiscordNewsPostDto {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  publishedAt: string;
  authorName: string | null;
  url: string;
}

/** A due turn reminder: the member's turns reached the cap since the last one. */
export interface DiscordTurnReminderDto {
  discordId: string;
  displayName: string;
  roundName: string;
  turns: number;
  cap: number;
  url: string;
}

export type DiscordAlertType = 'attacks' | 'round' | 'rank' | 'turns' | 'turf' | 'alliance';

/** Private /alerts state for one member. */
export interface DiscordAlertSettingsDto {
  alerts: Record<DiscordAlertType, boolean>;
  roundName: string | null;
  /** Current turns and national rank when the member has joined the current round. */
  current: { turns: number; cap: number; nationalRank: number } | null;
}

export type DiscordBattleKind = 'RAID' | 'DRIVE_BY' | 'DRUG_HOES' | 'STEAL_RIDE' | 'LURE_CREW';

/** A new battle for the raid feed. Names and result only: no loot, crew or weapons. */
export interface DiscordBattleEventDto {
  id: string;
  kind: DiscordBattleKind;
  roundName: string;
  attackerName: string;
  attackerProfileUrl: string;
  defenderName: string;
  defenderProfileUrl: string;
  attackerWon: boolean;
  createdAt: string;
}

/** A successful turf push for the public street/combat feed. */
export interface DiscordTurfEventDto {
  id: string;
  roundName: string;
  city: string;
  cityName: string;
  district: string;
  districtName: string;
  attackerName: string;
  attackerProfileUrl: string;
  attackerAllianceTag: string | null;
  defenderName: string;
  defenderProfileUrl: string;
  settledAt: string;
}

export interface DiscordTurfCityDto {
  roundName: string;
  city: { slug: string; name: string };
  control: {
    alliance: AllianceTagDto;
    blocksHeld: number;
    blocksTotal: number;
    share: number;
  } | null;
  blocks: Array<{
    district: string;
    districtName: string;
    holder: {
      publicPimpId: number;
      displayName: string;
      alliance: AllianceTagDto | null;
    } | null;
    cornerThugs: number;
    cornerGuns: number;
    localsThugs: number;
    vacant: boolean;
    heldSince: string | null;
    shieldUntil: string | null;
  }>;
}

export interface DiscordAllianceCardDto {
  roundName: string;
  alliance: AllianceDetailDto;
  turf: {
    blocksHeld: number;
    citiesControlled: number;
    cities: Array<{
      slug: string;
      name: string;
      blocksHeld: number;
      blocksTotal: number;
      controls: boolean;
    }>;
    recent: DiscordTurfEventDto[];
  };
}

/** 0.6.0-E. An alliance gained, lost or directly stole control of a city. */
export interface DiscordTerritoryEventDto {
  id: string;
  roundName: string;
  city: string;
  cityName: string;
  previous: { name: string; tag: string; blocksHeld: number } | null;
  next: { name: string; tag: string; blocksHeld: number } | null;
  blocksTotal: number;
  happenedAt: string;
}

/** 0.6.0-F. Public warning/result for the one seeded late-round Federal turf sweep. */
export interface DiscordCrackdownEventDto {
  id: string;
  phase: 'warning' | 'sweep';
  roundName: string;
  city: string;
  cityName: string;
  warningAt: string;
  sweepAt: string;
  holdersAffected: number;
  thugsPickedUp: number;
}

export interface DiscordRankAlertDto {
  discordId: string;
  displayName: string;
  roundName: string;
  kind: 'lost-first' | 'out-of-top-10';
  rank: number;
  leaderName: string | null;
  url: string;
}

export interface DiscordRoundEventDto {
  type: 'opened' | 'ending-soon' | 'ended';
  roundName: string;
  status: string;
  startsAt: string;
  endsAt: string;
  url: string;
  /** Final top 10, for "ended" only. */
  standings: DiscordRankingEntryDto[];
}

/** A battle DM for the defender. */
export interface DiscordAttackAlertDto extends DiscordBattleEventDto {
  discordId: string;
}

/** A round DM; rank is the member's in that round, when they played it. */
export interface DiscordRoundAlertDto extends DiscordRoundEventDto {
  discordId: string;
  rank: number | null;
}

/**
 * Everything the bot sends, each handed out once. battles and rounds feed the
 * public channels; the rest are private DMs.
 */
export interface DiscordAlertsClaimDto {
  turns: DiscordTurnReminderDto[];
  ranks: DiscordRankAlertDto[];
  attacks: DiscordAttackAlertDto[];
  roundAlerts: DiscordRoundAlertDto[];
  turfAlerts: Array<DiscordTurfEventDto & { discordId: string }>;
  allianceAlerts: Array<DiscordTerritoryEventDto & { discordId: string; allianceTag: string; change: 'gained' | 'lost' }>;
  /** 0.9.0-G categories, already worded; older bots ignore the field. */
  notices: Array<GameNoticeDto & { discordId: string; category: NoticeCategory }>;
  battles: DiscordBattleEventDto[];
  turf: DiscordTurfEventDto[];
  territory: DiscordTerritoryEventDto[];
  crackdowns: DiscordCrackdownEventDto[];
  rounds: DiscordRoundEventDto[];
}

/**
 * 0.9.0-G. One alert, already worded, safe for a lock screen: names and places the
 * player is already entitled to see in game, never amounts, crew or weapons.
 */
export interface GameNoticeDto {
  title: string;
  body: string;
  url: string;
  /** Notices sharing a tag replace each other on a device instead of stacking. */
  tag: string;
}

export type { NotificationCategory } from '../notifications.js';

/** One alert as the server stores it, before a channel adds its own address. */
export type NotificationPayload =
  | { category: 'attacks'; battle: DiscordBattleEventDto }
  | { category: 'turns'; reminder: Omit<DiscordTurnReminderDto, 'discordId'> }
  | { category: 'rank'; alert: Omit<DiscordRankAlertDto, 'discordId'> }
  | { category: 'round'; event: DiscordRoundEventDto; rank: number | null }
  | { category: 'turf'; event: DiscordTurfEventDto }
  | { category: 'alliance'; event: DiscordTerritoryEventDto; allianceTag: string; change: 'gained' | 'lost' }
  | { category: NoticeCategory; notice: GameNoticeDto };

export interface PushDeviceDto {
  id: string;
  /** First 16 hex characters of the endpoint's SHA-256, so a browser can spot itself without the endpoint leaving the server. */
  endpointHash: string;
  label: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSuccessAt: string | null;
}

/** The account settings Alerts panel. */
export interface NotificationSettingsDto {
  categories: Record<NotificationCategory, boolean>;
  channels: { discord: boolean; push: boolean };
  /** 0.9.0-G master switch: true pauses every outside alert. */
  paused: boolean;
  /** 0.9.0-G. Outside alerts are not sent inside this local window; the bell keeps everything. */
  quietHours: { start: number; end: number; timeZone: string } | null;
  /** 0.9.0-G. Categories hidden from the in-game bell. */
  bellMuted: NotificationCategory[];
  discordLinked: boolean;
  push: {
    /** False until the server has VAPID keys. */
    available: boolean;
    vapidPublicKey: string | null;
    devices: PushDeviceDto[];
  };
}

/** One durable item in the in-game notification bell. */
export interface InAppNotificationDto {
  id: string;
  readAt: string | null;
  activity: ActivityDto;
}

export interface InAppNotificationFeedDto {
  notifications: InAppNotificationDto[];
  unreadCount: number;
  /** 0.9.0-G. Categories this account muted in the bell, so live toasts can skip them too. */
  bellMuted?: NotificationCategory[];
}

/** Private /stats: the member's own dashboard numbers. */
export interface DiscordStatsDto {
  roundName: string;
  displayName: string;
  publicPimpId: number;
  profileUrl: string;
  cashCents: number;
  netWorthCents: number;
  payoutPercent: number;
  turns: { turns: number; cap: number; nextTurnAt: string; perTick: number };
  crew: { whores: number; thugs: number; fitThugs: number; woundedThugs: number; armedThugs: number };
  weapons: { pistols: number; shotguns: number; tek9s: number; ak47s: number };
  supplies: { condoms: number; medicine: number; crack: number; beer: number };
  lowRiders: number;
  happiness: { whore: number; thug: number };
  rank: { local: number | null; national: number | null };
}

export type DiscordLeaderboardStat = 'raids' | 'defenses' | 'drive-bys' | 'recon' | 'rides' | 'lures';

export interface DiscordLeaderboardDto {
  round: { name: string; status: string; endsAt: string } | null;
  stat: DiscordLeaderboardStat;
  label: string;
  entries: Array<{ rank: number; publicPimpId: number; displayName: string; city: string; value: number; profileUrl: string }>;
}

export interface DiscordHistoryDto {
  displayName: string;
  rounds: Array<{ name: string; endedAt: string; displayName: string; rank: number | null; netWorthCents: number; city: string }>;
  legacy: PublicLegacyDto;
}

export interface DiscordNewsCreatedDto {
  id: string;
  title: string;
  url: string;
  roundName: string | null;
}

/** Private /link status for one Discord member. */
export interface DiscordMemberDto {
  linked: boolean;
  username: string | null;
  forumUsername: string | null;
  roundName: string | null;
  player: { displayName: string; publicPimpId: number; profileUrl: string } | null;
  roles: string[];
}

export interface GameNewsDto {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  publishedAt: string;
  authorName: string | null;
}

export interface GameNewsFeedDto {
  news: GameNewsDto[];
}

export interface GameStatusDto {
  round: RoundDto | null;
  ruleset: {
    id: string;
    version: string;
    name: string;
  } | null;
  turns: {
    amountPerInterval: number;
    intervalMinutes: number;
    cap: number;
    awayBonus: {
      enabled: boolean;
      afterHours: number;
      amount: number;
    };
  } | null;
}

export type AdminSeasonChecklistStatus = 'done' | 'todo' | 'warning';

export interface AdminSeasonChecklistItemDto {
  key: string;
  label: string;
  status: AdminSeasonChecklistStatus;
  detail: string;
  action: string | null;
  href: string | null;
}

export interface AdminSeasonChecklistDto {
  now: string;
  currentRound: RoundDto | null;
  latestEndedRound: RoundDto | null;
  nextRound: RoundDto | null;
  openExpiredRounds: number;
  activeRoundCount: number;
  items: AdminSeasonChecklistItemDto[];
}
