import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  RoundAftermathCategoriesDto,
  RoundAftermathCategoryDto,
  RoundAftermathCategoryKey,
  RoundAftermathLeaderboardDto,
  RoundAftermathOverviewDto,
} from '@streets/shared';
import { z } from 'zod';
import { AppError } from '../utils/errors.js';

const playerSchema = z.object({
  roundPlayerId: z.string(),
  publicPimpId: z.number().int(),
  displayName: z.string(),
  cityName: z.string(),
  eligibleCompetitor: z.boolean(),
  nationalRank: z.number().int().nullable(),
  localRank: z.number().int().nullable(),
  netWorthCents: z.string().regex(/^-?\d+$/),
  crewMembers: z.number().int().nonnegative(),
  turfBlocksHeld: z.number().int().nonnegative(),
  activeBusinessesHeld: z.number().int().nonnegative(),
  raidsAttempted: z.number().int().nonnegative(),
  driveBysAttempted: z.number().int().nonnegative(),
}).passthrough();

export type PlayerSnapshot = z.infer<typeof playerSchema>;

const globalSchema = z.object({
  participants: z.number().int().nonnegative(),
  eligibleCompetitors: z.number().int().nonnegative(),
  citiesInRound: z.number().int().nonnegative(),
  finalNetWorthCents: z.string().regex(/^-?\d+$/),
  finalCrewMembers: z.number().int().nonnegative(),
  playerHeldTurfBlocks: z.number().int().nonnegative(),
  activeBusinessesHeld: z.number().int().nonnegative(),
  crimeActions: z.number().int().nonnegative(),
}).strict();

const citySchema = z.object({
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
  { key: 'drugs', title: 'Drugs', recordKey: 'drugsProducedAndSold', description: 'Production and sales are not recorded as complete round totals.', unit: null, valueFor: () => '0' },
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
  if (candidate === undefined && key === 'competition') return null;
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
  const availableCategory = category !== 'drugs';
  const eligible = availableCategory
    ? rows.filter((player) => player.eligibleCompetitor && player.nationalRank !== null)
    : [];
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

export const RoundAftermathQueryService = {
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
