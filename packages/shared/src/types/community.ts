import type { AllianceTagDto } from './alliance.js';
import type { ActivityDto, CityDto, ProfileAccent, RoundDto, SeasonHideoutDto } from './api.js';

export type PublicAchievementCategory = 'rank' | 'wealth' | 'combat' | 'intel' | 'reputation' | 'hideout' | 'legacy';
export type PublicAchievementRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface PublicAchievementProgressDto {
  current: number;
  target: number;
  label: string;
}

export interface PublicAwardDto {
  key: string;
  title: string;
  description: string;
  category: PublicAchievementCategory;
  rarity: PublicAchievementRarity;
  unlocked: boolean;
  earnedAt: string | null;
  progress: PublicAchievementProgressDto | null;
}

/** A compact profile badge: an earned achievement, shown on game and forum profiles. */
export interface ProfileBadgeDto {
  key: string;
  title: string;
  description: string;
  category: PublicAchievementCategory;
  rarity: PublicAchievementRarity;
  /** Legacy badges carry across rounds; the rest reset with the round. */
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
  traderFavors: number;
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
  hideout: SeasonHideoutDto;
  joinedAt: string;
  lastActiveAt: string;
}

export interface PublicCareerDto {
  legacy: PublicLegacyDto;
  seasons: PublicSeasonResultDto[];
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

export interface RankingsDto {
  national: RankingEntryDto[];
  local: RankingEntryDto[];
  localCity: CityDto;
  me: {
    publicPimpId: number;
    localRank: number;
    nationalRank: number;
  };
}

export interface PublicPlayerProfileDto {
  forumProfileUrl: string | null;
  badges: ProfileBadgeDto[];
  forumGroups: ForumGroupBadgeDto[];
  cosmetics: {
    title: string | null;
    accent: ProfileAccent;
  };
  publicPimpId: number;
  displayName: string;
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

export type DiscordAlertType = 'attacks' | 'round' | 'rank' | 'turns';

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
  battles: DiscordBattleEventDto[];
  rounds: DiscordRoundEventDto[];
}

/** Alert categories a player can switch on, delivered by any channel. */
export type NotificationCategory = DiscordAlertType;

/** One alert as the server stores it, before a channel adds its own address. */
export type NotificationPayload =
  | { category: 'attacks'; battle: DiscordBattleEventDto }
  | { category: 'turns'; reminder: Omit<DiscordTurnReminderDto, 'discordId'> }
  | { category: 'rank'; alert: Omit<DiscordRankAlertDto, 'discordId'> }
  | { category: 'round'; event: DiscordRoundEventDto; rank: number | null };

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
  discordLinked: boolean;
  push: {
    /** False until the server has VAPID keys. */
    available: boolean;
    vapidPublicKey: string | null;
    devices: PushDeviceDto[];
  };
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
