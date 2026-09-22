import { describe, expect, it } from 'vitest';
import { classicOgV07F, classicOgV07G } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import { PermanentUnlockService } from '../permanent-unlock.service.js';

describe('PermanentUnlockService', () => {
  it('finds product purchase gates only on rulesets that define them', () => {
    expect(PermanentUnlockService.productPurchaseUnlock(classicOgV07F, 'METH')).toBeNull();
    expect(PermanentUnlockService.productPurchaseUnlock(classicOgV07G, 'METH')).toMatchObject({
      key: 'PRODUCT_METH_ACCESS',
      effect: { kind: 'PRODUCT_PURCHASE_ACCESS', productKey: 'METH' },
    });
    expect(PermanentUnlockService.productPurchaseUnlock(classicOgV07G, 'WEED')).toBeNull();
  });

  it('awards one idempotent per-round unlock with its source job', async () => {
    const rows = new Map<string, { key: string; sourceQuestKey: string | null }>();
    const db = {
      playerUnlock: {
        upsert: async ({ where, create }: {
          where: { roundPlayerId_key: { roundPlayerId: string; key: string } };
          create: { key: string; sourceQuestKey: string | null };
        }) => {
          const id = `${where.roundPlayerId_key.roundPlayerId}:${where.roundPlayerId_key.key}`;
          if (!rows.has(id)) rows.set(id, { key: create.key, sourceQuestKey: create.sourceQuestKey });
          return rows.get(id)!;
        },
        findMany: async ({ where }: { where: { roundPlayerId: string } }) =>
          [...rows.entries()]
            .filter(([id]) => id.startsWith(`${where.roundPlayerId}:`))
            .map(([, row]) => ({ key: row.key })),
      },
    } as unknown as Db;

    const first = await PermanentUnlockService.award(
      db,
      'player-1',
      classicOgV07G,
      'PRODUCT_METH_ACCESS',
      'PIP_BULK_ORDER',
    );
    const second = await PermanentUnlockService.award(
      db,
      'player-1',
      classicOgV07G,
      'PRODUCT_METH_ACCESS',
      'OTHER_JOB',
    );

    expect(first.key).toBe('PRODUCT_METH_ACCESS');
    expect(second.key).toBe('PRODUCT_METH_ACCESS');
    expect(rows.size).toBe(1);
    expect(rows.get('player-1:PRODUCT_METH_ACCESS')).toEqual({
      key: 'PRODUCT_METH_ACCESS',
      sourceQuestKey: 'PIP_BULK_ORDER',
    });
    expect(await PermanentUnlockService.keys(db, 'player-1')).toEqual(new Set(['PRODUCT_METH_ACCESS']));
  });

  it('rejects a reward key that is not defined by the pinned ruleset', async () => {
    const db = {
      playerUnlock: {
        upsert: async () => {
          throw new Error('should not write');
        },
      },
    } as unknown as Db;

    await expect(PermanentUnlockService.award(
      db,
      'player-1',
      classicOgV07G,
      'NOT_A_REAL_UNLOCK',
      'TEST_JOB',
    )).rejects.toMatchObject({ code: 'QUEST_REWARD_INVALID' });
  });
});
