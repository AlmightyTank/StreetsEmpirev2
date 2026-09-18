import type { Prisma, Run, RunCargo, RunStop } from '@prisma/client';
import {
  cityCounter,
  loadRulesetForRound,
  runPosition,
  settleCityShelf,
  type Ruleset,
  type RunStopPlan,
} from '@streets/rules-engine';
import type { SupplyLevelDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { ActivityService } from './activity.service.js';
import { CRACK, productKeys } from './product-inventory.service.js';

export const RUN_INCLUDE = {
  stops: { orderBy: { order: 'asc' } },
  cargo: true,
} as const satisfies Prisma.RunInclude;

export type LoadedRun = Run & { stops: RunStop[]; cargo: RunCargo[] };

export function toStopPlans(stops: readonly RunStop[]): RunStopPlan[] {
  return stops.map((stop) => ({
    city: stop.city,
    route: stop.route as string[],
    departAt: stop.departAt,
    arriveAt: stop.arriveAt,
    leaveAt: stop.leaveAt,
  }));
}

export function cargoOf(run: { cargo: readonly RunCargo[] }): Record<string, number> {
  return Object.fromEntries(run.cargo.map((row) => [row.productKey, row.quantity]));
}

/** What the crew sees at Pip's in a city at a moment: every product, carried or not. */
export interface SightingCounter {
  products: Array<{ key: string; supply: SupplyLevelDto | null; buyCents: number | null; sellCents: number | null; stock: number }>;
}

/** Pip's counter in a city as a player's shelves stand at `at`. */
export async function counterAt(db: Db, roundPlayerId: string, ruleset: Ruleset, city: string, at: Date): Promise<SightingCounter> {
  const shelves = await db.cityShelf.findMany({ where: { roundPlayerId, city }, select: { productKey: true, stock: true, stockAt: true } });
  return {
    products: productKeys(ruleset).map((key) => {
      const counter = cityCounter(ruleset, city, key);
      if (!counter) return { key, supply: null, buyCents: null, sellCents: null, stock: 0 };
      const row = shelves.find((shelf) => shelf.productKey === key) ?? null;
      // A shelf last touched after `at` is read as it is: never look back past a trade.
      const settled = settleCityShelf(row && row.stockAt.getTime() > at.getTime() ? { stock: row.stock, stockAt: at } : row, counter, at);
      return { key, supply: counter.supply, buyCents: counter.buyCents, sellCents: counter.sellCents, stock: settled.stock };
    }),
  };
}

/** Remember what the crew saw at Pip's in a city, if it is newer than what they knew. */
export async function recordSighting(db: Db, roundPlayerId: string, ruleset: Ruleset, city: string, at: Date): Promise<void> {
  const existing = await db.citySighting.findUnique({ where: { roundPlayerId_city: { roundPlayerId, city } }, select: { seenAt: true } });
  if (existing && existing.seenAt.getTime() >= at.getTime()) return;
  const counter = await counterAt(db, roundPlayerId, ruleset, city, at);
  await db.citySighting.upsert({
    where: { roundPlayerId_city: { roundPlayerId, city } },
    create: { roundPlayerId, city, seenAt: at, counter: counter as unknown as Prisma.InputJsonValue },
    update: { seenAt: at, counter: counter as unknown as Prisma.InputJsonValue },
  });
}

/** Refresh what the crew knows about every town the run has reached, as of when it was last there. */
async function recordStops(tx: Db, roundPlayerId: string, ruleset: Ruleset, stops: readonly RunStopPlan[], now: Date): Promise<void> {
  for (const stop of stops.slice(0, -1)) {
    if (stop.arriveAt.getTime() > now.getTime()) break;
    const seenAt = stop.leaveAt && stop.leaveAt.getTime() < now.getTime() ? stop.leaveAt : now;
    const existing = await tx.citySighting.findUnique({ where: { roundPlayerId_city: { roundPlayerId, city: stop.city } }, select: { seenAt: true } });
    // While a run sits in town the crew keeps watching, but a page refresh a second later is not news.
    if (existing && seenAt.getTime() - existing.seenAt.getTime() < 60_000 && existing.seenAt.getTime() >= stop.arriveAt.getTime()) continue;
    await recordSighting(tx, roundPlayerId, ruleset, stop.city, seenAt);
  }
}

/**
 * Bring a run home: its wallet, cars, escorts and cargo go back into home stock, and
 * the run becomes a receipt. Net worth does not move, because the run was already
 * counted at the same values while it was away.
 */
async function bringHome(tx: Db, roundPlayerId: string, ruleset: Ruleset, run: LoadedRun, stops: readonly RunStopPlan[]): Promise<void> {
  const cargo = cargoOf(run);
  const returnedAt = stops[stops.length - 1]!.arriveAt;
  for (const [key, quantity] of Object.entries(cargo)) {
    if (quantity <= 0 || key === CRACK) continue;
    await tx.playerProduct.upsert({
      where: { roundPlayerId_productKey: { roundPlayerId, productKey: key } },
      create: { roundPlayerId, productKey: key, quantity },
      update: { quantity: { increment: quantity } },
    });
  }
  await tx.roundPlayer.update({
    where: { id: roundPlayerId },
    data: {
      cashCents: { increment: run.cashCents },
      lowRiders: { increment: run.lowRiders },
      thugs: { increment: run.escortThugs },
      crack: { increment: cargo[CRACK] ?? 0 },
      awayNetWorthCents: 0,
    },
  });
  await tx.run.update({ where: { id: run.id }, data: { status: 'RETURNED', returnedAt } });
  await ActivityService.log(tx, roundPlayerId, 'RUN_RETURNED', {
    runId: run.id,
    cities: stops.slice(0, -1).map((stop) => ruleset.cities?.[stop.city]?.name ?? stop.city),
    startCashCents: Number(run.startCashCents),
    cashCents: Number(run.cashCents),
    cargoOut: Object.fromEntries(run.cargo.map((row) => [row.productKey, row.startQuantity])),
    cargoBack: cargo,
    lowRiders: run.lowRiders,
    escortThugs: run.escortThugs,
    turnsSpent: run.turnsSpent,
  });
}

/** The run in one line, for the dashboard and the nav badge. Null when nothing is out. */
export async function runSummary(db: Db, roundPlayerId: string, ruleset: Ruleset, now: Date): Promise<{ phase: 'road' | 'town'; city: string; cityName: string; until: string } | null> {
  const run = await db.run.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, include: { stops: { orderBy: { order: 'asc' } } } });
  if (!run) return null;
  const position = runPosition(ruleset, toStopPlans(run.stops), now);
  if (position.phase === 'home') return null;
  return { phase: position.phase, city: position.city, cityName: ruleset.cities?.[position.city]?.name ?? position.city, until: position.until.toISOString() };
}

/**
 * 0.5.0-B. Settle a player's run. Called under the player's lock, before anything
 * reads the player: every action and every settle sees a run that is home as home.
 * Records what the crew saw in each town it reached. Idempotent: reading twice at the
 * same moment changes nothing the second time.
 */
export const RunSettleService = {
  async settle(tx: Db, roundPlayerId: string, now: Date): Promise<void> {
    const run = await tx.run.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, include: RUN_INCLUDE });
    if (!run) return;
    const { round } = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { round: { select: { rulesetId: true, rulesetVersion: true } } } });
    const ruleset = loadRulesetForRound(round);
    const stops = toStopPlans(run.stops);
    await recordStops(tx, roundPlayerId, ruleset, stops, now);
    if (runPosition(ruleset, stops, now).phase === 'home') await bringHome(tx, roundPlayerId, ruleset, run, stops);
  },
};
