import { describe, expect, it } from 'vitest';
import { classicOgV04E, classicOgV05A, type Ruleset } from '@streets/rulesets';
import {
  cityCounter,
  cityHeatRules,
  cityModifiers,
  cityRulesetProblems,
  driveHoursFrom,
  findRoutes,
  highMarketBaseline,
  highMarketSaleCents,
  pipBase,
  rulesetForCity,
} from '../calculations/cities.js';
import { bustChance, heatTakeMultiplier } from '../calculations/heat.js';
import { runTravelSimulation, travelGate } from '../simulations/travel.js';

const NYC = 'new-york-city';
const products = Object.keys(classicOgV05A.products);

describe('0.5.0-A cities: a round in New York plays like 0.4.0-E', () => {
  it('keeps every 0.4.0-E rule, adding only cities and roads', () => {
    for (const key of Object.keys(classicOgV04E) as Array<keyof typeof classicOgV04E>) {
      if (key === 'meta') continue;
      expect(classicOgV05A[key], key).toBe(classicOgV04E[key]);
    }
    expect(Object.keys(classicOgV05A).sort()).toEqual([...Object.keys(classicOgV04E), 'cities', 'travel'].sort());
  });

  it('gives New York the 0.4.0-C Heat levels and no modifiers', () => {
    expect(cityHeatRules(classicOgV05A, NYC)).toEqual(classicOgV04E.heat);
    expect(cityModifiers(classicOgV05A, NYC)).toEqual({ scoutModifier: 1, incomeModifier: 1, crackModifier: 1 });
    const home = rulesetForCity(classicOgV05A, NYC);
    for (const heat of [0, 39, 40, 55, 70, 85, 100]) {
      expect(heatTakeMultiplier(heat, home)).toBe(heatTakeMultiplier(heat, classicOgV04E));
      expect(bustChance(heat, home)).toBe(bustChance(heat, classicOgV04E));
    }
  });

  it('makes Pip in New York the Pip every 0.4.0-E round has', () => {
    for (const product of products) {
      const base = pipBase(classicOgV04E, product)!;
      const counter = cityCounter(classicOgV05A, NYC, product)!;
      expect(counter, product).toMatchObject({ supply: 'NORMAL', buyCents: base.buyCents, sellCents: base.sellCents, shelfCap: base.shelfCap, perInterval: base.perInterval });
    }
  });

  it('leaves rounds before 0.5.0-A alone', () => {
    expect(cityModifiers(classicOgV04E, 'beverly-hills')).toEqual({ scoutModifier: 1, incomeModifier: 1, crackModifier: 1 });
    expect(rulesetForCity(classicOgV04E, 'beverly-hills')).toBe(classicOgV04E);
    expect(cityCounter(classicOgV04E, NYC, 'COCAINE')).toBeNull();
    expect(findRoutes(classicOgV04E, NYC, 'detroit')).toEqual([]);
  });
});

describe('0.5.0-A city characters', () => {
  it('has no problems: reachable, priced, ordered Heat, no same-city loops', () => {
    expect(cityRulesetProblems(classicOgV05A)).toEqual([]);
  });

  it('applies a city\'s Heat levels and bust severity', () => {
    const hills = rulesetForCity(classicOgV05A, 'beverly-hills');
    expect(hills.heat!.drag.startsAt).toBe(25);
    expect(hills.heat!.bust.startsAt).toBe(45);
    expect(bustChance(50, hills)).toBeGreaterThan(0);
    expect(bustChance(50, rulesetForCity(classicOgV05A, NYC))).toBe(0);
    const detroit = cityHeatRules(classicOgV05A, 'detroit')!;
    expect(detroit.bust.productSeizedFraction).toBeCloseTo(classicOgV04E.heat.bust.productSeizedFraction * 1.3);
  });

  it('prices Pip by supply: cheap and plentiful at the source, scarce where it pays', () => {
    const miami = cityCounter(classicOgV05A, 'miami-beach', 'COCAINE')!;
    const hills = cityCounter(classicOgV05A, 'beverly-hills', 'COCAINE')!;
    expect(miami.supply).toBe('PLENTIFUL');
    expect(miami.buyCents).toBeLessThan(pipBase(classicOgV05A, 'COCAINE')!.buyCents);
    expect(miami.shelfCap).toBeGreaterThan(pipBase(classicOgV05A, 'COCAINE')!.shelfCap);
    expect(hills.supply).toBe('LOW');
    expect(hills.buyCents).toBeGreaterThan(miami.buyCents * 3);
    expect(cityCounter(classicOgV05A, 'gotham', 'COCAINE')).toBeNull();
    // Pip does not carry crack in Beverly Hills, or heroin in Seattle.
    expect(cityCounter(classicOgV05A, 'beverly-hills', 'CRACK')).toBeNull();
    expect(cityCounter(classicOgV05A, 'seattle', 'HEROIN')).toBeNull();
    expect(cityCounter(classicOgV05A, 'miami-beach', 'COCAINE', 'OUT')).toMatchObject({ shelfCap: 0, perInterval: 0 });
  });

  it('never lets the high market undercut Pip at home, and sells for less the more you sell', () => {
    for (const product of products) {
      expect(highMarketBaseline(classicOgV05A, NYC, product)!.buyCents).toBeGreaterThanOrEqual(cityCounter(classicOgV05A, NYC, product)!.buyCents);
    }
    const one = highMarketSaleCents(classicOgV05A, 'beverly-hills', 'COCAINE', 1);
    const thousand = highMarketSaleCents(classicOgV05A, 'beverly-hills', 'COCAINE', 1_000);
    expect(one).toBe(highMarketBaseline(classicOgV05A, 'beverly-hills', 'COCAINE')!.sellCents);
    expect(thousand).toBeLessThan(one * 1_000);
    expect(highMarketSaleCents(classicOgV05A, 'beverly-hills', 'COCAINE', 0)).toBe(0);
  });

  it('keeps street talk true and free of numbers', () => {
    const miami = classicOgV05A.cities['miami-beach'];
    const vague = { ...classicOgV05A, cities: { ...classicOgV05A.cities, 'miami-beach': { ...miami, talk: ['Something comes in by boat.'] } } } as Ruleset;
    expect(cityRulesetProblems(vague)).toContain('Miami Beach: street talk should mention cocaine.');
    expect(cityRulesetProblems(vague)).toContain('Miami Beach: street talk should mention ecstasy.');
    const exact = { ...classicOgV05A, cities: { ...classicOgV05A.cities, 'miami-beach': { ...miami, talk: [...miami.talk, 'Cocaine is $17.60 here.'] } } } as Ruleset;
    expect(cityRulesetProblems(exact)).toContain('Miami Beach: street talk never gives a number.');
  });

  it('flags a same-city loop', () => {
    const cities = { ...classicOgV05A.cities, 'beverly-hills': { ...classicOgV05A.cities['beverly-hills'], products: { ...classicOgV05A.cities['beverly-hills'].products, COCAINE: { price: 1.8, demand: 1.8, supply: 'LOW' as const } } } };
    const broken = { ...classicOgV05A, cities } as Ruleset;
    expect(cityRulesetProblems(broken).join('\n')).toMatch(/Beverly Hills COCAINE: buying at Pip's and selling on the high market is a loop/);
  });
});

describe('0.5.0-A roads', () => {
  it('drives New York to Miami on I-95, or the long way through Atlanta', () => {
    const routes = findRoutes(classicOgV05A, NYC, 'miami-beach');
    expect(routes[0]).toMatchObject({ cities: [NYC, 'miami-beach'], driveHours: 19, passesThrough: [], police: 1.8, gameMinutes: 95, turns: 10 });
    expect(routes[1]).toMatchObject({ cities: [NYC, 'atlanta', 'miami-beach'], driveHours: 23, passesThrough: ['atlanta'] });
    expect(routes.length).toBeLessThanOrEqual(classicOgV05A.travel.maxRoutes);
  });

  it('only reaches Beverly Hills through Los Angeles', () => {
    const routes = findRoutes(classicOgV05A, NYC, 'beverly-hills');
    expect(routes.length).toBeGreaterThan(1);
    for (const route of routes) expect(route.passesThrough).toContain('los-angeles');
    expect(routes.map((route) => route.driveHours)).toEqual([...routes.map((route) => route.driveHours)].sort((a, b) => a - b));
  });

  it('makes Detroit the closest city to New York', () => {
    const hours = driveHoursFrom(classicOgV05A, NYC);
    expect(hours.detroit).toBe(10);
    expect(Math.min(...Object.values(hours))).toBe(10);
    expect(Object.keys(hours)).toHaveLength(7);
  });
});

describe('0.5.0-A travel gate', () => {
  it('passes: no run beats the street, and every city is worth a drive', () => {
    const summaries = runTravelSimulation(classicOgV05A);
    expect(travelGate(classicOgV05A, summaries).problems).toEqual([]);
    for (const summary of summaries) {
      expect(summary.trades.length).toBeGreaterThan(0);
      expect(summary.trades[0]!.profitCents).toBeGreaterThan(0);
    }
  });

  it('fails a ruleset where a run beats the street', () => {
    const cheap = { ...classicOgV05A, travel: { ...classicOgV05A.travel, turnsPerDriveHour: 0.05 } } as Ruleset;
    expect(travelGate(cheap, runTravelSimulation(cheap)).problems.join('\n')).toMatch(/of the street per turn/);
  });
});
