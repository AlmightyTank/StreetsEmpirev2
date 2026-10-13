import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SupporterDropService } from '../supporter-drop.service.js';
import { PublicSupportersService } from '../public-supporters.service.js';

type Row = Record<string, any>;
const OCTOBER = new Date('2026-10-01T00:30:00Z');

/** Tables the drop sweep, its summary and the public list read. */
function fakeDb(memberships: Row[], unlocks: Row[] = [], profiles: Row[] = [], accounts: Row[] = [], payments: Row[] = []) {
  const audit: Row[] = [];
  const matches = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'in' in value) return (value.in as unknown[]).includes(row[key]);
    return row[key] === value;
  });
  const db: Row = {
    audit,
    unlocks,
    payments,
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    supporterMembership: {
      findMany: async ({ where }: Row) => memberships.filter((row) => where.status.in.includes(row.status)),
    },
    supporterPayment: {
      findMany: async ({ where }: Row) => payments.filter((row) => matches(row, where)),
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

  it('grants every item in a multi-item bundle, including a partial hold', async () => {
    const march = new Date('2027-03-10T00:00:00Z');
    const db = fakeDb(
      [{ accountId: 'a', status: 'active' }, { accountId: 'b', status: 'active' }],
      [{ accountId: 'b', key: 'supporter-drop-2027-03' }],
    );

    expect(await SupporterDropService.sweep(db as unknown as PrismaClient, march)).toEqual({ month: '2027-03', granted: 2 });
    const aKeys = db.unlocks.filter((row: Row) => row.accountId === 'a').map((row: Row) => row.key).sort();
    expect(aKeys).toEqual(['supporter-drop-2027-03', 'supporter-drop-2027-03-backer']);
    const bKeys = db.unlocks.filter((row: Row) => row.accountId === 'b').map((row: Row) => row.key).sort();
    expect(bKeys).toEqual(['supporter-drop-2027-03', 'supporter-drop-2027-03-backer']);
    expect(db.audit).toHaveLength(2);

    expect(await SupporterDropService.sweep(db as unknown as PrismaClient, march)).toEqual({ month: '2027-03', granted: 0 });
  });

  it('reconciles tenure badges for supporters who hold the bundle but never got the badge', async () => {
    const paid = (iso: string) => ({ accountId: 'v', amountCents: 500, status: 'paid', paidAt: new Date(iso) });
    const db = fakeDb(
      [{ accountId: 'v', status: 'active' }],
      [{ accountId: 'v', key: 'supporter-drop-2026-10' }],
      [],
      [],
      [paid('2026-10-15T12:00:00Z'), paid('2026-11-15T12:00:00Z'), paid('2026-12-15T12:00:00Z')],
    );

    expect(await SupporterDropService.sweep(db as unknown as PrismaClient, OCTOBER)).toEqual({ month: '2026-10', granted: 1 });
    expect(db.unlocks.filter((row: Row) => row.accountId === 'v').map((row: Row) => row.key)).toContain('supporter-tenure-3');
    expect(db.audit[0]).toMatchObject({ actorUsername: 'Monthly drop', reason: 'Supporter tenure award', targetId: 'v' });

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
