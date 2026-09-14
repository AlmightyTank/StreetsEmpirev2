import type { ActivityDto, CityDto, RoundDto } from './api.js';

export type PublicAchievementCategory = 'rank' | 'wealth' | 'combat' | 'intel' | 'reputation' | 'legacy';
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
  bestNationalRank: number | null;
  totalFinalNetWorthCents: number;
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
  publicPimpId: number;
  displayName: string;
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

export interface DiscordReminderStateDto {
  turns: boolean;
  roundName: string | null;
  /** Current turns and cap when the member has joined the current round. */
  current: { turns: number; cap: number } | null;
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
