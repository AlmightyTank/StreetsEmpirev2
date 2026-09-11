import { describe, expect, it } from 'vitest';
import type { City } from '@prisma/client';
import { rankRows } from '../community.service.js';

const city = {
  id: 'city-1',
  slug: 'new-york',
  name: 'New York City',
  sortOrder: 0,
  isEnabled: true,
  scoutModifier: 1,
  incomeModifier: 1,
  crackModifier: 1,
  createdAt: new Date('2026-09-07T00:00:00Z'),
  updatedAt: new Date('2026-09-07T00:00:00Z'),
} satisfies City;

function row(publicPimpId: number, worth: number, rank = publicPimpId - 1000) {
  return {
    id: `player-${publicPimpId}`,
    accountId: `account-${publicPimpId}`,
    publicPimpId,
    displayName: `Pimp ${publicPimpId}`,
    netWorthCents: BigInt(worth),
    city,
    localRank: rank,
    nationalRank: rank,
    localRankSinceAt: new Date('2026-09-07T00:00:00Z'),
    nationalRankSinceAt: new Date('2026-09-07T00:00:00Z'),
    dailyStartingLocalRank: rank + 1,
    dailyStartingNationalRank: rank + 1,
    shotgunUnlocked: false,
    tek9Unlocked: false,
    ak47Unlocked: false,
  };
}

describe('rankRows', () => {
  it('uses competition ranking for ties', () => {
    const ranked = rankRows([row(1001, 500), row(1002, 400), row(1003, 400), row(1004, 300)], 1003);
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 2, 2, 4]);
  });

  it('marks the current player without changing ordering', () => {
    const ranked = rankRows([row(1001, 500), row(1002, 400)], 1002);
    expect(ranked.map((entry) => entry.isYou)).toEqual([false, true]);
  });

  it('keeps public net worth visible and reports rank movement', () => {
    const ranked = rankRows([row(1001, 500, 1), row(1002, 400, 2)], 1002);
    expect(ranked.map((entry) => entry.netWorthCents)).toEqual([500, 400]);
    expect(ranked.map((entry) => entry.rankMovement)).toEqual([1, 1]);
    expect(ranked.map((entry) => entry.intelRequired)).toEqual([false, false]);
  });
});
