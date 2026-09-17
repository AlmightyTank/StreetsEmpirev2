import { describe, expect, it } from 'vitest';
import { classicOgV04B, classicOgV04C } from '@streets/rulesets';
import { calculateWhoreHappiness, happinessProductStock } from '../calculations/happiness.js';
import { addHeat, bribeCentsPerPoint, bustChance, decayHeat, heatTakeMultiplier, resolveBust, tripHeat } from '../calculations/heat.js';
import { calculateProduce, calculateStreetTake } from '../calculations/actions.js';
import { COOK_JOB, planWorkSupply } from '../calculations/work-supply.js';
import { dominantProducts, heatRecovery, productWinners, runProductSimulation } from '../simulations/products.js';

const rules = classicOgV04C.heat;
const policy = (primary: string) => ({ primary, fallback: null, emergency: null, strict: false });

describe('Heat', () => {
  it('decays on the turn clock and never leaves 0..max', () => {
    expect(decayHeat(50, 10, rules)).toBe(40);
    expect(decayHeat(5, 100, rules)).toBe(0);
    expect(addHeat(95, 30, rules)).toBe(100);
    expect(addHeat(10, -30, rules)).toBe(0);
  });

  it('drags the take only above the drag line, down to the maximum penalty', () => {
    expect(heatTakeMultiplier(rules.drag.startsAt, classicOgV04C)).toBe(1);
    expect(heatTakeMultiplier(rules.max, classicOgV04C)).toBeCloseTo(1 - rules.drag.maxTakePenalty, 10);
    expect(heatTakeMultiplier(100, classicOgV04B)).toBe(1);
  });

  it('only risks a bust from the bust line, rising to the chance at max', () => {
    expect(bustChance(rules.bust.startsAt - 1, classicOgV04C)).toBe(0);
    expect(bustChance(rules.max, classicOgV04C)).toBeCloseTo(rules.bust.chanceAtMax, 10);
    expect(bustChance(100, classicOgV04B)).toBe(0);
  });

  it('a bust seizes a share of every product, fines cash, and burns off Heat', () => {
    const bust = resolveBust({ heat: 100, cashCents: 1_000_000n, products: { CRACK: 101, WEED: 40, METH: 1 }, ruleset: classicOgV04C, rng: () => 0 });
    expect(bust.busted).toBe(true);
    expect(bust.seized).toEqual({ CRACK: 50, WEED: 20 });
    expect(bust.fineCents).toBe(BigInt(1_000_000 * rules.bust.cashFineFraction));
    expect(bust.heatAfter).toBe(100 - rules.bust.heatDrop);
    expect(resolveBust({ heat: 100, cashCents: 1_000_000n, products: { CRACK: 10 }, ruleset: classicOgV04C, rng: () => 0.99 }).busted).toBe(false);
  });

  it('prices a bribe on net worth, never below the floor', () => {
    expect(bribeCentsPerPoint(0n, rules)).toBe(BigInt(rules.bribe.minCentsPerPoint));
    const rich = 1_000_000_000n;
    expect(bribeCentsPerPoint(rich, rules)).toBe(BigInt(Math.floor(Number(rich) * rules.bribe.netWorthFractionPerPoint)));
  });

  it('can always be brought below the bust line by waiting', () => {
    for (const row of heatRecovery(classicOgV04C)) {
      expect(row.idleHours).toBeLessThanOrEqual(12);
      expect(row.cleanWorkTurns).toBeGreaterThan(0);
    }
  });
});

describe('product effects in a work plan', () => {
  it('weights take, recruits, walkouts and Heat by the share each product supplied', () => {
    // 100 whores for 10 turns need 50. 25 Ecstasy then dry.
    const plan = planWorkSupply({ job: 'NIGHTCLUB', workers: 100, turns: 10, policy: policy('ECSTASY'), inventory: { ECSTASY: 25 }, ruleset: classicOgV04C });
    const ecstasy = classicOgV04C.products.ECSTASY.effects.hoes;
    const supply = classicOgV04C.workSupply;
    expect(plan.takeMultiplier).toBeCloseTo(0.5 * ecstasy.take * ecstasy.jobTake.NIGHTCLUB + 0.5 * supply.dryTakeMultiplier, 10);
    expect(plan.recruitmentMultiplier).toBeCloseTo(0.5 * ecstasy.recruitment + 0.5, 10);
    expect(plan.departureMultiplier).toBeCloseTo(0.5 * ecstasy.departures + 0.5 * supply.dryDepartureMultiplier, 10);
    // 5 turns of Ecstasy at crew scale 1.
    expect(plan.heat).toBeCloseTo(5 * ecstasy.heatPerTurn, 10);
    expect(tripHeat([plan])).toBe(Math.round(5 * ecstasy.heatPerTurn));
  });

  it('crashes a crew whose Heroin ran out part-way', () => {
    const plan = planWorkSupply({ job: 'WINO_SLUMS', workers: 100, turns: 10, policy: policy('HEROIN'), inventory: { HEROIN: 25 }, ruleset: classicOgV04C });
    const dry = plan.slices.at(-1)!;
    expect(dry.state).toBe('dry');
    expect(dry.departureMultiplier).toBeCloseTo(classicOgV04C.workSupply.dryDepartureMultiplier * classicOgV04C.products.HEROIN.effects.hoes.crashDepartures, 10);
  });

  it('rounds the need up, so a tiny trip still burns what it uses', () => {
    const plan = planWorkSupply({ job: 'CASINO', workers: 3, turns: 1, policy: policy('ECSTASY'), inventory: {}, ruleset: classicOgV04C });
    expect(plan.need).toBe(1);
    expect(plan.slices[0]!.state).toBe('dry');
  });

  it('supplies cooks on their own rate, and a dry cook works as before', () => {
    const plan = planWorkSupply({ job: COOK_JOB, role: 'thugs', workers: 40, turns: 10, policy: policy('METH'), inventory: { METH: 0 }, ruleset: classicOgV04C });
    expect(plan.need).toBe(Math.ceil(40 * classicOgV04C.workSupply.productPerThugPerTurn * 10));
    expect(plan).toMatchObject({ takeMultiplier: 1, morale: 0, heat: 0 });
    const meth = planWorkSupply({ job: COOK_JOB, role: 'thugs', workers: 40, turns: 10, policy: policy('METH'), inventory: { METH: 1_000 }, ruleset: classicOgV04C });
    expect(meth.takeMultiplier).toBe(classicOgV04C.products.METH.effects.thugs.output);
  });

  it('carries Heat drag into the take and cook output into production', () => {
    const player = { whores: 100, thugs: 40, pistols: 40, condoms: 10_000, crack: 10_000, beer: 10_000, medicine: 0, whoreHappiness: 100, thugHappiness: 100 };
    const base = { player, turns: 10, ruleset: classicOgV04C, clientCapacity: 2_000, district: 'CASINO' as const, payoutPercent: 50, rng: () => 0.5 };
    const cold = calculateStreetTake({ ...base, heat: 0 });
    const hot = calculateStreetTake({ ...base, heat: 100 });
    expect(Number(hot.grossCents)).toBeCloseTo(Number(cold.grossCents) * (1 - rules.drag.maxTakePenalty), -2);

    const cook = planWorkSupply({ job: COOK_JOB, role: 'thugs', workers: 40, turns: 10, policy: policy('METH'), inventory: { METH: 1_000 }, ruleset: classicOgV04C });
    const produce = { player, turns: 10, ruleset: classicOgV04C, clientCapacity: 2_000, payoutPercent: 50, cashCents: 100_000_000n, rng: () => 0.5 };
    const plain = calculateProduce(produce);
    const boosted = calculateProduce({ ...produce, cook });
    expect(boosted.crackProduced).toBeGreaterThan(plain.crackProduced * 1.5);
  });
});

describe('product-aware whore happiness', () => {
  const crew = { whores: 100, thugs: 10, condoms: 1_000, crack: 0, payoutPercent: 50 };

  it('counts every product at its weight on rounds with effects, crack alone before', () => {
    expect(happinessProductStock({ ...crew, products: { WEED: 100 } }, classicOgV04C)).toBe(100 * classicOgV04C.products.WEED.effects.hoes.happinessWeight);
    expect(happinessProductStock({ ...crew, products: { WEED: 100 } }, classicOgV04B)).toBe(0);
    expect(happinessProductStock({ ...crew, crack: 50 }, classicOgV04B)).toBe(50);
  });

  it('lets Heroin hold a crew happier than the same count of Ecstasy', () => {
    const heroin = calculateWhoreHappiness({ ...crew, products: { HEROIN: 100 } }, classicOgV04C);
    const ecstasy = calculateWhoreHappiness({ ...crew, products: { ECSTASY: 100 } }, classicOgV04C);
    expect(heroin).toBeGreaterThan(ecstasy);
  });
});

describe('0.4.0-C product simulation gate', () => {
  const rows = runProductSimulation(classicOgV04C);
  const winners = productWinners(rows);

  it('never has one product best on every job', () => {
    expect(dominantProducts(winners)).toEqual([]);
  });

  it('gives every product at least one job it wins', () => {
    const products = new Set(winners.map((winner) => winner.product));
    expect([...products].sort()).toEqual(Object.keys(classicOgV04C.products).sort());
  });
});
