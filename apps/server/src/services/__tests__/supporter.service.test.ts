import { describe, expect, it } from 'vitest';
import { SUPPORTER_COSMETICS } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import { SupporterService } from '../supporter.service.js';

type Row = { accountId: string; key: string; kind: string; styleKey: string | null; sourceQuestKey: string; awardedAt: Date };

function fakeDb(rows: Row[] = []) {
  return {
    rows,
    accountCosmeticUnlock: {
      findMany: async ({ where }: { where: { accountId: string; key: { in: string[] } } }) =>
        rows.filter((row) => row.accountId === where.accountId && where.key.in.includes(row.key)),
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
  };
}

describe('SupporterService', () => {
  it('grants the Midnight Chrome collection and the Signature card as permanent unlocks', async () => {
    const db = fakeDb();
    const at = new Date('2026-10-11T12:00:00Z');

    const added = await SupporterService.grant(db as unknown as Db, 'account-1', at);

    expect(added).toEqual(Object.keys(SUPPORTER_COSMETICS));
    expect(db.rows.map((row) => [row.kind, row.styleKey, row.sourceQuestKey])).toEqual([
      ['ITEM_COLLECTION', 'midnight-chrome', 'supporter'],
      ['PROFILE_FRAME', 'midnight-chrome-frame', 'supporter'],
    ]);
    expect(await SupporterService.since(db as unknown as Db, 'account-1')).toEqual(at);
  });

  it('only adds what is missing, so granting twice changes nothing', async () => {
    const db = fakeDb();
    await SupporterService.grant(db as unknown as Db, 'account-1');

    expect(await SupporterService.grant(db as unknown as Db, 'account-1')).toEqual([]);
    expect(db.rows).toHaveLength(2);
  });

  it('reports no supporter date for an account that was never granted', async () => {
    expect(await SupporterService.since(fakeDb() as unknown as Db, 'account-1')).toBeNull();
  });
});
