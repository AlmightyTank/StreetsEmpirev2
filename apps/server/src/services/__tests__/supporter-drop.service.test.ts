import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SupporterDropService } from '../supporter-drop.service.js';
import { PublicSupportersService } from '../public-supporters.service.js';

type Row = Record<string, any>;
const OCTOBER = new Date('2026-10-01T00:30:00Z');

/** Tables the drop sweep, its summary and the public list read. */
function fakeDb(memberships: Row[], unlocks: Row[] = [], profiles: Row[] = [], accounts: Row[] = []) {
  const audit: Row[] = [];
  const matches = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'in' in value) return (value.in as unknown[]).includes(row[key]);
    return row[key] === value;
  });
  const db: Row = {
    audit,
    unlocks,
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    supporterMembership: {
      findMany: async ({ where }: Row) => memberships.filter((row) => where.status.in.includes(row.status)),
    },
    accountCosmeticUnlock: {
      findMany: async ({ where }: Row) => unlocks.filter((row) => matches(row, where)),
      findFirst: async ({ where }: Row) => unlocks.find((row) => matches(row, where)) ?? null,
      create: async ({ data }: Row) => { unlocks.push(data); return data; },
      groupBy: async ({ by, where }: Row) => {
        const rows = unlocks.filter((row) => matches(row, where));
        const groups = new Map<string, Row[]>();
        for (const row of rows) groups.set(row[by[0]], [...(groups.get(row[by[0]]) ?? []), row]);
        return [...groups.entries()].map(([key, group]) => ({
          [by[0]]: key,
          _count: { _all: group.length },
          _min: { awardedAt: group.map((row) => row.awardedAt).sort((a, b) => a - b)[0] },
        }));
      },
    },
    adminAuditLog: { create: async ({ data }: Row) => { audit.push(data); return data; } },
    accountProfile: {
      findMany: async ({ where }: Row) => profiles
        .filter((profile) => profile.showOnSupporterList === where.showOnSupporterList)
        .map((profile) => ({ profile, account: accounts.find((account) => account.id === profile.accountId)! }))
        .filter(({ account }) => account.isActive === where.account.isActive && account.bannedAt === where.account.bannedAt)
        .map(({ profile, account }) => ({ accountId: profile.accountId, account: { username: account.username } })),
    },
  };
  return db;
}

describe('SupporterDropService.sweep', () => {
  it("gives this month's drop to everyone supporting now, once", async () => {
    const db = fakeDb(
      [{ accountId: 'a', status: 'active' }, { accountId: 'b', status: 'trialing' }, { accountId: 'c', status: 'past_due' }, { accountId: 'd', status: 'canceled' }],
      [{ accountId: 'b', key: 'supporter-drop-2026-10' }],
    );

    expect(await SupporterDropService.sweep(db as unknown as PrismaClient, OCTOBER)).toEqual({ month: '2026-10', granted: 1 });
    expect(db.unlocks.filter((row: Row) => row.key === 'supporter-drop-2026-10').map((row: Row) => row.accountId).sort()).toEqual(['a', 'b']);
    expect(db.unlocks.find((row: Row) => row.accountId === 'a')).toMatchObject({ kind: 'TITLE_BADGE', sourceQuestKey: 'supporter', sourceRulesetId: 'supporter-drop', sourceRulesetVersion: '2026-10' });
    expect(db.audit[0]).toMatchObject({ actorAccountId: null, actorUsername: 'Monthly drop', targetId: 'a' });

    expect(await SupporterDropService.sweep(db as unknown as PrismaClient, OCTOBER)).toEqual({ month: '2026-10', granted: 0 });
  });

  it('does nothing in a month without a drop', async () => {
    const db = fakeDb([{ accountId: 'a', status: 'active' }]);
    expect(await SupporterDropService.sweep(db as unknown as PrismaClient, new Date('1999-01-15T00:00:00Z'))).toEqual({ month: '1999-01', granted: 0 });
    expect(db.unlocks).toEqual([]);
  });

  it('counts holders and places each drop in time', async () => {
    const db = fakeDb([], [{ accountId: 'a', key: 'supporter-drop-2026-10' }, { accountId: 'b', key: 'supporter-drop-2026-10' }]);
    const drops = await SupporterDropService.summary(db as unknown as PrismaClient, new Date('2026-11-05T00:00:00Z'));

    expect(drops.find((drop) => drop.month === '2026-10')).toMatchObject({ holders: 2, when: 'past' });
    expect(drops.find((drop) => drop.month === '2026-11')).toMatchObject({ holders: 0, when: 'current' });
    expect(drops.find((drop) => drop.month === '2026-12')?.when).toBe('upcoming');
  });
});

describe('PublicSupportersService.list', () => {
  it('lists only supporters who opted in, by name and starting month, longest-standing first', async () => {
    const db = fakeDb(
      [],
      [
        { accountId: 'a', key: 'midnight-chrome-frame', sourceQuestKey: 'supporter', awardedAt: new Date('2026-11-02T00:00:00Z') },
        { accountId: 'b', key: 'midnight-chrome-frame', sourceQuestKey: 'supporter', awardedAt: new Date('2026-10-20T00:00:00Z') },
        { accountId: 'c', key: 'midnight-chrome-frame', sourceQuestKey: 'supporter', awardedAt: new Date('2026-10-01T00:00:00Z') },
      ],
      [
        { accountId: 'a', showOnSupporterList: true },
        { accountId: 'b', showOnSupporterList: true },
        { accountId: 'c', showOnSupporterList: false },
        { accountId: 'x', showOnSupporterList: true },
      ],
      [
        { id: 'a', username: 'NewDon', isActive: true, bannedAt: null },
        { id: 'b', username: 'VitoReyes', isActive: true, bannedAt: null },
        { id: 'c', username: 'QuietMoney', isActive: true, bannedAt: null },
        // Opted in but never supported: not listed.
        { id: 'x', username: 'Tourist', isActive: true, bannedAt: null },
      ],
    );

    expect(await PublicSupportersService.list(db as unknown as PrismaClient)).toEqual({
      supporters: [{ name: 'VitoReyes', since: '2026-10' }, { name: 'NewDon', since: '2026-11' }],
    });
  });
});
