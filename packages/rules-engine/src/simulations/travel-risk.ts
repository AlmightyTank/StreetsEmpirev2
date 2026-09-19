import type { Ruleset } from '@streets/rulesets';
import { hashParts, seededRng } from '../rng.js';
import { cityHeatRules, cityRulesetProblems, findRoutes, highMarketBaseline } from '../calculations/cities.js';
import { fillMarket, liveCounter, marketView, settlePush } from '../calculations/markets.js';
import { bustChance } from '../calculations/heat.js';
import { resolveRoadStop, resolveRunTrouble, saleHeat } from '../calculations/road-risk.js';
import { runTravelSimulation, type TravelCrewSummary, type TravelTrade } from './travel.js';

/**
 * 0.5.0-C. The same runs as the 0.5.0-A simulation, driven through live rounds: Pip's
 * supply swings, gluts and droughts, the high market at whatever the schedule says,
 * police stops on every leg, Heat from selling and the town's busts and arrests.
 *
 * Each crew's best planned runs are driven many times, from different rounds and
 * departure times, at a spread of starting Heat. The runner adapts only as a player
 * could: they skip a buy that already costs more than they planned to sell for.
 *
 * The gate asks three things of it:
 * - the range is wide: the good runs are well above the plan and the bad ones well below;
 * - the expected value holds: the average stays near the plan, so risk is swing and not tax;
 * - no run beats working the street at its best, even on average.
 * and, of the market alone, that a player cannot pump a price and cash it out.
 */

export const RISK_SAMPLES = 400;
/** The plans per crew driven through live rounds. */
const PLANS_PER_CREW = 5;
/** The average may sit this far below or above the plan. */
export const RISK_EV_BAND = { low: 0.75, high: 1.1 };
/** The 10th and 90th percentile must sit at least this far either side of the plan. */
export const RISK_WIDTH = { below: 0.85, above: 1.1 };
const START_HEAT_MAX = 60;
const DAY = 24 * 60 * 60_000;
const EPOCH = Date.UTC(2026, 0, 5);

export interface RiskOutcome {
  profitCents: number;
  stopped: boolean;
  trouble: 'BUST' | 'ARREST' | null;
  /** Anything the schedule did to the plan: a swing or event at either end. */
  moved: boolean;
  skipped: boolean;
}

export interface RiskPlanSummary {
  trade: TravelTrade;
  plannedProfitCents: number;
  meanProfitCents: number;
  p10Cents: number;
  p50Cents: number;
  p90Cents: number;
  stopRate: number;
  troubleRate: number;
  movedRate: number;
  skipRate: number;
  /** Mean net worth per turn over the street's. */
  meanStreetShare: number;
}

export interface RiskCrewSummary {
  crew: TravelCrewSummary['crew'];
  streetWorthPerTurnCents: number;
  plans: RiskPlanSummary[];
}

function legRoute(ruleset: Ruleset, from: string, to: string): string[] {
  return from === to ? [from] : findRoutes(ruleset, from, to)[0]?.cities ?? [from, to];
}

function legMs(ruleset: Ruleset, route: readonly string[]): number {
  const hours = findRoutes(ruleset, route[0]!, route[route.length - 1]!)[0]?.driveHours ?? 0;
  return route.length < 2 ? 0 : hours * (ruleset.travel?.gameMinutesPerDriveHour ?? 0) * 60_000;
}

/** Drive one planned run once, in one round, from one moment, at one starting Heat. */
export function driveRiskRun(ruleset: Ruleset, trade: TravelTrade, sample: number, cashCents: number, escorts: number): RiskOutcome {
  const seed = `sim-${sample}`;
  const rng = seededRng(hashParts(seed, trade.crew, trade.product, trade.buyCity, trade.sellCity, trade.buyFrom, trade.sellTo));
  const home = ruleset.round.startingCitySlug;
  let heat = Math.floor(rng() * (START_HEAT_MAX + 1));
  const heatMax = ruleset.heat?.max ?? 100;
  let t = EPOCH + Math.floor(rng() * 7 * DAY);
  let cash = BigInt(cashCents);
  let stopped = false;
  let trouble: RiskOutcome['trouble'] = null;
  let moved = false;
  let skipped = false;
  const cargo: Record<string, number> = {};
  let spent = 0n;
  let earned = 0n;

  const drive = (from: string, to: string) => {
    const route = legRoute(ruleset, from, to);
    if (route.length < 2) return;
    t += legMs(ruleset, route);
    const stop = resolveRoadStop(ruleset, { route, cargo, cashCents: cash, escorts, heat, rng });
    if (stop.stopped) {
      stopped = true;
      for (const [key, units] of Object.entries(stop.seized)) cargo[key] = (cargo[key] ?? 0) - units;
      cash -= stop.fineCents;
    }
  };
  const troubleAt = (city: string) => {
    const town = { ...ruleset, heat: cityHeatRules(ruleset, city) };
    const roll = resolveRunTrouble({ heat, cashCents: cash, cargo, ruleset: town, bustChance: bustChance(heat, town), rng });
    if (roll.kind) {
      trouble = trouble === 'ARREST' ? 'ARREST' : roll.kind;
      for (const [key, units] of Object.entries(roll.seized)) cargo[key] = (cargo[key] ?? 0) - units;
      cash -= roll.fineCents;
      heat = roll.heatAfter;
    }
    return roll.kind === 'ARREST';
  };

  drive(home, trade.buyCity);
  const plannedSaleUnit = trade.units > 0 ? trade.revenueCents / trade.units : 0;
  const at = new Date(t);
  const pip = liveCounter(ruleset, seed, trade.buyCity, trade.product, at);
  const usual = ruleset.cities?.[trade.buyCity]?.products[trade.product]?.supply ?? null;
  if (pip?.supply !== usual) moved = true;
  let bought = 0;
  if (trade.buyFrom === 'pip') {
    const units = pip ? Math.min(trade.units, pip.shelfCap, Math.floor(Number(cash) / pip.buyCents)) : 0;
    if (pip && units > 0 && pip.buyCents < plannedSaleUnit) {
      const cost = BigInt(pip.buyCents) * BigInt(units);
      cash -= cost;
      spent += cost;
      bought = units;
    }
  } else {
    const view = marketView(ruleset, seed, trade.buyCity, trade.product, 0, at);
    if (view?.event) moved = true;
    if (view && view.buyCents < plannedSaleUnit) {
      let units = trade.units;
      let fill = fillMarket(view, ruleset.travel!.market!, 'buy', units);
      while (units > 0 && fill.totalCents > cash) { units = Math.floor(units * 0.9); fill = fillMarket(view, ruleset.travel!.market!, 'buy', units); }
      if (units > 0) { cash -= fill.totalCents; spent += fill.totalCents; bought = units; }
    }
  }
  if (bought === 0) skipped = true;
  cargo[trade.product] = bought;
  const arrestedBuying = bought > 0 && troubleAt(trade.buyCity);

  if (!arrestedBuying && (cargo[trade.product] ?? 0) > 0) {
    drive(trade.buyCity, trade.sellCity);
    const sellAt = new Date(t);
    const units = Math.max(0, cargo[trade.product] ?? 0);
    let revenue = 0n;
    if (trade.sellTo === 'pip') {
      const counter = liveCounter(ruleset, seed, trade.sellCity, trade.product, sellAt);
      if (counter) revenue = BigInt(counter.sellCents) * BigInt(units);
      if (counter?.supply !== ruleset.cities?.[trade.sellCity]?.products[trade.product]?.supply) moved = true;
    } else {
      const view = marketView(ruleset, seed, trade.sellCity, trade.product, settlePush(null, ruleset.travel!.market!, sellAt), sellAt);
      if (view) {
        revenue = fillMarket(view, ruleset.travel!.market!, 'sell', units).totalCents;
        if (view.event || view.supply !== ruleset.cities?.[trade.sellCity]?.products[trade.product]?.supply) moved = true;
      }
    }
    // The town rolls on the Heat the run arrived with; the sale's own Heat lands after.
    const arrestedSelling = troubleAt(trade.sellCity);
    const kept = Math.max(0, cargo[trade.product] ?? 0);
    const soldShare = units > 0 ? (arrestedSelling ? 0 : kept / units) : 0;
    const takings = BigInt(Math.floor(Number(revenue) * soldShare));
    cash += takings;
    earned += takings;
    cargo[trade.product] = 0;
    heat = Math.min(heatMax, heat + saleHeat(ruleset, trade.sellCity, takings));
  }
  drive(arrestedBuying ? trade.buyCity : trade.sellCity, home);
  // Whatever is still in the trunk comes home at no value here: the plan was to sell it.
  const fines = BigInt(cashCents) - spent + earned - cash;
  return { profitCents: Number(earned - spent - fines), stopped, trouble, moved, skipped };
}

function percentile(sorted: readonly number[], share: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(share * sorted.length)))]!;
}

export function runTravelRiskSimulation(ruleset: Ruleset, samples: number = RISK_SAMPLES): RiskCrewSummary[] {
  if (!ruleset.travel?.market) throw new Error(`${ruleset.meta.id} has no live high market.`);
  const cashWeight = ruleset.economy.netWorth.cashWeightPercent / 100;
  return runTravelSimulation(ruleset).map((summary) => {
    // The best few plans, one per product and pair of cities, so the top is not one route five ways.
    const seen = new Set<string>();
    const plans = summary.trades.filter((trade) => {
      const key = `${trade.product}:${trade.buyCity}:${trade.sellCity}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, PLANS_PER_CREW);
    const escorts = Math.min(summary.crew.thugs, summary.crew.lowRiders * ruleset.lowRiderThugCapacity);
    return {
      crew: summary.crew,
      streetWorthPerTurnCents: summary.streetWorthPerTurnCents,
      plans: plans.map((trade) => {
        // The run carries what the plan spends and a tenth more, not the whole bankroll.
        const carried = Math.min(summary.crew.cashCents, Math.ceil(trade.costCents * 1.1));
        const outcomes = Array.from({ length: samples }, (_, sample) => driveRiskRun(ruleset, trade, sample, carried, escorts));
        const profits = outcomes.map((outcome) => outcome.profitCents).sort((a, b) => a - b);
        const mean = profits.reduce((sum, value) => sum + value, 0) / profits.length;
        const rate = (test: (outcome: RiskOutcome) => boolean) => outcomes.filter(test).length / outcomes.length;
        return {
          trade,
          plannedProfitCents: trade.profitCents,
          meanProfitCents: mean,
          p10Cents: percentile(profits, 0.1),
          p50Cents: percentile(profits, 0.5),
          p90Cents: percentile(profits, 0.9),
          stopRate: rate((outcome) => outcome.stopped),
          troubleRate: rate((outcome) => outcome.trouble !== null),
          movedRate: rate((outcome) => outcome.moved),
          skipRate: rate((outcome) => outcome.skipped),
          meanStreetShare: summary.streetWorthPerTurnCents > 0 ? (mean * cashWeight) / trade.turns / summary.streetWorthPerTurnCents : 0,
        };
      }),
    };
  });
}

/**
 * Pump and cash out: buy into a market, then sell the same units back, straight away
 * or after the push has worn off some. Every city and product, at the baseline and at
 * a spread of order sizes. Any of these that makes money is a problem.
 */
export function pumpProblems(ruleset: Ruleset): string[] {
  const rules = ruleset.travel?.market;
  if (!rules) return [];
  const problems: string[] = [];
  const at = new Date(EPOCH);
  for (const city of Object.keys(ruleset.cities ?? {})) {
    for (const product of Object.keys(ruleset.products ?? { CRACK: true })) {
      const depth = ruleset.cities![city]!.marketDepth;
      for (const units of [1, 10, depth, depth * 10, depth * 60]) {
        const view = marketView(ruleset, 'pump', city, product, 0, at);
        if (!view || !highMarketBaseline(ruleset, city, product)) continue;
        const bought = fillMarket(view, rules, 'buy', units);
        for (const waitMinutes of [0, 30, rules.recoveryHalfLifeMinutes * 3]) {
          const later = new Date(at.getTime() + waitMinutes * 60_000);
          const push = settlePush({ push: bought.pushAfter, pushAt: at }, rules, later);
          const sold = fillMarket(marketView(ruleset, 'pump', city, product, push, at)!, rules, 'sell', units);
          if (sold.totalCents >= bought.totalCents) {
            problems.push(`${ruleset.cities![city]!.name} ${product}: buying ${units} and selling them back after ${waitMinutes} minutes does not lose.`);
          }
          // Dump first, then buy back cheap.
          const dumped = fillMarket(view, rules, 'sell', units);
          const back = fillMarket(marketView(ruleset, 'pump', city, product, settlePush({ push: dumped.pushAfter, pushAt: at }, rules, later), at)!, rules, 'buy', units);
          if (dumped.totalCents >= back.totalCents) {
            problems.push(`${ruleset.cities![city]!.name} ${product}: selling ${units} and buying them back after ${waitMinutes} minutes does not lose.`);
          }
        }
      }
    }
  }
  return problems;
}

export interface TravelRiskGate {
  problems: string[];
}

export function travelRiskGate(ruleset: Ruleset, summaries: readonly RiskCrewSummary[]): TravelRiskGate {
  const problems = [...cityRulesetProblems(ruleset), ...pumpProblems(ruleset)];
  for (const summary of summaries) {
    const best = [...summary.plans].sort((a, b) => b.meanStreetShare - a.meanStreetShare)[0];
    if (best && best.meanStreetShare > 1) problems.push(`${summary.crew.name}: ${describe(ruleset, best.trade)} averages ${percent(best.meanStreetShare)} of the street per turn.`);
    for (const plan of summary.plans) {
      const planned = plan.plannedProfitCents;
      if (planned <= 0) continue;
      const ratio = plan.meanProfitCents / planned;
      if (ratio < RISK_EV_BAND.low || ratio > RISK_EV_BAND.high) {
        problems.push(`${summary.crew.name}: ${describe(ruleset, plan.trade)} averages ${percent(ratio)} of its plan, outside ${percent(RISK_EV_BAND.low)}-${percent(RISK_EV_BAND.high)}.`);
      }
    }
    const top = summary.plans[0];
    if (top && top.plannedProfitCents > 0 && !(top.p10Cents <= top.plannedProfitCents * RISK_WIDTH.below && top.p90Cents >= top.plannedProfitCents * RISK_WIDTH.above)) {
      problems.push(`${summary.crew.name}: ${describe(ruleset, top.trade)} is too steady: 10th to 90th percentile ${percent(top.p10Cents / top.plannedProfitCents)}-${percent(top.p90Cents / top.plannedProfitCents)} of plan.`);
    }
  }
  return { problems };
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;
const money = (cents: number) => `${cents < 0 ? '-' : ''}$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;

function describe(ruleset: Ruleset, trade: TravelTrade): string {
  return `${trade.product} from ${cityName(ruleset, trade.buyCity)} (${trade.buyFrom === 'pip' ? "Pip's" : 'market'}) to ${cityName(ruleset, trade.sellCity)} (${trade.sellTo === 'pip' ? "Pip's" : 'market'})`;
}

export function travelRiskMarkdown(ruleset: Ruleset, summaries: readonly RiskCrewSummary[], samples: number = RISK_SAMPLES): string {
  const gate = travelRiskGate(ruleset, summaries);
  const lines = [
    `# Travel risk simulation - ${ruleset.meta.version}`,
    '',
    `Ruleset \`${ruleset.meta.id}\`. Each crew's best planned runs from the 0.5.0-A simulation, driven ${samples} times each through live rounds: `
      + `a different seeded round and departure time every time, starting Heat anywhere from 0 to ${START_HEAT_MAX}, every escort the cars seat, and the plan's cost and a tenth more in cash. `
      + "Pip's supply swings, gluts and droughts, the high market at the schedule's price, police stops on every leg, the towns' busts and arrests, and Heat from selling all apply. "
      + 'The runner skips a buy that already costs more than they planned to sell for, and nothing else.',
    '',
    `The gate: the average stays within ${percent(RISK_EV_BAND.low)}-${percent(RISK_EV_BAND.high)} of the plan; the best plan's 10th percentile is at most ${percent(RISK_WIDTH.below)} of it and its 90th at least ${percent(RISK_WIDTH.above)}; `
      + 'no run averages more than the street; and nobody can pump a high market and cash it out.',
    '',
  ];
  for (const summary of summaries) {
    lines.push(
      `## ${summary.crew.name}`,
      '',
      `Street work: ${money(summary.streetWorthPerTurnCents)} of net worth a turn.`,
      '',
      '| Run | Plan | Average | 10th | Median | 90th | Stopped | Busted | Moved | Skipped | Of street |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...summary.plans.map((plan) =>
        `| ${describe(ruleset, plan.trade)} | ${money(plan.plannedProfitCents)} | ${money(plan.meanProfitCents)} | ${money(plan.p10Cents)} | ${money(plan.p50Cents)} | ${money(plan.p90Cents)} | ${percent(plan.stopRate)} | ${percent(plan.troubleRate)} | ${percent(plan.movedRate)} | ${percent(plan.skipRate)} | ${percent(plan.meanStreetShare)} |`),
      '',
    );
  }
  lines.push('## Gate', '', gate.problems.length ? gate.problems.map((line) => `- ${line}`).join('\n') : '- Passes: wide outcomes, the average holds, no run beats the street, and no market can be pumped.', '');
  return lines.join('\n');
}
