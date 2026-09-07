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
