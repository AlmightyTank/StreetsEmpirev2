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
  slug: string | null;
  name: string | null;
  participants: number;
  eligibleCompetitors: number;
  netWorthCents: string;
  crewMembers: number;
  turfBlocksHeld: number;
  activeBusinessesHeld: number;
}

export interface RoundAftermathCityLeaderboardEntryDto {
  localRank: number;
  nationalRank: number;
  publicPimpId: number;
  displayName: string;
  netWorthCents: string;
  crewMembers: number;
  turfBlocksHeld: number;
  activeBusinessesHeld: number;
}

export interface RoundAftermathCityDetailDto {
  city: RoundAftermathCityDto;
  reportStatus: RoundAftermathReportStatus;
  localStandings: RoundAftermathCityLeaderboardEntryDto[];
}

export interface RoundAftermathAllianceMemberDto {
  publicPimpId: number;
  displayName: string;
  cityName: string;
  nationalRank: number;
  netWorthCents: string;
}

export interface RoundAftermathAllianceDto {
  name: string;
  tag: string;
  rank: number;
  memberCount: number;
  eligibleCompetitors: number;
  combinedNetWorthCents: string;
  turfBlocksHeld: number;
  activeBusinessesHeld: number;
  leader: Pick<RoundAftermathAllianceMemberDto, 'publicPimpId' | 'displayName'> | null;
  members: RoundAftermathAllianceMemberDto[];
  cityControl: Array<{ cityName: string | null; turfBlocksHeld: number }>;
}

export interface RoundAftermathAlliancesDto {
  reportStatus: RoundAftermathReportStatus;
  status: 'AVAILABLE' | 'NOT_RECORDED';
  reason: string | null;
  alliances: RoundAftermathAllianceDto[];
}

export interface RoundAftermathPersonalMetricDto {
  category: RoundAftermathCategoryKey;
  status: 'AVAILABLE' | 'NOT_RECORDED';
  value: string | null;
  rank: number | null;
  percentile: number | null;
  tiedCompetitors: number;
  unit: string | null;
}

export interface RoundAftermathPersonalBestDto {
  category: Exclude<RoundAftermathCategoryKey, 'drugs'>;
  value: string;
  roundId: string;
  roundName: string;
}

export interface RoundAftermathPersonalDto {
  reportStatus: RoundAftermathReportStatus;
  participation: 'PLAYED' | 'NOT_PLAYED' | 'UNKNOWN';
  round: { id: string; name: string } | null;
  player: {
    publicPimpId: number;
    displayName: string;
    cityName: string;
    eligibleCompetitor: boolean;
    nationalRank: number | null;
    localRank: number | null;
    eligibleCompetitors: number;
    percentile: number | null;
    netWorthCents: string;
    crewMembers: number;
    turfBlocksHeld: number;
    activeBusinessesHeld: number;
    raidsAttempted: number;
    driveBysAttempted: number;
    crimeActions: number;
  } | null;
  metrics: RoundAftermathPersonalMetricDto[];
  milestones: string[];
  personalBests: RoundAftermathPersonalBestDto[];
}

export interface RoundAftermathRecordsDto {
  reportStatus: RoundAftermathReportStatus;
  categoryStatus: RoundAftermathCategoryDto['status'];
  category: RoundAftermathCategoryKey;
  citySlug: string | null;
  award: {
    title: string;
    status: 'AVAILABLE' | 'NOT_RECORDED';
    formula: string;
    leaders: RoundAftermathLeaderDto[];
    leadersTruncated: boolean;
  };
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  entries: RoundAftermathLeaderboardEntryDto[];
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
