import { describe, expect, it } from 'vitest';
import { classicOgV14C } from '../classic-og-v1.4-c/index.js';
import { classicOgV14C2 } from '../classic-og-v1.4-c2/index.js';
import { factionProblems } from '../faction-definitions.js';

describe('1.4.0-C2 sponsored contract balance', () => {
  it('pins a balance-only ruleset on top of 1.4.0-C', () => {
    expect(classicOgV14C2.meta).toEqual({
      id: 'classic-og-v1.4-c2',
      version: '1.4.0-C2',
      name: 'Classic OG - Sponsored Contract Balance',
    });
    expect({ ...classicOgV14C2, meta: null, factionStanding: null, contractSponsors: null })
      .toEqual({ ...classicOgV14C, meta: null, factionStanding: null, contractSponsors: null });
    expect(factionProblems(classicOgV14C2)).toEqual([]);
  });

  it('softens middle tiers without making Inner Circle a one-time Job payout', () => {
    expect(classicOgV14C2.factionStanding).toEqual({
      ...classicOgV14C.factionStanding,
      tiers: { known: 25, trusted: 70, connected: 140, innerCircle: 300 },
    });
    expect(classicOgV14C2.factionStanding.tiers.trusted).toBeLessThan(classicOgV14C.factionStanding.tiers.trusted);
    expect(classicOgV14C2.factionStanding.tiers.connected).toBeLessThan(classicOgV14C.factionStanding.tiers.connected);
    expect(classicOgV14C2.factionStanding.tiers.innerCircle).toBe(classicOgV14C.factionStanding.tiers.innerCircle);
  });

  it('raises board standing while preserving longer-window ordering and focused sponsor lean', () => {
    const { DAILY, WEEKLY, CITY_CONTRACT, SEASON, ALLIANCE } = classicOgV14C2.contractSponsors.standing;
    expect(classicOgV14C2.contractSponsors.standing).toEqual({
      DAILY: 3,
      WEEKLY: 8,
      CITY_CONTRACT: 2,
      SEASON: 24,
      ALLIANCE: 8,
    });
    expect(CITY_CONTRACT).toBeLessThanOrEqual(DAILY);
    expect(DAILY).toBeLessThan(WEEKLY);
    expect(WEEKLY).toBeLessThanOrEqual(ALLIANCE);
    expect(ALLIANCE).toBeLessThan(SEASON);
    expect(classicOgV14C2.contractSponsors.knownLean).toBe(2);
  });
});
