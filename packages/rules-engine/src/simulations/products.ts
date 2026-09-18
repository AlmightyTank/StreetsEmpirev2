import type { ProductEffects, Ruleset } from '@streets/rulesets';
import { happinessMultiplier } from '../rng.js';
import { recruitmentMultiplier } from '../calculations/actions.js';
import { bribeCentsPerPoint, bustChance, heatTakeMultiplier } from '../calculations/heat.js';
import { COOK_JOB, heatCrewFactor, productSliceEffects, type WorkSupplyRole } from '../calculations/work-supply.js';
import { productEconomy, productLoops, productRecipes } from '../calculations/product-economy.js';

/**
 * 0.4.0-C. Product effects and Heat, simulated as expected values before they
 * reach players. Every row runs one product on one job for a whole horizon of
 * turns, fully supplied, with no dice: take, recruits, departures and busts are
 * their expectations, so differences come from the rules alone.
 *
 * Assumptions, all stated in the report: girls fully covered and on a block with
 * room for them, a 50% cut, a product buffer of two trips on hand when a bust
 * lands, and each whore worth a day's baseline take when she joins or walks.
 */

export interface ProductPlayStyle {
  readonly name: string;
  readonly purpose: string;
  /** Turns spent in the horizon. */
  readonly turns: number;
  /** Turns per trip. */
  readonly tripTurns: number;
  /** Turn intervals that pass per turn spent: 0 for spending a banked cap at once, 0.5 for playing at the regeneration pace. */
  readonly intervalsPerTurn: number;
}

export interface ProductCrew {
  readonly name: string;
  readonly whores: number;
  readonly thugs: number;
  readonly cashCents: number;
  readonly netWorthCents: number;
}

export interface ProductMood {
  readonly name: string;
  readonly whoreHappiness: number;
  readonly thugHappiness: number;
}

export const productPlayStyles: readonly ProductPlayStyle[] = [
  { name: 'Banked cap', purpose: 'A full 144-turn bank spent in one sitting, 12 turns a trip. Heat has no time to decay.', turns: 144, tripTurns: 12, intervalsPerTurn: 0 },
  { name: 'All day', purpose: '576 turns at the regeneration pace, 12 a trip: a day of play with decay running alongside.', turns: 576, tripTurns: 12, intervalsPerTurn: 0.5 },
];

export const productCrews: readonly ProductCrew[] = [
  { name: 'Early', whores: 30, thugs: 10, cashCents: 2_000_000, netWorthCents: 5_000_000 },
  { name: 'Middle', whores: 150, thugs: 40, cashCents: 30_000_000, netWorthCents: 80_000_000 },
  { name: 'Late', whores: 500, thugs: 120, cashCents: 200_000_000, netWorthCents: 600_000_000 },
];

export const productMoods: readonly ProductMood[] = [
  { name: 'Happy', whoreHappiness: 90, thugHappiness: 90 },
  { name: 'Struggling', whoreHappiness: 30, thugHappiness: 30 },
];

export interface ProductRunSummary {
  readonly style: string;
  readonly crew: string;
  readonly mood: string;
  readonly job: string;
  readonly role: WorkSupplyRole;
  readonly product: string;
  /** Take (or cooked product at reference cost) minus product burned. */
  readonly netCents: number;
  readonly productCostCents: number;
  readonly bustLossCents: number;
  readonly expectedBusts: number;
  readonly workersChange: number;
  readonly peakHeat: number;
  readonly endHeat: number;
  /** netCents plus whores gained or lost at a day's baseline take each. */
  readonly scoreCents: number;
}

function effectsFor(ruleset: Ruleset, key: string): ProductEffects {
  const effects = (ruleset.products?.[key] as { effects?: ProductEffects } | undefined)?.effects;
  if (!effects) throw new Error(`${key} has no effects in ${ruleset.meta.id}.`);
  return effects;
}

/** Share of a crew that walks over `turns` at this happiness, as calculateDepartures expects it. */
function departureFraction(ruleset: Ruleset, happiness: number, turns: number, multiplier: number): number {
  const d = ruleset.departures;
  if (happiness >= d.happinessThreshold) return 0;
  const perTurn = Math.min(1, d.chancePerTurn * ((d.happinessThreshold - happiness) / d.happinessThreshold) * multiplier);
  return Math.min(1 - (1 - perTurn) ** turns, d.maxFractionPerAction);
}

export function simulateProductRun(ruleset: Ruleset, input: { style: ProductPlayStyle; crew: ProductCrew; mood: ProductMood; job: string; product: string }): ProductRunSummary {
  const { style, crew, mood, job, product } = input;
  const heatRules = ruleset.heat;
  const supply = ruleset.workSupply;
  if (!heatRules || !supply) throw new Error(`${ruleset.meta.id} has no Heat or work supply.`);
  const role: WorkSupplyRole = job === COOK_JOB ? 'thugs' : 'hoes';
  const effects = productSliceEffects(ruleset, product, role, job);
  const cost = effectsFor(ruleset, product).referenceCostCents;
  const crackValue = effectsFor(ruleset, 'CRACK').referenceCostCents;
  const keep = 0.5;
  const whoreDayCents = ruleset.scouting.grossPerWhorePerTurnCents * keep * 144;
  const district = role === 'hoes' ? ruleset.scouting.districts[job as keyof typeof ruleset.scouting.districts] : undefined;

  let whores = crew.whores;
  let thugs = crew.thugs;
  let heat = 0;
  let peakHeat = 0;
  let cash = crew.cashCents;
  let net = 0;
  let productCost = 0;
  let bustLoss = 0;
  let busts = 0;

  for (let spent = 0; spent < style.turns; spent += style.tripTurns) {
    const turns = Math.min(style.tripTurns, style.turns - spent);
    const workers = role === 'hoes' ? whores : thugs;
    const rate = role === 'hoes' ? supply.productPerWhorePerTurn : supply.productPerThugPerTurn ?? 0;
    const units = Math.ceil(workers * rate * turns);
    const burn = units * cost;

    let gain: number;
    let walked: number;
    if (role === 'hoes' && district) {
      gain = whores * ruleset.scouting.grossPerWhorePerTurnCents * turns
        * happinessMultiplier(mood.whoreHappiness, ruleset.scouting.minHappinessMultiplier)
        * district.payMultiplier * effects.takeMultiplier * heatTakeMultiplier(heat, ruleset) * keep;
      const recruits = district.whoresPerTurn * turns * recruitmentMultiplier(whores, ruleset.scouting.recruitment.whoreSoftCap) * effects.recruitmentMultiplier;
      walked = whores * departureFraction(ruleset, mood.whoreHappiness, turns, effects.departureMultiplier);
      whores = Math.max(0, whores + recruits - walked);
    } else {
      const morale = Math.min(ruleset.happiness.max, mood.thugHappiness + effects.morale);
      const cooked = thugs * ruleset.production.crack.perThugPerTurn * turns
        * happinessMultiplier(morale, ruleset.production.crack.minHappinessMultiplier) * effects.takeMultiplier;
      gain = cooked * (crackValue - ruleset.production.crack.ingredientCentsPerRock);
      walked = thugs * departureFraction(ruleset, morale, turns, effects.departureMultiplier);
      thugs = Math.max(0, thugs - walked);
    }

    // A bust is rolled at the Heat the trip starts with, against what the trip leaves behind.
    const chance = bustChance(heat, ruleset);
    const loss = chance * (heatRules.bust.cashFineFraction * (cash + gain) + heatRules.bust.productSeizedFraction * 2 * burn);
    busts += chance;
    bustLoss += loss;
    productCost += burn;
    net += gain - burn - loss;
    cash += gain - burn - loss;

    const added = turns * effects.heatPerTurn * heatCrewFactor(ruleset, role, workers);
    heat = Math.min(heatRules.max, Math.max(0, heat + added - chance * heatRules.bust.heatDrop));
    peakHeat = Math.max(peakHeat, heat);
    heat = Math.max(0, heat - turns * style.intervalsPerTurn * heatRules.decayPerInterval);
  }

  const workersChange = role === 'hoes' ? whores - crew.whores : thugs - crew.thugs;
  // A cook who walks is worth what he would have cooked in a day; a whore, what she would have earned.
  const workerValue = role === 'hoes' ? whoreDayCents : ruleset.production.crack.perThugPerTurn * 144 * (crackValue - ruleset.production.crack.ingredientCentsPerRock);

  return {
    style: style.name, crew: crew.name, mood: mood.name, job, role, product,
    netCents: Math.round(net), productCostCents: Math.round(productCost), bustLossCents: Math.round(bustLoss),
    expectedBusts: busts, workersChange, peakHeat, endHeat: heat,
    scoreCents: Math.round(net + workersChange * workerValue),
  };
}

export function productJobs(ruleset: Ruleset): string[] {
  return [...Object.keys(ruleset.scouting.districts), COOK_JOB];
}

export function runProductSimulation(ruleset: Ruleset): ProductRunSummary[] {
  const products = Object.keys(ruleset.products ?? {});
  return productPlayStyles.flatMap((style) => productCrews.flatMap((crew) => productMoods.flatMap((mood) =>
    productJobs(ruleset).flatMap((job) => products.map((product) => simulateProductRun(ruleset, { style, crew, mood, job, product }))))));
}

export interface ProductWinner {
  readonly style: string;
  readonly crew: string;
  readonly mood: string;
  readonly job: string;
  readonly product: string;
  /** How far ahead of the runner-up, as a share of the winner's score. */
  readonly margin: number;
}

export function productWinners(rows: readonly ProductRunSummary[]): ProductWinner[] {
  const groups = new Map<string, ProductRunSummary[]>();
  for (const row of rows) {
    const key = [row.style, row.crew, row.mood, row.job].join('|');
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((group) => {
    const [best, next] = [...group].sort((a, b) => b.scoreCents - a.scoreCents);
    return {
      style: best!.style, crew: best!.crew, mood: best!.mood, job: best!.job, product: best!.product,
      margin: next && best!.scoreCents > 0 ? (best!.scoreCents - next.scoreCents) / best!.scoreCents : 1,
    };
  });
}

/**
 * The 0.4.0-C gate: in every crew, mood and play style, no single product is
 * the best answer on every job. Returns the situations that fail.
 */
export function dominantProducts(winners: readonly ProductWinner[]): Array<{ situation: string; product: string }> {
  const bySituation = new Map<string, Set<string>>();
  for (const winner of winners) {
    const key = `${winner.style} · ${winner.crew} · ${winner.mood}`;
    bySituation.set(key, (bySituation.get(key) ?? new Set()).add(winner.product));
  }
  return [...bySituation.entries()].filter(([, products]) => products.size === 1).map(([situation, products]) => ({ situation, product: [...products][0]! }));
}

export interface HeatRecoveryRow {
  readonly from: number;
  readonly to: number;
  readonly idleHours: number;
  /** Turns of heat-free work at the regeneration pace. */
  readonly cleanWorkTurns: number;
  readonly bribeCents: Record<string, number>;
}

/** How Heat comes down: waiting, working clean product, or paying. */
export function heatRecovery(ruleset: Ruleset, crews: readonly ProductCrew[] = productCrews): HeatRecoveryRow[] {
  const rules = ruleset.heat;
  if (!rules) return [];
  const intervalHours = ruleset.turns.intervalMinutes / 60;
  return [
    [rules.max, rules.bust.startsAt],
    [rules.max, rules.drag.startsAt],
    [rules.bust.startsAt, 0],
  ].map(([from, to]) => {
    const intervals = Math.ceil((from! - to!) / rules.decayPerInterval);
    return {
      from: from!, to: to!,
      idleHours: intervals * intervalHours,
      cleanWorkTurns: intervals * ruleset.turns.amountPerInterval,
      bribeCents: Object.fromEntries(crews.map((crew) => [crew.name, Number(bribeCentsPerPoint(BigInt(crew.netWorthCents), rules) * BigInt(from! - to!))])),
    };
  });
}

export function productSimulationMarkdown(ruleset: Ruleset, rows: readonly ProductRunSummary[]): string {
  const money = (cents: number) => `${cents < 0 ? '-' : ''}$${Math.abs(Math.round(cents / 100)).toLocaleString('en-US')}`;
  const winners = productWinners(rows);
  const dominant = dominantProducts(winners);
  const products = Object.keys(ruleset.products ?? {});
  const jobs = productJobs(ruleset);
  const name = (key: string) => ruleset.products?.[key]?.name ?? key;
  const jobName = (key: string) => key === COOK_JOB ? 'Cooking (thugs)' : ruleset.scouting.districts[key as keyof typeof ruleset.scouting.districts]?.name ?? key;
  const heat = ruleset.heat!;
  const winCounts = Object.fromEntries(products.map((product) => [product, winners.filter((winner) => winner.product === product).length]));

  const lines = [
    `# 0.4.0-C product effects and Heat simulation`, '',
    `Ruleset: ${ruleset.meta.id}. Expected values, no dice: every row runs one product on one job for the whole horizon, fully supplied.`,
    'Girls are fully covered on a block with room, on a 50% cut. Product is priced at each product\'s reference cost; cooked',
    'product is worth crack\'s reference cost less ingredients. A bust fines cash and seizes half of a two-trip product buffer.',
    'Score is net cash plus workers gained or lost, each worth a day of baseline work.', '',
    `Heat: max ${heat.max}, decays ${heat.decayPerInterval} per ${ruleset.turns.intervalMinutes}-minute interval; drag from ${heat.drag.startsAt} (up to ${heat.drag.maxTakePenalty * 100}% of take at max);`,
    `bust rolls from ${heat.bust.startsAt} (up to ${heat.bust.chanceAtMax * 100}% a trip at max), seizing ${heat.bust.productSeizedFraction * 100}% of product and fining ${heat.bust.cashFineFraction * 100}% of cash.`, '',
    '## Gate', '',
    dominant.length
      ? `**Fails.** One product is best on every job in: ${dominant.map((row) => `${row.situation} (${name(row.product)})`).join('; ')}.`
      : `**Passes.** In every play style, crew and mood, at least two products win a job. Jobs won across all ${winners.length} situations: ${products.map((product) => `${name(product)} ${winCounts[product]}`).join(', ')}.`,
    '',
    '## Best product per job', '',
    `| Situation | ${jobs.map(jobName).join(' | ')} |`,
    `| --- | ${jobs.map(() => '---').join(' | ')} |`,
  ];
  for (const style of productPlayStyles) for (const crew of productCrews) for (const mood of productMoods) {
    const cells = jobs.map((job) => {
      const winner = winners.find((row) => row.style === style.name && row.crew === crew.name && row.mood === mood.name && row.job === job)!;
      return `${name(winner.product)} (+${Math.round(winner.margin * 100)}%)`;
    });
    lines.push(`| ${style.name} · ${crew.name} · ${mood.name} | ${cells.join(' | ')} |`);
  }
  lines.push('', 'The percentage is how far the winner leads the runner-up.', '');

  for (const style of productPlayStyles) {
    lines.push(`## ${style.name}`, '', style.purpose, '');
    for (const crew of productCrews) for (const mood of productMoods) {
      lines.push(`### ${crew.name} crew (${crew.whores} whores, ${crew.thugs} thugs), ${mood.name.toLowerCase()}`, '',
        `| Job | ${products.map(name).join(' | ')} |`, `| --- | ${products.map(() => '---:').join(' | ')} |`);
      for (const job of jobs) {
        const cells = products.map((product) => {
          const row = rows.find((candidate) => candidate.style === style.name && candidate.crew === crew.name && candidate.mood === mood.name && candidate.job === job && candidate.product === product)!;
          const change = Math.round(row.workersChange);
          return `${money(row.scoreCents)}<br>heat ${Math.round(row.peakHeat)}${row.expectedBusts >= 0.05 ? ` · ${row.expectedBusts.toFixed(1)} busts` : ''}${change ? ` · ${change > 0 ? '+' : ''}${change} ${row.role === 'hoes' ? 'whores' : 'thugs'}` : ''}`;
        });
        lines.push(`| ${jobName(job)} | ${cells.join(' | ')} |`);
      }
      lines.push('');
    }
  }

  lines.push('## Bringing Heat down', '',
    `| From | To | Waiting | Clean work at regeneration pace | Bribe: ${productCrews.map((crew) => `${crew.name} (${money(crew.netWorthCents)} net worth)`).join(' / ')} |`,
    '| ---: | ---: | ---: | ---: | ---: |',
    ...heatRecovery(ruleset).map((row) => `| ${row.from} | ${row.to} | ${row.idleHours.toFixed(1)} h | ${row.cleanWorkTurns} turns | ${productCrews.map((crew) => money(row.bribeCents[crew.name]!)).join(' / ')} |`),
    '',
    '## Happiness per dollar', '',
    'What it costs to hold enough product that whore happiness takes no product penalty, per whore.', '',
    '| Product | Happiness weight | Units per whore | Cost per whore |', '| --- | ---: | ---: | ---: |',
    ...products.map((product) => {
      const effects = effectsFor(ruleset, product);
      const units = ruleset.happiness.whore.crackPerWhore / effects.hoes.happinessWeight;
      return `| ${name(product)} | ${effects.hoes.happinessWeight} | ${units.toFixed(2)} | ${money(units * effects.referenceCostCents)} |`;
    }),
    '');
  return lines.join('\n');
}

/**
 * 0.4.0-D. The product economy as a report: Pip's prices and shelves, what a
 * round trip loses, what cooking saves against buying, and the money-loop gate.
 */
export function productEconomyMarkdown(ruleset: Ruleset): string {
  const money = (cents: number) => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const loops = productLoops(ruleset);
  const keys = Object.entries(ruleset.products ?? {}).sort(([, a], [, b]) => a.sortOrder - b.sortOrder).map(([key]) => key);
  const crackItem = ruleset.stores.PIP.items.CRACK;
  const priceRows = keys.map((key) => {
    const name = ruleset.products![key]!.name;
    if (key === 'CRACK') {
      const restock = crackItem?.restock;
      return `| ${name} (Pip's Product) | ${money(crackItem?.buyCents ?? 0)} | ${crackItem?.sellCents === null || !crackItem ? 'none' : money(crackItem.sellCents)} | ${money(ruleset.economy.netWorth.perCrackCents)} | ${restock ? `${restock.cap} / ${restock.perInterval ?? 1} every ${restock.intervalMinutes} min` : 'unlimited'} | ${crackItem?.sellCents ? `${Math.round((1 - crackItem.sellCents / crackItem.buyCents) * 100)}%` : '-'} |`;
    }
    const economy = productEconomy(ruleset, key);
    if (!economy?.pip) return `| ${name} | not dealt | - | ${money(economy?.netWorthCents ?? 0)} | - | - |`;
    const { pip } = economy;
    return `| ${name} | ${money(pip.buyCents)} | ${money(pip.sellCents)} | ${money(economy.netWorthCents)} | ${pip.restock.cap} / ${pip.restock.perInterval} every ${pip.restock.intervalMinutes} min | ${Math.round((1 - pip.sellCents / pip.buyCents) * 100)}% |`;
  });
  const recipeRows = productRecipes(ruleset).map((recipe) => {
    const buy = recipe.product === 'CRACK' ? crackItem?.buyCents ?? 0 : productEconomy(ruleset, recipe.product)?.pip?.buyCents ?? 0;
    const saved = recipe.perThugPerTurn * (buy - recipe.ingredientCentsPerUnit);
    return `| ${recipe.name} | ${recipe.perThugPerTurn} | ${money(recipe.ingredientCentsPerUnit)} | ${money(buy)} | ${money(saved)} | ${recipe.heatPerUnit > 0 ? (recipe.perThugPerTurn * 40 * recipe.heatPerUnit).toFixed(1) : '0'} |`;
  });
  return [
    `# 0.4.0-D product economy`, '',
    `Ruleset: ${ruleset.meta.id}. Every number here is integer cents in the ruleset.`, '',
    '## Gate: no free money loop', '',
    loops.length ? `**Fails.**\n\n${loops.map((line) => `- ${line}`).join('\n')}` : '**Passes.** For every product, Pip buys back for less than he sells, net worth values a unit at no more than Pip pays, and ingredients cost at least what Pip pays, so buying, cooking or holding product never mints money or net worth.',
    '',
    "## Pip's counter", '',
    '| Product | Buy | Sell | Net worth | Shelf | Round trip loses |', '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...priceRows, '',
    '## Produce', '',
    'Cooking pays by saving the difference between Pip\'s price and the ingredients, before thug happiness, cook supply and variance.', '',
    '| Recipe | Per thug per turn | Ingredients each | Pip sells at | Saved per thug per turn | Heat per turn, 40 thugs |', '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...recipeRows, '',
    '## Loot', '',
    `Raids draw their product haul from the whole stash, capped by the same share (${ruleset.combat?.loot.exposedDrugPercent ?? 0}%) and carry (${ruleset.combat?.loot.perFitAttackerCrack ?? 0} a fit attacker) crack always had, then split it across products in proportion to what the target holds. Drug runs burn the defender's stash the same way. Every unit a raid takes lands with the attacker.`,
    '',
  ].join('\n');
}
