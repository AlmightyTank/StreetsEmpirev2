import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../utils/errors.js';
import type { Db } from '../utils/db.js';

export const ROUND_AFTERMATH_SCHEMA_VERSION = 4;
export const ROUND_AFTERMATH_SOURCE_REVISION = 'round-aftermath-v4';

export interface AftermathPlayerSource {
  id: string;
  accountId: string;
  publicPimpId: number;
  displayName: string;
  cityId: string;
  cityName: string;
  citySlug: string;
  allianceId: string | null;
  netWorthCents: bigint;
  nationalRank: number | null;
  localRank: number | null;
  thugs: number;
  whores: number;
  drugUnitsHeld: number;
  raidsDone: number;
  driveBysDone: number;
}

export interface AftermathPlaceSource {
  cityId: string;
  holderId: string | null;
}

export interface AftermathAllianceSource {
  id: string;
  name: string;
  tag: string;
  leaderId: string;
}

export interface RoundAftermathAggregates {
  globalAggregate: Prisma.InputJsonObject;
  cityAggregates: Prisma.InputJsonArray;
  playerAggregates: Prisma.InputJsonArray;
  categoryRecords: Prisma.InputJsonObject;
  allianceAggregate: Prisma.InputJsonArray;
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
  additionalCitySlugs: ReadonlyMap<string, string> = new Map(),
  alliances: AftermathAllianceSource[] = [],
): RoundAftermathAggregates {
  const cityNames = new Map(additionalCityNames);
  const citySlugs = new Map(additionalCitySlugs);
  for (const player of players) {
    cityNames.set(player.cityId, player.cityName);
    citySlugs.set(player.cityId, player.citySlug);
  }
  const cityIds = new Set<string>([
    ...players.map((player) => player.cityId),
    ...turfs.map((turf) => turf.cityId),
  ]);
  const eligible = players.filter((player) => player.nationalRank !== null);
  const turfByPlayer = new Map<string, number>();
  const turfByCity = new Map<string, number>();
  const businessesByPlayer = new Map<string, number>();
  const businessesByCity = new Map<string, number>();
  const turfCitiesByPlayer = new Map<string, Map<string, number>>();
  const businessCitiesByPlayer = new Map<string, Map<string, number>>();

  const addPlayerCityCount = (counts: Map<string, Map<string, number>>, playerId: string, cityId: string) => {
    const cityCounts = counts.get(playerId) ?? new Map<string, number>();
    cityCounts.set(cityId, (cityCounts.get(cityId) ?? 0) + 1);
    counts.set(playerId, cityCounts);
  };

  for (const turf of turfs) {
    if (turf.holderId) {
      turfByPlayer.set(turf.holderId, (turfByPlayer.get(turf.holderId) ?? 0) + 1);
      turfByCity.set(turf.cityId, (turfByCity.get(turf.cityId) ?? 0) + 1);
      addPlayerCityCount(turfCitiesByPlayer, turf.holderId, turf.cityId);
    }
  }
  for (const business of businesses) {
    if (business.holderId) {
      businessesByPlayer.set(business.holderId, (businessesByPlayer.get(business.holderId) ?? 0) + 1);
      businessesByCity.set(business.cityId, (businessesByCity.get(business.cityId) ?? 0) + 1);
      addPlayerCityCount(businessCitiesByPlayer, business.holderId, business.cityId);
    }
  }

  const cityTotals = new Map([...cityIds].map((cityId) => [cityId, {
    cityId,
    citySlug: citySlugs.get(cityId) ?? null,
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
  const topDrugs = leaders(eligible, (player) => player.drugUnitsHeld);
  const topCrime = leaders(eligible, (player) => player.raidsDone + player.driveBysDone);
  const noEligibleCompetitors = { status: 'NOT_RECORDED', reason: 'This round has no eligible competitors to rank.' };
  const cities = [...cityTotals.values()].map((city) => ({
    ...city,
    netWorthCents: city.netWorthCents.toString(),
    turfBlocksHeld: turfByCity.get(city.cityId) ?? 0,
    activeBusinessesHeld: businessesByCity.get(city.cityId) ?? 0,
  })).sort((a, b) => a.cityId.localeCompare(b.cityId));

  const allianceMembers = new Map<string, AftermathPlayerSource[]>();
  const allianceByPlayer = new Map<string, string>();
  for (const player of players) {
    if (!player.allianceId) continue;
    allianceByPlayer.set(player.id, player.allianceId);
    const members = allianceMembers.get(player.allianceId) ?? [];
    members.push(player);
    allianceMembers.set(player.allianceId, members);
  }
  const allianceTotals = new Map(alliances.map((alliance) => [alliance.id, {
    alliance,
    members: allianceMembers.get(alliance.id) ?? [],
    combinedNetWorthCents: 0n,
    turfBlocksHeld: 0,
    activeBusinessesHeld: 0,
    turfByCity: new Map<string, number>(),
  }]));
  for (const totals of allianceTotals.values()) {
    totals.combinedNetWorthCents = totals.members
      .filter((member) => member.nationalRank !== null)
      .reduce((sum, member) => sum + member.netWorthCents, 0n);
  }
  for (const turf of turfs) {
    const allianceId = turf.holderId ? allianceByPlayer.get(turf.holderId) : undefined;
    const totals = allianceId ? allianceTotals.get(allianceId) : undefined;
    if (!totals) continue;
    totals.turfBlocksHeld += 1;
    totals.turfByCity.set(turf.cityId, (totals.turfByCity.get(turf.cityId) ?? 0) + 1);
  }
  for (const business of businesses) {
    const allianceId = business.holderId ? allianceByPlayer.get(business.holderId) : undefined;
    const totals = allianceId ? allianceTotals.get(allianceId) : undefined;
    if (totals) totals.activeBusinessesHeld += 1;
  }
  const rankedAlliances = [...allianceTotals.values()].sort((a, b) => {
    if (a.combinedNetWorthCents !== b.combinedNetWorthCents) {
      return a.combinedNetWorthCents > b.combinedNetWorthCents ? -1 : 1;
    }
    return a.alliance.tag.localeCompare(b.alliance.tag);
  });
  let priorAllianceWorth: bigint | null = null;
  let priorAllianceRank = 0;
  const allianceAggregate = rankedAlliances.map((totals, index) => {
    const rank = priorAllianceWorth === totals.combinedNetWorthCents ? priorAllianceRank : index + 1;
    priorAllianceWorth = totals.combinedNetWorthCents;
    priorAllianceRank = rank;
    const members = totals.members
      .filter((member) => member.nationalRank !== null)
      .sort((a, b) => a.netWorthCents === b.netWorthCents
        ? a.publicPimpId - b.publicPimpId
        : a.netWorthCents > b.netWorthCents ? -1 : 1);
    const leader = members.find((member) => member.id === totals.alliance.leaderId);
    return {
      name: totals.alliance.name,
      tag: totals.alliance.tag,
      rank,
      memberCount: totals.members.length,
      eligibleCompetitors: members.length,
      combinedNetWorthCents: totals.combinedNetWorthCents.toString(),
      turfBlocksHeld: totals.turfBlocksHeld,
      activeBusinessesHeld: totals.activeBusinessesHeld,
      leader: leader ? { publicPimpId: leader.publicPimpId, displayName: leader.displayName } : null,
      members: members.map((member) => ({
        publicPimpId: member.publicPimpId,
        displayName: member.displayName,
        cityName: member.cityName,
        nationalRank: member.nationalRank!,
        netWorthCents: member.netWorthCents.toString(),
      })),
      cityControl: [...totals.turfByCity.entries()]
        .map(([cityId, turfBlocksHeld]) => ({ cityName: cityNames.get(cityId) ?? null, turfBlocksHeld }))
        .sort((a, b) => (b.turfBlocksHeld - a.turfBlocksHeld) || (a.cityName ?? '').localeCompare(b.cityName ?? '')),
    };
  });

  const playerRows = players.map((player) => ({
    roundPlayerId: player.id,
    accountId: player.accountId,
    publicPimpId: player.publicPimpId,
    displayName: player.displayName,
    cityId: player.cityId,
    citySlug: player.citySlug,
    cityName: player.cityName,
    allianceId: player.allianceId,
    eligibleCompetitor: player.nationalRank !== null,
    nationalRank: player.nationalRank,
    localRank: player.localRank,
    netWorthCents: player.netWorthCents.toString(),
    thugs: player.thugs,
    whores: player.whores,
    crewMembers: player.thugs + player.whores,
    drugUnitsHeld: player.drugUnitsHeld,
    turfBlocksHeld: turfByPlayer.get(player.id) ?? 0,
    activeBusinessesHeld: businessesByPlayer.get(player.id) ?? 0,
    turfByCity: [...(turfCitiesByPlayer.get(player.id) ?? [])]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([cityId, count]) => ({ citySlug: citySlugs.get(cityId) ?? null, count })),
    businessesByCity: [...(businessCitiesByPlayer.get(player.id) ?? [])]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([cityId, count]) => ({ citySlug: citySlugs.get(cityId) ?? null, count })),
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
    allianceAggregate,
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
      drugUnitsHeld: eligible.length ? { status: 'AVAILABLE', ...topDrugs, unit: 'drug units held at cutoff' } : noEligibleCompetitors,
      crime: eligible.length ? { status: 'AVAILABLE', ...topCrime, unit: 'attempted raids plus attempted drive-bys' } : noEligibleCompetitors,
      moneyEarnedAndSpent: { status: 'NOT_RECORDED', reason: 'The available ledgers do not provide complete, consistently scoped round totals.' },
      turfCapturesAndDefenses: { status: 'NOT_RECORDED', reason: 'Final ownership is persisted, but event sources do not yet provide a complete cross-system count.' },
      crewRecruitedAndReleased: { status: 'NOT_RECORDED', reason: 'Crew history coverage is not complete for every round and cannot be backfilled as a round total.' },
      drugsProducedAndSold: { status: 'NOT_RECORDED', reason: 'Production and sales totals are not complete; Drug Kingpin instead uses frozen drug inventory held at cutoff.' },
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
  attribution: "Round-global player measures are counted once. Final roster and net worth use the player's final city; turf and businesses use their physical city. Player-level crime counters are not city-attributed.",
  money: 'All money amounts in JSON are base-10 strings of integer cents; no floating-point conversion is used.',
  metrics: {
    participants: { status: 'AVAILABLE', source: 'RoundPlayer.roundId', unit: 'rows', definition: 'All player rows in the round, including ineligible competitors.' },
    eligibleCompetitors: { status: 'AVAILABLE', source: 'Frozen RoundPlayer.nationalRank', unit: 'players', definition: 'Players with non-null final national rank.' },
    cities: { status: 'AVAILABLE', source: 'RoundPlayer.cityId and Turf.cityId', definition: 'Distinct final participant cities and cities with round turf.' },
    cityStandings: { status: 'AVAILABLE', source: 'RoundPlayer.localRank and final cityId', definition: 'Frozen local standings; player totals are attributed only to their final city.' },
    finalNetWorth: { status: 'AVAILABLE', source: 'RoundPlayer.netWorthCents', unit: 'cents', timing: 'After PlayerStateService settlement and frozen standings.' },
    finalCrew: { status: 'AVAILABLE', source: 'RoundPlayer.thugs, RoundPlayer.whores', unit: 'members', timing: 'After PlayerStateService settlement.' },
    finalTurf: { status: 'AVAILABLE', source: 'Turf.holderId and Turf.cityId', unit: 'blocks held', timing: 'After turf-war settlement at the round cutoff.' },
    finalBusinesses: { status: 'AVAILABLE', source: 'Business.level and Turf.holderId', unit: 'active lots held', timing: 'At the round cutoff; does not represent revenue.' },
    crimeActions: { status: 'AVAILABLE', source: 'RoundPlayer.raidsDone and RoundPlayer.driveBysDone', unit: 'attempts', timing: 'Cumulative round counters at close; not wins.' },
    categoryRecords: { status: 'AVAILABLE', source: 'Frozen nationalRank, cutoff inventory, and supported final counters', definition: 'All tied leaders are preserved; empty rounds have no champions.' },
    drugUnitsHeld: { status: 'AVAILABLE', source: 'RoundPlayer.crack and PlayerProduct.quantity', unit: 'drug units held', timing: 'Total inventory at the round cutoff, attributed to the holder’s final city; not production or sales.' },
    alliances: { status: 'AVAILABLE', source: 'Alliance, RoundPlayer.allianceId, leaderId, Turf.holderId, and active Business lots', definition: 'Non-disbanded alliance and membership state at cutoff; combined wealth sums eligible members only; territorial counts follow members at that same cutoff.' },
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
        city: { select: { name: true, slug: true } },
        allianceId: true,
        netWorthCents: true,
        nationalRank: true,
        localRank: true,
        thugs: true,
        whores: true,
        crack: true,
        products: { select: { quantity: true } },
        raidsDone: true,
        driveBysDone: true,
      },
    });
    const [turfs, businesses, alliances, warehouseStocks, dealerStocks, runCargo, outposts] = await Promise.all([
      tx.turf.findMany({ where: { roundId }, select: { cityId: true, holderId: true } }),
      tx.business.findMany({
        where: { roundId, level: { gt: 0 } },
        select: { turf: { select: { cityId: true, holderId: true } } },
      }),
      tx.alliance.findMany({
        where: { roundId, disbandedAt: null },
        select: { id: true, name: true, tag: true, leaderId: true },
      }),
      tx.supplyStock.findMany({
        where: { warehouse: { roundPlayer: { roundId } } },
        select: { quantity: true, warehouse: { select: { roundPlayerId: true } } },
      }),
      tx.dealerStock.findMany({
        where: { dealerCrew: { roundPlayer: { roundId } } },
        select: { quantity: true, dealerCrew: { select: { roundPlayerId: true } } },
      }),
      tx.runCargo.findMany({
        where: { run: { roundPlayer: { roundId } } },
        select: { quantity: true, run: { select: { roundPlayerId: true } } },
      }),
      tx.turfOutpost.findMany({
        where: { turf: { roundId } },
        select: { ownerId: true, products: true },
      }),
    ]);
    const additionalDrugUnits = new Map<string, number>();
    const addUnits = (roundPlayerId: string, quantity: number) => {
      additionalDrugUnits.set(roundPlayerId, (additionalDrugUnits.get(roundPlayerId) ?? 0) + quantity);
    };
    for (const stock of warehouseStocks) addUnits(stock.warehouse.roundPlayerId, stock.quantity);
    for (const stock of dealerStocks) addUnits(stock.dealerCrew.roundPlayerId, stock.quantity);
    for (const cargo of runCargo) addUnits(cargo.run.roundPlayerId, cargo.quantity);
    for (const outpost of outposts) {
      const products = z.record(z.string(), z.number().int().nonnegative()).safeParse(outpost.products);
      if (!products.success) {
        throw new AppError(500, 'AFTERMATH_INVENTORY_INVALID', 'A turf outpost has invalid product inventory.');
      }
      addUnits(outpost.ownerId, Object.values(products.data).reduce((sum, quantity) => sum + quantity, 0));
    }
    const cityIds = [...new Set([...players.map((player) => player.cityId), ...turfs.map((turf) => turf.cityId)])];
    const extraCities = cityIds.length
      ? await tx.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, name: true, slug: true } })
      : [];
    const cityNames = new Map(extraCities.map((city) => [city.id, city.name]));
    const citySlugs = new Map(extraCities.map((city) => [city.id, city.slug]));
    const sourcePlayers: AftermathPlayerSource[] = players.map((player) => ({
      ...player,
      cityName: player.city.name || cityNames.get(player.cityId) || '',
      citySlug: player.city.slug,
      drugUnitsHeld: player.crack
        + player.products.reduce((sum, product) => sum + product.quantity, 0)
        + (additionalDrugUnits.get(player.id) ?? 0),
    }));
    const aggregates = buildRoundAftermathAggregates(
      sourcePlayers,
      turfs,
      businesses.map((business) => business.turf),
      cityNames,
      citySlugs,
      alliances,
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
