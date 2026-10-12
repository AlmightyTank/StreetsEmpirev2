import { describe, expect, it } from 'vitest';
import { classicOgV16G, classicOgV16H } from '@streets/rulesets';
import { seededRng } from '../rng.js';
import { laneExpectedLoss, laneOdds, laneQuote, laneRiskWord, laneRules, resolveLaneArrival } from '../calculations/supply-lanes.js';

describe('1.6.0-H international lanes', () => {
  const rules = laneRules(classicOgV16H)!;
  const { FREIGHT, OVERLAND, AIR, NORTHERN } = rules.routes;

  it('pins lanes to H only, with every card landing in real cities', () => {
    expect(laneRules(classicOgV16G)).toBeUndefined();
    for (const route of Object.values(rules.routes)) {
      for (const city of route.entryCities) expect(Object.keys(classicOgV16H.cities)).toContain(city);
    }
    for (const supplier of rules.suppliers) {
      expect(supplier.routes.length).toBeGreaterThan(0);
      for (const product of Object.keys(supplier.offers)) expect(Object.keys(classicOgV16H.products)).toContain(product);
    }
  });

  it('prices the goods and the card separately', () => {
    expect(laneQuote(FREIGHT, 2_300, 10_000)).toEqual({ goodsCents: 23_000_000, feeCents: 2_000_000 + 2_000_000, totalCents: 27_000_000, transitHours: 36 });
    expect(() => laneQuote(AIR, 2_300, 0)).toThrow();
  });

  it('trades capacity, fee, time and risk: no card is best at all four', () => {
    const cards = [FREIGHT, OVERLAND, AIR, NORTHERN];
    const best = (score: (card: (typeof cards)[number]) => number) => cards.reduce((winner, card) => (score(card) < score(winner) ? card : winner));
    const winners = new Set([
      best((card) => -card.capacityUnits).name,
      best((card) => card.feeCentsPerUnit).name,
      best((card) => card.transitHours).name,
      best((card) => laneExpectedLoss(card, laneOdds(card, 1))).name,
    ]);
    expect(winners.size).toBeGreaterThan(1);
    expect(FREIGHT.capacityUnits).toBeGreaterThan(AIR.capacityUnits);
    expect(AIR.transitHours).toBeLessThan(FREIGHT.transitHours);
  });

  it('scales the odds by the entry city and never makes a lane safe or certain to fail', () => {
    const quiet = laneOdds(OVERLAND, 0.6);
    const watched = laneOdds(OVERLAND, 1.6);
    expect(watched.seizeChance).toBeGreaterThan(quiet.seizeChance);
    expect(laneOdds(AIR, 0.6).seizeChance).toBeGreaterThan(0);
    const extreme = laneOdds(OVERLAND, 20);
    expect(extreme.seizeChance).toBeLessThanOrEqual(0.5);
    expect(extreme.cleanChance).toBeGreaterThan(0);
    expect(laneRiskWord(laneOdds(AIR, 0.6))).toBe('LOW');
    expect(laneRiskWord(watched)).toBe('HIGH');
  });

  it('resolves an arrival the same way for the same seed, and never delivers more than was sent', () => {
    const first = resolveLaneArrival({ route: FREIGHT, quantity: 5_000, pressure: 1, rng: seededRng(42) });
    const again = resolveLaneArrival({ route: FREIGHT, quantity: 5_000, pressure: 1, rng: seededRng(42) });
    expect(again).toEqual(first);
    const outcomes = new Map<string, number>();
    for (let seed = 0; seed < 4_000; seed++) {
      const arrival = resolveLaneArrival({ route: OVERLAND, quantity: 1_000, pressure: 1, rng: seededRng(seed) });
      expect(arrival.delivered + arrival.lost).toBe(1_000);
      expect(arrival.delivered).toBeGreaterThanOrEqual(0);
      if (arrival.outcome === 'CLEAN') expect(arrival.casePoints).toBe(0);
      if (arrival.outcome === 'SEIZED') expect(arrival.delivered).toBe(0);
      if (arrival.outcome === 'PARTIAL') expect(arrival.lost).toBeGreaterThan(0);
      outcomes.set(arrival.outcome, (outcomes.get(arrival.outcome) ?? 0) + 1);
    }
    // Overland at pressure 1: about 10% seized, 20% searched, 70% clean.
    expect(outcomes.get('SEIZED')! / 4_000).toBeCloseTo(0.1, 1);
    expect(outcomes.get('PARTIAL')! / 4_000).toBeCloseTo(0.2, 1);
  });
});
