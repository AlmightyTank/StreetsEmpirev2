import type { DistrictKey, Ruleset } from '@streets/rulesets';
import { happinessMultiplier } from '../rng.js';
import { recruitmentMultiplier } from '../calculations/actions.js';
import { clientMultiplier } from '../calculations/clients.js';
import { runRules } from '../calculations/runs.js';
import {
  cityCounter,
  cityRulesetProblems,
  findRoutes,
  highMarketBaseline,
  rulesetForCity,
} from '../calculations/cities.js';

/**
 * 0.5.0-A. Is a run worth the drive? For every place to buy, place to sell and
 * product, one run from home: drive to the buy city, load up, drive to the sell
 * city, sell, drive home. It is scored per turn the drive costs and set against
 * the same crew spending those turns on the street at its best.
 *
 * Deliberately generous to travel: Pip's usual supply everywhere, the high
 * market at its baseline before anyone else has sold into it, no road stops, no
 * hijackers. 0.5.0-C and E add the risks; this is the ceiling they cut into.
 *
 * The common currency is net worth, the number rankings use. A run's profit is
 * cash, counted at the cash weight. Street work is cash at the same weight plus
 * the whores and thugs a trip recruits at their net worth, because growing the
 * crew is half of what a turn on the street is for.
 */

export interface TravelCrew {
  readonly name: string;
  readonly whores: number;
  readonly thugs: number;
  readonly lowRiders: number;
  readonly cashCents: number;
}

export const travelCrews: readonly TravelCrew[] = [
  { name: 'Fresh start', whores: 20, thugs: 5, lowRiders: 1, cashCents: 2_000_000 },
  { name: 'Mid-round', whores: 200, thugs: 50, lowRiders: 5, cashCents: 30_000_000 },
  { name: 'Late round', whores: 1_000, thugs: 250, lowRiders: 20, cashCents: 300_000_000 },
];

/** A run is "a reason to go" when it earns at least this share of street work per turn. */
export const TRAVEL_REASON_SHARE = 0.15;
const HAPPINESS = 85;
const KEEP = 0.5;

export interface TravelTrade {
  readonly crew: string;
  readonly product: string;
  readonly buyCity: string;
  readonly buyFrom: 'pip' | 'market';
  readonly sellCity: string;
  readonly sellTo: 'pip' | 'market';
  readonly units: number;
  /** What held the load down: the trunk, the cash, the shelf, or the market (more would sell for less than it cost). */
  readonly limit: 'trunk' | 'cash' | 'shelf' | 'market';
  readonly costCents: number;
  readonly revenueCents: number;
  readonly profitCents: number;
  readonly driveHours: number;
  readonly turns: number;
  readonly profitPerTurnCents: number;
  /** Net worth per turn over street work's net worth per turn. Above 1 beats the street. */
  readonly streetShare: number;
}

export interface TravelCrewSummary {
  readonly crew: TravelCrew;
  readonly district: DistrictKey;
  /** Cash kept per turn on the best block. */
  readonly streetCashPerTurnCents: number;
  /** Net worth per turn on the best block: cash at the cash weight, plus recruits. */
  readonly streetWorthPerTurnCents: number;
  readonly trades: readonly TravelTrade[];
}

/**
 * A turn on the street at its best, as net worth: the district that adds the most,
 * among those the crew's thugs can cover, with the busiest clients.
 */
export function streetPerTurn(ruleset: Ruleset, crew: TravelCrew): { district: DistrictKey; cashCents: number; worthCents: number } {
  const rules = ruleset.scouting;
  const worth = ruleset.economy.netWorth;
  const busiest = Math.max(...rules.clients.capacities);
  let best = { district: 'WINO_SLUMS' as DistrictKey, cashCents: 0, worthCents: 0 };
  for (const [key, district] of Object.entries(rules.districts) as Array<[DistrictKey, (typeof rules.districts)[DistrictKey]]>) {
    if (crew.thugs * district.protectionWhoresPerThug < crew.whores) continue;
    const cashCents = crew.whores * rules.grossPerWhorePerTurnCents * happinessMultiplier(HAPPINESS, rules.minHappinessMultiplier)
      * district.payMultiplier * clientMultiplier(busiest, crew.whores) * KEEP;
    const recruits = district.whoresPerTurn * recruitmentMultiplier(crew.whores, rules.recruitment.whoreSoftCap) * worth.perWhoreCents
      + district.thugsPerTurn * recruitmentMultiplier(crew.thugs, rules.recruitment.thugSoftCap) * worth.perThugCents;
    const worthCents = cashCents * (worth.cashWeightPercent / 100) + recruits;
    if (worthCents > best.worthCents) best = { district: key, cashCents, worthCents };
  }
  return best;
}

/** The most units worth moving: the last one still sells for more than it costs. */
function bestUnits(max: number, revenueOf: (unit: number) => number, costOf: (unit: number) => number): number {
  let low = 0;
  let high = max;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (revenueOf(mid - 1) > costOf(mid - 1)) low = mid; else high = mid - 1;
  }
  return low;
}

/** Cents for buying `units` from a high market, the price climbing 1% per `depth` units. */
function marketBuyCents(ruleset: Ruleset, city: string, product: string, units: number): number {
  const quote = highMarketBaseline(ruleset, city, product);
  if (!quote) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let unit = 0; unit < units; unit++) total += Math.round(quote.buyCents * (1 + unit / (quote.depth * 100)));
  return total;
}

/** Most units `cash` buys from a high market. */
function marketUnitsFor(ruleset: Ruleset, city: string, product: string, cash: number, cap: number): number {
  let low = 0;
  let high = cap;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (marketBuyCents(ruleset, city, product, mid) <= cash) low = mid; else high = mid - 1;
  }
  return low;
}

function legHours(ruleset: Ruleset, from: string, to: string): number {
  return from === to ? 0 : findRoutes(ruleset, from, to)[0]?.driveHours ?? Number.POSITIVE_INFINITY;
}

export function runTravelSimulation(ruleset: Ruleset, crews: readonly TravelCrew[] = travelCrews): TravelCrewSummary[] {
  const cities = Object.keys(ruleset.cities ?? {});
  const travel = ruleset.travel;
  if (!cities.length || !travel) throw new Error(`${ruleset.meta.id} has no cities.`);
  const home = ruleset.round.startingCitySlug;
  const products = Object.keys(ruleset.products ?? { CRACK: true });

  return crews.map((crew) => {
    // Street work where the crew lives, with that city's district pay (0.5.0-D).
    const street = streetPerTurn(rulesetForCity(ruleset, home), crew);
    const cashWeight = ruleset.economy.netWorth.cashWeightPercent / 100;
    const trunk = crew.lowRiders * travel.cargoPerLowRider;
    const trades: TravelTrade[] = [];

    for (const buyCity of cities) {
      for (const sellCity of cities) {
        // Home is where a run starts and ends, never a town it trades in.
        if (buyCity === sellCity || sellCity === home) continue;
        const driveHours = legHours(ruleset, home, buyCity) + legHours(ruleset, buyCity, sellCity) + legHours(ruleset, sellCity, home);
        const turns = Math.max(1, Math.ceil(driveHours * travel.turnsPerDriveHour));

        for (const product of products) {
          const counter = cityCounter(ruleset, buyCity, product);
          const buyQuote = highMarketBaseline(ruleset, buyCity, product);
          const sellCounter = cityCounter(ruleset, sellCity, product);
          const sellQuote = highMarketBaseline(ruleset, sellCity, product);
          // Unit i's price, counting from 0: Pip's is flat, a market moves 1% per `depth` units.
          // A run trades in the towns it stops at. At home it loads Pip's shelf, and (0.5.0-F,
          // where the rules allow it) buys on the home market as it leaves; it never sells there.
          const homeMarketOk = buyCity !== home || (runRules(ruleset)?.homeMarketAtLaunch ?? false);
          const sources = [
            counter && counter.shelfCap > 0
              ? { from: 'pip' as const, shelf: counter.shelfCap, costOf: () => counter.buyCents }
              : null,
            buyQuote && homeMarketOk ? { from: 'market' as const, shelf: Number.POSITIVE_INFINITY, costOf: (unit: number) => Math.round(buyQuote.buyCents * (1 + unit / (buyQuote.depth * 100))) } : null,
          ].filter((source) => source !== null);
          const sales = [
            sellQuote ? { to: 'market' as const, revenueOf: (unit: number) => Math.round(sellQuote.sellCents * Math.max(0.1, 1 - unit / (sellQuote.depth * 100))) } : null,
            // Pip buys back only where he carries it.
            sellCounter ? { to: 'pip' as const, revenueOf: () => sellCounter.sellCents } : null,
          ].filter((sale) => sale !== null);

          for (const source of sources) {
            const byCash = source.from === 'pip' ? Math.floor(crew.cashCents / source.costOf()) : marketUnitsFor(ruleset, buyCity, product, crew.cashCents, trunk);
            const max = Math.min(trunk, byCash, source.shelf);
            const limit: TravelTrade['limit'] = max === trunk ? 'trunk' : max === byCash ? 'cash' : 'shelf';
            for (const sale of sales) {
              const units = bestUnits(max, sale.revenueOf, source.costOf);
              if (units <= 0) continue;
              let cost = 0;
              let revenue = 0;
              for (let unit = 0; unit < units; unit++) { cost += source.costOf(unit); revenue += sale.revenueOf(unit); }
              const profit = revenue - cost;
              trades.push({
                crew: crew.name, product, buyCity, buyFrom: source.from, sellCity, sellTo: sale.to,
                units, limit: units < max ? 'market' : limit, costCents: cost, revenueCents: revenue, profitCents: profit,
                driveHours, turns, profitPerTurnCents: profit / turns,
                streetShare: street.worthCents > 0 ? (profit * cashWeight) / turns / street.worthCents : 0,
              });
            }
          }
        }
      }
    }
    trades.sort((a, b) => b.profitPerTurnCents - a.profitPerTurnCents);
    return { crew, district: street.district, streetCashPerTurnCents: street.cashCents, streetWorthPerTurnCents: street.worthCents, trades };
  });
}

export interface TravelGate {
  readonly problems: string[];
  /** Per city, the best share of street work a run through it earns, for the middle crew. */
  readonly reasons: Record<string, number>;
}

/**
 * The 0.5.0-A gate:
 * - the city ruleset is sound (no same-city loops, reachable, the start unchanged);
 * - for every crew, no run beats working the street at its best;
 * - for the mid-round crew, every city is worth driving to: some run buying or
 *   selling there earns at least `TRAVEL_REASON_SHARE` of the street per turn.
 */
export function travelGate(ruleset: Ruleset, summaries: readonly TravelCrewSummary[]): TravelGate {
  const problems = [...cityRulesetProblems(ruleset)];
  for (const summary of summaries) {
    const best = summary.trades[0];
    if (best && best.streetShare > 1) {
      problems.push(`${summary.crew.name}: ${describe(ruleset, best)} earns ${percent(best.streetShare)} of the street per turn.`);
    }
  }
  const middle = summaries.find((summary) => summary.crew.name === 'Mid-round') ?? summaries[Math.floor(summaries.length / 2)];
  const reasons: Record<string, number> = {};
  for (const slug of Object.keys(ruleset.cities ?? {})) {
    reasons[slug] = Math.max(0, ...(middle?.trades ?? []).filter((trade) => trade.buyCity === slug || trade.sellCity === slug).map((trade) => trade.streetShare));
    if (slug !== ruleset.round.startingCitySlug && reasons[slug]! < TRAVEL_REASON_SHARE) {
      problems.push(`${ruleset.cities![slug]!.name}: its best run earns ${percent(reasons[slug]!)} of the street per turn, under ${percent(TRAVEL_REASON_SHARE)}.`);
    }
  }
  return { problems, reasons };
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const name = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;
const money = (cents: number) => `${cents < 0 ? '-' : ''}$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;

function describe(ruleset: Ruleset, trade: TravelTrade): string {
  return `${trade.product} from ${name(ruleset, trade.buyCity)} (${trade.buyFrom === 'pip' ? "Pip's" : 'market'}) to ${name(ruleset, trade.sellCity)} (${trade.sellTo === 'pip' ? "Pip's" : 'market'})`;
}

export function travelMarkdown(ruleset: Ruleset, summaries: readonly TravelCrewSummary[]): string {
  const gate = travelGate(ruleset, summaries);
  const lines = [
    `# Travel simulation - ${ruleset.meta.version}`,
    '',
    `Ruleset \`${ruleset.meta.id}\`. One run from ${name(ruleset, ruleset.round.startingCitySlug)}: drive to the buy city, load up, drive to the sell city, sell, drive home, on the shortest roads. `
      + `${ruleset.travel!.turnsPerDriveHour} turn${ruleset.travel!.turnsPerDriveHour === 1 ? '' : 's'} per drive hour, ${ruleset.travel!.cargoPerLowRider} units per Low-Rider, Pip's usual supply, the high market from its baseline with its depth, no road stops and no hijackers.`,
    '',
    'Street work is the same crew on the best block its thugs can cover, at 85% happiness, the busiest clients and a 50% payout. '
      + `Both are counted as net worth, the number rankings use: cash at ${ruleset.economy.netWorth.cashWeightPercent}%, and the whores and thugs a trip recruits at their net worth. `
      + 'Each run carries the load that earns the most: past that, one more unit sells for less than it costs.',
    '',
  ];
  for (const summary of summaries) {
    lines.push(
      `## ${summary.crew.name}`,
      '',
      `${summary.crew.whores} whores, ${summary.crew.thugs} thugs, ${summary.crew.lowRiders} Low-Rider${summary.crew.lowRiders === 1 ? '' : 's'} (${summary.crew.lowRiders * ruleset.travel!.cargoPerLowRider} units), ${money(summary.crew.cashCents)}. `
        + `Street work: ${money(summary.streetWorthPerTurnCents)} of net worth a turn in the ${ruleset.scouting.districts[summary.district].name} (${money(summary.streetCashPerTurnCents)} of it cash).`,
      '',
      '| Run | Units | Held by | Profit | Drive | Turns | Cash per turn | Of street |',
      '| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |',
      ...summary.trades.slice(0, 8).map((trade) =>
        `| ${describe(ruleset, trade)} | ${trade.units} | ${trade.limit} | ${money(trade.profitCents)} | ${trade.driveHours}h | ${trade.turns} | ${money(trade.profitPerTurnCents)} | ${percent(trade.streetShare)} |`),
      '',
    );
  }
  lines.push(
    '## A reason to go',
    '',
    `The best run through each city, buying or selling there, for the mid-round crew. The gate asks for ${percent(TRAVEL_REASON_SHARE)} of street work a turn outside the starting city.`,
    '',
    '| City | Best run, of street |',
    '| --- | ---: |',
    ...Object.entries(gate.reasons).map(([slug, share]) => `| ${name(ruleset, slug)} | ${percent(share)} |`),
    '',
    '## Gate',
    '',
    gate.problems.length ? gate.problems.map((line) => `- ${line}`).join('\n') : '- Passes: no run beats the street for any crew, every city has a reason to go, and no city makes a same-city loop.',
    '',
  );
  return lines.join('\n');
}

/**
 * 0.5.0-D. Where to live: street work per turn for each crew living in each city, with
 * the city's district pay, against the starting city. A report, not a gate: the
 * cities that pay more on the block pay for it elsewhere (Pip's prices, Heat lines),
 * which street work alone does not show.
 */
export function livingMarkdown(ruleset: Ruleset, crews: readonly TravelCrew[] = travelCrews): string {
  const cities = Object.keys(ruleset.cities ?? {});
  const home = ruleset.round.startingCitySlug;
  const lines = [
    `# Where to live - ${ruleset.meta.version}`,
    '',
    `Street work per turn living in each city, against ${name(ruleset, home)}, on the best block the crew can cover. The Heat lines are listed because they are part of what the better blocks cost; so are Pip's home prices, which follow each city's character.`,
    '',
    `| City | Busts from | Arrests from | ${crews.map((crew) => crew.name).join(' | ')} |`,
    `| --- | ---: | ---: | ${crews.map(() => '---:').join(' | ')} |`,
  ];
  for (const slug of cities) {
    const city = ruleset.cities![slug]!;
    const shares = crews.map((crew) => {
      const base = streetPerTurn(rulesetForCity(ruleset, home), crew).worthCents;
      const here = streetPerTurn(rulesetForCity(ruleset, slug), crew);
      return `${percent(base > 0 ? here.worthCents / base : 0)} (${ruleset.scouting.districts[here.district].name})`;
    });
    lines.push(`| ${city.name} | ${city.heat.bustStartsAt} | ${city.heat.arrestStartsAt} | ${shares.join(' | ')} |`);
  }
  lines.push('');
  return lines.join('\n');
}
