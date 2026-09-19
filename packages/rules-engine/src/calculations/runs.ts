import type { RestockRule, Ruleset, RunRules } from '@streets/rulesets';
import { cityCounter, findRoutes, type CityCounter, type TravelRoute } from './cities.js';
import { calculateNetWorthCents } from './net-worth.js';
import { CRACK_PRODUCT } from './product-economy.js';
import { settleStock, type RestockSettlement } from './restock.js';
import { MAX_INVENTORY } from './stores.js';

/**
 * 0.5.0-B. Runs: a crew on the road with its own wallet and trunk.
 *
 * A run is a list of stops, each the end of one leg: drive there, trade for the
 * town window, move on. The last stop is always home and has no window. Where a
 * run is at any moment is worked out from those times alone, so nothing has to
 * run in the background, and reading a run twice always gives the same answer.
 *
 * Everything here is pure. The server locks, loads, writes and rolls.
 */

export class RunError extends Error {
  constructor(public readonly code: string, message: string, public readonly field?: string) {
    super(message);
  }
}

export interface RunStopPlan {
  city: string;
  /** City slugs from the previous stop to this one, both ends included. */
  route: string[];
  departAt: Date;
  arriveAt: Date;
  /** When the town window closes. Null for the drive home. */
  leaveAt: Date | null;
}

export function runRules(ruleset: Ruleset): RunRules | undefined {
  return ruleset.travel?.runs;
}

function cityName(ruleset: Ruleset, slug: string): string {
  return ruleset.cities?.[slug]?.name ?? slug;
}

/** Drive hours along a list of cities, road by road. */
export function routeHours(ruleset: Ruleset, cities: readonly string[]): number {
  let hours = 0;
  for (let index = 1; index < cities.length; index++) {
    const a = cities[index - 1]!;
    const b = cities[index]!;
    const road = ruleset.travel?.roads.find((entry) => (entry.from === a && entry.to === b) || (entry.from === b && entry.to === a));
    if (!road) throw new RunError('NO_ROAD', `There is no road from ${cityName(ruleset, a)} to ${cityName(ruleset, b)}.`);
    hours += road.driveHours;
  }
  return hours;
}

/** Real milliseconds a drive of `hours` takes. */
export function driveMs(ruleset: Ruleset, hours: number): number {
  return Math.round(hours * (ruleset.travel?.gameMinutesPerDriveHour ?? 0) * 60_000);
}

/** Turns a drive of `hours` costs, rounded up. */
export function driveTurns(ruleset: Ruleset, hours: number): number {
  return Math.ceil(hours * (ruleset.travel?.turnsPerDriveHour ?? 0) - 1e-9);
}

function windowMs(ruleset: Ruleset): number {
  return (runRules(ruleset)?.townWindowMinutes ?? 0) * 60_000;
}

function pickRoute(ruleset: Ruleset, from: string, to: string, index: number): TravelRoute {
  if (!ruleset.cities?.[to]) throw new RunError('UNKNOWN_CITY', 'That city is not on the map.', 'to');
  const routes = findRoutes(ruleset, from, to);
  const route = routes[index];
  if (!route) throw new RunError('UNKNOWN_ROUTE', `Pick one of the ${routes.length} ways to ${cityName(ruleset, to)}.`, 'route');
  return route;
}

/** The shortest way home from a city. */
function homeRoute(ruleset: Ruleset, from: string, home: string): TravelRoute {
  const route = findRoutes(ruleset, from, home)[0];
  if (!route) throw new RunError('NO_ROAD', `There is no road home from ${cityName(ruleset, from)}.`);
  return route;
}

export interface LaunchPlan {
  stops: RunStopPlan[];
  /** Out and back, both paid at launch. */
  turns: number;
  route: TravelRoute;
}

/**
 * A run from home to one city and back. The drive home is planned and paid for up
 * front, so a run that is never touched again still comes home when its window
 * closes.
 */
export function planLaunch(ruleset: Ruleset, input: { home: string; to: string; routeIndex: number; now: Date }): LaunchPlan {
  const { home, to, routeIndex, now } = input;
  if (!runRules(ruleset)) throw new RunError('RUNS_DISABLED', 'Nobody drives out of town this round.');
  if (to === home) throw new RunError('ALREADY_HOME', `You already live in ${cityName(ruleset, home)}.`, 'to');
  const route = pickRoute(ruleset, home, to, routeIndex);
  const back = homeRoute(ruleset, to, home);
  const arriveAt = new Date(now.getTime() + driveMs(ruleset, route.driveHours));
  const leaveAt = new Date(arriveAt.getTime() + windowMs(ruleset));
  return {
    route,
    turns: driveTurns(ruleset, route.driveHours + back.driveHours),
    stops: [
      { city: to, route: route.cities, departAt: now, arriveAt, leaveAt },
      { city: home, route: back.cities, departAt: leaveAt, arriveAt: new Date(leaveAt.getTime() + driveMs(ruleset, back.driveHours)), leaveAt: null },
    ],
  };
}

export type RunPhase = 'road' | 'town' | 'home';

export interface RunPosition {
  /** On the road to a stop, in town at one, or home (the run is back). */
  phase: RunPhase;
  /** The stop being driven to, or the one the run is in. */
  stopIndex: number;
  /** That stop's city. */
  city: string;
  /** Where the leg started. */
  from: string;
  /** Share of the leg driven, 0..1. */
  progress: number;
  /** The road the run is on right now, and how far along it. Null in town. */
  road: { from: string; to: string; progress: number } | null;
  /** When it reaches the stop (road), or when the window closes (town). */
  until: Date;
}

/** Where a run is at `now`, from its stop times alone. */
export function runPosition(ruleset: Ruleset, stops: readonly RunStopPlan[], now: Date): RunPosition {
  const last = stops[stops.length - 1]!;
  const t = now.getTime();
  if (t >= last.arriveAt.getTime()) {
    return { phase: 'home', stopIndex: stops.length - 1, city: last.city, from: last.route[0] ?? last.city, progress: 1, road: null, until: last.arriveAt };
  }
  for (let index = 0; index < stops.length; index++) {
    const stop = stops[index]!;
    if (t < stop.arriveAt.getTime()) {
      const span = stop.arriveAt.getTime() - stop.departAt.getTime();
      const progress = span > 0 ? Math.min(1, Math.max(0, (t - stop.departAt.getTime()) / span)) : 1;
      return { phase: 'road', stopIndex: index, city: stop.city, from: stop.route[0] ?? stop.city, progress, road: roadAt(ruleset, stop.route, progress), until: stop.arriveAt };
    }
    if (stop.leaveAt && t < stop.leaveAt.getTime()) {
      return { phase: 'town', stopIndex: index, city: stop.city, from: stop.route[0] ?? stop.city, progress: 1, road: null, until: stop.leaveAt };
    }
  }
  // Unreachable while the last stop is home, which always ends the list.
  return { phase: 'home', stopIndex: stops.length - 1, city: last.city, from: last.city, progress: 1, road: null, until: last.arriveAt };
}

/** Which road of a route a share of it falls on. */
function roadAt(ruleset: Ruleset, route: readonly string[], progress: number): { from: string; to: string; progress: number } {
  const total = routeHours(ruleset, route);
  let driven = progress * total;
  for (let index = 1; index < route.length; index++) {
    const hours = routeHours(ruleset, [route[index - 1]!, route[index]!]);
    if (driven <= hours || index === route.length - 1) {
      return { from: route[index - 1]!, to: route[index]!, progress: hours > 0 ? Math.min(1, driven / hours) : 1 };
    }
    driven -= hours;
  }
  return { from: route[0]!, to: route[0]!, progress: 1 };
}

function assertInTown(ruleset: Ruleset, stops: readonly RunStopPlan[], now: Date): RunPosition {
  const position = runPosition(ruleset, stops, now);
  if (position.phase !== 'town') {
    throw new RunError('NOT_IN_TOWN', position.phase === 'road'
      ? `The run is still on the road to ${cityName(ruleset, position.city)}.`
      : 'The run is already home.');
  }
  return position;
}

export interface DrivePlan {
  stops: RunStopPlan[];
  /** Extra turns: the new legs out and home, less the drive home already paid. Never negative. */
  turns: number;
}

/**
 * Leave the town the run is in for another city, then home from there. The run pays
 * for the new legs less the drive home it already paid for.
 */
export function planDriveOn(ruleset: Ruleset, stops: readonly RunStopPlan[], now: Date, input: { home: string; to: string; routeIndex: number }): DrivePlan {
  const position = assertInTown(ruleset, stops, now);
  const here = stops[position.stopIndex]!;
  if (input.to === here.city) throw new RunError('ALREADY_THERE', `The run is already in ${cityName(ruleset, here.city)}.`, 'to');
  if (input.to === input.home) throw new RunError('USE_HEAD_HOME', 'Head home instead: the drive home is already paid for.', 'to');
  const route = pickRoute(ruleset, here.city, input.to, input.routeIndex);
  const back = homeRoute(ruleset, input.to, input.home);
  const paidHome = routeHours(ruleset, stops[stops.length - 1]!.route);
  const arriveAt = new Date(now.getTime() + driveMs(ruleset, route.driveHours));
  const leaveAt = new Date(arriveAt.getTime() + windowMs(ruleset));
  return {
    turns: Math.max(0, driveTurns(ruleset, route.driveHours + back.driveHours) - driveTurns(ruleset, paidHome)),
    stops: [
      ...stops.slice(0, position.stopIndex),
      { ...here, leaveAt: now },
      { city: input.to, route: route.cities, departAt: now, arriveAt, leaveAt },
      { city: input.home, route: back.cities, departAt: leaveAt, arriveAt: new Date(leaveAt.getTime() + driveMs(ruleset, back.driveHours)), leaveAt: null },
    ],
  };
}

/** Close the town window now and start the drive home that is already paid for. */
export function planHeadHome(ruleset: Ruleset, stops: readonly RunStopPlan[], now: Date): RunStopPlan[] {
  const position = assertInTown(ruleset, stops, now);
  const home = stops[stops.length - 1]!;
  const hours = routeHours(ruleset, home.route);
  return [
    ...stops.slice(0, position.stopIndex),
    { ...stops[position.stopIndex]!, leaveAt: now },
    { ...home, departAt: now, arriveAt: new Date(now.getTime() + driveMs(ruleset, hours)) },
  ];
}

// --- the trunk and the wallet ------------------------------------------------------

export function runCapacity(ruleset: Ruleset, lowRiders: number): number {
  return Math.max(0, lowRiders) * (ruleset.travel?.cargoPerLowRider ?? 0);
}

export function cargoUnits(cargo: Readonly<Record<string, number>>): number {
  return Object.values(cargo).reduce((sum, units) => sum + Math.max(0, units), 0);
}

export interface RunGuns {
  pistols: number;
  shotguns: number;
  tek9s: number;
  ak47s: number;
}

export const NO_GUNS: RunGuns = { pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 };

/**
 * 0.5.0-E. The guns escorts take on a run: one each, the best first, out of what is at
 * home. Escorts always ride armed as far as the arsenal goes.
 */
export function armEscorts(ruleset: Ruleset, escorts: number, home: RunGuns): RunGuns {
  const order = (Object.keys(ruleset.combat?.weapons ?? {}) as Array<keyof typeof GUN_FIELDS>)
    .sort((a, b) => (ruleset.combat!.weapons[b].power - ruleset.combat!.weapons[a].power) || a.localeCompare(b));
  let left = Math.max(0, escorts);
  const taken: RunGuns = { ...NO_GUNS };
  for (const key of order) {
    const field = GUN_FIELDS[key];
    const count = Math.min(home[field], left);
    taken[field] = count;
    left -= count;
  }
  return taken;
}

/** Weapon key to the field it is counted in. */
export const GUN_FIELDS = { PISTOL: 'pistols', SHOTGUN: 'shotguns', TEK9: 'tek9s', AK47: 'ak47s' } as const;

/** What a run is worth to net worth: its wallet at the cash weight, its cars, its escorts, their guns and its cargo at home values. */
export function runNetWorthCents(ruleset: Ruleset, run: { cashCents: bigint; lowRiders: number; escortThugs: number; cargo: Readonly<Record<string, number>>; guns?: RunGuns }): bigint {
  const { [CRACK_PRODUCT]: crack = 0, ...products } = run.cargo;
  const guns = run.guns ?? NO_GUNS;
  return calculateNetWorthCents({
    cashCents: run.cashCents,
    whores: 0,
    thugs: run.escortThugs,
    lowRiders: run.lowRiders,
    medicine: 0,
    crack,
    condoms: 0,
    beer: 0,
    pistols: guns.pistols,
    shotguns: guns.shotguns,
    tek9s: guns.tek9s,
    ak47s: guns.ak47s,
    products,
  }, ruleset);
}

// --- Pip's counter in another city ---------------------------------------------------

/**
 * Settle a player's shelf for one product in one city. No stored shelf is a full one,
 * as with Pip's at home. A product the city is out of has an empty shelf.
 */
export function settleCityShelf(shelf: { stock: number; stockAt: Date } | null, counter: CityCounter, now: Date): RestockSettlement {
  if (counter.shelfCap <= 0) {
    return { stock: 0, stockAt: now, gained: 0, cap: 0, intervalMinutes: counter.intervalMinutes, perInterval: 0, nextAt: null, changed: shelf !== null && shelf.stock !== 0 };
  }
  const rule = { cap: counter.shelfCap, perInterval: Math.max(1, counter.perInterval), intervalMinutes: counter.intervalMinutes, stockField: 'stock', stockAtField: 'stockAt' } as unknown as RestockRule;
  const settled = settleStock(shelf ?? { stock: counter.shelfCap, stockAt: now }, rule, now, counter.intervalMinutes);
  return shelf ? settled : { ...settled, changed: true };
}

export interface CityTrade {
  product: string;
  direction: 'buy' | 'sell';
  quantity: number;
  unitCents: number;
  totalCents: bigint;
  /** Signed, for the run's wallet. */
  cashChangeCents: bigint;
  /** Signed, for the trunk. */
  quantityChange: number;
  /** Units taken off Pip's shelf. Selling never touches it. */
  stockTaken: number;
}

/**
 * Price and check one trade at Pip's counter in another city, paid from the run's
 * wallet and loaded into its trunk. Whole orders only, as at home.
 */
export function calculateCityTrade(input: {
  ruleset: Ruleset;
  city: string;
  product: string;
  direction: 'buy' | 'sell';
  quantity: number;
  runCashCents: bigint;
  /** Units of this product in the trunk. */
  held: number;
  /** Units of everything in the trunk. */
  trunkUnits: number;
  capacity: number;
  shelfStock: number;
  /** 0.5.0-C. Pip's counter at today's supply; his usual one when left out. */
  counter?: CityCounter | null;
}): CityTrade {
  const { ruleset, city, product, direction, quantity } = input;
  const name = ruleset.products?.[product]?.name ?? product.charAt(0) + product.slice(1).toLowerCase();
  const counter = input.counter !== undefined ? input.counter : cityCounter(ruleset, city, product);
  if (!counter) throw new RunError('NOT_CARRIED', `Pip does not deal ${name} in ${cityName(ruleset, city)}.`, 'product');
  if (direction !== 'buy' && direction !== 'sell') throw new RunError('INVALID_TRADE', 'Choose buy or sell.', 'direction');
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_INVENTORY) {
    throw new RunError('INVALID_QUANTITY', 'Enter a positive whole quantity.', 'quantity');
  }
  const buying = direction === 'buy';
  const unitCents = buying ? counter.buyCents : counter.sellCents;
  const totalCents = BigInt(unitCents) * BigInt(quantity);
  if (buying) {
    const stock = Math.max(0, input.shelfStock);
    if (quantity > stock) {
      throw new RunError('OUT_OF_STOCK', stock === 0 ? `Pip has no ${name} left here.` : `Pip only has ${stock.toLocaleString('en-US')} ${name} here right now.`, 'quantity');
    }
    if (totalCents > input.runCashCents) {
      throw new RunError('NOT_ENOUGH_CASH', `That is $${(Number(totalCents) / 100).toLocaleString('en-US')}, and the run only carries $${(Number(input.runCashCents) / 100).toLocaleString('en-US')}.`, 'quantity');
    }
    const room = Math.max(0, input.capacity - input.trunkUnits);
    if (quantity > room) {
      throw new RunError('TRUNK_FULL', room === 0 ? 'The trunk is full.' : `There is only room for ${room.toLocaleString('en-US')} more.`, 'quantity');
    }
    return { product, direction, quantity, unitCents, totalCents, cashChangeCents: -totalCents, quantityChange: quantity, stockTaken: quantity };
  }
  if (quantity > input.held) {
    throw new RunError('NOT_ENOUGH_PRODUCT', input.held === 0 ? `There is no ${name} in the trunk.` : `The trunk only has ${input.held.toLocaleString('en-US')} ${name}.`, 'quantity');
  }
  return { product, direction, quantity, unitCents, totalCents, cashChangeCents: totalCents, quantityChange: -quantity, stockTaken: 0 };
}
