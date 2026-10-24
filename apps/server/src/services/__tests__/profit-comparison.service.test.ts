import { describe, expect, it } from 'vitest';
import { projectProfitComparison } from '../profit-intelligence.service.js';

describe('profit intelligence city and route comparison', () => {
  it('compares only recorded trip trades and labels the result as trade delta', () => {
    const result = projectProfitComparison({
      runs: [{
        stops: [
          { order: 0, city: 'chicago', route: ['chicago'] },
          { order: 1, city: 'detroit', route: ['chicago', 'detroit'] },
          { order: 2, city: 'chicago', route: ['detroit', 'chicago'] },
        ],
        trades: [
          { city: 'detroit', productKey: 'CRACK', direction: 'buy', totalCents: 1000n },
          { city: 'detroit', productKey: 'CRACK', direction: 'sell', totalCents: 1600n },
        ],
      }],
      businesses: [{ registerCents: 800n, turf: { city: { slug: 'detroit', name: 'Detroit' } } }],
      sightings: [{ city: 'detroit', seenAt: new Date('2026-10-01T12:00:00Z'), counter: { products: [{ key: 'CRACK', market: { buyCents: 80, sellCents: 60, depth: 5 } }] } }],
      activeRuns: [{ cashCents: 500n }],
      activeBossTrips: [{ bankrollCents: 200n }],
      cityNames: { chicago: 'Chicago', detroit: 'Detroit' },
    });

    expect(result.routes[0]).toMatchObject({ tripCount: 1, buyCents: '1000', sellCents: '1600', tradeDeltaCents: '600' });
    expect(result.tradeCities[0]).toMatchObject({ citySlug: 'detroit', tradeDeltaCents: '600' });
    expect(result.currentRegisters[0]!.registerCents).toBe('800');
    expect(result.observedMarkets[0]!.products[0]!).toMatchObject({ productKey: 'CRACK', buyCents: 80, sellCents: 60 });
    expect(result.cashAway.totalCents).toBe('700');
    expect(result.caveats.some((note) => note.includes('excludes home cargo cost'))).toBe(true);
  });

  it('ignores malformed observed market prices instead of inventing quotes', () => {
    const result = projectProfitComparison({
      runs: [], businesses: [],
      sightings: [{ city: 'unknown', seenAt: new Date('2026-10-01T12:00:00Z'), counter: { products: [{ key: 'BAD', market: { buyCents: '100', sellCents: null } }] } }],
      activeRuns: [], activeBossTrips: [], cityNames: {},
    });
    expect(result.observedMarkets[0]!.products).toEqual([]);
    expect(result.observedMarkets[0]!.cityName).toBe('unknown');
  });
});
