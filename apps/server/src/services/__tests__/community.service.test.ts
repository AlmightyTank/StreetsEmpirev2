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

function row(publicPimpId: number, worth: number) {
  return {
    publicPimpId,
    displayName: `Pimp ${publicPimpId}`,
    netWorthCents: BigInt(worth),
    city,
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

  it('can hide opponent net worth while keeping self exact', () => {
    const ranked = rankRows([row(1001, 500), row(1002, 400)], 1002, true);
    expect(ranked.map((entry) => entry.netWorthCents)).toEqual([null, 400]);
    expect(ranked.map((entry) => entry.intelRequired)).toEqual([true, false]);
  });
});
