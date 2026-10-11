import type { Prisma } from '@prisma/client';
import type { Db } from '../utils/db.js';

export const ROUND_AFTERMATH_SCHEMA_VERSION = 1;
export const ROUND_AFTERMATH_SOURCE_REVISION = 'round-aftermath-v1';

export interface AftermathPlayerSource {
  id: string;
  accountId: string;
  publicPimpId: number;
  displayName: string;
  cityId: string;
  cityName: string;
  netWorthCents: bigint;
  nationalRank: number | null;
  localRank: number | null;
  thugs: number;
  whores: number;
  raidsDone: number;
  driveBysDone: number;
}

export interface AftermathPlaceSource {
  cityId: string;
  holderId: string | null;
}

export interface RoundAftermathAggregates {
  globalAggregate: Prisma.InputJsonObject;
  cityAggregates: Prisma.InputJsonArray;
  playerAggregates: Prisma.InputJsonArray;
  categoryRecords: Prisma.InputJsonObject;
}

function leaders<T extends { id: string }>(rows: T[], score: (row: T) => number): { ids: string[]; value: number } {
  const value = rows.reduce((highest, row) => Math.max(highest, score(row)), 0);
  return { ids: value > 0 ? rows.filter((row) => score(row) === value).map((row) => row.id) : [], value };
}

export function buildRoundAftermathAggregates(
  players: AftermathPlayerSource[],
  turfs: AftermathPlaceSource[],
  businesses: AftermathPlaceSource[],
  additionalCityNames: ReadonlyMap<string, string> = new Map(),
): RoundAftermathAggregates {
  const cityNames = new Map(additionalCityNames);
  for (const player of players) cityNames.set(player.cityId, player.cityName);
  const cityIds = new Set<string>([
    ...players.map((player) => player.cityId),
    ...turfs.map((turf) => turf.cityId),
  ]);
  const eligible = players.filter((player) => player.nationalRank !== null);
  const turfByPlayer = new Map<string, number>();
  const turfByCity = new Map<string, number>();
  const businessesByPlayer = new Map<string, number>();
  const businessesByCity = new Map<string, number>();

  for (const turf of turfs) {
    if (turf.holderId) {
      turfByPlayer.set(turf.holderId, (turfByPlayer.get(turf.holderId) ?? 0) + 1);
      turfByCity.set(turf.cityId, (turfByCity.get(turf.cityId) ?? 0) + 1);
    }
  }
  for (const business of businesses) {
    if (business.holderId) {
      businessesByPlayer.set(business.holderId, (businessesByPlayer.get(business.holderId) ?? 0) + 1);
      businessesByCity.set(business.cityId, (businessesByCity.get(business.cityId) ?? 0) + 1);
    }
  }

  const cityTotals = new Map([...cityIds].map((cityId) => [cityId, {
    cityId,
    cityName: cityNames.get(cityId) ?? null,
    participants: 0,
    eligibleCompetitors: 0,
    netWorthCents: 0n,
    crewMembers: 0,
  }]));
  for (const player of players) {
    const city = cityTotals.get(player.cityId)!;
    city.participants += 1;
    if (player.nationalRank !== null) {
      city.eligibleCompetitors += 1;
      city.netWorthCents += player.netWorthCents;
      city.crewMembers += player.thugs + player.whores;
    }
  }

  const finalNetWorthCents = eligible.reduce((sum, player) => sum + player.netWorthCents, 0n);
  const finalCrewMembers = eligible.reduce((sum, player) => sum + player.thugs + player.whores, 0);
  const crimeActions = eligible.reduce((sum, player) => sum + player.raidsDone + player.driveBysDone, 0);
  const wealthLeaders = eligible.filter((player) => player.nationalRank === 1);
  const topCrew = leaders(eligible, (player) => player.thugs + player.whores);
  const topTurf = leaders(eligible, (player) => turfByPlayer.get(player.id) ?? 0);
  const topBusinesses = leaders(eligible, (player) => businessesByPlayer.get(player.id) ?? 0);
  const topCrime = leaders(eligible, (player) => player.raidsDone + player.driveBysDone);
  const noEligibleCompetitors = { status: 'NOT_RECORDED', reason: 'This round has no eligible competitors to rank.' };
  const cities = [...cityTotals.values()].map((city) => ({
    ...city,
    netWorthCents: city.netWorthCents.toString(),
    turfBlocksHeld: turfByCity.get(city.cityId) ?? 0,
    activeBusinessesHeld: businessesByCity.get(city.cityId) ?? 0,
  })).sort((a, b) => a.cityId.localeCompare(b.cityId));

  const playerRows = players.map((player) => ({
    roundPlayerId: player.id,
    accountId: player.accountId,
    publicPimpId: player.publicPimpId,
    displayName: player.displayName,
    cityId: player.cityId,
    cityName: player.cityName,
    eligibleCompetitor: player.nationalRank !== null,
    nationalRank: player.nationalRank,
    localRank: player.localRank,
    netWorthCents: player.netWorthCents.toString(),
    thugs: player.thugs,
    whores: player.whores,
    crewMembers: player.thugs + player.whores,
    turfBlocksHeld: turfByPlayer.get(player.id) ?? 0,
    activeBusinessesHeld: businessesByPlayer.get(player.id) ?? 0,
    raidsAttempted: player.raidsDone,
    driveBysAttempted: player.driveBysDone,
  }));

  return {
    globalAggregate: {
      participants: players.length,
      eligibleCompetitors: eligible.length,
      citiesInRound: cityIds.size,
      finalNetWorthCents: finalNetWorthCents.toString(),
      finalCrewMembers,
      playerHeldTurfBlocks: turfs.filter((turf) => turf.holderId !== null).length,
      activeBusinessesHeld: businesses.filter((business) => business.holderId !== null).length,
      crimeActions,
    },
    cityAggregates: cities,
    playerAggregates: playerRows,
    categoryRecords: {
      wealth: eligible.length ? {
        status: 'AVAILABLE',
        valueCents: wealthLeaders[0]!.netWorthCents.toString(),
        roundPlayerIds: wealthLeaders.map((player) => player.id),
        rankingRule: 'Frozen national rank; all players tied at rank 1 are included.',
      } : noEligibleCompetitors,
      crew: eligible.length ? { status: 'AVAILABLE', ...topCrew, unit: 'members' } : noEligibleCompetitors,
      turf: eligible.length ? { status: 'AVAILABLE', ...topTurf, unit: 'blocks held at cutoff' } : noEligibleCompetitors,
      businesses: eligible.length ? { status: 'AVAILABLE', ...topBusinesses, unit: 'active lots held at cutoff' } : noEligibleCompetitors,
      crime: eligible.length ? { status: 'AVAILABLE', ...topCrime, unit: 'attempted raids plus attempted drive-bys' } : noEligibleCompetitors,
      moneyEarnedAndSpent: { status: 'NOT_RECORDED', reason: 'The available ledgers do not provide complete, consistently scoped round totals.' },
      turfCapturesAndDefenses: { status: 'NOT_RECORDED', reason: 'Final ownership is persisted, but event sources do not yet provide a complete cross-system count.' },
      crewRecruitedAndReleased: { status: 'NOT_RECORDED', reason: 'Crew history coverage is not complete for every round and cannot be backfilled as a round total.' },
      drugsProducedAndSold: { status: 'NOT_RECORDED', reason: 'Stock movements and sales do not provide a complete, consistently attributed production-and-sales history.' },
      businessRevenueAndProfit: { status: 'NOT_RECORDED', reason: 'The register is a cutoff balance, not cumulative gross revenue or net profit.' },
      crimeWins: { status: 'NOT_RECORDED', reason: 'Raid and drive-by counters measure attempts, not victories.' },
      allianceOutcomes: { status: 'NOT_RECORDED', reason: 'Alliance state is not yet frozen as-of the round cutoff.' },
    },
  };
}

const SOURCE_PROVENANCE: Prisma.InputJsonObject = {
  schemaVersion: ROUND_AFTERMATH_SCHEMA_VERSION,
  sourceRevision: ROUND_AFTERMATH_SOURCE_REVISION,
  eligibility: 'A competitor is eligible when the frozen nationalRank is non-null; final standings already exclude inactive accounts and NPC gangs.',
  attribution: "Round-global player measures are counted once. Final roster and net worth use the player's final city; turf and business measures use their physical city. Player-level crime counters are not city-attributed.",
  money: 'All money amounts in JSON are base-10 strings of integer cents; no floating-point conversion is used.',
  metrics: {
    participants: { status: 'AVAILABLE', source: 'RoundPlayer.roundId', unit: 'rows', definition: 'All player rows in the round, including ineligible competitors.' },
    eligibleCompetitors: { status: 'AVAILABLE', source: 'Frozen RoundPlayer.nationalRank', unit: 'players', definition: 'Players with non-null final national rank.' },
    cities: { status: 'AVAILABLE', source: 'RoundPlayer.cityId and Turf.cityId', definition: 'Distinct final participant cities and cities with round turf.' },
    finalNetWorth: { status: 'AVAILABLE', source: 'RoundPlayer.netWorthCents', unit: 'cents', timing: 'After PlayerStateService settlement and frozen standings.' },
    finalCrew: { status: 'AVAILABLE', source: 'RoundPlayer.thugs, RoundPlayer.whores', unit: 'members', timing: 'After PlayerStateService settlement.' },
    finalTurf: { status: 'AVAILABLE', source: 'Turf.holderId and Turf.cityId', unit: 'blocks held', timing: 'After turf-war settlement at the round cutoff.' },
    finalBusinesses: { status: 'AVAILABLE', source: 'Business.level and Turf.holderId', unit: 'active lots held', timing: 'At the round cutoff; does not represent revenue.' },
    crimeActions: { status: 'AVAILABLE', source: 'RoundPlayer.raidsDone and RoundPlayer.driveBysDone', unit: 'attempts', timing: 'Cumulative round counters at close; not wins.' },
    categoryRecords: { status: 'AVAILABLE', source: 'Frozen nationalRank and supported final counters', definition: 'All tied leaders are preserved; empty rounds have no champions.' },
    unsupported: 'See categoryRecords for metrics intentionally marked NOT_RECORDED rather than inferred.',
  },
};

export const RoundAftermathService = {
  async finalize(tx: Db, roundId: string, cutoffAt: Date): Promise<void> {
    const existing = await tx.roundAftermathReport.findUnique({ where: { roundId }, select: { id: true } });
    if (existing) return;

    const players = await tx.roundPlayer.findMany({
      where: { roundId },
      orderBy: { publicPimpId: 'asc' },
      select: {
        id: true,
        accountId: true,
        publicPimpId: true,
        displayName: true,
        cityId: true,
        city: { select: { name: true } },
        netWorthCents: true,
        nationalRank: true,
        localRank: true,
        thugs: true,
        whores: true,
        raidsDone: true,
        driveBysDone: true,
      },
    });
    const [turfs, businesses] = await Promise.all([
      tx.turf.findMany({ where: { roundId }, select: { cityId: true, holderId: true } }),
      tx.business.findMany({
        where: { roundId, level: { gt: 0 } },
        select: { turf: { select: { cityId: true, holderId: true } } },
      }),
    ]);
    const cityIds = [...new Set([...players.map((player) => player.cityId), ...turfs.map((turf) => turf.cityId)])];
    const extraCities = cityIds.length
      ? await tx.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, name: true } })
      : [];
    const cityNames = new Map(extraCities.map((city) => [city.id, city.name]));
    const sourcePlayers: AftermathPlayerSource[] = players.map((player) => ({
      ...player,
      cityName: player.city.name || cityNames.get(player.cityId) || '',
    }));
    const aggregates = buildRoundAftermathAggregates(
      sourcePlayers,
      turfs,
      businesses.map((business) => business.turf),
      cityNames,
    );

    await tx.roundAftermathReport.create({
      data: {
        roundId,
        schemaVersion: ROUND_AFTERMATH_SCHEMA_VERSION,
        status: 'READY',
        sourceRevision: ROUND_AFTERMATH_SOURCE_REVISION,
        cutoffAt,
        finalizedAt: new Date(),
        sourceProvenance: SOURCE_PROVENANCE,
        ...aggregates,
      },
    });
  },
};
