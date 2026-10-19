import { describe, expect, it } from 'vitest';
import { SUPPORTER_COSMETICS } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import { SupporterService } from '../supporter.service.js';

type Row = { accountId: string; key: string; kind: string; styleKey: string | null; sourceQuestKey: string; awardedAt: Date };
type PaymentRow = { accountId: string | null; amountCents: number; status: string; paidAt: Date | null };
type StampRow = { accountId: string; roundId: string; awardedAt: Date };

function fakeDb(rows: Row[] = [], payments: PaymentRow[] = [], stamps: StampRow[] = []) {
  return {
    rows,
    accountCosmeticUnlock: {
      findMany: async ({ where }: { where: { accountId: string | { in: string[] }; key?: { in: string[] }; sourceQuestKey?: string } }) =>
        rows.filter((row) =>
          (typeof where.accountId === 'string' ? row.accountId === where.accountId : where.accountId.in.includes(row.accountId))
          && (where.key === undefined || where.key.in.includes(row.key))
          && (where.sourceQuestKey === undefined || row.sourceQuestKey === where.sourceQuestKey)),
      create: async ({ data }: { data: Row }) => {
        if (rows.some((row) => row.accountId === data.accountId && row.key === data.key)) throw new Error('unique');
        rows.push(data);
        return data;
      },
      findFirst: async ({ where }: { where: { accountId: string; sourceQuestKey: string } }) =>
        rows
          .filter((row) => row.accountId === where.accountId && row.sourceQuestKey === where.sourceQuestKey)
          .sort((a, b) => a.awardedAt.getTime() - b.awardedAt.getTime())[0] ?? null,
    },
    supporterPayment: {
      findMany: async ({ where }: { where: { accountId?: string; status: string } }) =>
        payments.filter((row) => (where.accountId === undefined || row.accountId === where.accountId) && row.status === where.status),
    },
    supporterSeasonStamp: {
      findMany: async ({ where }: { where: { roundId?: string | { in: string[] }; accountId?: { in: string[] } } }) =>
        stamps.filter((row) =>
          (where.roundId === undefined
            || (typeof where.roundId === 'string' ? row.roundId === where.roundId : where.roundId.in.includes(row.roundId)))
          && (where.accountId === undefined || where.accountId.in.includes(row.accountId))),
      create: async ({ data }: { data: StampRow }) => {
        if (stamps.some((row) => row.accountId === data.accountId && row.roundId === data.roundId)) throw new Error('unique');
        stamps.push(data);
        return data;
      },
    },
  };
}

describe('SupporterService', () => {
  it('grants the Midnight Chrome collection, Signature card and banner accent as permanent unlocks', async () => {
    const db = fakeDb();
    const at = new Date('2026-10-11T12:00:00Z');

    const added = await SupporterService.grant(db as unknown as Db, 'account-1', at);

    expect(added).toEqual(Object.keys(SUPPORTER_COSMETICS));
    expect(db.rows.map((row) => [row.kind, row.styleKey, row.sourceQuestKey])).toEqual(
      Object.values(SUPPORTER_COSMETICS).map((cosmetic) => [cosmetic.kind, cosmetic.styleKey, 'supporter']),
    );
    expect(await SupporterService.since(db as unknown as Db, 'account-1')).toEqual(at);
  });

  it('only adds what is missing, so granting twice changes nothing', async () => {
    const db = fakeDb();
    await SupporterService.grant(db as unknown as Db, 'account-1');

    expect(await SupporterService.grant(db as unknown as Db, 'account-1')).toEqual([]);
    expect(db.rows).toHaveLength(Object.keys(SUPPORTER_COSMETICS).length);
  });

  it('reports no supporter date for an account that was never granted', async () => {
    expect(await SupporterService.since(fakeDb() as unknown as Db, 'account-1')).toBeNull();
  });
});

describe('SupporterService.grantTenure', () => {
  const paid = (month: string) => ({ accountId: 'account-1', amountCents: 500, status: 'paid', paidAt: new Date(`${month}-15T12:00:00Z`) });

  it('grants nothing below three paid months', async () => {
    const db = fakeDb([], [paid('2026-10'), paid('2026-11')]);
    expect(await SupporterService.grantTenure(db as unknown as Db, 'account-1')).toEqual([]);
    expect(db.rows).toEqual([]);
  });

  it('grants the 3-month badge on the third distinct paid month and keeps it permanent', async () => {
    const db = fakeDb([], [paid('2026-10'), paid('2026-11'), paid('2027-01')]);
    const at = new Date('2027-01-20T00:00:00Z');

    expect(await SupporterService.grantTenure(db as unknown as Db, 'account-1', at)).toEqual(['supporter-tenure-3']);
    expect(db.rows[0]).toMatchObject({
      key: 'supporter-tenure-3', kind: 'TITLE_BADGE', sourceQuestKey: 'supporter', sourceRulesetId: 'supporter-tenure',
    });
    // Granting again changes nothing.
    expect(await SupporterService.grantTenure(db as unknown as Db, 'account-1', at)).toEqual([]);
    expect(db.rows).toHaveLength(1);
  });

  it('counts repeat invoices in one month once and ignores free or unpaid rows', async () => {
    const db = fakeDb([], [
      paid('2026-10'),
      { ...paid('2026-10'), amountCents: 500 },
      { ...paid('2026-11'), amountCents: 0 },
      { ...paid('2026-12'), status: 'refunded' },
      paid('2027-01'),
      paid('2027-02'),
    ]);
    expect(await SupporterService.grantTenure(db as unknown as Db, 'account-1')).toEqual(['supporter-tenure-3']);
  });

  it('tops up only the missing badges at six paid months', async () => {
    const rows: Row[] = [{
      accountId: 'account-1', key: 'supporter-tenure-3', kind: 'TITLE_BADGE', styleKey: null,
      sourceQuestKey: 'supporter', awardedAt: new Date('2027-01-20T00:00:00Z'),
    }];
    const db = fakeDb(rows, [paid('2026-10'), paid('2026-11'), paid('2026-12'), paid('2027-01'), paid('2027-02'), paid('2027-03')]);
    expect(await SupporterService.grantTenure(db as unknown as Db, 'account-1')).toEqual(['supporter-tenure-6']);
  });
});

describe('SupporterService.flags', () => {
  const unlock = (accountId: string, key: string, awardedAt: string, sourceQuestKey = 'supporter'): Row => ({
    accountId, key, kind: 'TITLE_BADGE', styleKey: null, sourceQuestKey, awardedAt: new Date(awardedAt),
  });

  it('marks only accounts holding a supporter reward, with their earliest month', async () => {
    const db = fakeDb([
      unlock('a', 'supporter-drop-2026-10', '2026-10-05T12:00:00Z'),
      unlock('a', 'supporter-drop-2026-11', '2026-11-05T12:00:00Z'),
      unlock('b', 'some-quest-cosmetic', '2026-10-05T12:00:00Z', 'some-quest'),
    ]);
    const flags = await SupporterService.flags(db as unknown as Db, ['a', 'b', 'c']);
    expect(flags.get('a')).toEqual({ isSupporter: true, supporterSince: '2026-10' });
    expect(flags.get('b')).toEqual({ isSupporter: false, supporterSince: null });
    expect(flags.get('c')).toEqual({ isSupporter: false, supporterSince: null });
  });

  it('returns an empty map for no accounts and never leaks amounts or statuses', async () => {
    const db = fakeDb([unlock('a', 'supporter-drop-2026-10', '2026-10-05T12:00:00Z')]);
    expect(await SupporterService.flags(db as unknown as Db, [])).toEqual(new Map());
    const flags = await SupporterService.flags(db as unknown as Db, ['a']);
    expect(Object.keys(flags.get('a')!)).toEqual(['isSupporter', 'supporterSince']);
  });
});

describe('SupporterService.stampSeason', () => {
  const paid = (accountId: string | null, at: string, amountCents = 500, status = 'paid'): PaymentRow => ({
    accountId, amountCents, status, paidAt: new Date(at),
  });

  it('stamps each account with a paid invoice inside the season window once', async () => {
    const stamps: StampRow[] = [];
    const db = fakeDb([], [
      paid('a', '2027-03-01T00:00:00Z'),
      paid('a', '2027-03-15T00:00:00Z'),
      paid('b', '2027-03-31T23:59:59Z'),
      paid('c', '2027-04-01T00:00:01Z'),
    ], stamps);
    const at = new Date('2027-04-01T00:00:00Z');

    expect(await SupporterService.stampSeason(db as unknown as Db, 'round-1', new Date('2027-03-01T00:00:00Z'), at, at)).toEqual(['a', 'b']);
    expect(stamps.map((row) => [row.accountId, row.roundId, row.awardedAt.toISOString()])).toEqual([
      ['a', 'round-1', at.toISOString()],
      ['b', 'round-1', at.toISOString()],
    ]);
    expect(await SupporterService.stampSeason(db as unknown as Db, 'round-1', new Date('2027-03-01T00:00:00Z'), at, at)).toEqual([]);
  });

  it('ignores free, refunded, unlinked, and null-date payments', async () => {
    const stamps: StampRow[] = [];
    const db = fakeDb([], [
      paid('free', '2027-03-10T00:00:00Z', 0),
      paid('refunded', '2027-03-10T00:00:00Z', 500, 'refunded'),
      paid(null, '2027-03-10T00:00:00Z'),
      { accountId: 'null-date', amountCents: 500, status: 'paid', paidAt: null },
    ], stamps);

    expect(await SupporterService.stampSeason(db as unknown as Db, 'round-1', new Date('2027-03-01T00:00:00Z'), new Date('2027-04-01T00:00:00Z'))).toEqual([]);
    expect(stamps).toEqual([]);
  });

  it('batch-reads stamps by round', async () => {
    const db = fakeDb([], [], [
      { accountId: 'a', roundId: 'r1', awardedAt: new Date() },
      { accountId: 'b', roundId: 'r1', awardedAt: new Date() },
      { accountId: 'a', roundId: 'r2', awardedAt: new Date() },
    ]);

    const stamps = await SupporterService.seasonStamps(db as unknown as Db, ['r1', 'r2']);
    expect(stamps.get('r1')).toEqual(new Set(['a', 'b']));
    expect(stamps.get('r2')).toEqual(new Set(['a']));
  });
});
