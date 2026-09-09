import { describe, expect, it } from 'vitest';
import { classicOgV01 } from '@streets/rulesets';
import { dailyBoundary, RankingService } from '../ranking.service.js';

describe('dailyBoundary', () => {
  it('is the reset hour earlier today once it has passed', () => {
    const boundary = dailyBoundary(new Date('2026-09-07T05:00:00.000Z'), classicOgV01);
    expect(boundary.toISOString()).toBe('2026-09-07T00:00:00.000Z');
  });

  it('includes the reset instant itself', () => {
    const boundary = dailyBoundary(new Date('2026-09-07T00:00:00.000Z'), classicOgV01);
    expect(boundary.toISOString()).toBe('2026-09-07T00:00:00.000Z');
  });

  it('falls back to yesterday before today’s reset hour', () => {
    const noon = { ...classicOgV01, rankings: { ...classicOgV01.rankings, dailyResetHourUtc: 12 } };
    const boundary = dailyBoundary(new Date('2026-09-07T05:00:00.000Z'), noon);
    expect(boundary.toISOString()).toBe('2026-09-06T12:00:00.000Z');
  });

  it('handles a reset that crosses a month boundary', () => {
    const noon = { ...classicOgV01, rankings: { ...classicOgV01.rankings, dailyResetHourUtc: 12 } };
    const boundary = dailyBoundary(new Date('2026-10-01T03:00:00.000Z'), noon);
    expect(boundary.toISOString()).toBe('2026-09-30T12:00:00.000Z');
  });
});

describe('RankingService.isDailySnapshotStale', () => {
  const now = new Date('2026-09-07T05:00:00.000Z');

  it('is stale when no snapshot has ever been taken', () => {
    expect(
      RankingService.isDailySnapshotStale({ dailyRankSnapshotAt: null }, now, classicOgV01),
    ).toBe(true);
  });

  it('is stale when the snapshot predates the last reset', () => {
    expect(
      RankingService.isDailySnapshotStale(
        { dailyRankSnapshotAt: new Date('2026-09-06T23:59:59.000Z') },
        now,
        classicOgV01,
      ),
    ).toBe(true);
  });

  it('is fresh when the snapshot was taken after the last reset', () => {
    expect(
      RankingService.isDailySnapshotStale(
        { dailyRankSnapshotAt: new Date('2026-09-07T00:00:01.000Z') },
        now,
        classicOgV01,
      ),
    ).toBe(false);
  });

  it('goes stale again the moment the next reset passes', () => {
    const snapshot = { dailyRankSnapshotAt: new Date('2026-09-07T18:00:00.000Z') };

    expect(
      RankingService.isDailySnapshotStale(snapshot, new Date('2026-09-07T23:00:00.000Z'), classicOgV01),
    ).toBe(false);
    expect(
      RankingService.isDailySnapshotStale(snapshot, new Date('2026-09-08T00:30:00.000Z'), classicOgV01),
    ).toBe(true);
  });
});

/**
 * The player's own row still holds their PREVIOUS net worth while an action is
 * mid-flight, so a rank computed for the new value must not count it.
 *
 * Without this, buying a single condom - $1 of cash for $0.10 of net worth -
 * made the player rank behind themselves, and the receipt reported "#1 -> #2"
 * for someone who was #1 by a hundred thousand dollars.
 */
describe('rank counting excludes the player themselves', () => {
  function stubDb() {
    const seen: Record<string, unknown>[] = [];
    return {
      seen,
      db: {
        roundPlayer: {
          count: async ({ where }: { where: Record<string, unknown> }) => {
            seen.push(where);
            // Pretend one row is "ahead": the player's own stale net worth.
            return where.id === undefined ? 1 : 0;
          },
        },
      } as never,
    };
  }

  it('passes the exclusion through to both queries', async () => {
    const { db, seen } = stubDb();

    const ranks = await RankingService.ranksFor(db, {
      id: 'player-1',
      roundId: 'round-1',
      cityId: 'city-1',
      netWorthCents: 100n,
    });

    expect(seen).toHaveLength(2);
    for (const where of seen) {
      expect(where.id).toEqual({ not: 'player-1' });
    }
    expect(ranks).toEqual({ localRank: 1, nationalRank: 1 });
  });

  it('still works for a player who has no row yet, as at join', async () => {
    const { db, seen } = stubDb();

    const ranks = await RankingService.ranksFor(db, {
      roundId: 'round-1',
      cityId: 'city-1',
      netWorthCents: 100n,
    });

    for (const where of seen) {
      expect(where.id).toBeUndefined();
    }
    // The stub counts one player ahead when nobody is excluded.
    expect(ranks).toEqual({ localRank: 2, nationalRank: 2 });
  });
});
