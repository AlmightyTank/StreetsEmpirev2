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


export interface PublicRankingsDto {
  generatedAt: string;
  round: RoundDto | null;
  rankings: Array<PublicRankingEntryDto & {
    movement: number | null;
  }>;
}

export interface PublicCareerSeasonDto {
  round: {
    slug: string;
    name: string;
    startsAt: string;
    endedAt: string;
  };
  publicPimpId: number;
  displayName: string;
  city: { slug: string; name: string };
  alliance: { name: string; tag: string } | null;
  finalNetWorthCents: number;
  localRank: number | null;
  nationalRank: number | null;
}

export interface PublicPlayerPageDto {
  round: RoundDto;
  player: {
    publicPimpId: number;
    displayName: string;
    netWorthCents: number;
    city: { slug: string; name: string };
    alliance: { name: string; tag: string } | null;
    rank: {
      national: number;
      local: number;
      nationalMovement: number | null;
      localMovement: number | null;
    };
    cosmetics: {
      title: string | null;
      accent: string;
    };
    joinedAt: string;
    lastActiveAt: string;
  };
  career: {
    roundsPlayed: number;
    roundWins: number;
    topTenFinishes: number;
    bestNationalRank: number | null;
    totalFinalNetWorthCents: number;
    seasons: PublicCareerSeasonDto[];
  };
}

export interface PublicAllianceRankingDto {
  rank: number;
  name: string;
  tag: string;
  combinedNetWorthCents: number;
  memberCount: number;
  turfBlocks: number;
}

export interface PublicAlliancesDto {
  generatedAt: string;
  round: RoundDto | null;
  alliances: PublicAllianceRankingDto[];
}

export interface PublicAlliancePageDto extends PublicAllianceRankingDto {
  leader: {
    publicPimpId: number;
    displayName: string;
  } | null;
  members: Array<{
    publicPimpId: number;
    displayName: string;
    nationalRank: number;
    netWorthCents: number;
    city: { slug: string; name: string };
    isLeader: boolean;
  }>;
  foundedAt: string;
}

export interface PublicCitySummaryDto {
  slug: string;
  name: string;
  trait: string | null;
  blurb: string | null;
  talk: string[];
  playerCount: number;
  economyNetWorthCents: number;
  turfBlocksHeld: number;
  turfBlocksTotal: number;
  topPlayers: PublicRankingEntryDto[];
}

export interface PublicCitiesDto {
  generatedAt: string;
  round: RoundDto | null;
  cities: PublicCitySummaryDto[];
}

export interface PublicCityPageDto extends PublicCitySummaryDto {
  districts: Array<{
    key: string;
    name: string;
    blurb: string | null;
    holder: {
      publicPimpId: number;
      displayName: string;
      alliance: { name: string; tag: string } | null;
      heldSince: string | null;
    } | null;
  }>;
}

export interface PublicTurfBlockDto {
  city: { slug: string; name: string };
  district: string;
  districtName: string;
  holder: {
    publicPimpId: number;
    displayName: string;
    alliance: { name: string; tag: string } | null;
  } | null;
  heldSince: string | null;
}

export interface PublicTurfDto {
  generatedAt: string;
  round: RoundDto | null;
  enabled: boolean;
  blocks: PublicTurfBlockDto[];
  recentCaptures: PublicTurfEventDto[];
}

export interface PublicHallOfFameDto {
  generatedAt: string;
  champions: Array<{
    round: { slug: string; name: string; endedAt: string };
    winners: PublicSeasonStandingDto[];
  }>;
  career: Array<{
    displayName: string;
    wins: number;
    topTenFinishes: number;
    roundsPlayed: number;
    totalFinalNetWorthCents: number;
  }>;
}

export interface PublicStatsDto {
  generatedAt: string;
  current: PublicCurrentGameDto['stats'] | null;
  allTime: {
    completedGames: number;
    playerSeasons: number;
    finalEconomyNetWorthCents: number;
    combatBattles: number;
    travelRuns: number;
    turfBattles: number;
    turfCaptures: number;
  };
}

export interface PublicNewsArticleDto {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  publishedAt: string;
  authorName: string | null;
  round: { slug: string; name: string } | null;
}

export interface PublicNewsFeedDto {
  generatedAt: string;
  news: PublicNewsArticleDto[];
}

export interface PublicSearchResultDto {
  kind: 'player' | 'alliance' | 'game' | 'news' | 'city';
  title: string;
  subtitle: string;
  href: string;
}

export interface PublicSearchDto {
  query: string;
  results: PublicSearchResultDto[];
}

export interface PublicStatusDto {
  generatedAt: string;
  api: 'operational';
  database: 'operational';
  currentRound: {
    name: string;
    status: string;
  } | null;
}
