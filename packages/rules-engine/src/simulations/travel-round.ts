import type { DistrictKey, Ruleset } from '@streets/rulesets';
import { happinessMultiplier, hashParts, seededRng } from '../rng.js';
import { recruitmentMultiplier } from '../calculations/actions.js';
import { clientMultiplier } from '../calculations/clients.js';
import { findRoutes, highMarketBaseline, cityCounter, rulesetForCity } from '../calculations/cities.js';
import { runRules } from '../calculations/runs.js';
import { simulateRaid, type CombatCrew } from '../calculations/combat.js';
import { convoyCombatModel, convoyRules } from '../calculations/convoys.js';
import { bustChance, heatTakeMultiplier } from '../calculations/heat.js';
import { productEconomy, productRecipes } from '../calculations/product-economy.js';
import { relocationFeeCents, relocationRules } from '../calculations/relocation.js';
import { roadStopChance, saleHeat } from '../calculations/road-risk.js';
import { heatCrewFactor, productSliceEffects } from '../calculations/work-supply.js';
import { driveRiskRun } from './travel-risk.js';
import type { TravelTrade } from './travel.js';

/**
 * 0.5.0-F. A whole round with the road in it: 28 days of turns spent on the street, at
 * the stove, on runs and on other people's runs, from New York or after moving to any of
 * the other seven cities. It answers the release question: does playing all of it beat
 * doing one thing?
 *
 * Expected values, like the 0.4.0-E round. What it adds:
 * - **The street as a player finds it.** Client capacity is hidden and reshuffled every
 *   hour, so a trip earns the average block, not the busiest (the A simulation's
 *   generous street). Product is bought at the home Pip's within his shelves when it
 *   earns more than it costs, used in the order a player would, and Heat drags and busts.
 * - **Produce** when a turn at the stove is worth more than a turn on the street: product
 *   the shelves could not supply, at the ingredient price.
 * - **Runs** in real time, one at a time, planned from what the crew has (cash, cars,
 *   where it lives) and driven through the C risk model: a run that makes money, or a
 *   supply run that brings home product the street cannot get at home.
 * - **Moving** to the city, fee and downtime included, as soon as the crew can pay.
 * - **Hijacking**: recon and tails on other runs at an assumed rate of runs in reach.
 *
 * Left out: combat at home, bribes, happiness and departures (held steady, as in 0.4.0-E),
 * wounds from hits (they heal), and other players' pressure on the high market.
 */

export interface TravelRoundStyle {
  readonly name: string;
  readonly purpose: string;
  readonly sessionsPerDay: number;
  readonly sessionTurns: number;
  /** Turn intervals per turn spent inside a session: 0 when a banked cap is spent at once. */
  readonly intervalsPerTurn: number;
  /** How long a session is online for a run's town stops, in minutes. */
  readonly onlineMinutes: number;
}

export const travelRoundStyles: readonly TravelRoundStyle[] = [
  { name: 'All day', purpose: '576 turns a day at the regeneration pace, online sixteen hours: runs go back to back.', sessionsPerDay: 1, sessionTurns: 576, intervalsPerTurn: 0.5, onlineMinutes: 16 * 60 },
  { name: 'Twice a day', purpose: 'A banked cap of 144 turns, morning and evening, two hours online each: a run has to reach its towns inside a session.', sessionsPerDay: 2, sessionTurns: 144, intervalsPerTurn: 0, onlineMinutes: 120 },
];

export interface TravelRoundStart {
  readonly name: string;
  readonly whores: number;
  readonly thugs: number;
  readonly lowRiders: number;
  readonly cashCents: number;
}

export const travelRoundStarts: readonly TravelRoundStart[] = [
  { name: 'Fresh start', whores: 20, thugs: 5, lowRiders: 1, cashCents: 2_000_000 },
  { name: 'Mid-round start', whores: 200, thugs: 50, lowRiders: 5, cashCents: 30_000_000 },
];

export type TravelRoundStrategyKey = 'street' | 'produce' | 'runner' | 'hijacker' | 'mixed-profit' | 'mixed-supply' | 'mixed';

export interface TravelRoundStrategy {
  readonly key: TravelRoundStrategyKey;
  readonly name: string;
  readonly purpose: string;
  readonly street: boolean;
  readonly produce: boolean;
  /** Which runs it makes: for profit, to bring product home for the street, or either. */
  readonly runs: 'profit' | 'supply' | 'both' | null;
  readonly hijack: boolean;
  /** One of the ways to mix; the gate takes the best of them. */
  readonly mixed: boolean;
}

export const travelRoundStrategies: readonly TravelRoundStrategy[] = [
  { key: 'street', name: 'Street only', purpose: 'Every turn on the street, product from the home Pip.', street: true, produce: false, runs: null, hijack: false, mixed: false },
  { key: 'produce', name: 'Street and Produce', purpose: 'The street, and the stove when it pays better.', street: true, produce: true, runs: null, hijack: false, mixed: false },
  { key: 'runner', name: 'Runner only', purpose: 'Runs back to back and nothing else; profit buys cars.', street: false, produce: false, runs: 'profit', hijack: false, mixed: false },
  { key: 'hijacker', name: 'Hijacker', purpose: 'The street, plus recon and tails on runs coming through.', street: true, produce: false, runs: null, hijack: true, mixed: false },
  { key: 'mixed-profit', name: 'Mixed, runs for profit', purpose: 'The street, the stove when it pays, and a run for profit whenever the car is free and one beats the street.', street: true, produce: true, runs: 'profit', hijack: false, mixed: true },
  { key: 'mixed-supply', name: 'Mixed, supply runs', purpose: 'The street, the stove when it pays, and runs that bring home the product the street is short of.', street: true, produce: true, runs: 'supply', hijack: false, mixed: true },
  { key: 'mixed', name: 'Mixed, either run', purpose: 'The street, the stove when it pays, and whichever run beats the street by more.', street: true, produce: true, runs: 'both', hijack: false, mixed: true },
];

/**
 * Assumptions about everyone else, which a single-player simulation cannot know. Set
 * for a busy round; revisit with the first 0.5.0 round's numbers.
 */
export const TRAVEL_ROUND_WORLD = {
  /** The chance a recon finds a run in reach worth tailing. */
  reconFindChance: 0.3,
  /** Hits a hijacker can land in a day, all day or per session twice a day: runs in reach are only so many. */
  hitsPerDay: { 'All day': 4, 'Twice a day': 1 } as Record<string, number>,
  /** The run a hijacker finds: cash on the way out, cargo on the way back, and its escort. */
  target: { cashCents: 33_000_000, cargo: { COCAINE: 1_900 } as Record<string, number>, escorts: 12 },
  /** The chance any one of your runs is tailed, and the squad that does it. */
  tailedChance: 0.1,
  tailSquad: 30,
} as const;

const DAYS_DEFAULT = 28;
const TRIP_TURNS = 12;
const KEEP = 0.5;
const HAPPINESS = 85;
/** Escorts a mixed player sends: a share of the thugs, as far as the cars seat them. */
const MIXED_ESCORT_SHARE = 0.2;
/** A run carries what it plans to spend and a tenth more. */
const CARRY = 1.1;
/** The stove takes at most this share of a session. */
const PRODUCE_MAX_SHARE = 0.3;
/** A supply run brings home this many days of what the street burns. */
const SUPPLY_DAYS = 1.5;
/**
 * How much more than the street's turns a run has to earn before a street player makes it. A
 * player finds their own threshold over a round, so mixed play tries each and keeps the best:
 * the street's turn is worth more than a trip shows (recruits keep earning), and a run's sale
 * Heat costs the street too, so neither side of the comparison is exact.
 */
export const RUN_EDGES = [0.8, 1.2, 1.6] as const;
const RISK_SAMPLES = 20;
const FIGHT_SAMPLES = 400;
const MINUTES_PER_DAY = 24 * 60;

export interface TravelRoundSummary {
  readonly style: string;
  readonly start: string;
  readonly strategy: TravelRoundStrategyKey;
  readonly strategyName: string;
  readonly home: string;
  /** The day the crew moved, or null for New York or a move it never afforded. */
  readonly movedOnDay: number | null;
  readonly moveFeeCents: number;
  readonly scoreCents: number;
  readonly cashCents: number;
  readonly whores: number;
  readonly thugs: number;
  readonly lowRiders: number;
  readonly streetTurns: number;
  readonly produceTurns: number;
  readonly runTurns: number;
  readonly hijackTurns: number;
  readonly runs: number;
  readonly supplyRuns: number;
  readonly runProfitCents: number;
  readonly hits: number;
  readonly hitTakeCents: number;
  readonly productCostCents: number;
  readonly busts: number;
  readonly averageHeat: number;
  /** Turns the strategy had and could not use. */
  readonly idleTurns: number;
  /** Mixed play's threshold that did best, or null. */
  readonly edge: number | null;
}

// --- the street -----------------------------------------------------------------------------

interface Shelf { stock: number; cap: number; perInterval: number; intervalMinutes: number; buyCents: number; waited: number }

function homeShelves(ruleset: Ruleset): Map<string, Shelf> {
  const shelves = new Map<string, Shelf>();
  const crack = ruleset.stores.PIP.items.CRACK;
  if (crack?.restock && crack.restock.cap > 0) {
    shelves.set('CRACK', { stock: crack.restock.cap, cap: crack.restock.cap, perInterval: crack.restock.perInterval ?? 1, intervalMinutes: crack.restock.intervalMinutes, buyCents: crack.buyCents, waited: 0 });
  }
  for (const key of Object.keys(ruleset.products ?? {})) {
    const pip = productEconomy(ruleset, key)?.pip;
    if (pip && pip.restock.cap > 0) shelves.set(key, { stock: pip.restock.cap, cap: pip.restock.cap, perInterval: pip.restock.perInterval, intervalMinutes: pip.restock.intervalMinutes, buyCents: pip.buyCents, waited: 0 });
  }
  return shelves;
}

function restock(shelf: Shelf, minutes: number): void {
  if (shelf.stock >= shelf.cap) { shelf.waited = 0; return; }
  shelf.waited += minutes;
  const deliveries = Math.floor(shelf.waited / shelf.intervalMinutes);
  shelf.waited -= deliveries * shelf.intervalMinutes;
  shelf.stock = Math.min(shelf.cap, shelf.stock + deliveries * shelf.perInterval);
}

/** A hidden, hourly-shuffled block: the average of the capacities, not the busiest. */
function averageClients(ruleset: Ruleset, whores: number): number {
  const capacities = ruleset.scouting.clients.capacities;
  return capacities.reduce((sum, capacity) => sum + clientMultiplier(capacity, whores), 0) / capacities.length;
}

/** The products a trip tries, in order: the 0.4.0-E winner ("fit, Cocaine while cool"), then whatever is cheap. */
function productOrder(district: DistrictKey, heat: number, ruleset: Ruleset): string[] {
  const drag = ruleset.heat?.drag.startsAt ?? 100;
  const cool = heat < drag - 10;
  if (district === 'CASINO') return cool ? ['COCAINE', 'ECSTASY', 'CRACK', 'WEED'] : ['ECSTASY', 'CRACK', 'WEED'];
  if (district === 'NIGHTCLUB') return ['ECSTASY', 'CRACK', 'WEED'];
  return heat >= drag ? ['WEED', 'CRACK'] : ['CRACK', 'WEED'];
}

// --- runs ------------------------------------------------------------------------------------

export interface RoundRunPlan {
  readonly kind: 'profit' | 'supply';
  readonly product: string;
  readonly buyCity: string;
  readonly buyFrom: 'pip' | 'market';
  /** Null on a supply run, which drives the load home. */
  readonly sellCity: string | null;
  readonly sellTo: 'pip' | 'market' | null;
  readonly units: number;
  readonly costCents: number;
  readonly revenueCents: number;
  readonly driveHours: number;
  /** Drive hours from leaving home to the last town it trades in. */
  readonly hoursToLastStop: number;
  readonly turns: number;
  readonly minutes: number;
  readonly limit: 'trunk' | 'cash' | 'shelf' | 'market';
}

const legMemo = new WeakMap<object, Map<string, Map<string, number>>>();

function legHours(ruleset: Ruleset, from: string, to: string): number {
  if (from === to) return 0;
  let memo = legMemo.get(ruleset.travel!);
  if (!memo) legMemo.set(ruleset.travel!, (memo = new Map()));
  let row = memo.get(from);
  if (!row) memo.set(from, (row = new Map()));
  let hours = row.get(to);
  if (hours === undefined) row.set(to, (hours = findRoutes(ruleset, from, to)[0]?.driveHours ?? Number.POSITIVE_INFINITY));
  return hours;
}

/** Cents for units [0, n) at a price moving `slope` of its first price a unit, floored at a tenth. */
function sumMoving(price: number, slope: number, n: number): number {
  if (n <= 0) return 0;
  if (slope >= 0) return price * (n + slope * n * (n - 1) / 2);
  const flat = Math.min(n, Math.ceil(0.9 / -slope));
  return price * (flat + slope * flat * (flat - 1) / 2) + price * 0.1 * (n - flat);
}

/** Most units whose total stays within `cash`. */
function unitsFor(cash: number, price: number, slope: number, cap: number): number {
  let low = 0;
  let high = cap;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (sumMoving(price, slope, mid) <= cash) low = mid; else high = mid - 1;
  }
  return low;
}

interface Source { city: string; from: 'pip' | 'market'; price: number; slope: number; shelf: number }
interface Sale { city: string; to: 'pip' | 'market'; price: number; slope: number }

/**
 * Where a run can buy a product. At home that is Pip's counter only, but a crew can buy his
 * shelf as it restocks for `loadMinutes` before it leaves and load the lot.
 */
function sourcesOf(ruleset: Ruleset, home: string, product: string, loadMinutes = 0): Source[] {
  // 0.5.0-F: a run can load up on its home market too, where the rules allow it.
  const atHome = runRules(ruleset)?.homeMarketAtLaunch ?? false;
  const sources: Source[] = [];
  for (const city of Object.keys(ruleset.cities ?? {})) {
    const counter = cityCounter(ruleset, city, product);
    const stocked = city === home && counter ? counter.shelfCap + counter.perInterval * Math.floor(loadMinutes / counter.intervalMinutes) : counter?.shelfCap ?? 0;
    if (counter && stocked > 0) sources.push({ city, from: 'pip', price: counter.buyCents, slope: 0, shelf: stocked });
    // A run trades in towns only: at home it loads what was bought at Pip's.
    const quote = city === home && !atHome ? null : highMarketBaseline(ruleset, city, product);
    if (quote) sources.push({ city, from: 'market', price: quote.buyCents, slope: 1 / (quote.depth * 100), shelf: Number.POSITIVE_INFINITY });
  }
  return sources;
}

function salesOf(ruleset: Ruleset, home: string, product: string): Sale[] {
  const sales: Sale[] = [];
  for (const city of Object.keys(ruleset.cities ?? {})) {
    if (city === home) continue;
    const quote = highMarketBaseline(ruleset, city, product);
    if (quote) sales.push({ city, to: 'market', price: quote.sellCents, slope: -1 / (quote.depth * 100) });
    const counter = cityCounter(ruleset, city, product);
    if (counter) sales.push({ city, to: 'pip', price: counter.sellCents, slope: 0 });
  }
  return sales;
}

const planMemo = new WeakMap<object, Map<string, RoundRunPlan[]>>();

/** Every run worth making from `home` with this trunk and cash, whose towns come within `maxHours` of leaving. */
export function roundRunPlans(ruleset: Ruleset, input: { home: string; trunk: number; cashCents: number; maxHours: number; loadMinutes?: number }): RoundRunPlan[] {
  // Cash on a 5% grid, rounded down, so a plan never spends more than the crew holds; past what
  // the dearest full trunk costs, more cash changes nothing.
  const enough = input.trunk * richest(ruleset) * 2;
  const cash = input.cashCents >= enough ? enough : input.cashCents <= 0 ? 0 : 1.05 ** Math.floor(Math.log(input.cashCents) / Math.log(1.05));
  let memo = planMemo.get(ruleset);
  if (!memo) planMemo.set(ruleset, (memo = new Map()));
  const key = `${input.home}:${input.trunk}:${Math.round(cash)}:${input.maxHours}:${input.loadMinutes ?? 0}`;
  const known = memo.get(key);
  if (known) return known;
  const plans = planRuns(ruleset, { ...input, cashCents: cash });
  memo.set(key, plans);
  return plans;
}

const richestMemo = new WeakMap<object, number>();

/** The highest price anything is bought for anywhere, per unit. */
function richest(ruleset: Ruleset): number {
  let known = richestMemo.get(ruleset);
  if (known === undefined) {
    known = 0;
    for (const product of Object.keys(ruleset.products ?? { CRACK: true })) {
      for (const city of Object.keys(ruleset.cities ?? {})) {
        known = Math.max(known, cityCounter(ruleset, city, product)?.buyCents ?? 0, highMarketBaseline(ruleset, city, product)?.buyCents ?? 0);
      }
    }
    richestMemo.set(ruleset, known);
  }
  return known;
}

function planRuns(ruleset: Ruleset, input: { home: string; trunk: number; cashCents: number; maxHours: number; loadMinutes?: number }): RoundRunPlan[] {
  const travel = ruleset.travel!;
  const plans: RoundRunPlan[] = [];
  for (const product of Object.keys(ruleset.products ?? { CRACK: true })) {
    const sales = salesOf(ruleset, input.home, product);
    for (const source of sourcesOf(ruleset, input.home, product, input.loadMinutes)) {
      const out = legHours(ruleset, input.home, source.city);
      const byCash = unitsFor(input.cashCents / CARRY, source.price, source.slope, input.trunk);
      const max = Math.min(input.trunk, byCash, source.shelf);
      if (max <= 0) continue;
      const held: RoundRunPlan['limit'] = max === input.trunk ? 'trunk' : max === byCash ? 'cash' : 'shelf';
      for (const sale of sales) {
        if (sale.city === source.city) continue;
        const toStop = out + legHours(ruleset, source.city, sale.city);
        if (toStop > input.maxHours) continue;
        // The last unit still sells for more than it cost.
        let low = 0;
        let high = max;
        while (low < high) {
          const mid = Math.ceil((low + high) / 2);
          const unit = mid - 1;
          const cost = source.price * (1 + source.slope * unit);
          const revenue = sale.price * Math.max(0.1, 1 + sale.slope * unit);
          if (revenue > cost) low = mid; else high = mid - 1;
        }
        if (low <= 0) continue;
        const hours = toStop + legHours(ruleset, sale.city, input.home);
        const costCents = sumMoving(source.price, source.slope, low);
        plans.push({
          kind: 'profit', product, buyCity: source.city, buyFrom: source.from, sellCity: sale.city, sellTo: sale.to, units: low,
          costCents, revenueCents: sumMoving(sale.price, sale.slope, low), driveHours: hours, hoursToLastStop: toStop,
          turns: Math.max(1, Math.ceil(hours * travel.turnsPerDriveHour)), minutes: hours * travel.gameMinutesPerDriveHour,
          limit: low < max ? 'market' : held,
        });
      }
    }
  }
  return plans;
}

/** Every way to bring up to `units` of a product home, within `maxHours` of leaving. Never Pip's at home: that is the shelf. */
export function roundSupplyPlans(ruleset: Ruleset, input: { home: string; product: string; units: number; cashCents: number; maxHours: number; ceilingCents: number }): RoundRunPlan[] {
  const travel = ruleset.travel!;
  const plans: RoundRunPlan[] = [];
  for (const source of sourcesOf(ruleset, input.home, input.product)) {
    if (source.city === input.home && source.from === 'pip') continue;
    // Loaded at home, it still has to go somewhere: the nearest town and straight back.
    const out = source.city === input.home
      ? Math.min(...Object.keys(ruleset.cities ?? {}).filter((other) => other !== input.home).map((other) => legHours(ruleset, input.home, other)))
      : legHours(ruleset, input.home, source.city);
    if (out > input.maxHours) continue;
    // No more than keeps the last unit under what it is worth at home.
    const underCeiling = source.slope > 0 ? Math.max(0, Math.floor((input.ceilingCents / source.price - 1) / source.slope)) : source.price < input.ceilingCents ? input.units : 0;
    const units = Math.min(input.units, source.shelf, underCeiling, unitsFor(input.cashCents / CARRY, source.price, source.slope, input.units));
    if (units <= 0) continue;
    const costCents = sumMoving(source.price, source.slope, units);
    const hours = out * 2;
    plans.push({
      kind: 'supply', product: input.product, buyCity: source.city, buyFrom: source.from, sellCity: null, sellTo: null, units,
      costCents, revenueCents: 0, driveHours: hours, hoursToLastStop: out,
      turns: Math.max(1, Math.ceil(hours * travel.turnsPerDriveHour)), minutes: hours * travel.gameMinutesPerDriveHour,
      limit: units === input.units ? 'trunk' : 'market',
    });
  }
  return plans;
}

// --- the round -------------------------------------------------------------------------------

interface Crew { whores: number; thugs: number; lowRiders: number; cash: number; heat: number; stash: Record<string, number> }

function valueOf(ruleset: Ruleset, key: string): number {
  if (key === 'CRACK') return ruleset.economy.netWorth.perCrackCents;
  return productEconomy(ruleset, key)?.netWorthCents ?? 0;
}

/** Net worth the way rankings count it: cash at its weight, the crew, the cars and the stash. */
function netWorth(ruleset: Ruleset, crew: Crew): number {
  const worth = ruleset.economy.netWorth;
  return crew.cash * (worth.cashWeightPercent / 100) + crew.whores * worth.perWhoreCents + crew.thugs * worth.perThugCents
    + crew.lowRiders * worth.perLowRiderCents + Object.entries(crew.stash).reduce((sum, [key, units]) => sum + units * valueOf(ruleset, key), 0);
}

export class TravelRoundCache {
  readonly risk = new Map<string, number>();
  readonly fights = new Map<string, number>();
}

/** How much of its plan a run keeps on average through the C risk model: swings, stops, busts. */
function riskShare(ruleset: Ruleset, home: string, plan: RoundRunPlan, escorts: number, cache: TravelRoundCache): number {
  // Escorts by the carful: a stop's odds move little between them. The share barely moves with the load.
  const cars = Math.min(5, Math.round(escorts / 6));
  const key = `${home}:${plan.product}:${plan.buyCity}:${plan.buyFrom}:${plan.sellCity}:${plan.sellTo}:${cars}`;
  const known = cache.risk.get(key);
  if (known !== undefined) return known;
  const profit = plan.revenueCents - plan.costCents;
  const trade: TravelTrade = {
    crew: 'round', product: plan.product, buyCity: plan.buyCity, buyFrom: plan.buyFrom, sellCity: plan.sellCity!, sellTo: plan.sellTo!,
    units: plan.units, limit: plan.limit, costCents: plan.costCents, revenueCents: plan.revenueCents, profitCents: profit,
    driveHours: plan.driveHours, turns: plan.turns, profitPerTurnCents: profit / plan.turns, streetShare: 0,
  };
  const living = { ...ruleset, round: { ...ruleset.round, startingCitySlug: home } } as Ruleset;
  let sum = 0;
  for (let sample = 0; sample < RISK_SAMPLES; sample++) sum += driveRiskRun(living, trade, sample, Math.ceil(plan.costCents * CARRY), cars * 6).profitCents;
  const share = profit > 0 ? Math.max(-1, sum / RISK_SAMPLES / profit) : 0;
  cache.risk.set(key, share);
  return share;
}

/** The attacker's chance against `defenders`, armed with pistols, on the road's roll. */
function hitChance(ruleset: Ruleset, attackers: number, defenders: number, cache: TravelRoundCache): number {
  const key = `${attackers}:${defenders}`;
  const known = cache.fights.get(key);
  if (known !== undefined) return known;
  const model = convoyCombatModel(ruleset);
  if (!model || attackers <= 0) return 0;
  const crew = (thugs: number): CombatCrew => {
    const weapons = Object.fromEntries(Object.keys(model.weapons).map((weapon) => [weapon, 0])) as CombatCrew['weapons'];
    (weapons as Record<string, number>).PISTOL = thugs;
    return { thugs, thugHappiness: HAPPINESS, weapons };
  };
  let wins = 0;
  for (let sample = 0; sample < FIGHT_SAMPLES; sample++) {
    const result = simulateRaid({ attacker: crew(attackers), defender: crew(defenders), attackingThugs: Math.min(attackers, model.squadCap), attackerTurns: model.turnCost, defenderCashCents: 0n }, model, seededRng(hashParts('round-fight', attackers, defenders, sample)));
    if (result.winner === 'ATTACKER') wins++;
  }
  cache.fights.set(key, wins / FIGHT_SAMPLES);
  return wins / FIGHT_SAMPLES;
}

/** What a landed hit takes on average: the middle of the loot rolls, as far as the squad carries. */
function averageLoot(ruleset: Ruleset, squad: number, cashCents: number, cargoUnits: number): { cash: number; units: number } {
  const loot = convoyRules(ruleset)!.loot;
  const cashShare = (loot.cashPercent.min + loot.cashPercent.max) / 200;
  const cargoShare = (loot.cargoPercent.min + loot.cargoPercent.max) / 200;
  return { cash: Math.min(cashCents * cashShare, squad * loot.cashPerAttackerCents), units: Math.min(cargoUnits * cargoShare, squad * loot.cargoPerAttacker) };
}

export function simulateTravelRound(ruleset: Ruleset, input: {
  style: TravelRoundStyle;
  start: TravelRoundStart;
  strategy: TravelRoundStrategy;
  home: string;
  days?: number;
  cache?: TravelRoundCache;
  /** Mixed play's threshold: a run has to earn this many times the street's turns. */
  edge?: number;
}): TravelRoundSummary {
  const { style, start, strategy } = input;
  const edge = input.edge ?? 1;
  const cache = input.cache ?? new TravelRoundCache();
  const heatRules = ruleset.heat;
  const supply = ruleset.workSupply;
  const travel = ruleset.travel;
  if (!heatRules || !supply || !travel?.market) throw new Error(`${ruleset.meta.id} has no Heat, work supply or high market.`);
  const days = input.days ?? DAYS_DEFAULT;
  const intervalMinutes = ruleset.turns.intervalMinutes;
  const firstHome = ruleset.round.startingCitySlug;
  const moveRules = relocationRules(ruleset);

  let city = firstHome;
  let living = rulesetForCity(ruleset, city);
  let shelves = homeShelves(living);
  const crew: Crew = { whores: start.whores, thugs: start.thugs, lowRiders: start.lowRiders, cash: start.cashCents, heat: 0, stash: {} };
  const tally = { streetTurns: 0, produceTurns: 0, runTurns: 0, hijackTurns: 0, runs: 0, supplyRuns: 0, runProfit: 0, hits: 0, hitTake: 0, productCost: 0, busts: 0, heatSum: 0, heatTurns: 0, idle: 0 };
  let movedOnDay: number | null = null;
  /** When the crew started buying at home for the next run. */
  let loadingSince = 0;
  /** What the crew's own trades have done to each high market, wearing off at the recovery half-life. */
  const pushes = new Map<string, { push: number; at: number }>();
  const pushNow = (city: string, product: string, minute: number): number => {
    const state = pushes.get(`${city}:${product}`);
    return state ? state.push * 0.5 ** ((minute - state.at) / travel.market!.recoveryHalfLifeMinutes) : 0;
  };
  const pushed = (city: string, product: string, minute: number, units: number) => {
    const depth = ruleset.cities?.[city]?.marketDepth ?? 1;
    const push = Math.min(travel.market!.maxPushUp, Math.max(-travel.market!.maxPushDown, pushNow(city, product, minute) + units / (depth * 100)));
    pushes.set(`${city}:${product}`, { push, at: minute });
  };
  /** A plan at today's prices: whatever the crew's last trades there left behind, on top of the baseline. */
  const repriced = (plan: RoundRunPlan, minute: number): RoundRunPlan => {
    const buyPush = plan.buyFrom === 'market' ? pushNow(plan.buyCity, plan.product, minute) : 0;
    const sellPush = plan.sellTo === 'market' && plan.sellCity ? pushNow(plan.sellCity, plan.product, minute) : 0;
    if (buyPush === 0 && sellPush === 0) return plan;
    return { ...plan, costCents: plan.costCents * (1 + buyPush), revenueCents: plan.revenueCents * Math.max(0.1, 1 + sellPush) };
  };
  let moveFee = 0;
  /** The run out: when it is back, and what it brings. */
  let away: { backAt: number; cash: number; cargo: Record<string, number>; escorts: number; lowRiders: number } | null = null;
  const recipes = productRecipes(ruleset).filter((recipe) => recipe.ingredientCentsPerUnit > 0);

  const escortsFor = () => Math.floor(Math.min(crew.lowRiders * ruleset.lowRiderThugCapacity, strategy.street ? crew.thugs * MIXED_ESCORT_SHARE : crew.thugs));
  const homeThugs = () => crew.thugs - (away?.escorts ?? 0);

  /** One trip's take and recruits in a district with an order of products, from stash then shelf; `commit` spends them. */
  const trip = (district: DistrictKey, turns: number, commit: boolean) => {
    const definition = living.scouting.districts[district];
    const need = Math.ceil(crew.whores * supply.productPerWhorePerTurn * turns);
    const clients = averageClients(living, crew.whores);
    const perWhore = living.scouting.grossPerWhorePerTurnCents * turns * happinessMultiplier(HAPPINESS, living.scouting.minHappinessMultiplier)
      * definition.payMultiplier * clients * heatTakeMultiplier(crew.heat, living);
    let left = need;
    let cost = 0;
    let take = 0;
    let recruit = 0;
    let heatPerTurn = 0;
    const order = productOrder(district, crew.heat, living);
    const effects = order.map((product) => productSliceEffects(living, product, 'hoes', district));
    order.forEach((product, index) => {
      if (left <= 0) return;
      const effect = effects[index]!;
      // What the next product down (or going dry) would earn in its place.
      const fallback = Math.max(supply.dryTakeMultiplier, ...effects.slice(index + 1).map((next) => next.takeMultiplier));
      const fromStash = Math.min(left, crew.stash[product] ?? 0);
      let units = fromStash;
      const shelf = shelves.get(product);
      if (shelf && units < left) {
        // Buy only what earns more than it costs: the uplift over the fallback, per unit, at the pimp's cut.
        const worth = (effect.takeMultiplier - fallback) * perWhore * crew.whores * KEEP / Math.max(1, need);
        if (worth > shelf.buyCents) {
          const bought = Math.min(left - units, shelf.stock, Math.floor(Math.max(0, crew.cash - cost) / shelf.buyCents));
          units += bought;
          cost += bought * shelf.buyCents;
          if (commit) shelf.stock -= bought;
        }
      }
      if (commit) crew.stash[product] = (crew.stash[product] ?? 0) - fromStash;
      const share = need ? units / need : 0;
      take += share * effect.takeMultiplier;
      recruit += share * effect.recruitmentMultiplier;
      heatPerTurn += share * effect.heatPerTurn;
      left -= units;
    });
    const dry = need ? left / need : 0;
    take += dry * supply.dryTakeMultiplier;
    recruit += dry;
    const cash = crew.whores * perWhore * take * KEEP;
    const whores = definition.whoresPerTurn * turns * recruitmentMultiplier(crew.whores, living.scouting.recruitment.whoreSoftCap) * recruit;
    const thugs = definition.thugsPerTurn * turns * recruitmentMultiplier(crew.thugs, living.scouting.recruitment.thugSoftCap);
    const worth = living.economy.netWorth;
    const value = (cash - cost) * (worth.cashWeightPercent / 100) + whores * worth.perWhoreCents + thugs * worth.perThugCents;
    return { cash, cost, whores, thugs, heat: turns * heatPerTurn * heatCrewFactor(living, 'hoes', crew.whores), value };
  };

  /** The best block the thugs at home can cover. */
  const bestDistrict = (turns: number): DistrictKey => {
    let best: DistrictKey = living.scouting.produceDistrict;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (const [key, definition] of Object.entries(living.scouting.districts) as Array<[DistrictKey, (typeof living.scouting.districts)[DistrictKey]]>) {
      if (homeThugs() * definition.protectionWhoresPerThug < crew.whores) continue;
      const value = trip(key, turns, false).value;
      if (value > bestValue) { bestValue = value; best = key; }
    }
    return best;
  };

  /** What one more street turn is worth right now, as net worth. */
  const streetTurnValue = () => (strategy.street ? trip(bestDistrict(TRIP_TURNS), TRIP_TURNS, false).value / TRIP_TURNS : 0);

  const street = (turns: number) => {
    const district = bestDistrict(turns);
    const result = trip(district, turns, true);
    const chance = bustChance(crew.heat, living);
    const fine = chance * heatRules.bust.cashFineFraction * Math.max(0, crew.cash + result.cash - result.cost);
    for (const key of Object.keys(crew.stash)) crew.stash[key] = crew.stash[key]! * (1 - chance * heatRules.bust.productSeizedFraction);
    crew.cash += result.cash - result.cost - fine;
    crew.whores += result.whores;
    crew.thugs += result.thugs;
    crew.heat = Math.min(heatRules.max, Math.max(0, crew.heat + result.heat - chance * heatRules.bust.heatDrop));
    tally.productCost += result.cost;
    tally.busts += chance;
    tally.streetTurns += turns;
    tally.heatSum += crew.heat * turns;
    tally.heatTurns += turns;
  };

  /** Cook what the street will run short of, when a turn at the stove beats a turn on the street. */
  const produce = (sessionTurns: number): number => {
    const district = bestDistrict(TRIP_TURNS);
    const perTrip = trip(district, TRIP_TURNS, false);
    const need = crew.whores * supply.productPerWhorePerTurn * sessionTurns;
    const cooks = homeThugs() * happinessMultiplier(HAPPINESS, 0.25);
    let spent = 0;
    for (const product of productOrder(district, crew.heat, living)) {
      const recipe = recipes.find((candidate) => candidate.product === product);
      if (!recipe) continue;
      const have = (crew.stash[product] ?? 0) + (shelves.get(product)?.stock ?? 0);
      const short = need - have;
      if (short <= 0) break;
      const perTurn = cooks * recipe.perThugPerTurn;
      if (perTurn <= 0) continue;
      // A cooked unit is worth its share of a trip's take over going without; the girls earn a third of a night meanwhile.
      const effect = productSliceEffects(living, product, 'hoes', district).takeMultiplier;
      const unitWorth = (effect - supply.dryTakeMultiplier) * (perTrip.cash / Math.max(0.01, effect)) / Math.max(1, crew.whores * supply.productPerWhorePerTurn * TRIP_TURNS);
      const turnWorth = perTurn * (unitWorth - recipe.ingredientCentsPerUnit) * (living.economy.netWorth.cashWeightPercent / 100)
        + perTrip.value / TRIP_TURNS * living.production.unsupervisedTakeMultiplier;
      if (turnWorth <= perTrip.value / TRIP_TURNS) continue;
      const turns = Math.min(Math.ceil(short / perTurn), Math.floor(sessionTurns * PRODUCE_MAX_SHARE) - spent, Math.floor(crew.cash / (perTurn * recipe.ingredientCentsPerUnit)));
      if (turns <= 0) continue;
      const units = turns * perTurn;
      crew.cash -= units * recipe.ingredientCentsPerUnit;
      crew.cash += perTrip.cash * living.production.unsupervisedTakeMultiplier * turns / TRIP_TURNS;
      crew.stash[product] = (crew.stash[product] ?? 0) + units;
      crew.heat = Math.min(heatRules.max, crew.heat + units * recipe.heatPerUnit);
      tally.produceTurns += turns;
      spent += turns;
      break;
    }
    return spent;
  };

  /** Plan the run worth most per minute the car is out; a mixed player only takes one that beats the street for its turns. */
  const launch = (turnsLeft: number, minute: number, onlineUntil: number, cars = crew.lowRiders): { turns: number; plan: RoundRunPlan; score: number } | null => {
    const maxHours = Math.max(0, (onlineUntil - minute) / travel.gameMinutesPerDriveHour);
    const trunk = cars * travel.cargoPerLowRider;
    const escorts = escortsFor();
    const perTurn = streetTurnValue();
    const weight = ruleset.economy.netWorth.cashWeightPercent / 100;
    const tail = TRAVEL_ROUND_WORLD.tailedChance * hitChance(ruleset, TRAVEL_ROUND_WORLD.tailSquad, escorts, cache);
    let best: { plan: RoundRunPlan; score: number } | null = null;
    // Buying Pip's shelf at home as it restocks, since the last run left or the session opened.
    const loadMinutes = Math.max(0, minute - loadingSince);
    for (const baseline of strategy.runs === 'supply' ? [] : roundRunPlans(ruleset, { home: city, trunk, cashCents: crew.cash, maxHours, loadMinutes })) {
      if (baseline.turns > turnsLeft) continue;
      const plan = repriced(baseline, minute);
      if (plan.revenueCents <= plan.costCents) continue;
      const profit = (plan.revenueCents - plan.costCents) * riskShare(ruleset, city, plan, escorts, cache);
      const loot = averageLoot(ruleset, TRAVEL_ROUND_WORLD.tailSquad, plan.costCents * CARRY, plan.units);
      const hit = tail * (loot.cash + loot.units * (plan.costCents / plan.units)) / 2;
      // A player on the street wants a clear edge for the turns: the sale's Heat costs the street too.
      const gain = (profit - hit) * weight - plan.turns * perTurn * edge;
      if (gain <= 0) continue;
      const score = gain / plan.minutes;
      if (!best || score > best.score) best = { plan: { ...plan, revenueCents: plan.costCents + profit - hit }, score };
    }
    // A supply run: the first product the street's best block wants, bought where it is cheaper than
    // at home (or where home has none), as much as a day and a half of trips burn.
    if (strategy.street && strategy.runs !== 'profit') {
      const district = bestDistrict(TRIP_TURNS);
      const order = productOrder(district, crew.heat, living);
      const product = order[0]!;
      const perDay = crew.whores * supply.productPerWhorePerTurn * style.sessionTurns * style.sessionsPerDay;
      // The trip's alternative is the next product down that home keeps in supply, or going without.
      const perDayAt = (key: string) => {
        const shelf = shelves.get(key);
        return (shelf ? shelf.perInterval * (MINUTES_PER_DAY / shelf.intervalMinutes) : 0) + (crew.stash[key] ?? 0);
      };
      const alternative = Math.max(supply.dryTakeMultiplier, ...order.slice(1).filter((key) => perDayAt(key) >= perDay / 2).map((key) => productSliceEffects(living, key, 'hoes', district).takeMultiplier));
      const want = Math.min(trunk, Math.ceil(perDay * SUPPLY_DAYS - (crew.stash[product] ?? 0)));
      const home = shelves.get(product);
      const ceiling = home?.buyCents ?? Math.round(valueOf(ruleset, product) * 4);
      const tripCash = trip(district, TRIP_TURNS, false).cash;
      const effect = productSliceEffects(living, product, 'hoes', district).takeMultiplier;
      // What a unit adds to a trip over the alternative.
      const fallbackUnit = (Math.max(0, effect - alternative) * tripCash / Math.max(0.01, effect)) / Math.max(1, crew.whores * supply.productPerWhorePerTurn * TRIP_TURNS);
      // A unit replaces one the home shelf would have sold (worth his price) or fills a trip that would have gone without.
      const shelfPerDay = home ? home.perInterval * (MINUTES_PER_DAY / home.intervalMinutes) : 0;
      const short = Math.max(0, Math.min(1, 1 - shelfPerDay / Math.max(1, perDay)));
      const unitWorth = short * fallbackUnit + (1 - short) * Math.min(fallbackUnit, ceiling);
      for (const baseline of want > 0 ? roundSupplyPlans(ruleset, { home: city, product, units: want, cashCents: crew.cash, maxHours, ceilingCents: ceiling }) : []) {
        if (baseline.turns > turnsLeft) continue;
        const plan = repriced(baseline, minute);
        const stopped = roadStopChance(ruleset, { route: findRoutes(ruleset, plan.buyCity, city)[0]?.cities ?? [plan.buyCity, city], cargoUnits: plan.units, escorts, heat: crew.heat });
        const kept = plan.units * (1 - stopped * (travel.stops?.productSeizedFraction ?? 0));
        const gain = (kept * unitWorth - plan.costCents) * weight - plan.turns * perTurn * edge;
        const score = gain / plan.minutes;
        if (gain > 0 && (!best || score > best.score)) best = { plan: { ...plan, units: Math.floor(kept) }, score };
      }
    }
    return best ? { turns: best.plan.turns, plan: best.plan, score: best.score } : null;
  };

  const settleRun = (now: number) => {
    if (!away || away.backAt > now) return;
    crew.cash += away.cash;
    for (const [key, units] of Object.entries(away.cargo)) crew.stash[key] = (crew.stash[key] ?? 0) + units;
    away = null;
  };

  const hijack = (turnsLeft: number, hitsLeft: number): number => {
    const recon = convoyRules(ruleset)!.recon.turnCost;
    const tailCost = convoyRules(ruleset)!.turnCost;
    const perHit = recon / TRAVEL_ROUND_WORLD.reconFindChance + tailCost;
    const squad = Math.floor(Math.min(homeThugs(), convoyCombatModel(ruleset)!.squadCap));
    const target = TRAVEL_ROUND_WORLD.target;
    const cargo = Object.values(target.cargo).reduce((sum, units) => sum + units, 0);
    const win = hitChance(ruleset, squad, target.escorts, cache);
    const loot = averageLoot(ruleset, squad, target.cashCents, cargo);
    // Half the runs are found on the way out (cash), half on the way back (cargo), which goes to the street.
    const product = Object.keys(target.cargo)[0]!;
    const value = win * (loot.cash / 2 * (ruleset.economy.netWorth.cashWeightPercent / 100) + loot.units / 2 * valueOf(ruleset, product));
    let spent = 0;
    let hits = 0;
    // A hijacker hits whatever it finds, as far as the runs coming through go.
    while (value > 0 && hits < hitsLeft && spent + perHit <= turnsLeft) {
      crew.cash += win * loot.cash / 2;
      crew.stash[product] = (crew.stash[product] ?? 0) + win * loot.units / 2;
      tally.hits += win;
      tally.hitTake += win * (loot.cash / 2 + loot.units / 2 * valueOf(ruleset, product));
      spent += perHit;
      hits++;
    }
    tally.hijackTurns += Math.round(spent);
    return Math.round(spent);
  };

  const gapMinutes = MINUTES_PER_DAY / style.sessionsPerDay;
  for (let day = 0; day < days; day++) {
    for (let session = 0; session < style.sessionsPerDay; session++) {
      const opens = day * MINUTES_PER_DAY + session * gapMinutes;
      if (style.intervalsPerTurn === 0 || (day > 0 && session === 0)) {
        // Away between sessions (or overnight): Heat cools, shelves refill.
        const gap = style.intervalsPerTurn === 0 ? gapMinutes : MINUTES_PER_DAY - style.onlineMinutes;
        crew.heat = Math.max(0, crew.heat - Math.floor(gap / intervalMinutes) * heatRules.decayPerInterval);
        for (const shelf of shelves.values()) restock(shelf, gap);
      }
      settleRun(opens);

      // Move as soon as the fee leaves enough to work with and no run is out.
      if (input.home !== city && moveRules && !away) {
        const fee = Number(relocationFeeCents(BigInt(Math.round(netWorth(ruleset, crew))), moveRules));
        if (crew.cash >= fee * 2) {
          crew.cash -= fee;
          moveFee += fee;
          movedOnDay = day;
          city = input.home;
          living = rulesetForCity(ruleset, city);
          shelves = homeShelves(living);
          // Downtime is spent on the road, and turns bank up to the cap meanwhile.
          crew.heat = Math.max(0, crew.heat - Math.floor(moveRules.downtimeMinutes / intervalMinutes) * heatRules.decayPerInterval);
        }
      }

      let turns = style.sessionTurns;
      if (strategy.runs) {
        const price = ruleset.stores.CHARLIE?.items.LOW_RIDER?.buyCents ?? 0;
        const lot = style.intervalsPerTurn === 0 ? 3 : Math.floor(style.onlineMinutes / 240) * 3;
        // Charlie's lot, toward the fleet that makes the best run worth the most over the rest of the
        // round, net of what the cars cost, with cash to spare for the load.
        const runsLeft = (days - day) * Math.max(1, style.onlineMinutes / 480) * style.sessionsPerDay;
        const carCost = price * (ruleset.economy.netWorth.cashWeightPercent / 100) - ruleset.economy.netWorth.perLowRiderCents;
        let target = crew.lowRiders;
        let targetWorth = 0;
        const base = launch(turns, opens, opens + style.onlineMinutes);
        for (const extra of [lot, lot * 2, lot * 4, lot * 8]) {
          const more = launch(turns, opens, opens + style.onlineMinutes, crew.lowRiders + extra);
          if (!more) continue;
          const worth = (more.score * more.plan.minutes - (base ? base.score * base.plan.minutes : 0)) * runsLeft - extra * carCost;
          if (worth > targetWorth) { targetWorth = worth; target = crew.lowRiders + extra; }
        }
        for (let bought = 0; bought < lot && crew.lowRiders < target && price > 0 && crew.cash > price * 10; bought++) {
          crew.cash -= price;
          crew.lowRiders += 1;
        }
        let minute = opens;
        loadingSince = opens;
        const closes = opens + style.onlineMinutes;
        while (minute < closes) {
          if (away) {
            if (away.backAt >= closes) break;
            minute = Math.max(minute, away.backAt);
            settleRun(minute);
            continue;
          }
          const next = launch(turns, minute, closes);
          if (!next) break;
          const { plan } = next;
          loadingSince = minute;
          if (plan.buyFrom === 'market') pushed(plan.buyCity, plan.product, minute, plan.units);
          if (plan.sellTo === 'market' && plan.sellCity) pushed(plan.sellCity, plan.product, minute, -plan.units);
          // What was loaded at home came off Pip's shelf (bought as it restocked).
          if (plan.buyCity === city) {
            const shelf = shelves.get(plan.product);
            if (shelf) shelf.stock = Math.max(0, shelf.stock - plan.units);
          }
          const escorts = escortsFor();
          const carried = plan.costCents * CARRY;
          crew.cash -= carried;
          turns -= plan.turns;
          tally.runTurns += plan.turns;
          tally.runs += 1;
          if (plan.kind === 'supply') tally.supplyRuns += 1;
          const back = plan.kind === 'supply'
            ? { cash: carried - plan.costCents, cargo: { [plan.product]: plan.units } }
            : { cash: carried - plan.costCents + plan.revenueCents, cargo: {} };
          if (plan.kind === 'profit') {
            tally.runProfit += plan.revenueCents - plan.costCents;
            crew.heat = Math.min(heatRules.max, crew.heat + saleHeat(ruleset, plan.sellCity!, plan.revenueCents));
          }
          away = { backAt: minute + plan.minutes, ...back, escorts, lowRiders: crew.lowRiders };
          minute += plan.minutes;
        }
      }

      if (strategy.hijack) {
        const hits = TRAVEL_ROUND_WORLD.hitsPerDay[style.name] ?? 0;
        turns -= hijack(turns, hits);
      }
      if (strategy.produce) turns -= produce(turns);
      if (!strategy.street) { tally.idle += turns; continue; }

      for (let spent = 0; spent < turns; spent += TRIP_TURNS) {
        const chunk = Math.min(TRIP_TURNS, turns - spent);
        street(chunk);
        if (style.intervalsPerTurn > 0) {
          const passed = chunk * style.intervalsPerTurn * intervalMinutes;
          crew.heat = Math.max(0, crew.heat - chunk * style.intervalsPerTurn * heatRules.decayPerInterval);
          for (const shelf of shelves.values()) restock(shelf, passed);
        }
      }
    }
  }
  // Whatever is on the road comes home before the round ends.
  settleRun(Number.POSITIVE_INFINITY);

  return {
    style: style.name, start: start.name, strategy: strategy.key, strategyName: strategy.name, home: input.home,
    movedOnDay, moveFeeCents: Math.round(moveFee),
    scoreCents: Math.round(netWorth(ruleset, crew)), cashCents: Math.round(crew.cash),
    whores: crew.whores, thugs: crew.thugs, lowRiders: crew.lowRiders,
    streetTurns: tally.streetTurns, produceTurns: tally.produceTurns, runTurns: tally.runTurns, hijackTurns: tally.hijackTurns,
    runs: tally.runs, supplyRuns: tally.supplyRuns, runProfitCents: Math.round(tally.runProfit), hits: tally.hits, hitTakeCents: Math.round(tally.hitTake),
    productCostCents: Math.round(tally.productCost), busts: tally.busts,
    averageHeat: tally.heatTurns ? tally.heatSum / tally.heatTurns : 0, idleTurns: tally.idle,
    edge: strategy.mixed ? edge : null,
  };
}

export function runTravelRoundSimulation(ruleset: Ruleset, days?: number): TravelRoundSummary[] {
  const cache = new TravelRoundCache();
  const homes = Object.keys(ruleset.cities ?? {});
  return travelRoundStyles.flatMap((style) => travelRoundStarts.flatMap((start) => homes.flatMap((home) => travelRoundStrategies.map((strategy) => {
    if (!strategy.mixed) return simulateTravelRound(ruleset, { style, start, strategy, home, days, cache });
    // A mixed player settles on the threshold that works for them.
    return RUN_EDGES.map((edge) => simulateTravelRound(ruleset, { style, start, strategy, home, days, cache, edge }))
      .sort((a, b) => b.scoreCents - a.scoreCents)[0]!;
  }))));
}

/**
 * The 0.5.0-F gate: in every play style, start and home city, mixed play (street, Produce
 * and runs) beats street only, street and Produce, and runner only.
 */
export function travelRoundGate(ruleset: Ruleset, rows: readonly TravelRoundSummary[]): string[] {
  const problems: string[] = [];
  const groups = new Map<string, TravelRoundSummary[]>();
  for (const row of rows) {
    const key = `${row.style} · ${row.start} · ${ruleset.cities?.[row.home]?.name ?? row.home}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const [situation, group] of groups) {
    const mixed = group.filter((row) => travelRoundStrategies.find((strategy) => strategy.key === row.strategy)?.mixed).sort((a, b) => b.scoreCents - a.scoreCents)[0];
    if (!mixed) continue;
    for (const rival of group.filter((row) => row.strategy === 'street' || row.strategy === 'produce' || row.strategy === 'runner')) {
      if (rival.scoreCents >= mixed.scoreCents) problems.push(`${situation}: ${rival.strategyName} (${money(rival.scoreCents)}) is not beaten by mixed play (${mixed.strategyName}, ${money(mixed.scoreCents)}).`);
    }
  }
  return problems;
}

function money(cents: number): string {
  return `${cents < 0 ? '-' : ''}$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
}

export function travelRoundMarkdown(ruleset: Ruleset, rows: readonly TravelRoundSummary[]): string {
  const problems = travelRoundGate(ruleset, rows);
  const name = (slug: string) => ruleset.cities?.[slug]?.name ?? slug;
  const world = TRAVEL_ROUND_WORLD;
  const lines = [
    `# Full round with travel - ${ruleset.meta.version}`,
    '',
    `Ruleset \`${ruleset.meta.id}\`. ${DAYS_DEFAULT} days, as expected values. Every strategy is played from New York and from each other city, moving there as soon as the fee is half the cash on hand. `
      + `The street earns the average block (client capacity is hidden and reshuffled hourly), at ${HAPPINESS}% happiness and a ${Math.round(KEEP * 100)}% cut, and buys product at the home Pip's when it earns more than it costs. `
      + 'Runs are planned from the crew\'s cash, cars and home, driven in real time one at a time, and kept at their C risk-model average (swings, events, stops, busts); a supply run brings home the street\'s best product. '
      + `Produce cooks what the shelves cannot supply when a turn at the stove beats a turn on the street, up to ${Math.round(PRODUCE_MAX_SHARE * 100)}% of a session.`,
    '',
    `The rest of the round is assumed: a recon finds a run worth tailing ${Math.round(world.reconFindChance * 100)}% of the time, a hijacker lands at most ${world.hitsPerDay['All day']} hits a day playing all day and ${world.hitsPerDay['Twice a day']} a session twice a day, `
      + `the run it finds carries ${money(world.target.cashCents)} out and ${world.target.cargo.COCAINE} Cocaine back with ${world.target.escorts} escorts, and ${Math.round(world.tailedChance * 100)}% of your own runs are tailed by a squad of ${world.tailSquad}.`,
    '',
    'Score is net worth as rankings count it: cash at its weight, whores, thugs, Low-Riders and the stash.',
    '',
    '## Gate',
    '',
    problems.length ? `**Fails.**\n\n${problems.map((line) => `- ${line}`).join('\n')}` : '**Passes.** In every play style, start and home, mixed play beats the street alone, the street with Produce, and running alone.',
    '',
  ];
  for (const style of travelRoundStyles) {
    for (const start of travelRoundStarts) {
      lines.push(`## ${style.name} · ${start.name}`, '', `${style.purpose} ${start.whores} whores, ${start.thugs} thugs, ${start.lowRiders} Low-Rider${start.lowRiders === 1 ? '' : 's'}, ${money(start.cashCents)}.`, '',
        `| Home | ${travelRoundStrategies.map((strategy) => strategy.name).join(' | ')} | Moved on day |`,
        `| --- | ${travelRoundStrategies.map(() => '---:').join(' | ')} | ---: |`);
      for (const home of Object.keys(ruleset.cities ?? {})) {
        const group = rows.filter((row) => row.style === style.name && row.start === start.name && row.home === home);
        const best = Math.max(...group.map((row) => row.scoreCents));
        const cells = travelRoundStrategies.map((strategy) => {
          const row = group.find((entry) => entry.strategy === strategy.key);
          if (!row) return '-';
          return row.scoreCents === best ? `**${money(row.scoreCents)}**` : money(row.scoreCents);
        });
        const moved = group.find((row) => row.strategy === 'street')?.movedOnDay;
        lines.push(`| ${name(home)} | ${cells.join(' | ')} | ${home === ruleset.round.startingCitySlug ? '-' : moved === null || moved === undefined ? 'never' : moved + 1} |`);
      }
      lines.push('');
      const nyc = rows.filter((row) => row.style === style.name && row.start === start.name && row.home === ruleset.round.startingCitySlug);
      lines.push(`From ${name(ruleset.round.startingCitySlug)}:`, '',
        '| Strategy | Score | Cash | Whores | Thugs | Cars | Street | Produce | Runs (supply) | Run turns | Run profit | Hits | Hit take | Average Heat | Idle turns |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
      for (const row of nyc) {
        lines.push(`| ${row.strategyName} | ${money(row.scoreCents)} | ${money(row.cashCents)} | ${Math.round(row.whores).toLocaleString('en-US')} | ${Math.round(row.thugs).toLocaleString('en-US')} | ${row.lowRiders} | ${row.streetTurns.toLocaleString('en-US')} | ${row.produceTurns.toLocaleString('en-US')} | ${row.runs} (${row.supplyRuns}) | ${row.runTurns.toLocaleString('en-US')} | ${money(row.runProfitCents)} | ${row.hits.toFixed(1)} | ${money(row.hitTakeCents)} | ${row.averageHeat.toFixed(0)} | ${row.idleTurns.toLocaleString('en-US')} |`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}
