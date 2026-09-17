import type { DistrictKey, Ruleset } from '@streets/rulesets';
import { happinessMultiplier } from '../rng.js';
import { recruitmentMultiplier } from '../calculations/actions.js';
import { bustChance, heatTakeMultiplier } from '../calculations/heat.js';
import { productEconomy } from '../calculations/product-economy.js';
import { heatCrewFactor, productSliceEffects } from '../calculations/work-supply.js';

/**
 * 0.4.0-E. A whole round of work with products, as expected values: 28 days of
 * Scout trips, buying product at Pip's within his shelves, Heat rising, cooling
 * and busting, the crew growing. It answers one question: is any single product
 * the automatic answer across a round?
 *
 * Deliberately narrower than the game: happiness is held steady, girls are
 * covered, and cash is the score. Combat, cooking and bribes are left out so the
 * work strategies are compared on their own.
 */

export interface RoundPlayStyle {
  readonly name: string;
  readonly purpose: string;
  /** Turns spent per session. */
  readonly sessionTurns: number;
  readonly sessionsPerDay: number;
  /** Turn intervals per turn spent inside a session: 0 when a banked cap is spent at once. */
  readonly intervalsPerTurn: number;
}

export const roundPlayStyles: readonly RoundPlayStyle[] = [
  { name: 'Twice a day', purpose: 'A banked cap of 144 turns, spent at once, morning and evening. Shelves and Heat reset between sessions.', sessionTurns: 144, sessionsPerDay: 2, intervalsPerTurn: 0 },
  { name: 'All day', purpose: '576 turns a day at the regeneration pace, so shelves refill and Heat cools as you go.', sessionTurns: 576, sessionsPerDay: 1, intervalsPerTurn: 0.5 },
];

/** Where a player spends their trips, by share of turns. Rich blocks for money, poor ones for crew. */
export const roundDistrictMix: ReadonlyArray<readonly [DistrictKey, number]> = [
  ['CASINO', 0.3], ['NIGHTCLUB', 0.25], ['URBAN_GHETTO', 0.15], ['LOW_RENT', 0.15], ['WINO_SLUMS', 0.15],
];

export interface RoundStrategy {
  readonly name: string;
  /** True when one product is used on every job. The gate is about these. */
  readonly singleProduct: boolean;
  /** The products a trip runs on, in policy order, given the district and the Heat it starts at. */
  readonly productFor: (district: DistrictKey, heat: number, ruleset: Ruleset) => readonly string[];
}

function everywhere(product: string): RoundStrategy {
  // Crack as the fallback, the way the supply policy defaults.
  return { name: `${product.charAt(0)}${product.slice(1).toLowerCase()} everywhere`, singleProduct: true, productFor: () => (product === 'CRACK' ? ['CRACK'] : [product, 'CRACK']) };
}

export const roundStrategies: readonly RoundStrategy[] = [
  { ...everywhere('CRACK'), name: 'Crack only' },
  everywhere('WEED'),
  everywhere('ECSTASY'),
  everywhere('COCAINE'),
  everywhere('METH'),
  everywhere('HEROIN'),
  {
    name: 'District fit',
    singleProduct: false,
    productFor: (district) => (district === 'CASINO' || district === 'NIGHTCLUB' ? ['ECSTASY', 'CRACK'] : ['CRACK']),
  },
  {
    name: 'Fit, Cocaine while cool',
    singleProduct: false,
    productFor: (district, heat, ruleset) => {
      const cool = heat < (ruleset.heat?.drag.startsAt ?? 0) - 10;
      if (district === 'CASINO') return cool ? ['COCAINE', 'ECSTASY', 'CRACK'] : ['ECSTASY', 'CRACK'];
      if (district === 'NIGHTCLUB') return ['ECSTASY', 'CRACK'];
      return heat >= (ruleset.heat?.drag.startsAt ?? 100) ? ['WEED', 'CRACK'] : ['CRACK'];
    },
  },
];

export interface RoundCrew {
  readonly name: string;
  readonly whores: number;
  readonly cashCents: number;
}

export const roundCrews: readonly RoundCrew[] = [
  { name: 'Fresh start', whores: 20, cashCents: 2_000_000 },
  { name: 'Mid-round start', whores: 200, cashCents: 30_000_000 },
];

export interface RoundSummary {
  readonly style: string;
  readonly crew: string;
  readonly strategy: string;
  readonly singleProduct: boolean;
  readonly finalCashCents: number;
  readonly finalWhores: number;
  readonly productCostCents: number;
  readonly busts: number;
  readonly finesCents: number;
  readonly averageHeat: number;
  /** Share of wanted product Pip's shelves could not supply, so it fell back to crack. */
  readonly shortShare: number;
  /** Cash plus whores at net worth value. */
  readonly scoreCents: number;
}

const TRIP_TURNS = 12;
const KEEP = 0.5;
const HAPPINESS = 85;

interface Shelf { stock: number; cap: number; perInterval: number; intervalMinutes: number; buyCents: number; waited: number }

function shelves(ruleset: Ruleset): Map<string, Shelf> {
  const map = new Map<string, Shelf>();
  const crack = ruleset.stores.PIP.items.CRACK;
  if (crack?.restock) map.set('CRACK', { stock: crack.restock.cap, cap: crack.restock.cap, perInterval: crack.restock.perInterval ?? 1, intervalMinutes: crack.restock.intervalMinutes, buyCents: crack.buyCents, waited: 0 });
  for (const key of Object.keys(ruleset.products ?? {})) {
    const pip = productEconomy(ruleset, key)?.pip;
    if (pip) map.set(key, { stock: pip.restock.cap, cap: pip.restock.cap, perInterval: pip.restock.perInterval, intervalMinutes: pip.restock.intervalMinutes, buyCents: pip.buyCents, waited: 0 });
  }
  return map;
}

/** Deliveries land on whole intervals; part of an interval carries over, as the lazy shelf clock does. */
function restock(shelf: Shelf, minutes: number): void {
  if (shelf.stock >= shelf.cap) { shelf.waited = 0; return; }
  shelf.waited += minutes;
  const deliveries = Math.floor(shelf.waited / shelf.intervalMinutes);
  shelf.waited -= deliveries * shelf.intervalMinutes;
  shelf.stock = Math.min(shelf.cap, shelf.stock + deliveries * shelf.perInterval);
}

export function simulateProductRound(ruleset: Ruleset, input: { style: RoundPlayStyle; crew: RoundCrew; strategy: RoundStrategy; days?: number }): RoundSummary {
  const { style, crew, strategy } = input;
  const heatRules = ruleset.heat;
  const supply = ruleset.workSupply;
  if (!heatRules || !supply) throw new Error(`${ruleset.meta.id} has no Heat or work supply.`);
  const days = input.days ?? ruleset.round.defaultDurationDays;
  const shelf = shelves(ruleset);
  const intervalMinutes = ruleset.turns.intervalMinutes;

  let whores = crew.whores;
  let cash = crew.cashCents;
  let heat = 0;
  let heatTurns = 0;
  let heatSum = 0;
  let productCost = 0;
  let busts = 0;
  let fines = 0;
  let wanted = 0;
  let short = 0;
  let trip = 0;

  // Trips cycle through the district mix in proportion to its shares.
  const schedule: DistrictKey[] = roundDistrictMix.flatMap(([district, share]) => Array.from({ length: Math.round(share * 20) }, () => district));

  for (let day = 0; day < days; day++) {
    for (let session = 0; session < style.sessionsPerDay; session++) {
      if (style.intervalsPerTurn === 0) {
        // Away between sessions: the day split evenly, Heat cooling and shelves refilling the whole time.
        const gap = (24 * 60) / style.sessionsPerDay;
        heat = Math.max(0, heat - Math.floor(gap / intervalMinutes) * heatRules.decayPerInterval);
        for (const row of shelf.values()) restock(row, gap);
      }
      for (let spent = 0; spent < style.sessionTurns; spent += TRIP_TURNS) {
        const turns = Math.min(TRIP_TURNS, style.sessionTurns - spent);
        const district = schedule[trip++ % schedule.length]!;
        const definition = ruleset.scouting.districts[district];
        const order = strategy.productFor(district, heat, ruleset);
        const need = Math.ceil(whores * supply.productPerWhorePerTurn * turns);

        // Buy what the trip needs off each shelf in policy order; whatever is left runs dry.
        let left = need;
        let cost = 0;
        const slices = order.map((product, index) => {
          const row = shelf.get(product);
          const units = Math.min(left, row?.stock ?? 0);
          if (row) row.stock -= units;
          left -= units;
          cost += units * (row?.buyCents ?? 0);
          if (index === 0) short += need - units;
          return { share: need ? units / need : index === 0 ? 1 : 0, effects: productSliceEffects(ruleset, product, 'hoes', district) };
        });
        wanted += need;
        const dryShare = need ? left / need : 0;
        const take = slices.reduce((sum, slice) => sum + slice.share * slice.effects.takeMultiplier, 0) + dryShare * supply.dryTakeMultiplier;
        const recruit = slices.reduce((sum, slice) => sum + slice.share * slice.effects.recruitmentMultiplier, 0) + dryShare;
        const heatPerTurn = slices.reduce((sum, slice) => sum + slice.share * slice.effects.heatPerTurn, 0);

        const gross = whores * ruleset.scouting.grossPerWhorePerTurnCents * turns
          * happinessMultiplier(HAPPINESS, ruleset.scouting.minHappinessMultiplier)
          * definition.payMultiplier * take * heatTakeMultiplier(heat, ruleset);
        const chance = bustChance(heat, ruleset);
        const fine = chance * heatRules.bust.cashFineFraction * Math.max(0, cash + gross * KEEP - cost);

        cash += gross * KEEP - cost - fine;
        productCost += cost;
        busts += chance;
        fines += fine;
        whores += definition.whoresPerTurn * turns * recruitmentMultiplier(whores, ruleset.scouting.recruitment.whoreSoftCap) * recruit;

        heat = Math.min(heatRules.max, Math.max(0, heat + turns * heatPerTurn * heatCrewFactor(ruleset, 'hoes', whores) - chance * heatRules.bust.heatDrop));
        heatSum += heat * turns;
        heatTurns += turns;

        if (style.intervalsPerTurn > 0) {
          const passed = turns * style.intervalsPerTurn * intervalMinutes;
          heat = Math.max(0, heat - turns * style.intervalsPerTurn * heatRules.decayPerInterval);
          for (const row of shelf.values()) restock(row, passed);
        }
      }
    }
  }

  return {
    style: style.name, crew: crew.name, strategy: strategy.name, singleProduct: strategy.singleProduct,
    finalCashCents: Math.round(cash), finalWhores: whores, productCostCents: Math.round(productCost),
    busts, finesCents: Math.round(fines), averageHeat: heatTurns ? heatSum / heatTurns : 0,
    shortShare: wanted ? short / wanted : 0,
    scoreCents: Math.round(cash + whores * ruleset.economy.netWorth.perWhoreCents),
  };
}

export function runProductRoundSimulation(ruleset: Ruleset, days?: number): RoundSummary[] {
  return roundPlayStyles.flatMap((style) => roundCrews.flatMap((crew) => roundStrategies.map((strategy) =>
    simulateProductRound(ruleset, { style, crew, strategy, days }))));
}

/** The 0.4.0-E round gate: in every play style and start, a mixed strategy beats every single-product one. */
export function productRoundGate(rows: readonly RoundSummary[]): string[] {
  const problems: string[] = [];
  const groups = new Map<string, RoundSummary[]>();
  for (const row of rows) groups.set(`${row.style} · ${row.crew}`, [...(groups.get(`${row.style} · ${row.crew}`) ?? []), row]);
  for (const [situation, group] of groups) {
    const best = [...group].sort((a, b) => b.scoreCents - a.scoreCents)[0]!;
    if (best.singleProduct) problems.push(`${situation}: ${best.strategy} wins the round.`);
  }
  return problems;
}

export function productRoundMarkdown(ruleset: Ruleset, rows: readonly RoundSummary[]): string {
  const money = (cents: number) => `${cents < 0 ? '-' : ''}$${Math.abs(Math.round(cents / 100)).toLocaleString('en-US')}`;
  const problems = productRoundGate(rows);
  const lines = [
    '# 0.4.0-E full-round product simulation', '',
    `Ruleset: ${ruleset.meta.id}. ${ruleset.round.defaultDurationDays} days of Scout trips, ${TRIP_TURNS} turns each, as expected values.`,
    `Trips cycle through ${roundDistrictMix.map(([district, share]) => `${ruleset.scouting.districts[district].name} ${Math.round(share * 100)}%`).join(', ')}.`,
    `Whore happiness is held at ${HAPPINESS}, girls are covered, the cut is 50%. Product is bought at Pip's price within his shelves; whatever`,
    'a shelf cannot supply falls back to crack, then runs dry. Heat rises, cools and busts as in play. Combat, cooking and bribes are left out.',
    'Score is final cash plus whores at their net worth value.', '',
    '## Gate', '',
    problems.length ? `**Fails.**\n\n${problems.map((line) => `- ${line}`).join('\n')}` : '**Passes.** In every play style and start, a strategy that mixes products by district beats every single-product strategy.',
    '',
  ];
  for (const style of roundPlayStyles) {
    lines.push(`## ${style.name}`, '', style.purpose, '');
    for (const crew of roundCrews) {
      lines.push(`### ${crew.name} (${crew.whores} whores, ${money(crew.cashCents)})`, '',
        '| Strategy | Score | Cash | Whores | Spent on product | Busts | Fines | Average Heat | Short at Pip\'s |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
      const group = rows.filter((row) => row.style === style.name && row.crew === crew.name).sort((a, b) => b.scoreCents - a.scoreCents);
      for (const row of group) {
        lines.push(`| ${row.strategy} | ${money(row.scoreCents)} | ${money(row.finalCashCents)} | ${Math.round(row.finalWhores).toLocaleString('en-US')} | ${money(row.productCostCents)} | ${row.busts.toFixed(1)} | ${money(row.finesCents)} | ${row.averageHeat.toFixed(0)} | ${Math.round(row.shortShare * 100)}% |`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}
