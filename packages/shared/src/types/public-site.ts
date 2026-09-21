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


export interface PublicSeasonStandingDto {
  nationalRank: number;
  localRank: number | null;
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

export interface PublicCompletedGameStatsDto {
  players: number;
  alliances: number;
  cities: number;
  economyNetWorthCents: number;
  combatBattles: number;
  driveBys: number;
  travelRuns: number;
  turfBattles: number;
  turfCaptures: number;
  turfBlocksHeldAtEnd: number;
}

export interface PublicAllianceSeasonStandingDto {
  rank: number;
  name: string;
  tag: string;
  combinedNetWorthCents: number;
  memberCount: number;
}

export interface PublicCitySeasonResultDto {
  city: {
    slug: string;
    name: string;
  };
  playerCount: number;
  economyNetWorthCents: number;
  champions: PublicSeasonStandingDto[];
}

export interface PublicGameArchiveEntryDto {
  id: string;
  slug: string;
  name: string;
  status: 'ENDED' | 'ARCHIVED';
  ruleset: {
    id: string;
    version: string;
    name: string;
  };
  startsAt: string;
  endedAt: string;
  playerCount: number;
  champions: PublicSeasonStandingDto[];
  stats: PublicCompletedGameStatsDto;
}

export interface PublicGamesArchiveDto {
  generatedAt: string;
  currentRound: RoundDto | null;
  games: PublicGameArchiveEntryDto[];
}

export interface PublicGameDetailDto extends PublicGameArchiveEntryDto {
  podium: PublicSeasonStandingDto[];
  standings: PublicSeasonStandingDto[];
  allianceStandings: PublicAllianceSeasonStandingDto[];
  cityResults: PublicCitySeasonResultDto[];
}
