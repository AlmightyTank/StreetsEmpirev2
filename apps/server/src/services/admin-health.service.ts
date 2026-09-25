import type { PrismaClient } from '@prisma/client';
import type { AdminRoundHealthDayDto, AdminRoundHealthDto } from '@streets/shared';
import {
  emptyStandings,
  loadRulesetForRound,
  productEconomy,
  restockIntervalFor,
  rulesetForCity,
  settleProductShelf,
  type Ruleset,
  type Standings,
} from '@streets/rules-engine';
import type { TraderKey } from '@streets/rulesets';
import { AppError } from '../utils/errors.js';
import { adminRound } from './admin-round.service.js';
import { StockService } from './stock.service.js';

const DAY_MS = 86_400_000;
const HEALTH_DAYS = 14;

/**
 * Activity that does not mean the player did something: joining, being hit,
 * and the away bonus that is logged when they come back. Away bonus also logs
 * turns gained, so it never counts toward turns spent.
 */
const PASSIVE_TYPES = ['ROUND_JOINED', 'RAID_DEFENSE', 'DRIVE_BY_DEFENSE', 'AWAY_BONUS'];

const dayKey = (date: Date) => date.toISOString().slice(0, 10);


type StandingRow = {
  trader: string;
  points: number;
  creditedOn: Date | null;
  questDoneAt: Date | null;
};

function standingsFromRows(ruleset: Ruleset, rows: StandingRow[]): Standings {
  const standings = emptyStandings(ruleset);
  for (const row of rows) {
    const trader = row.trader as TraderKey;
    if (!(trader in standings)) continue;
    standings[trader] = {
      points: row.points,
      creditedOn: row.creditedOn,
      questDone: row.questDoneAt !== null,
    };
  }
  return standings;
}

/**
 * Per-round health for admins, aggregated in the database so a busy round
 * never pulls every activity row into memory. Days are UTC calendar days.
 */
export const AdminHealthService = {
  async roundHealth(prisma: PrismaClient, roundId: string, now = new Date()): Promise<AdminRoundHealthDto> {
    const round = await prisma.round.findUnique({ where: { id: roundId } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');

    const windowEnd = new Date(Math.min(now.getTime(), round.endsAt.getTime()));
    const firstDay = new Date(`${dayKey(new Date(Math.max(round.startsAt.getTime(), windowEnd.getTime() - (HEALTH_DAYS - 1) * DAY_MS)))}T00:00:00.000Z`);

    const [activity, activePlayers, battles, joins, counts, neverActed, topPlayers] = await Promise.all([
      prisma.$queryRaw<Array<{ day: string; type: string; count: number; turns: number }>>`
        SELECT to_char(date_trunc('day', a."createdAt"), 'YYYY-MM-DD') AS day,
               a.type::text AS type,
               COUNT(*)::int AS count,
               COALESCE(SUM(CASE WHEN a.type::text <> 'AWAY_BONUS' AND jsonb_typeof(a.payload->'turns') = 'number'
                                 THEN (a.payload->>'turns')::numeric ELSE 0 END), 0)::int AS turns
        FROM "PlayerActivity" a
        JOIN "RoundPlayer" p ON p.id = a."roundPlayerId"
        WHERE p."roundId" = ${roundId} AND a."createdAt" >= ${firstDay}
        GROUP BY 1, 2`,
      prisma.$queryRaw<Array<{ day: string; players: number }>>`
        SELECT to_char(date_trunc('day', a."createdAt"), 'YYYY-MM-DD') AS day,
               COUNT(DISTINCT a."roundPlayerId")::int AS players
        FROM "PlayerActivity" a
        JOIN "RoundPlayer" p ON p.id = a."roundPlayerId"
        WHERE p."roundId" = ${roundId} AND a."createdAt" >= ${firstDay}
          AND a.type::text NOT IN ('ROUND_JOINED', 'RAID_DEFENSE', 'DRIVE_BY_DEFENSE', 'AWAY_BONUS')
        GROUP BY 1`,
      prisma.$queryRaw<Array<{ day: string; raids: number; driveBys: number; special: number }>>`
        SELECT to_char(date_trunc('day', b."createdAt"), 'YYYY-MM-DD') AS day,
               COUNT(*) FILTER (WHERE b.kind::text = 'RAID'
                 AND COALESCE(b."attackerReport"->>'kind', 'RAID') NOT IN ('DRUG_HOES', 'STEAL_RIDE', 'LURE_CREW'))::int AS raids,
               COUNT(*) FILTER (WHERE b.kind::text = 'DRIVE_BY')::int AS "driveBys",
               COUNT(*) FILTER (WHERE b.kind::text = 'RAID'
                 AND COALESCE(b."attackerReport"->>'kind', 'RAID') IN ('DRUG_HOES', 'STEAL_RIDE', 'LURE_CREW'))::int AS special
        FROM "RaidBattle" b
        JOIN "RoundPlayer" p ON p.id = b."attackerId"
        WHERE p."roundId" = ${roundId} AND b."createdAt" >= ${firstDay} AND b."voidedAt" IS NULL
        GROUP BY 1`,
      prisma.$queryRaw<Array<{ day: string; joins: number }>>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS joins
        FROM "RoundPlayer"
        WHERE "roundId" = ${roundId} AND "createdAt" >= ${firstDay}
        GROUP BY 1`,
      Promise.all([
        prisma.roundPlayer.count({ where: { roundId } }),
        prisma.roundPlayer.count({ where: { roundId, lastActiveAt: { gte: new Date(windowEnd.getTime() - DAY_MS) } } }),
        prisma.roundPlayer.count({ where: { roundId, lastActiveAt: { gte: new Date(windowEnd.getTime() - 7 * DAY_MS) } } }),
      ]),
      prisma.roundPlayer.count({
        where: { roundId, activity: { none: { type: { notIn: PASSIVE_TYPES as never[] } } } },
      }),
      prisma.roundPlayer.findMany({
        where: { roundId, account: { isActive: true } },
        orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
        take: 10,
        select: { id: true, displayName: true, publicPimpId: true, netWorthCents: true, nationalRank: true, lastActiveAt: true },
      }),
    ]);

    const days = new Map<string, AdminRoundHealthDayDto>();
    for (let time = new Date(`${dayKey(windowEnd)}T00:00:00.000Z`).getTime(); time >= firstDay.getTime(); time -= DAY_MS) {
      const day = dayKey(new Date(time));
      days.set(day, { day, joins: 0, activePlayers: 0, turnsSpent: 0, raids: 0, driveBys: 0, specialRaids: 0, recon: 0 });
    }
    for (const row of activity) {
      const day = days.get(row.day);
      if (!day) continue;
      day.turnsSpent += row.turns;
      if (row.type === 'COMBAT_RECON') day.recon += row.count;
    }
    for (const row of activePlayers) {
      const day = days.get(row.day);
      if (day) day.activePlayers = row.players;
    }
    for (const row of battles) {
      const day = days.get(row.day);
      if (!day) continue;
      day.raids = row.raids;
      day.driveBys = row.driveBys;
      day.specialRaids = row.special;
    }
    for (const row of joins) {
      const day = days.get(row.day);
      if (day) day.joins = row.joins;
    }

    const [total, active24h, active7d] = counts;
    const ruleset = loadRulesetForRound(round);
    let storeEconomy: AdminRoundHealthDto['storeEconomy'] = null;
    if (ruleset.storeEconomy) {
      const [marketRows, shelfPlayers, reputationRows, productShelves, specialOrders] = await Promise.all([
        prisma.highMarket.findMany({
          where: { roundId },
          orderBy: [{ city: 'asc' }, { productKey: 'asc' }],
          select: { city: true, productKey: true, push: true, pushAt: true },
        }),
        prisma.roundPlayer.findMany({
          where: { roundId },
          include: { city: { select: { slug: true } } },
        }),
        prisma.playerReputation.findMany({
          where: { roundPlayer: { roundId } },
          select: { roundPlayerId: true, trader: true, points: true, creditedOn: true, questDoneAt: true },
        }),
        prisma.productShelf.findMany({
          where: { roundPlayer: { roundId } },
          select: { roundPlayerId: true, productKey: true, stock: true, stockAt: true },
        }),
        prisma.$queryRaw<Array<{ last24h: number; pending: number }>>`
          SELECT
            COUNT(*) FILTER (WHERE a."createdAt" >= ${new Date(now.getTime() - DAY_MS)})::int AS "last24h",
            COUNT(*) FILTER (
              WHERE jsonb_typeof(a.payload->'specialOrder') = 'boolean'
                AND (a.payload->>'specialOrder')::boolean = true
                AND a.payload ? 'stockArrivesAt'
                AND (a.payload->>'stockArrivesAt')::timestamptz > ${now}
            )::int AS pending
          FROM "PlayerActivity" a
          JOIN "RoundPlayer" p ON p.id = a."roundPlayerId"
          WHERE p."roundId" = ${roundId}
            AND a.type::text = 'STORE_BUY'
            AND jsonb_typeof(a.payload->'specialOrder') = 'boolean'
            AND (a.payload->>'specialOrder')::boolean = true`,
      ]);

      const reputationByPlayer = new Map<string, StandingRow[]>();
      for (const row of reputationRows) {
        const rows = reputationByPlayer.get(row.roundPlayerId) ?? [];
        rows.push(row);
        reputationByPlayer.set(row.roundPlayerId, rows);
      }

      const productShelvesByPlayer = new Map<string, typeof productShelves>();
      for (const row of productShelves) {
        const rows = productShelvesByPlayer.get(row.roundPlayerId) ?? [];
        rows.push(row);
        productShelvesByPlayer.set(row.roundPlayerId, rows);
      }

      let emptyStandard = 0;
      let emptyProduct = 0;
      for (const player of shelfPlayers) {
        const playerRuleset = rulesetForCity(ruleset, player.city.slug);
        const standings = standingsFromRows(
          playerRuleset,
          reputationByPlayer.get(player.id) ?? [],
        );

        const standard = StockService.settle(
          player as unknown as Record<string, unknown>,
          now,
          playerRuleset,
          standings,
        );
        emptyStandard += Object.values(standard.byField)
          .filter((settled) => settled?.stock === 0)
          .length;

        const pipPoints = standings.PIP?.points ?? 0;
        for (const shelf of productShelvesByPlayer.get(player.id) ?? []) {
          const economy = productEconomy(playerRuleset, shelf.productKey);
          if (!economy?.pip) continue;
          const settled = settleProductShelf(
            { stock: shelf.stock, stockAt: shelf.stockAt },
            economy,
            now,
            restockIntervalFor(economy.pip.restock.intervalMinutes, pipPoints, playerRuleset),
          );
          if (settled?.stock === 0) emptyProduct += 1;
        }
      }
      const halfLife = ruleset.travel?.market?.recoveryHalfLifeMinutes ?? null;
      const pressureLimit = ruleset.storeEconomy.pipProductPressure?.maxPricePressure ?? 0;
      const shipments = ruleset.storeEconomy.shipments;
      storeEconomy = {
        pressureLimitPercent: Math.round(pressureLimit * 100),
        markets: marketRows.map((row) => {
          const elapsedMinutes = Math.max(0, (now.getTime() - row.pushAt.getTime()) / 60_000);
          const push = halfLife && halfLife > 0 ? row.push * 0.5 ** (elapsedMinutes / halfLife) : row.push;
          return {
            city: row.city,
            productKey: row.productKey,
            pushPercent: Math.round(push * 1000) / 10,
            updatedAt: row.pushAt.toISOString(),
          };
        }),
        shelves: {
          emptyStandard,
          emptyProduct,
        },
        shipments: {
          enabled: shipments?.enabled ?? false,
          delayChancePercent: shipments?.delayChancePercent ?? 0,
          partialChancePercent: shipments?.partialChancePercent ?? 0,
          largeChancePercent: shipments?.largeChancePercent ?? 0,
        },
        specialOrders: {
          last24h: specialOrders[0]?.last24h ?? 0,
          pendingByReceipt: specialOrders[0]?.pending ?? 0,
        },
        // Reserved stock and the rotating Black Market were deliberately left as post-0.8 scope.
        reservationsEnabled: false,
        blackMarketEnabled: false,
      };
    }
    return {
      round: await adminRound(prisma, round),
      players: { total, active24h, active7d, neverActed },
      days: [...days.values()],
      storeEconomy,
      topPlayers: topPlayers.map((player) => ({
        roundPlayerId: player.id,
        displayName: player.displayName,
        publicPimpId: player.publicPimpId,
        netWorthCents: Number(player.netWorthCents),
        nationalRank: player.nationalRank,
        lastActiveAt: player.lastActiveAt.toISOString(),
      })),
    };
  },
};
