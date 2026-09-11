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
