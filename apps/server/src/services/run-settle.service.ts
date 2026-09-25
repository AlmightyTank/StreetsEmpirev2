import type { Prisma, Run, RunCargo, RunIncident, RunStop } from '@prisma/client';
import {
  hashParts,
  loadRulesetForRound,
  marketView,
  resolveRoadStop,
  runNetWorthCents,
  runPosition,
  seededRng,
  settleLiveShelf,
  type RunGuns,
  type Ruleset,
  type RunStopPlan,
} from '@streets/rules-engine';
import type { MarketPriceDto, RunIncidentDto, SupplyLevelDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { ActivityService } from './activity.service.js';
import { CombatRecoveryService } from './combat-recovery.service.js';
import { ConvoyService } from './convoy.service.js';
import { HighMarketService } from './high-market.service.js';
import { EconomyLedgerService } from './economy-ledger.service.js';
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

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;

export function toIncidentDto(ruleset: Ruleset, incident: RunIncident): RunIncidentDto {
  return {
    kind: incident.kind,
    city: incident.city,
    cityName: cityName(ruleset, incident.city),
    road: incident.road,
    seized: incident.seized as Record<string, number>,
    fineCents: Number(incident.fineCents),
    at: incident.at.toISOString(),
  };
}

/** A run's away net worth, from its wallet, cars, escorts, their guns (0.5.0-E) and its trunk. */
export function awayWorth(ruleset: Ruleset, run: { cashCents: bigint; lowRiders: number; escortThugs: number; beer?: number } & Partial<RunGuns>, cargo: Record<string, number>): bigint {
  const guns = { pistols: run.pistols ?? 0, shotguns: run.shotguns ?? 0, tek9s: run.tek9s ?? 0, ak47s: run.ak47s ?? 0 };
  return runNetWorthCents(ruleset, { cashCents: run.cashCents, lowRiders: run.lowRiders, escortThugs: run.escortThugs, beer: run.beer ?? 0, cargo, guns });
}

export async function activeRuns(db: Db, roundPlayerId: string): Promise<LoadedRun[]> {
  return db.run.findMany({
    where: { roundPlayerId, status: 'ACTIVE' },
    include: RUN_INCLUDE,
    orderBy: [{ launchedAt: 'asc' }, { id: 'asc' }],
  });
}

/** 0.6.0-D Garage: away value is the sum of every active run, never whichever one moved last. */
export async function totalAwayWorth(tx: Db, roundPlayerId: string, ruleset: Ruleset): Promise<bigint> {
  const runs = await activeRuns(tx, roundPlayerId);
  return runs.reduce((sum, run) => sum + awayWorth(ruleset, run, cargoOf(run)), 0n);
}

export async function refreshAwayWorth(tx: Db, roundPlayerId: string, ruleset: Ruleset): Promise<bigint> {
  const awayNetWorthCents = await totalAwayWorth(tx, roundPlayerId, ruleset);
  await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { awayNetWorthCents } });
  return awayNetWorthCents;
}

/** The high market's next unit each way for a product in a city, or null where it has no price. */
export function marketPrice(ruleset: Ruleset, seed: string, city: string, product: string, push: number, at: Date): MarketPriceDto | null {
  const view = marketView(ruleset, seed, city, product, push, at);
  return view ? { buyCents: view.buyCents, sellCents: view.sellCents, depth: view.depth } : null;
}

/** What the crew sees in a city at a moment: Pip's counter, every product, and the high market. */
export interface SightingCounter {
  products: Array<{ key: string; supply: SupplyLevelDto | null; buyCents: number | null; sellCents: number | null; stock: number; market?: MarketPriceDto | null }>;
}

/** Pip's counter and the high market in a city as a player's shelves stand at `at`. */
export async function counterAt(db: Db, roundPlayerId: string, ruleset: Ruleset, seed: string, city: string, at: Date): Promise<SightingCounter> {
  const shelves = await db.cityShelf.findMany({ where: { roundPlayerId, city }, select: { productKey: true, stock: true, stockAt: true } });
  const pushes = await HighMarketService.pushes(db, ruleset, seed, city, at);
  return {
    products: productKeys(ruleset).map((key) => {
      const row = shelves.find((shelf) => shelf.productKey === key) ?? null;
      // A shelf last touched after `at` is read as it is: never look back past a trade.
      const settled = settleLiveShelf(row && row.stockAt.getTime() > at.getTime() ? { stock: row.stock, stockAt: at } : row, ruleset, seed, city, key, at);
      const counter = settled.counter;
      const market = marketPrice(ruleset, seed, city, key, pushes.get(key) ?? 0, at);
      if (!counter) return { key, supply: null, buyCents: null, sellCents: null, stock: 0, market };
      return { key, supply: counter.supply, buyCents: counter.buyCents, sellCents: counter.sellCents, stock: settled.stock, market };
    }),
  };
}

/** Remember what the crew saw in a city, if it is newer than what they knew. */
export async function recordSighting(db: Db, roundPlayerId: string, ruleset: Ruleset, seed: string, city: string, at: Date): Promise<void> {
  const existing = await db.citySighting.findUnique({ where: { roundPlayerId_city: { roundPlayerId, city } }, select: { seenAt: true } });
  if (existing && existing.seenAt.getTime() >= at.getTime()) return;
  const counter = await counterAt(db, roundPlayerId, ruleset, seed, city, at);
  await db.citySighting.upsert({
    where: { roundPlayerId_city: { roundPlayerId, city } },
    create: { roundPlayerId, city, seenAt: at, counter: counter as unknown as Prisma.InputJsonValue },
    update: { seenAt: at, counter: counter as unknown as Prisma.InputJsonValue },
  });
}

/** Refresh what the crew knows about every town the run has reached, as of when it was last there. */
async function recordStops(tx: Db, roundPlayerId: string, ruleset: Ruleset, seed: string, stops: readonly RunStopPlan[], now: Date): Promise<void> {
  for (const stop of stops.slice(0, -1)) {
    if (stop.arriveAt.getTime() > now.getTime()) break;
    const seenAt = stop.leaveAt && stop.leaveAt.getTime() < now.getTime() ? stop.leaveAt : now;
    const existing = await tx.citySighting.findUnique({ where: { roundPlayerId_city: { roundPlayerId, city: stop.city } }, select: { seenAt: true } });
    // While a run sits in town the crew keeps watching, but a page refresh a second later is not news.
    if (existing && seenAt.getTime() - existing.seenAt.getTime() < 60_000 && existing.seenAt.getTime() >= stop.arriveAt.getTime()) continue;
    await recordSighting(tx, roundPlayerId, ruleset, seed, stop.city, seenAt);
  }
}

/**
 * Take what the police took from a run: units out of the trunk, cash out of the
 * wallet. Keeps the player's away net worth true. Returns the run as it now stands.
 */
export async function takeFromRun(
  tx: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  run: LoadedRun,
  taken: { seized: Record<string, number>; fineCents: bigint },
): Promise<LoadedRun> {
  const cargo = cargoOf(run);
  for (const [key, units] of Object.entries(taken.seized)) {
    const left = Math.max(0, (cargo[key] ?? 0) - units);
    cargo[key] = left;
    await tx.runCargo.update({ where: { runId_productKey: { runId: run.id, productKey: key } }, data: { quantity: left } });
  }
  const cashCents = run.cashCents - (taken.fineCents > run.cashCents ? run.cashCents : taken.fineCents);
  await tx.run.update({ where: { id: run.id }, data: { cashCents } });
  await refreshAwayWorth(tx, roundPlayerId, ruleset);
  return { ...run, cashCents, cargo: run.cargo.map((row) => ({ ...row, quantity: cargo[row.productKey] ?? row.quantity })) };
}

/**
 * 0.5.0-C. Roll every leg the run has finished driving for a police stop, once each and
 * in order. The roll is seeded by the run and the leg, and `roadChecks` counts the legs
 * done, so reading a run again never rolls a leg twice or differently. Each leg rolls on
 * what the trunk held when it drove it: every trade needs the run in town, and every
 * action settles the run first, so a leg is always rolled before the next town's trades.
 */
async function rollRoadStops(tx: Db, roundPlayerId: string, ruleset: Ruleset, run: LoadedRun, stops: readonly RunStopPlan[], now: Date): Promise<LoadedRun> {
  if (!ruleset.travel?.stops) return run;
  let current = run;
  let checks = run.roadChecks;
  const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { heat: true } });
  while (checks < stops.length && stops[checks]!.arriveAt.getTime() <= now.getTime()) {
    const stop = stops[checks]!;
    const stopped = resolveRoadStop(ruleset, {
      route: stop.route,
      cargo: cargoOf(current),
      cashCents: current.cashCents,
      escorts: current.escortThugs,
      heat: player.heat,
      rng: seededRng(hashParts(run.id, 'road-stop', checks)),
    });
    checks++;
    if (!stopped.stopped) continue;
    current = await takeFromRun(tx, roundPlayerId, ruleset, current, stopped);
    const incident = await tx.runIncident.create({
      data: { runId: run.id, kind: 'STOP', city: stop.city, road: stopped.road?.name ?? null, seized: stopped.seized, fineCents: stopped.fineCents, at: stop.arriveAt },
    });
    if (incident.fineCents > 0n) {
      await EconomyLedgerService.record(tx, roundPlayerId, [{
        source: 'RUN_INCIDENT',
        label: `Road-stop fine · ${incident.road ?? cityName(ruleset, incident.city)}`,
        amountCents: -incident.fineCents,
      }], incident.at);
    }
    await ActivityService.log(tx, roundPlayerId, 'RUN_INCIDENT', { runId: run.id, ...toIncidentDto(ruleset, incident) } as unknown as Prisma.InputJsonValue);
  }
  if (checks !== run.roadChecks) await tx.run.update({ where: { id: run.id }, data: { roadChecks: checks } });
  return { ...current, roadChecks: checks };
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
  await tx.run.update({ where: { id: run.id }, data: { status: 'RETURNED', returnedAt } });
  const awayNetWorthCents = await totalAwayWorth(tx, roundPlayerId, ruleset);
  await tx.roundPlayer.update({
    where: { id: roundPlayerId },
    data: {
      cashCents: { increment: run.cashCents },
      beer: { increment: run.beer },
      lowRiders: { increment: run.lowRiders },
      thugs: { increment: run.escortThugs },
      // 0.5.0-E: the escorts' guns come home with them.
      pistols: { increment: run.pistols },
      shotguns: { increment: run.shotguns },
      tek9s: { increment: run.tek9s },
      ak47s: { increment: run.ak47s },
      crack: { increment: cargo[CRACK] ?? 0 },
      awayNetWorthCents,
    },
  });
  // 0.5.0-E: escorts wounded on the road come home still healing, if their wounds have not run out.
  const recovery = ruleset.combat?.wounds.recoveryMinutes ?? 0;
  if (run.woundedEscorts > 0 && run.lastHitAt) {
    const recoverAt = new Date(run.lastHitAt.getTime() + recovery * 60_000);
    if (recoverAt > returnedAt) await CombatRecoveryService.add(tx, roundPlayerId, null, run.woundedEscorts, recoverAt);
  }
  const incidents = await tx.runIncident.findMany({ where: { runId: run.id }, orderBy: { at: 'asc' } });
  await ActivityService.log(tx, roundPlayerId, 'RUN_RETURNED', {
    runId: run.id,
    cities: stops.slice(0, -1).map((stop) => cityName(ruleset, stop.city)),
    startCashCents: Number(run.startCashCents),
    cashCents: Number(run.cashCents),
    cargoOut: Object.fromEntries(run.cargo.map((row) => [row.productKey, row.startQuantity])),
    cargoBack: cargo,
    lowRiders: run.lowRiders,
    escortThugs: run.escortThugs,
    turnsSpent: run.turnsSpent,
    incidents: incidents.map((incident) => incident.kind),
  });
}

/** The run in one line, for the dashboard and the nav badge. Null when nothing is out. */
export async function runSummary(db: Db, roundPlayerId: string, ruleset: Ruleset, now: Date): Promise<{ phase: 'road' | 'town'; city: string; cityName: string; until: string } | null> {
  const run = await db.run.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, include: { stops: { orderBy: { order: 'asc' } } } });
  if (!run) return null;
  const position = runPosition(ruleset, toStopPlans(run.stops), now);
  if (position.phase === 'home') return null;
  return { phase: position.phase, city: position.city, cityName: cityName(ruleset, position.city), until: position.until.toISOString() };
}

/**
 * 0.5.0-B. Settle a player's run. Called under the player's lock, before anything
 * reads the player: every action and every settle sees a run that is home as home.
 * Rolls the road for every leg driven (0.5.0-C), lands any tail whose window has closed
 * (0.5.0-E), records what the crew saw in each
 * town it reached, and brings the run home when it is due. Idempotent: reading twice
 * at the same moment changes nothing the second time.
 */
export const RunSettleService = {
  async settle(tx: Db, roundPlayerId: string, now: Date): Promise<void> {
    const loaded = await activeRuns(tx, roundPlayerId);
    if (!loaded.length) return;
    const { round } = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { round: { select: { id: true, rulesetId: true, rulesetVersion: true } } } });
    const ruleset = loadRulesetForRound(round);
    for (const active of loaded) {
      const stops = toStopPlans(active.stops);
      const driven = await rollRoadStops(tx, roundPlayerId, ruleset, active, stops, now);
      // 0.5.0-E: then tails whose window has closed land, before this run can come home.
      const run = await ConvoyService.landTails(tx, roundPlayerId, ruleset, driven, stops, now);
      await recordStops(tx, roundPlayerId, ruleset, round.id, stops, now);
      if (runPosition(ruleset, stops, now).phase === 'home') await bringHome(tx, roundPlayerId, ruleset, run, stops);
    }
  },
};
