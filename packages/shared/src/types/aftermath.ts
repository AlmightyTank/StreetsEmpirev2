export type RoundAftermathReportStatus = 'PREPARING' | 'READY' | 'UNAVAILABLE';

export type RoundAftermathCategoryKey =
  | 'wealth'
  | 'turf'
  | 'crew'
  | 'drugs'
  | 'businesses'
  | 'crime'
  | 'competition';

export interface RoundAftermathRoundDto {
  id: string;
  name: string;
  slug: string;
  status: string;
  rulesetVersion: string;
  startsAt: string;
  endsAt: string;
}

export interface RoundAftermathCityDto {
  name: string | null;
  participants: number;
  eligibleCompetitors: number;
  netWorthCents: string;
  crewMembers: number;
  turfBlocksHeld: number;
  activeBusinessesHeld: number;
}

export interface RoundAftermathOverviewDto {
  round: RoundAftermathRoundDto;
  report: {
    status: RoundAftermathReportStatus;
    schemaVersion: number | null;
    sourceRevision: string | null;
    cutoffAt: string | null;
    finalizedAt: string | null;
  };
  global: {
    participants: number;
    eligibleCompetitors: number;
    citiesInRound: number;
    finalNetWorthCents: string;
    finalCrewMembers: number;
    playerHeldTurfBlocks: number;
    activeBusinessesHeld: number;
    crimeActions: number;
  } | null;
  cities: RoundAftermathCityDto[];
}

export interface RoundAftermathLeaderDto {
  publicPimpId: number;
  displayName: string;
  cityName: string;
  rank: number;
  value: string;
}

export interface RoundAftermathCategoryDto {
  key: RoundAftermathCategoryKey;
  title: string;
  status: 'AVAILABLE' | 'NOT_RECORDED' | 'PREPARING' | 'UNAVAILABLE';
  description: string;
  unit: string | null;
  leaders: RoundAftermathLeaderDto[];
}

export interface RoundAftermathCategoriesDto {
  reportStatus: RoundAftermathReportStatus;
  categories: RoundAftermathCategoryDto[];
}

export interface RoundAftermathLeaderboardEntryDto {
  rank: number;
  publicPimpId: number;
  displayName: string;
  cityName: string;
  value: string;
}

export interface RoundAftermathLeaderboardDto {
  reportStatus: RoundAftermathReportStatus;
  categoryStatus: RoundAftermathCategoryDto['status'];
  category: RoundAftermathCategoryKey;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  entries: RoundAftermathLeaderboardEntryDto[];
}
