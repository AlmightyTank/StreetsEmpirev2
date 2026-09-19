import { describe, expect, it } from 'vitest';
import { classicOgV05E, classicOgV05F, type Ruleset } from '@streets/rulesets';
import { rulesetForCity } from '../calculations/cities.js';
import { streetPerTurn } from '../simulations/travel.js';
import {
  RUN_EDGES,
  roundRunPlans,
  roundSupplyPlans,
  simulateTravelRound,
  travelRoundGate,
  travelRoundStarts,
  travelRoundStrategies,
  travelRoundStyles,
  TravelRoundCache,
} from '../simulations/travel-round.js';

const ruleset: Ruleset = classicOgV05F;
const NYC = 'new-york-city';
const strategy = (key: string) => travelRoundStrategies.find((entry) => entry.key === key)!;

describe('0.5.0-F planning a run from home', () => {
  it('never sells where it lives, and only buys on the home market where the rules allow it', () => {
    const at = { home: 'miami-beach', trunk: 3_000, cashCents: 50_000_000, maxHours: 200 };
    const before = roundRunPlans(classicOgV05E, at);
    const after = roundRunPlans(ruleset, at);
    expect(before.every((plan) => plan.sellCity !== at.home)).toBe(true);
    expect(after.every((plan) => plan.sellCity !== at.home)).toBe(true);
    expect(before.some((plan) => plan.buyCity === at.home && plan.buyFrom === 'market')).toBe(false);
    // Miami's own market is the port: the cheapest cocaine a crew living there can load.
    expect(after.some((plan) => plan.buyCity === at.home && plan.buyFrom === 'market' && plan.product === 'COCAINE')).toBe(true);
  });

  it('loads Pip\'s shelf at home as it restocks, and only what is there elsewhere', () => {
    const at = { home: NYC, trunk: 10_000, cashCents: 500_000_000, maxHours: 200 };
    const cold = roundRunPlans(ruleset, { ...at, loadMinutes: 0 }).filter((plan) => plan.buyCity === NYC && plan.buyFrom === 'pip');
    const stocked = roundRunPlans(ruleset, { ...at, loadMinutes: 480 }).filter((plan) => plan.buyCity === NYC && plan.buyFrom === 'pip');
    expect(Math.max(...stocked.map((plan) => plan.units))).toBeGreaterThan(Math.max(...cold.map((plan) => plan.units)));
    const away = roundRunPlans(ruleset, { ...at, loadMinutes: 480 }).filter((plan) => plan.buyCity === 'atlanta' && plan.buyFrom === 'pip');
    expect(away.every((plan) => plan.units <= 10_000)).toBe(true);
  });

  it('charges a supply run bought at home the drive to the nearest town and back', () => {
    const plans = roundSupplyPlans(ruleset, { home: 'los-angeles', product: 'COCAINE', units: 2_000, cashCents: 200_000_000, maxHours: 100, ceilingCents: 10_000 });
    const atHome = plans.find((plan) => plan.buyCity === 'los-angeles');
    // Beverly Hills is half an hour down Sunset: there and back.
    expect(atHome?.driveHours).toBe(1);
    expect(atHome?.turns).toBe(1);
  });
});

describe('0.5.0-F a round of it', () => {
  it('reads the street as a player finds it: the average block, not the busiest', () => {
    const cache = new TravelRoundCache();
    const street = simulateTravelRound(ruleset, { style: travelRoundStyles[0]!, start: travelRoundStarts[1]!, strategy: strategy('street'), home: NYC, days: 7, cache });
    const best = streetPerTurn(rulesetForCity(ruleset, NYC), { ...travelRoundStarts[1]! });
    expect(street.streetTurns).toBe(7 * 576);
    expect(street.cashCents / street.streetTurns).toBeLessThan(best.cashCents);
  });

  it('pays a crew that moves the fee, and moves it on the first day it can afford one', () => {
    const cache = new TravelRoundCache();
    const home = simulateTravelRound(ruleset, { style: travelRoundStyles[0]!, start: travelRoundStarts[1]!, strategy: strategy('street'), home: NYC, days: 5, cache });
    const moved = simulateTravelRound(ruleset, { style: travelRoundStyles[0]!, start: travelRoundStarts[1]!, strategy: strategy('street'), home: 'beverly-hills', days: 5, cache });
    expect(home.movedOnDay).toBeNull();
    expect(home.moveFeeCents).toBe(0);
    expect(moved.movedOnDay).toBe(0);
    expect(moved.moveFeeCents).toBeGreaterThanOrEqual(ruleset.travel!.relocation!.feeFloorCents);
  });

  it('never spends a turn twice', () => {
    const row = simulateTravelRound(ruleset, { style: travelRoundStyles[1]!, start: travelRoundStarts[0]!, strategy: strategy('mixed'), home: NYC, days: 6, edge: 0.8 });
    const spent = row.streetTurns + row.produceTurns + row.runTurns + row.hijackTurns + row.idleTurns;
    expect(spent).toBeLessThanOrEqual(6 * 144 * 2);
    expect(row.runTurns).toBeGreaterThan(0);
  });
});

describe('0.5.0-F gate', () => {
  // The whole grid (every style, start and city) is `npm run qa:travel`; here it is the
  // starting city and the three the release was balanced for, playing twice a day.
  it('has mixed play beating the street alone and running alone', () => {
    const cache = new TravelRoundCache();
    const rows = ['new-york-city', 'miami-beach', 'seattle', 'los-angeles'].flatMap((home) =>
      travelRoundStrategies.flatMap((entry) => (entry.mixed ? RUN_EDGES : [undefined]).map((edge) =>
        simulateTravelRound(ruleset, { style: travelRoundStyles[1]!, start: travelRoundStarts[1]!, strategy: entry, home, cache, edge }))));
    expect(travelRoundGate(ruleset, rows)).toEqual([]);
  }, 60_000);
});
