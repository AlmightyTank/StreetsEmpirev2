import type { RoundDto } from './api.js';

export interface PublicRankingEntryDto {
  rank: number;
  publicPimpId: number;
  displayName: string;
  netWorthCents: number;
  city: {
    slug: string;
    name: string;
  };
  alliance: {
    name: string;
    tag: string;
  } | null;
}

export interface PublicTurfEventDto {
  kind: 'TURF_CAPTURE';
  occurredAt: string;
  player: {
    publicPimpId: number;
    displayName: string;
  };
  alliance: {
    name: string;
    tag: string;
  } | null;
  city: {
    slug: string;
    name: string;
  };
  district: string;
}

export interface PublicNewsPreviewDto {
  id: string;
  title: string;
  isPinned: boolean;
  publishedAt: string;
}

export interface PublicCurrentGameDto {
  round: RoundDto;
  ruleset: {
    id: string;
    version: string;
    name: string;
  };
  stats: {
    players: number;
    alliances: number;
    cities: number;
    turfBlocksHeld: number;
    turfBattles: number;
    economyNetWorthCents: number;
  };
  topRankings: PublicRankingEntryDto[];
  recentEvents: PublicTurfEventDto[];
  recentNews: PublicNewsPreviewDto[];
}

export interface PublicOverviewDto {
  generatedAt: string;
  currentGame: PublicCurrentGameDto | null;
  allTime: {
    completedGames: number;
    activeAccounts: number;
  };
}
