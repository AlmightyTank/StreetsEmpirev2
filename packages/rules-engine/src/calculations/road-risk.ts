import type { RoadRules, Ruleset } from '@streets/rulesets';
import type { Rng } from '../rng.js';
import { cityRules } from './cities.js';

/**
 * 0.5.0-C. What the road and the police cost a run: Heat from selling, arrests (a
 * tier above busts, at home and on a run), and stops on the interstates.
 *
 * Everything here is pure. The server rolls with a seeded or injected `Rng`.
 */

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Heat a sale of `cents` draws in a city: its police pressure, on the square root of the sale. */
export function saleHeat(ruleset: Ruleset, city: string, cents: bigint | number): number {
  const rules = ruleset.travel?.saleHeat;
  const pressure = cityRules(ruleset, city)?.policePressure;
  const dollars = Number(cents) / 100;
  if (!rules || pressure === undefined || dollars <= 0) return 0;
  return Math.max(1, Math.round(pressure * rules.perTenThousandDollars * Math.sqrt(dollars / 10_000)));
}

/** Chance of an arrest at this Heat, where the ruleset (already a city's) says arrests start. */
export function arrestChance(heat: number, ruleset: Ruleset): number {
  const arrest = ruleset.heat?.arrest;
  const max = ruleset.heat?.max ?? 0;
  if (!arrest || heat < arrest.startsAt) return 0;
  const span = max - arrest.startsAt;
  if (span <= 0) return arrest.chanceAtMax;
  return arrest.chanceAtMax * clamp((heat - arrest.startsAt) / span, 0, 1);
}

export interface ArrestOutcome {
  arrested: boolean;
  chance: number;
  /** Units seized from each product, crack included. */
  seized: Record<string, number>;
  fineCents: bigint;
  heatAfter: number;
  /** Real minutes locked up. */
  downtimeMinutes: number;
}

/**
 * Roll for an arrest at home, at the Heat a trip started with. It takes a bigger share
 * of product and cash than a bust, burns off more Heat, and locks the player up. Rolls
 * nothing when an arrest is impossible, so rounds without arrests roll as they did.
 */
export function resolveArrest(input: { heat: number; cashCents: bigint; products: Record<string, number>; ruleset: Ruleset; rng: Rng }): ArrestOutcome {
  const { heat, cashCents, products, ruleset, rng } = input;
  const arrest = ruleset.heat?.arrest;
  const chance = arrestChance(heat, ruleset);
  if (!arrest || chance <= 0 || rng() >= chance) {
    return { arrested: false, chance, seized: {}, fineCents: 0n, heatAfter: heat, downtimeMinutes: 0 };
  }
  const seized: Record<string, number> = {};
  for (const [key, quantity] of Object.entries(products)) {
    const taken = Math.floor(Math.max(0, quantity) * arrest.productSeizedFraction);
    if (taken > 0) seized[key] = taken;
  }
  const cash = cashCents > 0n ? cashCents : 0n;
  return {
    arrested: true,
    chance,
    seized,
    fineCents: BigInt(Math.floor(Number(cash) * arrest.cashFineFraction)),
    heatAfter: clamp(heat - arrest.heatDrop, 0, ruleset.heat!.max),
    downtimeMinutes: arrest.downtimeMinutes,
  };
}

export type RunTroubleKind = 'BUST' | 'ARREST';

export interface RunTrouble {
  kind: RunTroubleKind | null;
  bustChance: number;
  arrestChance: number;
  /** Units taken from the trunk. An arrest takes all of it. */
  seized: Record<string, number>;
  /** Taken from the run's wallet. */
  fineCents: bigint;
  heatAfter: number;
}

/**
 * Roll a trade on a run against the town's Heat levels (the ruleset is the town's):
 * first for an arrest, then for a bust. An arrest takes the whole trunk and part of
 * the wallet and sends the run home; a bust takes a share of both.
 */
export function resolveRunTrouble(input: {
  heat: number;
  cashCents: bigint;
  cargo: Record<string, number>;
  ruleset: Ruleset;
  bustChance: number;
  rng: Rng;
}): RunTrouble {
  const { heat, cashCents, cargo, ruleset, rng } = input;
  const rules = ruleset.heat;
  const cash = cashCents > 0n ? cashCents : 0n;
  const arrestAt = arrestChance(heat, ruleset);
  const quiet: RunTrouble = { kind: null, bustChance: input.bustChance, arrestChance: arrestAt, seized: {}, fineCents: 0n, heatAfter: heat };
  if (!rules) return quiet;
  if (arrestAt > 0 && rng() < arrestAt) {
    const arrest = rules.arrest!;
    return {
      ...quiet,
      kind: 'ARREST',
      seized: Object.fromEntries(Object.entries(cargo).filter(([, units]) => units > 0)),
      fineCents: BigInt(Math.floor(Number(cash) * arrest.runCashSeizedFraction)),
      heatAfter: clamp(heat - arrest.heatDrop, 0, rules.max),
    };
  }
  if (input.bustChance > 0 && rng() < input.bustChance) {
    const seized: Record<string, number> = {};
    for (const [key, units] of Object.entries(cargo)) {
      const taken = Math.floor(Math.max(0, units) * rules.bust.productSeizedFraction);
      if (taken > 0) seized[key] = taken;
    }
    return {
      ...quiet,
      kind: 'BUST',
      seized,
      fineCents: BigInt(Math.floor(Number(cash) * rules.bust.cashFineFraction)),
      heatAfter: clamp(heat - rules.bust.heatDrop, 0, rules.max),
    };
  }
  return quiet;
}

// --- stops on the road -------------------------------------------------------------

function roadBetween(ruleset: Ruleset, a: string, b: string): RoadRules | undefined {
  return ruleset.travel?.roads.find((road) => (road.from === a && road.to === b) || (road.from === b && road.to === a));
}

/** Each road's chance of a stop on one leg, for a load, escort and Heat. */
export function roadStopChances(ruleset: Ruleset, input: { route: readonly string[]; cargoUnits: number; escorts: number; heat: number }): Array<{ road: RoadRules; chance: number }> {
  const rules = ruleset.travel?.stops;
  if (!rules) return [];
  const cargo = Math.min(rules.maxCargoFactor, 1 + Math.max(0, input.cargoUnits) / rules.cargoScale);
  const heat = 1 + clamp(input.heat, 0, ruleset.heat?.max ?? 100) / (ruleset.heat?.max ?? 100);
  const escort = Math.max(rules.minEscortFactor, 1 - Math.max(0, input.escorts) * rules.escortCut);
  const roads: Array<{ road: RoadRules; chance: number }> = [];
  for (let index = 1; index < input.route.length; index++) {
    const road = roadBetween(ruleset, input.route[index - 1]!, input.route[index]!);
    if (!road) continue;
    const perHour = clamp(rules.chancePerDriveHour * road.police, 0, 1);
    const base = 1 - (1 - perHour) ** road.driveHours;
    roads.push({ road, chance: clamp(base * cargo * heat * escort, 0, 1) });
  }
  return roads;
}

/** The chance a leg is stopped at least once. A leg is stopped at most once. */
export function roadStopChance(ruleset: Ruleset, input: { route: readonly string[]; cargoUnits: number; escorts: number; heat: number }): number {
  return 1 - roadStopChances(ruleset, input).reduce((clear, { chance }) => clear * (1 - chance), 1);
}

export interface RoadStop {
  stopped: boolean;
  chance: number;
  road: { from: string; to: string; name: string } | null;
  seized: Record<string, number>;
  fineCents: bigint;
}

/** Roll one leg for a police stop. A stop takes a share of the trunk and fines the wallet. */
export function resolveRoadStop(ruleset: Ruleset, input: {
  route: readonly string[];
  cargo: Record<string, number>;
  cashCents: bigint;
  escorts: number;
  heat: number;
  rng: Rng;
}): RoadStop {
  const rules = ruleset.travel?.stops;
  const units = Object.values(input.cargo).reduce((sum, value) => sum + Math.max(0, value), 0);
  const roads = roadStopChances(ruleset, { route: input.route, cargoUnits: units, escorts: input.escorts, heat: input.heat });
  const chance = 1 - roads.reduce((clear, { chance: each }) => clear * (1 - each), 1);
  const none: RoadStop = { stopped: false, chance, road: null, seized: {}, fineCents: 0n };
  if (!rules || chance <= 0) return none;
  // One roll per road, in the order they are driven: the first one that lands is the stop.
  const hit = roads.find(({ chance: each }) => input.rng() < each);
  if (!hit) return none;
  const seized: Record<string, number> = {};
  for (const [key, quantity] of Object.entries(input.cargo)) {
    const taken = Math.floor(Math.max(0, quantity) * rules.productSeizedFraction);
    if (taken > 0) seized[key] = taken;
  }
  const cash = input.cashCents > 0n ? input.cashCents : 0n;
  return {
    stopped: true,
    chance,
    road: { from: hit.road.from, to: hit.road.to, name: hit.road.name },
    seized,
    fineCents: BigInt(Math.floor(Number(cash) * rules.cashFineFraction)),
  };
}
