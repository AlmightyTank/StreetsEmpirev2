import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  RoundAftermathArchiveDto,
  RoundAftermathCategoriesDto,
  RoundAftermathCategoryDto,
  RoundAftermathCategoryKey,
  RoundAftermathAlliancesDto,
  RoundAftermathCityDetailDto,
  RoundAftermathCityDto,
  RoundAftermathLeaderboardDto,
  RoundAftermathOverviewDto,
  RoundAftermathPersonalDto,
  RoundAftermathPersonalBestDto,
  RoundAftermathPersonalMetricDto,
  RoundAftermathRecordsDto,
} from '@streets/shared';
import { z } from 'zod';
import { AppError } from '../utils/errors.js';

const playerSchema = z.object({
  roundPlayerId: z.string(),
  accountId: z.string().optional(),
  publicPimpId: z.number().int(),
  displayName: z.string(),
  cityName: z.string(),
  citySlug: z.string().optional(),
  eligibleCompetitor: z.boolean(),
  nationalRank: z.number().int().nullable(),
  localRank: z.number().int().nullable(),
  netWorthCents: z.string().regex(/^-?\d+$/),
  crewMembers: z.number().int().nonnegative(),
  drugUnitsHeld: z.number().int().nonnegative().optional(),
  turfBlocksHeld: z.number().int().nonnegative(),
  activeBusinessesHeld: z.number().int().nonnegative(),
  turfByCity: z.array(z.object({ citySlug: z.string().nullable(), count: z.number().int().nonnegative() })).optional(),
  businessesByCity: z.array(z.object({ citySlug: z.string().nullable(), count: z.number().int().nonnegative() })).optional(),
  raidsAttempted: z.number().int().nonnegative(),
  driveBysAttempted: z.number().int().nonnegative(),
}).passthrough();

const allianceSchema = z.object({
  name: z.string(),
  tag: z.string(),
  rank: z.number().int().positive(),
  memberCount: z.number().int().nonnegative(),
  eligibleCompetitors: z.number().int().nonnegative(),
  combinedNetWorthCents: z.string().regex(/^-?\d+$/),
  turfBlocksHeld: z.number().int().nonnegative(),
  activeBusinessesHeld: z.number().int().nonnegative(),
  leader: z.object({ publicPimpId: z.number().int(), displayName: z.string() }).nullable(),
  members: z.array(z.object({
    publicPimpId: z.number().int(),
    displayName: z.string(),
    cityName: z.string(),
    nationalRank: z.number().int(),
    netWorthCents: z.string().regex(/^-?\d+$/),
  })),
  cityControl: z.array(z.object({ cityName: z.string().nullable(), turfBlocksHeld: z.number().int().nonnegative() })),
}).strict();

export type PlayerSnapshot = z.infer<typeof playerSchema>;

function personalMetrics(
  subject: PlayerSnapshot,
  players: PlayerSnapshot[],
  records: Prisma.JsonValue | null,
): RoundAftermathPersonalMetricDto[] {
  const eligible = players.filter((player) => player.eligibleCompetitor && player.nationalRank !== null);
  const categories = new Map(mapCategories('READY', records, players).map((category) => [category.key, category.status]));
  return categoryDefinitions.map((definition) => {
    const status: RoundAftermathPersonalMetricDto['status'] = categories.get(definition.key) === 'AVAILABLE'
      ? 'AVAILABLE'
      : 'NOT_RECORDED';
    if (status !== 'AVAILABLE') {
      return {
        category: definition.key,
        status,
        value: null,
        rank: null,
        percentile: null,
        tiedCompetitors: 0,
        unit: definition.unit,
      };
    }
    const value = categoryValue(definition.key, subject);
    const isEligible = subject.eligibleCompetitor && subject.nationalRank !== null;
    const peers = isEligible ? eligible.filter((player) => categoryValue(definition.key, player) === value) : [];
    const rank = !isEligible
      ? null
      : definition.key === 'competition'
        ? subject.nationalRank
        : 1 + eligible.filter((player) => categoryValue(definition.key, player) > value).length;
    const percentile = rank === null
      ? null
      : eligible.length <= 1
        ? 100
        : Math.round(((eligible.length - rank) / (eligible.length - 1)) * 1000) / 10;
    return {
      category: definition.key,
      status,
      value: definition.key === 'competition' && !isEligible ? null : definition.valueFor(subject),
      rank,
      percentile,
      tiedCompetitors: peers.length,
      unit: definition.unit,
    };
  });
}

export function buildRoundAftermathPersonal(
  round: { id: string; name: string },
  accountId: string,
  players: PlayerSnapshot[],
  categoryRecords: Prisma.JsonValue | null,
): RoundAftermathPersonalDto {
  const subject = players.find((player) => player.accountId === accountId);
  if (!subject) {
    return {
      reportStatus: 'READY',
      participation: 'NOT_PLAYED',
      round,
      player: null,
      metrics: [],
      milestones: [],
      personalBests: [],
    };
  }
  const eligible = players.filter((player) => player.eligibleCompetitor && player.nationalRank !== null);
  const player = {
    publicPimpId: subject.publicPimpId,
    displayName: subject.displayName,
    cityName: subject.cityName,
    eligibleCompetitor: subject.eligibleCompetitor,
    nationalRank: subject.nationalRank,
    localRank: subject.localRank,
    eligibleCompetitors: eligible.length,
    percentile: subject.eligibleCompetitor && subject.nationalRank !== null
      ? eligible.length <= 1
        ? 100
        : Math.round(((eligible.length - subject.nationalRank) / (eligible.length - 1)) * 1000) / 10
      : null,
    netWorthCents: subject.netWorthCents,
    crewMembers: subject.crewMembers,
    turfBlocksHeld: subject.turfBlocksHeld,
    activeBusinessesHeld: subject.activeBusinessesHeld,
    raidsAttempted: subject.raidsAttempted,
    driveBysAttempted: subject.driveBysAttempted,
    crimeActions: subject.raidsAttempted + subject.driveBysAttempted,
  };
  const metrics = personalMetrics(subject, players, categoryRecords);
  const milestones: string[] = [];
  if (subject.nationalRank === 1) milestones.push('Round champion');
  if (subject.nationalRank !== null && subject.nationalRank <= 3) milestones.push('National podium');
  if (subject.nationalRank !== null && subject.nationalRank <= 10) milestones.push('National top 10');
  if (subject.localRank === 1) milestones.push('Local city champion');
  const subjectCategories = mapCategories('READY', categoryRecords, players);
  for (const category of subjectCategories) {
    if (category.key === 'competition' || category.status !== 'AVAILABLE') continue;
    const subjectValue = categoryValue(category.key, subject);
    const hasTopRecord = category.leaders.some((leader) => leader.publicPimpId === subject.publicPimpId);
    if (hasTopRecord && subjectValue >= 0n) milestones.push(`${category.title} category leader`);
  }
  return {
    reportStatus: 'READY',
    participation: 'PLAYED',
    round,
    player,
    metrics,
    milestones,
    personalBests: [],
  };
}

export function buildRoundAftermathCityDetail(
  city: RoundAftermathCityDto,
  players: PlayerSnapshot[],
  reportStatus: RoundAftermathCityDetailDto['reportStatus'],
): RoundAftermathCityDetailDto {
  const localStandings = reportStatus === 'READY'
    ? players
      .filter((player) => player.eligibleCompetitor && player.nationalRank !== null && player.localRank !== null)
      .sort((a, b) => (a.localRank! - b.localRank!) || (a.publicPimpId - b.publicPimpId))
      .map((player) => ({
        localRank: player.localRank!,
        nationalRank: player.nationalRank!,
        publicPimpId: player.publicPimpId,
        displayName: player.displayName,
        netWorthCents: player.netWorthCents,
        crewMembers: player.crewMembers,
        turfBlocksHeld: player.turfBlocksHeld,
        activeBusinessesHeld: player.activeBusinessesHeld,
      }))
    : [];
  return { city, reportStatus, localStandings };
}

const globalSchema = z.object({
  participants: z.number().int().nonnegative(),
  eligibleCompetitors: z.number().int().nonnegative(),
  citiesInRound: z.number().int().nonnegative(),
  finalNetWorthCents: z.string().regex(/^-?\d+$/),
  finalCrewMembers: z.number().int().nonnegative(),
  playerHeldTurfBlocks: z.number().int().nonnegative(),
  activeBusinessesHeld: z.number().int().nonnegative(),
  crimeActions: z.number().int().nonnegative(),
  territoryAwards: z.object({
    regions: z.array(z.object({ regionKey: z.string(), allianceId: z.string(), highestTier: z.number().int().positive() })),
    nationalKingpinAllianceId: z.string().nullable(),
    awards: z.array(z.object({ allianceId: z.string(), awardKey: z.string(), scopeKey: z.string() })),
  }).optional(),
}).strict();

const citySchema = z.object({
  citySlug: z.string().nullable().optional(),
  cityName: z.string().nullable(),
  participants: z.number().int().nonnegative(),
  eligibleCompetitors: z.number().int().nonnegative(),
  netWorthCents: z.string().regex(/^-?\d+$/),
  crewMembers: z.number().int().nonnegative(),
  turfBlocksHeld: z.number().int().nonnegative(),
  activeBusinessesHeld: z.number().int().nonnegative(),
}).passthrough();

const recordSchema = z.object({
  status: z.enum(['AVAILABLE', 'NOT_RECORDED']),
  value: z.number().int().nonnegative().optional(),
  valueCents: z.string().regex(/^-?\d+$/).nullable().optional(),
  ids: z.array(z.string()).optional(),
  roundPlayerIds: z.array(z.string()).optional(),
  unit: z.string().optional(),
  reason: z.string().optional(),
}).passthrough();

type AftermathRecord = z.infer<typeof recordSchema>;

const categoryDefinitions: Array<{
  key: RoundAftermathCategoryKey;
  title: string;
  recordKey: string;
  description: string;
  unit: string | null;
  valueFor: (player: PlayerSnapshot) => string;
}> = [
  { key: 'wealth', title: 'Wealth', recordKey: 'wealth', description: 'Final net worth at the frozen round cutoff.', unit: 'cents', valueFor: (player) => player.netWorthCents },
  { key: 'turf', title: 'Turf', recordKey: 'turf', description: 'Blocks held when the round closed; not captures or hold duration.', unit: 'blocks held', valueFor: (player) => String(player.turfBlocksHeld) },
  { key: 'crew', title: 'Crew', recordKey: 'crew', description: 'Active thug and worker headcount at the frozen cutoff.', unit: 'crew members', valueFor: (player) => String(player.crewMembers) },
  { key: 'drugs', title: 'Drugs', recordKey: 'drugUnitsHeld', description: 'Total drug inventory held by each player at the frozen round cutoff; not production or sales.', unit: 'units held', valueFor: (player) => String(player.drugUnitsHeld ?? 0) },
  { key: 'businesses', title: 'Businesses', recordKey: 'businesses', description: 'Active business lots held at the cutoff; not revenue or profit.', unit: 'active lots', valueFor: (player) => String(player.activeBusinessesHeld) },
  { key: 'crime', title: 'Crime', recordKey: 'crime', description: 'Attempted raids plus attempted drive-bys; not victories.', unit: 'attempts', valueFor: (player) => String(player.raidsAttempted + player.driveBysAttempted) },
  { key: 'competition', title: 'Competition', recordKey: 'competition', description: 'Frozen national placement from the final standings.', unit: 'final rank', valueFor: (player) => String(player.nationalRank ?? '') },
];

function jsonArray(value: Prisma.JsonValue | null, schema: typeof playerSchema, label: string): PlayerSnapshot[] {
  const parsed = z.array(schema).safeParse(value);
  if (!parsed.success) throw new AppError(500, 'AFTERMATH_REPORT_INVALID', `The finalized round report has invalid ${label}.`);
  return parsed.data;
}

function recordFor(records: Prisma.JsonValue | null, key: string): AftermathRecord | null {
  if (!records || typeof records !== 'object' || Array.isArray(records)) {
    throw new AppError(500, 'AFTERMATH_REPORT_INVALID', 'The finalized round report has invalid category data.');
  }
  const candidate = records[key];
  if (candidate === undefined && (key === 'competition' || key === 'drugUnitsHeld')) return null;
  const parsed = recordSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new AppError(500, 'AFTERMATH_REPORT_INVALID', `The finalized round report has invalid ${key} category data.`);
  }
  return parsed.data;
}

function recordStatus(record: AftermathRecord | null): 'AVAILABLE' | 'NOT_RECORDED' {
  return record?.status === 'AVAILABLE' ? 'AVAILABLE' : 'NOT_RECORDED';
}

function mapCategories(
  reportStatus: RoundAftermathCategoriesDto['reportStatus'],
  records: Prisma.JsonValue | null,
  players: PlayerSnapshot[],
): RoundAftermathCategoryDto[] {
  const playersById = new Map(players.map((player) => [player.roundPlayerId, player]));
  return categoryDefinitions.map((definition) => {
    if (reportStatus === 'PREPARING' || reportStatus === 'UNAVAILABLE') {
      return {
        key: definition.key,
        title: definition.title,
        status: reportStatus,
        description: definition.description,
        unit: definition.unit,
        leaders: [],
      };
    }

    const record = recordFor(records, definition.recordKey);
    const status = definition.key === 'competition'
      ? players.some((player) => player.eligibleCompetitor && player.nationalRank !== null) ? 'AVAILABLE' : 'NOT_RECORDED'
      : recordStatus(record);
    const ids = record?.roundPlayerIds ?? record?.ids ?? [];
    const leaderIds = definition.key === 'competition'
      ? players.filter((player) => player.nationalRank === 1).map((player) => player.roundPlayerId)
      : ids;
    const leaders = status === 'AVAILABLE'
      ? leaderIds.flatMap((id) => {
        const player = playersById.get(id);
        if (!player || !player.eligibleCompetitor) return [];
        return [{
          publicPimpId: player.publicPimpId,
          displayName: player.displayName,
          cityName: player.cityName,
          rank: player.nationalRank ?? 0,
          value: definition.valueFor(player),
        }];
      })
      : [];

    return {
      key: definition.key,
      title: definition.title,
      status,
      description: record?.reason ?? definition.description,
      unit: record?.unit ?? definition.unit,
      leaders,
    };
  });
}

function categoryValue(category: RoundAftermathCategoryKey, player: PlayerSnapshot): bigint {
  if (category === 'wealth') return BigInt(player.netWorthCents);
  if (category === 'competition') return BigInt(-(player.nationalRank ?? Number.MAX_SAFE_INTEGER));
  if (category === 'turf') return BigInt(player.turfBlocksHeld);
  if (category === 'crew') return BigInt(player.crewMembers);
  if (category === 'drugs') return BigInt(player.drugUnitsHeld ?? 0);
  if (category === 'businesses') return BigInt(player.activeBusinessesHeld);
  if (category === 'crime') return BigInt(player.raidsAttempted + player.driveBysAttempted);
  return 0n;
}

export function buildRoundAftermathLeaderboard(
  category: RoundAftermathCategoryKey,
  rows: PlayerSnapshot[],
  page: number,
  pageSize: number,
  reportStatus: RoundAftermathLeaderboardDto['reportStatus'],
  categoryStatus: RoundAftermathCategoryDto['status'] = reportStatus === 'READY'
    ? category === 'drugs' ? 'NOT_RECORDED' : 'AVAILABLE'
    : reportStatus,
): RoundAftermathLeaderboardDto {
  if (reportStatus !== 'READY' || categoryStatus !== 'AVAILABLE') {
    return {
      reportStatus,
      categoryStatus,
      category,
      page: 1,
      pageSize,
      total: 0,
      totalPages: 0,
      entries: [],
    };
  }
  const eligible = rows.filter((player) => player.eligibleCompetitor && player.nationalRank !== null);
  const sorted = eligible.sort((a, b) => {
    const aValue = categoryValue(category, a);
    const bValue = categoryValue(category, b);
    if (aValue !== bValue) return aValue > bValue ? -1 : 1;
    return a.publicPimpId - b.publicPimpId;
  });
  const totalPages = Math.ceil(sorted.length / pageSize);
  const effectivePage = Math.min(page, Math.max(totalPages, 1));
  const offset = (effectivePage - 1) * pageSize;
  let previousValue: bigint | null = null;
  let previousRank = 0;
  const ranked = sorted.map((player, index) => {
    const value = categoryValue(category, player);
    const rank = category === 'competition'
      ? player.nationalRank!
      : previousValue === value ? previousRank : index + 1;
    previousValue = value;
    previousRank = rank;
    return {
      rank,
      publicPimpId: player.publicPimpId,
      displayName: player.displayName,
      cityName: player.cityName,
      value: category === 'competition' ? String(player.nationalRank) : definitionFor(category).valueFor(player),
    };
  });
  return {
    reportStatus,
    categoryStatus,
    category,
    page: effectivePage,
    pageSize,
    total: sorted.length,
    totalPages,
    entries: ranked.slice(offset, offset + pageSize),
  };
}

function definitionFor(key: RoundAftermathCategoryKey) {
  return categoryDefinitions.find((definition) => definition.key === key)!;
}

const awardDefinitions: Record<RoundAftermathCategoryKey, { title: string; formula: string }> = {
  wealth: { title: 'Wealth King', formula: 'All players tied at frozen national rank #1; final net worth is displayed.' },
  turf: { title: 'Turf Warlord', formula: 'Highest player-held turf blocks at cutoff; ties share the award.' },
  crew: { title: 'Crew Commander', formula: 'Highest active thug and worker headcount at cutoff; ties share the award.' },
  drugs: { title: 'Drug Kingpin', formula: 'Highest total drug inventory held at round cutoff; ties share the award. This measures stock at cutoff, not production or sales.' },
  businesses: { title: 'Business Tycoon', formula: 'Highest active business lots held at cutoff; ties share the award.' },
  crime: { title: 'Most Feared', formula: 'Not awarded: attempted raids and drive-bys do not prove victories, defense, or fear.' },
  competition: { title: 'Round Champion', formula: 'Frozen national rank #1; tied champions are all listed.' },
};

function cityScore(category: RoundAftermathCategoryKey, player: PlayerSnapshot, citySlug: string): bigint {
  if (category === 'turf') {
    return BigInt(player.turfByCity?.find((entry) => entry.citySlug === citySlug)?.count ?? 0);
  }
  if (category === 'businesses') {
    return BigInt(player.businessesByCity?.find((entry) => entry.citySlug === citySlug)?.count ?? 0);
  }
  if (category === 'competition') return BigInt(-(player.localRank ?? Number.MAX_SAFE_INTEGER));
  return categoryValue(category, player);
}

export function buildRoundAftermathRecords(
  players: PlayerSnapshot[],
  category: RoundAftermathCategoryKey,
  page: number,
  pageSize: number,
  reportStatus: RoundAftermathRecordsDto['reportStatus'],
  citySlug: string | null,
  schemaVersion: number,
): RoundAftermathRecordsDto {
  const awardDefinition = awardDefinitions[category];
  const scopePlayers = citySlug
    ? players.filter((player) => {
      if (category === 'turf') return (player.turfByCity ?? []).some((entry) => entry.citySlug === citySlug);
      if (category === 'businesses') return (player.businessesByCity ?? []).some((entry) => entry.citySlug === citySlug);
      return player.citySlug === citySlug;
    })
    : players;
  const eligible = scopePlayers.filter((player) =>
    player.eligibleCompetitor
    && player.nationalRank !== null
    && (!citySlug || category === 'turf' || category === 'businesses' || player.localRank !== null),
  );
  const historicalCategoryMissing = Boolean(citySlug) && schemaVersion < 2;
  const cityMetricUnavailable = Boolean(citySlug) && category === 'crime';
  const cityPhysicalMetricMissing = Boolean(citySlug)
    && schemaVersion < 3
    && (category === 'turf' || category === 'businesses');
  const historicalDrugMetricMissing = category === 'drugs' && schemaVersion < 4;
  const supported = !citySlug || category !== 'crime';
  const categoryAvailable = supported && !historicalCategoryMissing && !cityMetricUnavailable && !cityPhysicalMetricMissing && !historicalDrugMetricMissing;
  const categoryStatus: RoundAftermathRecordsDto['categoryStatus'] = reportStatus !== 'READY'
    ? reportStatus
    : categoryAvailable && eligible.length ? 'AVAILABLE' : 'NOT_RECORDED';
  const score = (player: PlayerSnapshot) => citySlug
    ? cityScore(category, player, citySlug)
    : categoryValue(category, player);
  const rankedPlayers = categoryStatus === 'AVAILABLE'
    ? [...eligible].sort((a, b) => {
      const aValue = score(a);
      const bValue = score(b);
      if (aValue !== bValue) return aValue > bValue ? -1 : 1;
      return a.publicPimpId - b.publicPimpId;
    })
    : [];
  const total = rankedPlayers.length;
  const totalPages = Math.ceil(total / pageSize);
  const effectivePage = Math.min(page, Math.max(totalPages, 1));
  let priorScore: bigint | null = null;
  let priorRank = 0;
  const ranked = rankedPlayers.map((player, index) => {
    const value = score(player);
    const frozenCompetitionRank = category === 'competition'
      ? citySlug ? player.localRank : player.nationalRank
      : null;
    const rank = frozenCompetitionRank ?? (priorScore === value ? priorRank : index + 1);
    priorScore = value;
    priorRank = rank;
    return {
      rank,
      publicPimpId: player.publicPimpId,
      displayName: player.displayName,
      cityName: player.cityName,
      value: citySlug && category === 'competition'
        ? String(player.localRank)
        : citySlug && category === 'turf'
          ? String(player.turfByCity?.find((entry) => entry.citySlug === citySlug)?.count ?? 0)
          : citySlug && category === 'businesses'
            ? String(player.businessesByCity?.find((entry) => entry.citySlug === citySlug)?.count ?? 0)
            : category === 'competition'
              ? String(player.nationalRank)
              : definitionFor(category).valueFor(player),
      awardValue: value,
    };
  });
  const leaders = category === 'crime'
    ? []
    : categoryStatus === 'AVAILABLE' && ranked.length > 0
      && (category === 'wealth' || category === 'competition' || ranked[0]!.awardValue > 0n)
      ? category === 'wealth' && !citySlug
        ? ranked.filter((entry) => eligible.find((player) => player.publicPimpId === entry.publicPimpId)?.nationalRank === 1)
        : ranked.filter((entry) => entry.awardValue === ranked[0]!.awardValue)
      : [];
  const publicLeaders = leaders.slice(0, 100).map((entry) => ({
    publicPimpId: entry.publicPimpId,
    displayName: entry.displayName,
    cityName: entry.cityName,
    rank: entry.rank,
    value: entry.value,
  }));
  const offset = (effectivePage - 1) * pageSize;
  const entries = ranked.slice(offset, offset + pageSize).map((entry) => ({
    rank: entry.rank,
    publicPimpId: entry.publicPimpId,
    displayName: entry.displayName,
    cityName: entry.cityName,
    value: entry.value,
  }));
  const unavailableReason = category === 'drugs' && schemaVersion < 4
    ? 'This report predates frozen player drug inventory totals.'
    : category === 'drugs'
      ? 'No eligible player held drug inventory at the round cutoff.'
    : citySlug && category === 'crime'
      ? 'Crime actions have no trustworthy event-city attribution.'
      : citySlug && schemaVersion < 3 && (category === 'turf' || category === 'businesses')
        ? 'This report predates per-player physical-city holdings.'
        : awardDefinition.formula;
  const awardFormula = citySlug && category === 'wealth'
    ? 'Highest final net worth among eligible residents of this city; ties share the award.'
    : citySlug && category === 'turf'
      ? 'Highest player-held turf blocks physically located in this city at cutoff; ties share the award.'
      : citySlug && category === 'drugs'
        ? 'Highest drug inventory held at cutoff by eligible final residents of this city; ties share recognition. Inventory is not production or sales.'
        : citySlug && category === 'crew'
        ? 'Highest active thug and worker headcount among eligible final residents; ties share the award.'
        : citySlug && category === 'businesses'
          ? 'Highest active business lots physically located in this city at cutoff; ties share the award.'
          : citySlug && category === 'competition'
            ? 'Frozen local rank #1 for this city; tied local champions are listed.'
            : awardDefinition.formula;
  return {
    reportStatus,
    categoryStatus,
    category,
    citySlug,
    award: {
      title: awardDefinition.title,
      status: leaders.length ? 'AVAILABLE' : 'NOT_RECORDED',
      formula: categoryStatus === 'NOT_RECORDED' ? unavailableReason : awardFormula,
      leaders: publicLeaders,
      leadersTruncated: leaders.length > publicLeaders.length,
    },
    page: effectivePage,
    pageSize,
    total,
    totalPages,
    entries,
  };
}

export const RoundAftermathQueryService = {
  async archive(
    prisma: PrismaClient,
    options: { page: number; pageSize: number; query?: string; year?: number; reportStatus?: 'READY' | 'UNAVAILABLE' | 'PREPARING'; order: 'newest' | 'oldest' },
  ): Promise<RoundAftermathArchiveDto> {
    const startsAt = options.year ? new Date(Date.UTC(options.year, 0, 1)) : undefined;
    const endsAt = options.year ? new Date(Date.UTC(options.year + 1, 0, 1)) : undefined;
    const filters: Prisma.RoundWhereInput[] = [];
    if (options.query) {
      filters.push({
        OR: [
          { name: { contains: options.query, mode: 'insensitive' } },
          { slug: { contains: options.query, mode: 'insensitive' } },
        ],
      });
    }
    if (options.reportStatus === 'UNAVAILABLE') {
      filters.push({
        OR: [
          { aftermathReport: { is: { status: 'UNAVAILABLE' } } },
          { aftermathReport: { is: null } },
        ],
      });
    } else if (options.reportStatus) {
      filters.push({ aftermathReport: { is: { status: options.reportStatus } } });
    }
    const where: Prisma.RoundWhereInput = {
      status: { in: ['ENDED', 'ARCHIVED'] },
      ...(startsAt && endsAt ? { endsAt: { gte: startsAt, lt: endsAt } } : {}),
      ...(filters.length ? { AND: filters } : {}),
    };
    const [rounds, total] = await Promise.all([
      prisma.round.findMany({
        where,
        orderBy: [{ endsAt: options.order === 'newest' ? 'desc' : 'asc' }, { id: 'asc' }],
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          rulesetVersion: true,
          startsAt: true,
          endsAt: true,
          aftermathReport: { select: { status: true, globalAggregate: true } },
        },
      }),
      prisma.round.count({ where }),
    ]);
    const entries = rounds.map((round) => {
      const report = round.aftermathReport;
      const global = report?.status === 'READY' ? globalSchema.safeParse(report.globalAggregate) : null;
      if (global && !global.success) {
        throw new AppError(500, 'AFTERMATH_REPORT_INVALID', 'A finalized round report has invalid global totals.');
      }
      return {
        id: round.id,
        name: round.name,
        slug: round.slug,
        rulesetVersion: round.rulesetVersion,
        startsAt: round.startsAt.toISOString(),
        endedAt: round.endsAt.toISOString(),
        reportStatus: report?.status ?? 'UNAVAILABLE',
        global: global?.success ? global.data : null,
      };
    });
    return {
      page: options.page,
      pageSize: options.pageSize,
      total,
      totalPages: Math.ceil(total / options.pageSize),
      rounds: entries,
    };
  },

  async records(
    prisma: PrismaClient,
    roundId: string,
    category: RoundAftermathCategoryKey,
    page: number,
    pageSize: number,
    citySlug: string | null,
  ): Promise<RoundAftermathRecordsDto> {
    const report = await prisma.roundAftermathReport.findUnique({ where: { roundId } });
    if (!report) {
      const exists = await prisma.round.findUnique({ where: { id: roundId }, select: { id: true } });
      if (!exists) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
      return buildRoundAftermathRecords([], category, page, pageSize, 'PREPARING', citySlug, 0);
    }
    if (report.status !== 'READY') {
      return buildRoundAftermathRecords([], category, page, pageSize, report.status, citySlug, report.schemaVersion);
    }
    if (citySlug) {
      const cities = z.array(citySchema).safeParse(report.cityAggregates);
      if (!cities.success) throw new AppError(500, 'AFTERMATH_REPORT_INVALID', 'The finalized round report has invalid city totals.');
      if (!cities.data.some((city) => city.citySlug === citySlug)) {
        throw AppError.notFound('AFTERMATH_CITY_NOT_FOUND', 'That city is not part of this round report.');
      }
    }
    const players = jsonArray(report.playerAggregates, playerSchema, 'player aggregates');
    return buildRoundAftermathRecords(players, category, page, pageSize, report.status, citySlug, report.schemaVersion);
  },

  async personal(prisma: PrismaClient, roundId: string, accountId: string): Promise<RoundAftermathPersonalDto> {
    const round = await prisma.round.findUnique({ where: { id: roundId }, select: { id: true, name: true } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    const report = await prisma.roundAftermathReport.findUnique({ where: { roundId } });
    if (!report || report.status === 'PREPARING') {
      return {
        reportStatus: 'PREPARING',
        participation: 'UNKNOWN',
        round,
        player: null,
        metrics: [],
        milestones: [],
        personalBests: [],
      };
    }
    if (report.status === 'UNAVAILABLE') {
      return {
        reportStatus: 'UNAVAILABLE',
        participation: 'UNKNOWN',
        round,
        player: null,
        metrics: [],
        milestones: [],
        personalBests: [],
      };
    }

    const players = jsonArray(report.playerAggregates, playerSchema, 'player aggregates');
    const personal = buildRoundAftermathPersonal(round, accountId, players, report.categoryRecords);
    if (personal.participation !== 'PLAYED') return personal;

    const previousReports = await prisma.roundAftermathReport.findMany({
      where: { status: 'READY', roundId: { not: roundId } },
      orderBy: [{ finalizedAt: 'desc' }, { roundId: 'asc' }],
      select: {
        roundId: true,
        playerAggregates: true,
        round: { select: { name: true } },
      },
    });
    const bests = new Map<Exclude<RoundAftermathCategoryKey, 'drugs'>, RoundAftermathPersonalBestDto>();
    for (const previous of previousReports) {
      const historicalPlayers = jsonArray(previous.playerAggregates, playerSchema, 'historical player aggregates');
      const historicalPlayer = historicalPlayers.find((candidate) =>
        candidate.accountId === accountId && candidate.eligibleCompetitor && candidate.nationalRank !== null,
      );
      if (!historicalPlayer) continue;
      for (const category of ['wealth', 'turf', 'crew', 'businesses', 'crime', 'competition'] as const) {
        const value = category === 'competition'
          ? String(historicalPlayer.nationalRank)
          : definitionFor(category).valueFor(historicalPlayer);
        const existing = bests.get(category);
        const isBetter = !existing || (category === 'competition'
          ? BigInt(value) < BigInt(existing.value)
          : BigInt(value) > BigInt(existing.value));
        if (isBetter) bests.set(category, { category, value, roundId: previous.roundId, roundName: previous.round.name });
      }
    }
    return { ...personal, personalBests: [...bests.values()] };
  },

  async overview(prisma: PrismaClient, roundId: string): Promise<RoundAftermathOverviewDto> {
    const round = await prisma.round.findUnique({
      where: { id: roundId },
      select: { id: true, name: true, slug: true, status: true, rulesetVersion: true, startsAt: true, endsAt: true },
    });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    const report = await prisma.roundAftermathReport.findUnique({ where: { roundId } });
    if (!report || report.status !== 'READY') {
      const reportStatus = report?.status ?? 'PREPARING';
      return {
        round: { ...round, startsAt: round.startsAt.toISOString(), endsAt: round.endsAt.toISOString() },
        report: {
          status: reportStatus,
          schemaVersion: report?.schemaVersion ?? null,
          sourceRevision: report?.sourceRevision ?? null,
          cutoffAt: report?.cutoffAt?.toISOString() ?? null,
          finalizedAt: report?.finalizedAt?.toISOString() ?? null,
        },
        global: null,
        cities: [],
      };
    }
    const global = globalSchema.safeParse(report.globalAggregate);
    if (!global.success) throw new AppError(500, 'AFTERMATH_REPORT_INVALID', 'The finalized round report has invalid global totals.');
    const cities = z.array(citySchema).safeParse(report.cityAggregates);
    if (!cities.success) throw new AppError(500, 'AFTERMATH_REPORT_INVALID', 'The finalized round report has invalid city totals.');
    if (report.schemaVersion >= 2 && cities.data.some((city) => !city.citySlug)) {
      throw new AppError(500, 'AFTERMATH_REPORT_INVALID', 'The version-2 report is missing a frozen city slug.');
    }
    return {
      round: { ...round, startsAt: round.startsAt.toISOString(), endsAt: round.endsAt.toISOString() },
      report: {
        status: report.status,
        schemaVersion: report.schemaVersion,
        sourceRevision: report.sourceRevision,
        cutoffAt: report.cutoffAt?.toISOString() ?? null,
        finalizedAt: report.finalizedAt?.toISOString() ?? null,
      },
      global: global.data,
      cities: cities.data.map((city) => ({
        slug: city.citySlug ?? null,
        name: city.cityName,
        participants: city.participants,
        eligibleCompetitors: city.eligibleCompetitors,
        netWorthCents: city.netWorthCents,
        crewMembers: city.crewMembers,
        turfBlocksHeld: city.turfBlocksHeld,
        activeBusinessesHeld: city.activeBusinessesHeld,
      })),
    };
  },

  async city(prisma: PrismaClient, roundId: string, citySlug: string): Promise<RoundAftermathCityDetailDto> {
    const report = await prisma.roundAftermathReport.findUnique({ where: { roundId } });
    if (!report) {
      const exists = await prisma.round.findUnique({ where: { id: roundId }, select: { id: true } });
      if (!exists) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
      throw AppError.conflict('AFTERMATH_NOT_READY', 'City breakdowns are available after the round report is finalized.');
    }
    if (report.status !== 'READY') {
      throw AppError.conflict('AFTERMATH_NOT_READY', 'City breakdowns are not available for this round report.');
    }
    if (report.schemaVersion < 3) {
      throw AppError.conflict('CITY_BREAKDOWN_UNAVAILABLE', 'This older report does not include frozen per-city player holdings.');
    }
    const cityRows = z.array(citySchema).safeParse(report.cityAggregates);
    if (!cityRows.success) throw new AppError(500, 'AFTERMATH_REPORT_INVALID', 'The finalized round report has invalid city totals.');
    const cityRecord = cityRows.data.find((entry) => entry.citySlug === citySlug);
    if (!cityRecord || !cityRecord.citySlug) throw AppError.notFound('AFTERMATH_CITY_NOT_FOUND', 'That city is not part of this round report.');
    const city: RoundAftermathCityDto = {
      slug: cityRecord.citySlug,
      name: cityRecord.cityName,
      participants: cityRecord.participants,
      eligibleCompetitors: cityRecord.eligibleCompetitors,
      netWorthCents: cityRecord.netWorthCents,
      crewMembers: cityRecord.crewMembers,
      turfBlocksHeld: cityRecord.turfBlocksHeld,
      activeBusinessesHeld: cityRecord.activeBusinessesHeld,
    };
    const allPlayers = jsonArray(report.playerAggregates, playerSchema, 'player aggregates');
    if (allPlayers.some((player) => !player.citySlug)) {
      throw new AppError(500, 'AFTERMATH_REPORT_INVALID', 'The version-2 report is missing frozen player city slugs.');
    }
    const players = allPlayers
      .filter((player) => player.citySlug === citySlug)
      .map((player) => ({
        ...player,
        turfBlocksHeld: player.turfByCity?.find((entry) => entry.citySlug === citySlug)?.count ?? 0,
        activeBusinessesHeld: player.businessesByCity?.find((entry) => entry.citySlug === citySlug)?.count ?? 0,
      }));
    return buildRoundAftermathCityDetail(city, players, report.status);
  },

  async alliances(prisma: PrismaClient, roundId: string): Promise<RoundAftermathAlliancesDto> {
    const report = await prisma.roundAftermathReport.findUnique({ where: { roundId } });
    if (!report) {
      const exists = await prisma.round.findUnique({ where: { id: roundId }, select: { id: true } });
      if (!exists) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
      return { reportStatus: 'PREPARING', status: 'NOT_RECORDED', reason: null, alliances: [] };
    }
    if (report.status !== 'READY') {
      return {
        reportStatus: report.status,
        status: 'NOT_RECORDED',
        reason: report.status === 'UNAVAILABLE' ? 'This historical round has no canonical alliance cutoff snapshot.' : null,
        alliances: [],
      };
    }
    if (report.schemaVersion < 2 || report.allianceAggregate === null) {
      return {
        reportStatus: report.status,
        status: 'NOT_RECORDED',
        reason: 'This report predates frozen alliance membership and cutoff control data.',
        alliances: [],
      };
    }
    const parsed = z.array(allianceSchema).safeParse(report.allianceAggregate);
    if (!parsed.success) throw new AppError(500, 'AFTERMATH_REPORT_INVALID', 'The finalized round report has invalid alliance data.');
    return {
      reportStatus: report.status,
      status: 'AVAILABLE',
      reason: null,
      alliances: parsed.data,
    };
  },

  async categories(prisma: PrismaClient, roundId: string): Promise<RoundAftermathCategoriesDto> {
    const report = await prisma.roundAftermathReport.findUnique({ where: { roundId } });
    if (!report) {
      const exists = await prisma.round.findUnique({ where: { id: roundId }, select: { id: true } });
      if (!exists) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
      return { reportStatus: 'PREPARING', categories: mapCategories('PREPARING', null, []) };
    }
    const players = report.status === 'READY'
      ? jsonArray(report.playerAggregates, playerSchema, 'player aggregates')
      : [];
    return {
      reportStatus: report.status,
      categories: mapCategories(report.status, report.categoryRecords, players),
    };
  },

  async leaderboard(
    prisma: PrismaClient,
    roundId: string,
    category: RoundAftermathCategoryKey,
    page: number,
    pageSize: number,
  ): Promise<RoundAftermathLeaderboardDto> {
    const report = await prisma.roundAftermathReport.findUnique({ where: { roundId } });
    if (!report) {
      const exists = await prisma.round.findUnique({ where: { id: roundId }, select: { id: true } });
      if (!exists) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
      return buildRoundAftermathLeaderboard(category, [], page, pageSize, 'PREPARING');
    }
    const players = report.status === 'READY'
      ? jsonArray(report.playerAggregates, playerSchema, 'player aggregates')
      : [];
    const categoryStatus = report.status === 'READY'
      ? mapCategories(report.status, report.categoryRecords, players).find((entry) => entry.key === category)!.status
      : report.status;
    return buildRoundAftermathLeaderboard(category, players, page, pageSize, report.status, categoryStatus);
  },
};
