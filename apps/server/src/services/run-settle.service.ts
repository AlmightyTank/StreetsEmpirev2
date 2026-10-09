import type { Prisma, Run, RunCargo, RunIncident, RunStop } from '@prisma/client';
import {
  hashParts,
  loadRulesetForRound,
  marketView,
  resolveRoadStop,
  runNetWorthCents,
  runPosition,
  seededRng,
  planHeadHome,
  rideAlongHourCents,
  settleHotelBill,
  settleLiveShelf,
  tripNetWorthCents,
  tripRules,
  type RunGuns,
  type Ruleset,
  type RunStopPlan,
  racketRunStopCut,
  readRacketEffects,
  vehicleRiskMultiplier,
} from '@streets/rules-engine';
import type { MarketPriceDto, RunIncidentDto, SupplyLevelDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { ActivityService } from './activity.service.js';
import { CombatRecoveryService } from './combat-recovery.service.js';
import { ConvoyService } from './convoy.service.js';
import { HighMarketService } from './high-market.service.js';
import { EconomyLedgerService } from './economy-ledger.service.js';
import { CRACK, productKeys } from './product-inventory.service.js';
import { LawService, seizedValueCents } from './law.service.js';
import { hasVehicleDamage, readVehicleDamage, readVehicleLoadout, vehicleDamageJson } from './vehicle-fleet.service.js';
import { deliverSupplyPickups, settleSupplyStops, supplyLoadsByRun, withoutSupplyLoad } from './supply-pickup-settle.service.js';

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

/**
 * 0.6.0-D Garage: away value is the sum of every active run, never whichever one moved last.
 * Trips A: plus the bankroll the boss carries on a trip.
 */
export async function totalAwayWorth(tx: Db, roundPlayerId: string, ruleset: Ruleset): Promise<bigint> {
  const [runs, trips] = await Promise.all([
    activeRuns(tx, roundPlayerId),
    tx.bossTrip.findMany({ where: { roundPlayerId, status: 'ACTIVE' }, select: { bankrollCents: true, bodyguards: true } }),
  ]);
  // 1.6.0-C: a supply load on the road is paid stock, not away worth.
  const loads = ruleset.supplyNetwork?.pickups ? await supplyLoadsByRun(tx, runs.map((run) => run.id)) : new Map();
  return runs.reduce((sum, run) => sum + awayWorth(ruleset, run, withoutSupplyLoad(cargoOf(run), loads.get(run.id))), 0n)
    + trips.reduce((sum, trip) => sum + tripNetWorthCents(ruleset, trip.bankrollCents, trip.bodyguards), 0n);
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
async function rollRoadStops(tx: Db, roundPlayerId: string, ruleset: Ruleset, run: LoadedRun, stops: readonly RunStopPlan[], now: Date, legs = stops.length): Promise<LoadedRun> {
  if (!ruleset.travel?.stops) return run;
  let current = run;
  let checks = run.roadChecks;
  const last = Math.min(legs, stops.length);
  const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { heat: true, racketEffects: true } });
  // 1.1.0-C: an Auto Garage on Run mods means fewer stops, read when each leg is rolled.
  const stopCut = racketRunStopCut(ruleset, readRacketEffects(player.racketEffects));
  while (checks < last && stops[checks]!.arriveAt.getTime() <= now.getTime()) {
    const stop = stops[checks]!;
    const stopped = resolveRoadStop(ruleset, {
      route: stop.route,
      cargo: cargoOf(current),
      cashCents: current.cashCents,
      escorts: current.escortThugs,
      heat: player.heat,
      rng: seededRng(hashParts(run.id, 'road-stop', checks)),
      stopCut,
      riskMultiplier: vehicleRiskMultiplier(ruleset, readVehicleLoadout(current.vehicleLoadout, current.lowRiders)),
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
    await LawService.notePoliceLoss(tx, roundPlayerId, ruleset, seizedValueCents(stopped.seized, ruleset) + stopped.fineCents, incident.at);
    // 1.3.0-B: a stop is written down in the city the leg was driving into.
    if (ruleset.law?.evidence) {
      await LawService.record(tx, roundPlayerId, ruleset, [{ citySlug: incident.city, points: ruleset.law.evidence.roadStop, source: 'ROAD_STOP', sourceKey: `stop:${incident.id}` }], incident.at);
    }
  }
  if (checks !== run.roadChecks) await tx.run.update({ where: { id: run.id }, data: { roadChecks: checks } });
  return { ...current, roadChecks: checks };
}

/** Replace a run's stops with a new plan. Stops are few, so they are rewritten whole. */
export async function writeRunStops(tx: Db, runId: string, stops: readonly RunStopPlan[]): Promise<void> {
  await tx.runStop.deleteMany({ where: { runId } });
  await tx.runStop.createMany({
    data: stops.map((stop, order) => ({ runId, order, city: stop.city, route: stop.route, departAt: stop.departAt, arriveAt: stop.arriveAt, leaveAt: stop.leaveAt })),
  });
}

/**
 * Trips B. With the boss aboard, the hotel bills the run's cash for every hour of every
 * stay as it starts, town by town in order. The first hour the cash cannot cover, the
 * boss checks out and the run heads home from there. `hotelStayAt` and `hotelHours`
 * record what is already paid, so settling again never bills an hour twice.
 */
async function billHotel(tx: Db, roundPlayerId: string, ruleset: Ruleset, run: LoadedRun, stops: readonly RunStopPlan[], now: Date): Promise<{ run: LoadedRun; stops: RunStopPlan[] }> {
  const rules = tripRules(ruleset);
  if (!run.bossAboard || !rules?.rideAlong) return { run, stops: [...stops] };
  let plan = [...stops];
  let cashCents = run.cashCents;
  let hotelCents = run.hotelCents;
  let stayAt = run.hotelStayAt;
  let hours = run.hotelHours;
  const charges: Array<{ city: string; cents: bigint; at: Date }> = [];
  for (let index = 0; index < plan.length - 1; index++) {
    const stop = plan[index]!;
    if (!stop.leaveAt || stop.arriveAt.getTime() > now.getTime()) break;
    if (stayAt && stop.arriveAt.getTime() < stayAt.getTime()) continue;
    if (!stayAt || stop.arriveAt.getTime() !== stayAt.getTime()) {
      stayAt = stop.arriveAt;
      hours = 0;
    }
    const bill = settleHotelBill({
      arriveAt: stop.arriveAt,
      leaveAt: stop.leaveAt,
      now,
      hoursPaid: hours,
      walletCents: cashCents,
      hourCents: rideAlongHourCents(rules, stop.city, run.escortThugs),
    });
    hours = bill.hoursPaid;
    if (bill.chargeCents > 0n) {
      cashCents -= bill.chargeCents;
      hotelCents += bill.chargeCents;
      charges.push({ city: stop.city, cents: bill.chargeCents, at: bill.checkoutAt ?? (now < stop.leaveAt ? now : stop.leaveAt) });
    }
    // Only the town the run is in can still be checked out of: every earlier one was
    // billed through to its departure when the run left it.
    if (bill.checkoutAt && bill.checkoutAt.getTime() < stop.leaveAt.getTime() && index === plan.length - 2) {
      plan = planHeadHome(ruleset, plan, bill.checkoutAt);
      await writeRunStops(tx, run.id, plan);
      break;
    }
  }
  const unchanged = !charges.length && hours === run.hotelHours && stayAt?.getTime() === run.hotelStayAt?.getTime();
  if (unchanged) return { run, stops: plan };
  await tx.run.update({ where: { id: run.id }, data: { cashCents, hotelCents, hotelStayAt: stayAt, hotelHours: hours } });
  if (charges.length) {
    await EconomyLedgerService.record(tx, roundPlayerId, charges.map((charge) => ({
      source: 'RUN_HOTEL',
      label: `Hotel · ${cityName(ruleset, charge.city)}`,
      amountCents: -charge.cents,
    })), charges[charges.length - 1]!.at);
    await refreshAwayWorth(tx, roundPlayerId, ruleset);
  }
  return { run: { ...run, cashCents, hotelCents, hotelStayAt: stayAt, hotelHours: hours }, stops: plan };
}

/**
 * Trips D2. A stay cut short at `at` (a convoy hit sending the boss's run home) keeps only
 * the hours started by then: any hour billed after it goes back into the run's cash. The
 * bill can only run ahead of a hit when nobody read the run between the hit landing and
 * its settle. Returns the run as it stands after.
 */
export async function refundHotelAfter(tx: Db, roundPlayerId: string, ruleset: Ruleset, run: LoadedRun, stop: RunStopPlan, at: Date): Promise<LoadedRun> {
  const rules = tripRules(ruleset);
  if (!run.bossAboard || !rules?.rideAlong || !run.hotelStayAt || run.hotelStayAt.getTime() !== stop.arriveAt.getTime()) return run;
  const due = Math.max(1, Math.ceil((at.getTime() - stop.arriveAt.getTime()) / 3_600_000));
  const extra = run.hotelHours - due;
  if (extra <= 0) return run;
  const refund = rideAlongHourCents(rules, stop.city, run.escortThugs) * BigInt(extra);
  const cashCents = run.cashCents + refund;
  const hotelCents = run.hotelCents > refund ? run.hotelCents - refund : 0n;
  await tx.run.update({ where: { id: run.id }, data: { cashCents, hotelCents, hotelHours: due } });
  await EconomyLedgerService.record(tx, roundPlayerId, [{ source: 'RUN_HOTEL', label: `Hotel refund · ${cityName(ruleset, stop.city)}`, amountCents: refund }], at);
  await refreshAwayWorth(tx, roundPlayerId, ruleset);
  return { ...run, cashCents, hotelCents, hotelHours: due };
}

/**
 * Bring a run home: its wallet, cars, escorts and cargo go back into home stock, and
 * the run becomes a receipt. Net worth does not move, because the run was already
 * counted at the same values while it was away.
 */
async function bringHome(tx: Db, roundPlayerId: string, ruleset: Ruleset, run: LoadedRun, stops: readonly RunStopPlan[]): Promise<void> {
  const vehicles = readVehicleLoadout(run.vehicleLoadout, run.lowRiders);
  // 1.5.0-C: cars the road dented or the police kept come home to the garage, not the lot.
  const damage = readVehicleDamage(run.vehicleDamage, vehicles);
  const ready = (key: keyof typeof vehicles) => vehicles[key] - damage.damaged[key] - damage.disabled[key];
  const returnedAt = stops[stops.length - 1]!.arriveAt;
  // 1.6.0-C: a supply load goes into storage; only the rest of the trunk is home stock.
  const { cargo, deliveries } = ruleset.supplyNetwork?.pickups
    ? await deliverSupplyPickups(tx, roundPlayerId, ruleset, run, cargoOf(run), returnedAt)
    : { cargo: cargoOf(run), deliveries: [] };
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
      lowRiders: { increment: ready('LOW_RIDER') },
      sedans: { increment: ready('SEDAN') },
      vans: { increment: ready('VAN') },
      damagedLowRiders: { increment: damage.damaged.LOW_RIDER },
      damagedSedans: { increment: damage.damaged.SEDAN },
      damagedVans: { increment: damage.damaged.VAN },
      disabledLowRiders: { increment: damage.disabled.LOW_RIDER },
      disabledSedans: { increment: damage.disabled.SEDAN },
      disabledVans: { increment: damage.disabled.VAN },
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
    ...(hasVehicleDamage(damage) ? { vehicleDamage: vehicleDamageJson(damage) } : {}),
    escortThugs: run.escortThugs,
    turnsSpent: run.turnsSpent,
    ...(run.bossAboard ? { bossAboard: true, hotelCents: Number(run.hotelCents) } : {}),
    ...(deliveries.length ? { supplyPickups: deliveries.map((delivery) => ({ ...delivery })) } : {}),
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
      const planned = toStopPlans(active.stops);
      // 1.6.0-C/D: a pickup run loads at the supplier and unloads at its warehouse, so each
      // leg is rolled on what the trunk held when it drove it.
      const supplied = ruleset.supplyNetwork?.pickups
        ? await settleSupplyStops(tx, roundPlayerId, ruleset, active, planned, now, (run, legs) => rollRoadStops(tx, roundPlayerId, ruleset, run, planned, now, legs))
        : active;
      // Road stops on the way in come first; then (Trips B) the hotel, which can send
      // the run home early; then any leg that re-timing has already driven.
      const arrived = await rollRoadStops(tx, roundPlayerId, ruleset, supplied, planned, now);
      // The hotel bills only up to the first tail due, so the tail loots the wallet as it
      // stood when it landed; the hours after are billed once the tails are in.
      const firstTail = active.bossAboard
        ? await tx.convoyTail.findFirst({ where: { runId: active.id, status: 'PENDING', landsAt: { lte: now } }, orderBy: { landsAt: 'asc' }, select: { landsAt: true } })
        : null;
      const billed = await billHotel(tx, roundPlayerId, ruleset, arrived, planned, firstTail?.landsAt ?? now);
      const stops = billed.stops;
      const driven = await rollRoadStops(tx, roundPlayerId, ruleset, billed.run, stops, now);
      // 0.5.0-E: then tails whose window has closed land, before this run can come home.
      const landed = await ConvoyService.landTails(tx, roundPlayerId, ruleset, driven, stops, now);
      // Trips C: a hit that beat the boss's run sends it home, so its stops may have changed.
      const after = landed.stops === driven.stops ? stops : toStopPlans(landed.stops);
      const moved = after === stops ? landed : await rollRoadStops(tx, roundPlayerId, ruleset, landed, after, now);
      const rest = firstTail ? await billHotel(tx, roundPlayerId, ruleset, moved, after, now) : { run: moved, stops: after };
      // A bill that ran the wallet dry sends the run home: roll the road for that leg too.
      const run = firstTail ? await rollRoadStops(tx, roundPlayerId, ruleset, rest.run, rest.stops, now) : rest.run;
      await recordStops(tx, roundPlayerId, ruleset, round.id, rest.stops, now);
      if (runPosition(ruleset, rest.stops, now).phase === 'home') await bringHome(tx, roundPlayerId, ruleset, run, rest.stops);
    }
  },
};
