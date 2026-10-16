import { describe, expect, it, vi } from 'vitest';
import { EmpireLegacyService, buildLegacyEntrySeeds } from '../empire-legacy.service.js';

const awardedAt = new Date('2026-10-20T12:00:00.000Z');

function source() {
  return {
    round: { id: 'round-1', name: 'Season One' },
    awardedAt,
    players: [
      {
        id: 'player-1', accountId: 'account-1', displayName: 'King Pin',
        nationalRank: 1, localRank: 1, netWorthCents: 12_345_00n,
      },
      {
        id: 'player-2', accountId: 'account-2', displayName: 'Runner Up',
        nationalRank: 11, localRank: 2, netWorthCents: 9_000_00n,
      },
    ],
    events: [
      {
        id: 'event-public', kind: 'takeover', visibility: 'public', actors: ['player-1'],
        summary: { district: 'Downtown' }, happenedAt: new Date('2026-10-19T12:00:00.000Z'),
      },
      {
        id: 'event-private', kind: 'war_win', visibility: 'involved-only', actors: ['player-1'],
        summary: {}, happenedAt: new Date('2026-10-19T13:00:00.000Z'),
      },
    ],
    news: [{ id: 'news-1', title: 'Downtown Falls', cityMemoryEventId: 'event-public' }],
  };
}

describe('2.0 empire legacy', () => {
  it('builds permanent receipts for a top-ten finish, public city event, and Daily cover', () => {
    const seeds = buildLegacyEntrySeeds(source());

    expect(seeds.map((seed) => seed.kind)).toEqual(['season_finish', 'city_event', 'daily_cover']);
    expect(seeds[0]).toMatchObject({
      accountId: 'account-1',
      title: 'Season One champion',
      idempotencyKey: 'legacy:round-1:finish:account-1',
    });
    expect(seeds.some((seed) => seed.idempotencyKey.includes('event-private'))).toBe(false);
    expect(new Set(seeds.map((seed) => seed.idempotencyKey)).size).toBe(seeds.length);
  });

  it('snapshots with skipDuplicates so retrying round close is idempotent', async () => {
    const db = {
      round: { findUnique: vi.fn(async () => source().round) },
      roundPlayer: { findMany: vi.fn(async () => source().players) },
      cityMemoryEvent: { findMany: vi.fn(async () => source().events) },
      gameNews: { findMany: vi.fn(async () => source().news) },
      legacyEntry: { createMany: vi.fn(async () => ({ count: 3 })) },
    } as any;

    await EmpireLegacyService.snapshotRound(db, 'round-1', awardedAt);

    expect(db.legacyEntry.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });

  it('features only an entry owned by the requesting account', async () => {
    const rows = [{
      id: 'legacy-1', accountId: 'account-1', kind: 'season_finish', title: 'Season One champion',
      summary: {}, coverNewsId: null, awardedAt, sourceRound: {
        id: 'round-1', name: 'Season One', slug: 'season-one', endsAt: awardedAt,
      },
    }];
    let featuredLegacyEntryId: string | null = null;
    const db = {
      legacyEntry: {
        findFirst: vi.fn(async ({ where }: any) => rows.find((row) => row.id === where.id && row.accountId === where.accountId) ?? null),
        findMany: vi.fn(async ({ where }: any) => rows.filter((row) => row.accountId === where.accountId)),
      },
      accountProfile: {
        findUnique: vi.fn(async () => ({ featuredLegacyEntryId })),
        upsert: vi.fn(async ({ update }: any) => { featuredLegacyEntryId = update.featuredLegacyEntryId; }),
      },
    } as any;

    const entries = await EmpireLegacyService.feature(db, 'account-1', 'legacy-1');

    expect(entries[0]?.featured).toBe(true);
    await expect(EmpireLegacyService.feature(db, 'account-2', 'legacy-1')).rejects.toMatchObject({
      code: 'LEGACY_ENTRY_NOT_FOUND',
    });
  });
});
