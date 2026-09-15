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
    hideoutSafeRoomLevel: 0,
    hideoutLookoutsLevel: 0,
    hideoutWorkshopLevel: 0,
    hideoutBackOfficeLevel: 0,
    createdAt: new Date('2026-09-07T00:00:00Z'),
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

  it('returns rich public achievement metadata for earned ranking awards', () => {
    const ranked = rankRows([row(1001, 50_000_00, 1), row(1002, 40_000_00, 2)], 1002);
    expect(ranked[0]?.awards).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'national-number-one', category: 'rank', rarity: 'legendary', unlocked: true }),
      expect.objectContaining({ key: 'city-boss', category: 'rank', rarity: 'epic', unlocked: true }),
      expect.objectContaining({ key: 'top-ten', category: 'rank', rarity: 'rare', unlocked: true }),
    ]));
    expect(ranked[0]?.awards[0]?.progress).toEqual(expect.objectContaining({ current: 1, target: 1, label: 'rank #1' }));
  });

  it('keeps public net worth visible and reports rank movement', () => {
    const ranked = rankRows([row(1001, 500, 1), row(1002, 400, 2)], 1002);
    expect(ranked.map((entry) => entry.netWorthCents)).toEqual([500, 400]);
    expect(ranked.map((entry) => entry.rankMovement)).toEqual([1, 1]);
    expect(ranked.map((entry) => entry.intelRequired)).toEqual([false, false]);
  });

  it('awards seasonal hideout milestones', () => {
    const target = {
      ...row(1012, 1, 12),
      hideoutSafeRoomLevel: 5,
      hideoutLookoutsLevel: 5,
      hideoutWorkshopLevel: 5,
      hideoutBackOfficeLevel: 5,
    };
    const ranked = rankRows([
      row(1001, 12_000, 1),
      row(1002, 11_000, 2),
      row(1003, 10_000, 3),
      row(1004, 9_000, 4),
      row(1005, 8_000, 5),
      row(1006, 7_000, 6),
      row(1007, 6_000, 7),
      row(1008, 5_000, 8),
      row(1009, 4_000, 9),
      row(1010, 3_000, 10),
      row(1011, 2_000, 11),
      target,
    ], 1012);

    expect(ranked.at(-1)?.awards).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'first-hideout-upgrade', category: 'hideout', unlocked: true }),
      expect.objectContaining({ key: 'room-maxed', category: 'hideout', unlocked: true }),
    ]));
  });
});
