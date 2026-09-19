import type { ConvoyRules, Ruleset } from '@streets/rulesets';
import type { Rng } from '../rng.js';
import { cityRules, findRoutes } from './cities.js';
import { splitProductUnits } from './product-economy.js';
import { routeHours, runPosition, type RunStopPlan } from './runs.js';

/**
 * 0.5.0-E. Convoys: where a run can be hit, and what a hit takes.
 *
 * A run can be hit only near a city, never on the open road: in a city's zone at the
 * start of a leg (leaving), in town, in a city's zone at the end of a leg (coming in),
 * or in the zones either side of a town it drives through. A city's zone is its
 * `zoneHours` of road out along every road. Every window is worked out from the stop
 * times alone, like the run itself, so it needs nothing stored.
 *
 * Everything here is pure. The server locks, loads, rolls and writes.
 */

export function convoyRules(ruleset: Ruleset): ConvoyRules | undefined {
  return ruleset.travel?.convoys;
}

export type ReachKind = 'leaving' | 'town' | 'passing' | 'arriving';

export interface ReachWindow {
  city: string;
  kind: ReachKind;
  from: Date;
  to: Date;
  /** The stop whose leg (or town window) this is in. */
  stopIndex: number;
}

function zoneHours(ruleset: Ruleset, city: string): number {
  return Math.max(0, cityRules(ruleset, city)?.zoneHours ?? 0);
}

/** Every stretch of a run in which some city's locals can reach it, in time order. */
export function reachWindows(ruleset: Ruleset, stops: readonly RunStopPlan[]): ReachWindow[] {
  const windows: ReachWindow[] = [];
  stops.forEach((stop, stopIndex) => {
    const route = stop.route;
    const total = route.length > 1 ? routeHours(ruleset, route) : 0;
    const legMs = stop.arriveAt.getTime() - stop.departAt.getTime();
    let driven = 0;
    for (let index = 1; index < route.length; index++) {
      const a = route[index - 1]!;
      const b = route[index]!;
      const hours = routeHours(ruleset, [a, b]);
      const start = stop.departAt.getTime() + (total > 0 ? (driven / total) * legMs : 0);
      const end = stop.departAt.getTime() + (total > 0 ? ((driven + hours) / total) * legMs : legMs);
      const span = end - start;
      const share = (city: string) => (hours > 0 ? Math.min(1, zoneHours(ruleset, city) / hours) : 1);
      const out = share(a) * span;
      const into = share(b) * span;
      if (out > 0) windows.push({ city: a, kind: index === 1 ? 'leaving' : 'passing', from: new Date(start), to: new Date(start + out), stopIndex });
      if (into > 0) windows.push({ city: b, kind: index === route.length - 1 ? 'arriving' : 'passing', from: new Date(end - into), to: new Date(end), stopIndex });
      driven += hours;
    }
    if (stop.leaveAt && stop.leaveAt.getTime() > stop.arriveAt.getTime()) {
      windows.push({ city: stop.city, kind: 'town', from: stop.arriveAt, to: stop.leaveAt, stopIndex });
    }
  });
  return windows.sort((a, b) => a.from.getTime() - b.from.getTime() || a.city.localeCompare(b.city));
}

/** The cities whose locals can reach a run at a moment, and how. */
export function reachAt(windows: readonly ReachWindow[], at: Date): ReachWindow[] {
  const t = at.getTime();
  return windows.filter((window) => window.from.getTime() <= t && t < window.to.getTime());
}

export interface ReachSpan {
  city: string;
  from: Date;
  to: Date;
  /** What the run is doing there: coming in, in town, driving through, leaving. */
  kinds: ReachKind[];
}

/**
 * The windows joined up per city where they touch: coming in, the town window and
 * leaving are one stretch in that city's reach.
 */
export function reachSpans(windows: readonly ReachWindow[]): ReachSpan[] {
  const spans: ReachSpan[] = [];
  for (const window of [...windows].sort((a, b) => a.from.getTime() - b.from.getTime())) {
    const open = spans.find((span) => span.city === window.city && window.from.getTime() <= span.to.getTime() + 1_000);
    if (open) {
      if (window.to.getTime() > open.to.getTime()) open.to = window.to;
      if (!open.kinds.includes(window.kind)) open.kinds.push(window.kind);
    } else {
      spans.push({ city: window.city, from: window.from, to: window.to, kinds: [window.kind] });
    }
  }
  return spans.sort((a, b) => a.from.getTime() - b.from.getTime());
}

function shortestHours(ruleset: Ruleset, from: string, to: string): number {
  return from === to ? 0 : findRoutes(ruleset, from, to)[0]?.driveHours ?? Number.POSITIVE_INFINITY;
}

/** Drive hours from where a run is to its home, by the shortest roads. 0 once it is home. */
export function hoursFromHome(ruleset: Ruleset, stops: readonly RunStopPlan[], home: string, at: Date): number {
  const position = runPosition(ruleset, stops, at);
  if (position.phase === 'home') return 0;
  if (position.phase === 'town' || !position.road) return shortestHours(ruleset, position.city, home);
  const hours = routeHours(ruleset, [position.road.from, position.road.to]);
  return Math.min(
    position.road.progress * hours + shortestHours(ruleset, position.road.from, home),
    (1 - position.road.progress) * hours + shortestHours(ruleset, position.road.to, home),
  );
}

/**
 * Thugs from home who ride out on their own: the most when the run is in the home town,
 * none at the edge of the home zone and beyond.
 */
export function homeBackupThugs(ruleset: Ruleset, home: string, hoursHome: number, fitAtHome: number): number {
  const rules = convoyRules(ruleset);
  const zone = zoneHours(ruleset, home);
  if (!rules || zone <= 0 || hoursHome >= zone || fitAtHome <= 0) return 0;
  return Math.floor(fitAtHome * rules.homeBackupMaxShare * (1 - hoursHome / zone));
}

/** Minutes before a hit that an owner's lookouts see the tail on their run. None without lookouts. */
export function headsUpMinutes(ruleset: Ruleset, lookoutsLevel: number): number {
  const rules = convoyRules(ruleset);
  return rules ? Math.max(0, lookoutsLevel) * rules.headsUpMinutesPerLookouts : 0;
}

/** How far ahead an area recon sees runs coming, with the player's lookouts. */
export function reconLookaheadMinutes(ruleset: Ruleset, lookoutsLevel: number): number {
  const rules = convoyRules(ruleset);
  return rules ? rules.recon.lookaheadMinutes + Math.max(0, lookoutsLevel) * rules.recon.lookaheadMinutesPerLookouts : 0;
}

/** The raid model as it plays on the road (`convoys.fight`). */
export function convoyCombatModel(ruleset: Ruleset): NonNullable<Ruleset['combat']> | null {
  const model = ruleset.combat;
  const rules = convoyRules(ruleset);
  if (!model || !rules) return null;
  return { ...model, strength: { ...model.strength, defenseMultiplier: rules.fight.defenseMultiplier, variance: rules.fight.variance } };
}

/** Real minutes for backup from home to reach a run this far out. */
export function backupMinutes(ruleset: Ruleset, hoursHome: number): number {
  return hoursHome * (ruleset.travel?.gameMinutesPerDriveHour ?? 0);
}

export interface ConvoyLoot {
  cashPercent: number;
  cargoPercent: number;
  cashCents: bigint;
  cargo: Record<string, number>;
}

function roll(range: { min: number; max: number }, rng: Rng): number {
  return range.min + Math.floor(rng() * (range.max - range.min + 1));
}

/**
 * What a winning tail takes: a rolled share of the run's cash and of its cargo, the cargo
 * split across products by largest remainder, each capped by what the fit attackers can
 * carry. Two rolls, cash then cargo.
 */
export function convoyLoot(ruleset: Ruleset, input: { runCashCents: bigint; cargo: Record<string, number>; fitAttackers: number; rng: Rng }): ConvoyLoot {
  const rules = convoyRules(ruleset)!;
  const cashPercent = roll(rules.loot.cashPercent, input.rng);
  const cargoPercent = roll(rules.loot.cargoPercent, input.rng);
  const cash = input.runCashCents > 0n ? input.runCashCents : 0n;
  const cashShare = cash * BigInt(cashPercent) / 100n;
  const cashCarry = BigInt(Math.max(0, input.fitAttackers)) * BigInt(rules.loot.cashPerAttackerCents);
  const units = Object.values(input.cargo).reduce((sum, value) => sum + Math.max(0, value), 0);
  const cargoUnits = Math.min(Math.floor(units * cargoPercent / 100), Math.max(0, input.fitAttackers) * rules.loot.cargoPerAttacker);
  return {
    cashPercent,
    cargoPercent,
    cashCents: cashShare < cashCarry ? cashShare : cashCarry,
    cargo: splitProductUnits(input.cargo, cargoUnits, ruleset),
  };
}

/** Split `total` wounds across groups of defenders by size, largest remainder first. */
export function splitWounds(total: number, groups: Readonly<Record<string, number>>): Record<string, number> {
  const entries = Object.entries(groups).filter(([, size]) => size > 0);
  const size = entries.reduce((sum, [, count]) => sum + count, 0);
  const take = Math.max(0, Math.min(total, size));
  if (take === 0) return Object.fromEntries(entries.map(([key]) => [key, 0]));
  const shares = entries.map(([key, count]) => {
    const exact = (count * take) / size;
    return { key, count, whole: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let left = take - shares.reduce((sum, share) => sum + share.whole, 0);
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key))) {
    if (left <= 0) break;
    if (share.whole < share.count) { share.whole += 1; left -= 1; }
  }
  return Object.fromEntries(shares.map((share) => [share.key, share.whole]));
}

// --- what a look at a convoy tells you ------------------------------------------------

export type CashBand = 'light' | 'loaded' | 'heavy';
export type CargoBand = 'empty' | 'light' | 'half' | 'full';
export type EscortBand = 'none' | 'light' | 'armed' | 'heavy';

/** A run's wallet, trunk and escort in bands: enough to pick a target, never exact. */
export function convoyBands(input: { cashCents: bigint; cargoUnits: number; capacity: number; escorts: number }): { cash: CashBand; cargo: CargoBand; escort: EscortBand } {
  const dollars = Number(input.cashCents) / 100;
  const fill = input.capacity > 0 ? input.cargoUnits / input.capacity : 0;
  return {
    cash: dollars < 10_000 ? 'light' : dollars < 100_000 ? 'loaded' : 'heavy',
    cargo: input.cargoUnits <= 0 ? 'empty' : fill < 0.25 ? 'light' : fill < 0.75 ? 'half' : 'full',
    escort: input.escorts <= 0 ? 'none' : input.escorts < 6 ? 'light' : input.escorts < 18 ? 'armed' : 'heavy',
  };
}
