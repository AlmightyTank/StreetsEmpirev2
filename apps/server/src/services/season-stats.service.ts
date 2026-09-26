import { Prisma, type PrismaClient } from '@prisma/client';
import { loadRulesetForRound, type Ruleset } from '@streets/rules-engine';
import type { PublicStatSheetDto } from '@streets/shared';

/**
 * 0.9.0-F. Seasonal profile statistics.
 *
 * Every number is read back from history the game already keeps for its own
 * reasons (the activity feed, battle receipts, turf pushes and hold segments,
 * runs, reputation), so stats exist for seasons that finished before this
 * shipped and nothing on the action path has to keep a second set of books.
 * Voided battles never count, exactly like trophies and revenge.
 */
export interface SeasonTotals {
  turnsWorked: number;
  streetEarningsCents: number;
  recruitsFound: number;
  peakCrew: number;

  raidsWon: number;
  raidsLost: number;
  defensesHeld: number;
  defensesLost: number;
  driveBysLanded: number;
  thugsDefeated: number;
  cashStolenCents: number;
  biggestRaidCents: number;

  blocksCaptured: number;
  blocksLost: number;
  blockSeconds: number;
  citiesControlled: number;

  runsCompleted: number;
  driveHours: number;
  cargoMoved: number;
  convoyAttacksWon: number;

  productProduced: number;
  productSold: number;
  largestTransactionCents: number;
  traderReputation: number;
}

/** What the loader needs from each RoundPlayer. */
export interface SeasonStatsPlayer {
  id: string;
  whores: number;
  thugs: number;
  peakCrew: number;
  round: { endsAt: Date; rulesetId: string; rulesetVersion: string };
}

export const emptySeasonTotals = (): SeasonTotals => ({
  turnsWorked: 0,
  streetEarningsCents: 0,
  recruitsFound: 0,
  peakCrew: 0,
  raidsWon: 0,
  raidsLost: 0,
  defensesHeld: 0,
  defensesLost: 0,
  driveBysLanded: 0,
  thugsDefeated: 0,
  cashStolenCents: 0,
  biggestRaidCents: 0,
  blocksCaptured: 0,
  blocksLost: 0,
  blockSeconds: 0,
  citiesControlled: 0,
  runsCompleted: 0,
  driveHours: 0,
  cargoMoved: 0,
  convoyAttacksWon: 0,
  productProduced: 0,
  productSold: 0,
  largestTransactionCents: 0,
  traderReputation: 0,
});

/** A numeric JSON field, or 0 when a payload predates it or holds anything else. */
function jsonNumber(column: string, key: string): Prisma.Sql {
  return Prisma.raw(
    `(CASE WHEN jsonb_typeof(${column}->'${key}') = 'number' THEN (${column}->>'${key}')::float8 ELSE 0 END)`,
  );
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

type Row<K extends string> = { id: string } & Record<K, unknown>;

/** Drive hours of one leg's route (city slugs, both ends included) on the ruleset's roads. */
export function routeDriveHours(ruleset: Pick<Ruleset, 'travel'>, route: unknown): number {
  if (!Array.isArray(route) || route.length < 2) return 0;
  const roads = ruleset.travel?.roads ?? [];
  let hours = 0;
  for (let index = 1; index < route.length; index += 1) {
    const from = route[index - 1];
    const to = route[index];
    const road = roads.find((candidate) =>
      (candidate.from === from && candidate.to === to) || (candidate.from === to && candidate.to === from));
    hours += road?.driveHours ?? 0;
  }
  return hours;
}

async function activityTotals(prisma: PrismaClient, ids: string[]) {
  const a = 'a.payload';
  return prisma.$queryRaw<Array<Row<
    'turnsWorked' | 'streetEarningsCents' | 'recruitsFound' | 'productProduced' | 'productSold'
    | 'largestStoreCents' | 'convoyAttacksWon' | 'convoyCashCents' | 'turfClaims'
  >>>(Prisma.sql`
    SELECT
      a."roundPlayerId" AS id,
      COALESCE(SUM(CASE WHEN a.type::text IN ('SCOUT', 'PRODUCE_CRACK') THEN ${jsonNumber(a, 'turns')} END), 0) AS "turnsWorked",
      COALESCE(SUM(CASE WHEN a.type::text IN ('SCOUT', 'PRODUCE_CRACK') THEN ${jsonNumber(a, 'cashCents')} END), 0) AS "streetEarningsCents",
      COALESCE(SUM(CASE WHEN a.type::text = 'SCOUT' THEN ${jsonNumber(a, 'whores')} + ${jsonNumber(a, 'thugs')} END), 0) AS "recruitsFound",
      COALESCE(SUM(CASE WHEN a.type::text = 'PRODUCE_CRACK' THEN
        CASE WHEN jsonb_typeof(a.payload->'product') = 'number' THEN ${jsonNumber(a, 'product')} ELSE ${jsonNumber(a, 'crack')} END
      END), 0) AS "productProduced",
      COALESCE(SUM(CASE WHEN a.type::text = 'STORE_SELL' AND jsonb_typeof(a.payload->'product') = 'string'
        THEN ${jsonNumber(a, 'quantity')} END), 0) AS "productSold",
      COALESCE(MAX(CASE WHEN a.type::text IN ('STORE_BUY', 'STORE_SELL') THEN ABS(${jsonNumber(a, 'totalCents')}) END), 0) AS "largestStoreCents",
      COUNT(*) FILTER (WHERE a.type::text = 'CONVOY_ATTACK' AND a.payload->>'won' = 'true') AS "convoyAttacksWon",
      COALESCE(SUM(CASE WHEN a.type::text = 'CONVOY_ATTACK' AND a.payload->>'won' = 'true'
        THEN GREATEST(${jsonNumber(a, 'cashCents')}, 0) END), 0) AS "convoyCashCents",
      COUNT(*) FILTER (WHERE a.type::text = 'TURF_CLAIM' AND a.payload->>'won' = 'true') AS "turfClaims"
    FROM "PlayerActivity" a
    WHERE a."roundPlayerId" IN (${Prisma.join(ids)})
      AND a.type::text IN ('SCOUT', 'PRODUCE_CRACK', 'STORE_BUY', 'STORE_SELL', 'CONVOY_ATTACK', 'TURF_CLAIM')
    GROUP BY a."roundPlayerId"
  `);
}

/** Multi-line store checkouts keep their Pip product sales inside `lines`. */
async function checkoutProductSales(prisma: PrismaClient, ids: string[]) {
  const line = 'line';
  return prisma.$queryRaw<Array<Row<'sold'>>>(Prisma.sql`
    SELECT a."roundPlayerId" AS id, COALESCE(SUM(${jsonNumber(line, 'quantity')}), 0) AS sold
    FROM "PlayerActivity" a
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(a.payload->'lines') = 'array' THEN a.payload->'lines' ELSE '[]'::jsonb END
    ) AS line
    WHERE a."roundPlayerId" IN (${Prisma.join(ids)})
      AND a.type::text IN ('STORE_BUY', 'STORE_SELL')
      AND line->>'storeKey' = 'PIP'
      AND line->>'direction' = 'sell'
    GROUP BY a."roundPlayerId"
  `);
}

async function battleTotals(prisma: PrismaClient, ids: string[]) {
  const r = 'x.report';
  return prisma.$queryRaw<Array<Row<
    'raidsWon' | 'raidsLost' | 'defensesHeld' | 'defensesLost' | 'driveBysLanded'
    | 'thugsDefeated' | 'cashStolenCents' | 'biggestRaidCents'
  >>>(Prisma.sql`
    SELECT
      x.id,
      COUNT(*) FILTER (WHERE x.attacker AND x.kind = 'RAID' AND x.report->>'won' = 'true') AS "raidsWon",
      COUNT(*) FILTER (WHERE x.attacker AND x.kind = 'RAID' AND x.report->>'won' IS DISTINCT FROM 'true') AS "raidsLost",
      COUNT(*) FILTER (WHERE NOT x.attacker AND x.kind = 'RAID' AND x.report->>'won' = 'true') AS "defensesHeld",
      COUNT(*) FILTER (WHERE NOT x.attacker AND x.kind = 'RAID' AND x.report->>'won' IS DISTINCT FROM 'true') AS "defensesLost",
      COUNT(*) FILTER (WHERE x.attacker AND x.kind = 'DRIVE_BY' AND x.report->>'won' = 'true') AS "driveBysLanded",
      COALESCE(SUM(${jsonNumber(r, 'opponentWounds')}), 0) AS "thugsDefeated",
      COALESCE(SUM(CASE WHEN x.attacker THEN GREATEST(${jsonNumber(r, 'cashChangeCents')}, 0) END), 0) AS "cashStolenCents",
      COALESCE(MAX(CASE WHEN x.attacker THEN GREATEST(${jsonNumber(r, 'cashChangeCents')}, 0) END), 0) AS "biggestRaidCents"
    FROM (
      SELECT b."attackerId" AS id, true AS attacker, b.kind::text AS kind, b."attackerReport" AS report
      FROM "RaidBattle" b
      WHERE b."attackerId" IN (${Prisma.join(ids)}) AND b."voidedAt" IS NULL
      UNION ALL
      SELECT b."defenderId" AS id, false AS attacker, b.kind::text AS kind, b."defenderReport" AS report
      FROM "RaidBattle" b
      WHERE b."defenderId" IN (${Prisma.join(ids)}) AND b."voidedAt" IS NULL
    ) x
    GROUP BY x.id
  `);
}

/**
 * Cities an alliance took control of while this crew held a block there for it.
 * Control is alliance-only, and the hold segment snapshots the alliance, so a
 * crew that later leaves keeps the credit it earned.
 */
async function citiesControlled(prisma: PrismaClient, ids: string[]) {
  return prisma.$queryRaw<Array<Row<'cities'>>>(Prisma.sql`
    SELECT s."holderId" AS id, COUNT(DISTINCT e."cityId") AS cities
    FROM "TurfHoldSegment" s
    INNER JOIN "Turf" t ON t.id = s."turfId"
    INNER JOIN "TurfControlEvent" e
      ON e."roundId" = s."roundId"
     AND e."cityId" = t."cityId"
     AND e."nextAllianceId" = s."allianceId"
    WHERE s."holderId" IN (${Prisma.join(ids)})
      AND s."allianceId" IS NOT NULL
      AND s."startedAt" <= e."happenedAt"
      AND (s."endedAt" IS NULL OR s."endedAt" >= e."happenedAt")
    GROUP BY s."holderId"
  `);
}

async function runTotals(prisma: PrismaClient, ids: string[]) {
  const [cargo, trades] = await Promise.all([
    prisma.$queryRaw<Array<Row<'loaded'>>>(Prisma.sql`
      SELECT r."roundPlayerId" AS id, COALESCE(SUM(c."startQuantity"), 0) AS loaded
      FROM "RunCargo" c
      INNER JOIN "Run" r ON r.id = c."runId"
      WHERE r."roundPlayerId" IN (${Prisma.join(ids)})
      GROUP BY r."roundPlayerId"
    `),
    prisma.$queryRaw<Array<Row<'bought' | 'sold' | 'largest'>>>(Prisma.sql`
      SELECT
        r."roundPlayerId" AS id,
        COALESCE(SUM(CASE WHEN t.direction = 'buy' THEN t.quantity ELSE 0 END), 0) AS bought,
        COALESCE(SUM(CASE WHEN t.direction = 'sell' THEN t.quantity ELSE 0 END), 0) AS sold,
        COALESCE(MAX(t."totalCents"), 0) AS largest
      FROM "RunTrade" t
      INNER JOIN "Run" r ON r.id = t."runId"
      WHERE r."roundPlayerId" IN (${Prisma.join(ids)})
      GROUP BY r."roundPlayerId"
    `),
  ]);
  return { cargo, trades };
}

function byId<K extends string>(rows: Array<Row<K>>): Map<string, Row<K>> {
  return new Map(rows.map((row) => [row.id, row]));
}

export const SeasonStatsService = {
  /** Totals for many round players at once: a fixed number of queries whatever the count. */
  async totals(
    prisma: PrismaClient,
    players: SeasonStatsPlayer[],
    now: Date = new Date(),
  ): Promise<Map<string, SeasonTotals>> {
    const result = new Map<string, SeasonTotals>();
    if (!players.length) return result;
    const ids = players.map((player) => player.id);

    const [activity, checkout, battles, captured, lost, segments, cities, returned, stops, runs, reputation] = await Promise.all([
      activityTotals(prisma, ids),
      checkoutProductSales(prisma, ids),
      battleTotals(prisma, ids),
      prisma.turfPush.groupBy({ by: ['attackerId'], where: { attackerId: { in: ids }, captured: true }, _count: { _all: true } }),
      prisma.turfPush.groupBy({ by: ['defenderId'], where: { defenderId: { in: ids }, captured: true }, _count: { _all: true } }),
      prisma.turfHoldSegment.findMany({
        where: { holderId: { in: ids } },
        select: { holderId: true, startedAt: true, endedAt: true },
      }),
      citiesControlled(prisma, ids),
      prisma.run.groupBy({ by: ['roundPlayerId'], where: { roundPlayerId: { in: ids }, status: 'RETURNED' }, _count: { _all: true } }),
      prisma.runStop.findMany({
        where: { run: { roundPlayerId: { in: ids } }, arriveAt: { lte: now } },
        select: { route: true, run: { select: { roundPlayerId: true } } },
      }),
      runTotals(prisma, ids),
      prisma.playerReputation.groupBy({ by: ['roundPlayerId'], where: { roundPlayerId: { in: ids } }, _sum: { points: true } }),
    ]);

    const activityById = byId(activity);
    const checkoutById = byId(checkout);
    const battlesById = byId(battles);
    const citiesById = byId(cities);
    const cargoById = byId(runs.cargo);
    const tradesById = byId(runs.trades);
    const capturedById = new Map(captured.map((row) => [row.attackerId, row._count._all]));
    const lostById = new Map(lost.map((row) => [row.defenderId, row._count._all]));
    const returnedById = new Map(returned.map((row) => [row.roundPlayerId, row._count._all]));
    const reputationById = new Map(reputation.map((row) => [row.roundPlayerId, row._sum.points ?? 0]));

    const players_ = new Map(players.map((player) => [player.id, player]));
    const rulesets = new Map<string, Ruleset | null>();
    const rulesetFor = (player: SeasonStatsPlayer): Ruleset | null => {
      const key = `${player.round.rulesetId}@${player.round.rulesetVersion}`;
      if (!rulesets.has(key)) {
        try {
          rulesets.set(key, loadRulesetForRound(player.round));
        } catch {
          rulesets.set(key, null);
        }
      }
      return rulesets.get(key) ?? null;
    };

    for (const player of players) {
      const totals = emptySeasonTotals();
      const a = activityById.get(player.id);
      const b = battlesById.get(player.id);
      const trades = tradesById.get(player.id);

      totals.turnsWorked = num(a?.turnsWorked);
      totals.streetEarningsCents = num(a?.streetEarningsCents);
      totals.recruitsFound = num(a?.recruitsFound);
      totals.peakCrew = Math.max(player.peakCrew, player.whores + player.thugs);

      totals.raidsWon = num(b?.raidsWon);
      totals.raidsLost = num(b?.raidsLost);
      totals.defensesHeld = num(b?.defensesHeld);
      totals.defensesLost = num(b?.defensesLost);
      totals.driveBysLanded = num(b?.driveBysLanded);
      totals.thugsDefeated = num(b?.thugsDefeated);
      // Convoy hits take cash from other players as surely as a raid does.
      totals.cashStolenCents = num(b?.cashStolenCents) + num(a?.convoyCashCents);
      totals.biggestRaidCents = num(b?.biggestRaidCents);

      totals.blocksCaptured = (capturedById.get(player.id) ?? 0) + num(a?.turfClaims);
      totals.blocksLost = lostById.get(player.id) ?? 0;
      totals.citiesControlled = num(citiesById.get(player.id)?.cities);

      totals.runsCompleted = returnedById.get(player.id) ?? 0;
      totals.cargoMoved = num(cargoById.get(player.id)?.loaded) + num(trades?.bought);
      totals.convoyAttacksWon = num(a?.convoyAttacksWon);

      totals.productProduced = num(a?.productProduced);
      totals.productSold = num(a?.productSold) + num(checkoutById.get(player.id)?.sold) + num(trades?.sold);
      totals.largestTransactionCents = Math.max(num(a?.largestStoreCents), num(trades?.largest));
      totals.traderReputation = reputationById.get(player.id) ?? 0;

      result.set(player.id, totals);
    }

    for (const segment of segments) {
      const player = players_.get(segment.holderId);
      const totals = result.get(segment.holderId);
      if (!player || !totals) continue;
      const cap = Math.min(now.getTime(), player.round.endsAt.getTime());
      const end = Math.min(segment.endedAt?.getTime() ?? cap, cap);
      totals.blockSeconds += Math.max(0, Math.floor((end - segment.startedAt.getTime()) / 1000));
    }

    for (const stop of stops) {
      const player = players_.get(stop.run.roundPlayerId);
      const totals = result.get(stop.run.roundPlayerId);
      const ruleset = player && rulesetFor(player);
      if (!totals || !ruleset) continue;
      totals.driveHours += routeDriveHours(ruleset, stop.route);
    }

    return result;
  },
};

/**
 * The public sheet. `sealed` is true while the season is live and the viewer
 * is someone else: cash, crew and product-flow numbers would otherwise be free
 * recon, so they wait until the season ends.
 */
export function toStatSheet(totals: SeasonTotals, sealed: boolean): PublicStatSheetDto {
  const open = <T>(value: T): T | null => (sealed ? null : value);
  return {
    sealed,
    street: {
      turnsWorked: totals.turnsWorked,
      streetEarningsCents: open(totals.streetEarningsCents),
      recruitsFound: open(totals.recruitsFound),
      peakCrew: open(totals.peakCrew),
    },
    combat: {
      raidsWon: totals.raidsWon,
      raidsLost: totals.raidsLost,
      defensesHeld: totals.defensesHeld,
      defensesLost: totals.defensesLost,
      driveBysLanded: totals.driveBysLanded,
      thugsDefeated: totals.thugsDefeated,
      cashStolenCents: open(totals.cashStolenCents),
      biggestRaidCents: open(totals.biggestRaidCents),
    },
    turf: {
      blocksCaptured: totals.blocksCaptured,
      blocksLost: totals.blocksLost,
      blockHours: Math.round(totals.blockSeconds / 360) / 10,
      citiesControlled: totals.citiesControlled,
    },
    travel: {
      runsCompleted: totals.runsCompleted,
      driveHours: Math.round(totals.driveHours * 10) / 10,
      cargoMoved: open(totals.cargoMoved),
      convoyAttacksWon: totals.convoyAttacksWon,
    },
    economy: {
      productProduced: open(totals.productProduced),
      productSold: open(totals.productSold),
      largestTransactionCents: open(totals.largestTransactionCents),
      traderReputation: totals.traderReputation,
    },
  };
}

/** Which totals `toStatSheet` withholds from other viewers during a live season. */
export const SEALED_TOTALS: ReadonlySet<keyof SeasonTotals> = new Set<keyof SeasonTotals>([
  'streetEarningsCents',
  'recruitsFound',
  'peakCrew',
  'cashStolenCents',
  'biggestRaidCents',
  'cargoMoved',
  'productProduced',
  'productSold',
  'largestTransactionCents',
]);
