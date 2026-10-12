import { describe, expect, it } from 'vitest';
import { classicOgV07F, classicOgV07H, classicOgV18M, classicOgV18O } from '@streets/rulesets';
import { recipeLadder } from '@streets/rules-engine';
import type { Ruleset } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import { PermanentUnlockService } from '../permanent-unlock.service.js';

describe('PermanentUnlockService', () => {
  it('finds product purchase gates only on rulesets that define them', () => {
    expect(PermanentUnlockService.productPurchaseUnlock(classicOgV07F, 'METH')).toBeNull();
    expect(PermanentUnlockService.productPurchaseUnlock(classicOgV07H, 'METH')).toMatchObject({
      key: 'PRODUCT_METH_ACCESS',
      effect: { kind: 'PRODUCT_PURCHASE_ACCESS', productKey: 'METH' },
    });
    expect(PermanentUnlockService.productPurchaseUnlock(classicOgV07H, 'WEED')).toBeNull();
  });

  it('gates recipe production and Scout districts independently through quests', async () => {
    const ruleset = {
      ...classicOgV07H,
      permanentUnlocks: {
        ...classicOgV07H.permanentUnlocks,
        PRODUCT_COCAINE_RECIPE: {
          key: 'PRODUCT_COCAINE_RECIPE', name: 'Cocaine Recipe', description: 'A quest unlocks this recipe.',
          category: 'PRODUCT', effect: { kind: 'PRODUCT_PRODUCTION_ACCESS', productKey: 'COCAINE' },
        },
        URBAN_GHETTO_SCOUT_ACCESS: {
          key: 'URBAN_GHETTO_SCOUT_ACCESS', name: 'Ghetto Access', description: 'A quest opens this neighborhood.',
          category: 'TRAVEL', effect: { kind: 'DISTRICT_ACCESS', districtKey: 'URBAN_GHETTO' },
        },
      },
    } as Ruleset;
    const keys = new Set<string>();
    const db = {
      playerUnlock: { findMany: async () => [...keys].map((key) => ({ key })) },
      npcGang: { findUnique: async () => null },
    } as unknown as Db;

    expect(PermanentUnlockService.productProductionUnlock(ruleset, 'COCAINE')?.key).toBe('PRODUCT_COCAINE_RECIPE');
    expect((await PermanentUnlockService.districtAccess(db, 'player-1', ruleset)).get('URBAN_GHETTO')?.unlocked).toBe(false);
    await expect(PermanentUnlockService.assertCanProduceProduct(db, 'player-1', ruleset, 'COCAINE')).rejects.toMatchObject({ code: 'PRODUCT_RECIPE_LOCKED' });
    await expect(PermanentUnlockService.assertCanAccessDistrict(db, 'player-1', ruleset, 'URBAN_GHETTO')).rejects.toMatchObject({ code: 'DISTRICT_ACCESS_LOCKED' });
    await expect(PermanentUnlockService.assertCanAccessDistrict(db, 'player-1', ruleset, 'CASINO')).resolves.toBeUndefined();

    keys.add('PRODUCT_COCAINE_RECIPE');
    keys.add('URBAN_GHETTO_SCOUT_ACCESS');
    await expect(PermanentUnlockService.assertCanProduceProduct(db, 'player-1', ruleset, 'COCAINE')).resolves.toBeUndefined();
    await expect(PermanentUnlockService.assertCanAccessDistrict(db, 'player-1', ruleset, 'URBAN_GHETTO')).resolves.toBeUndefined();
  });

  it('gates the Nightclub and Casino on 1.8.0-O until the story jobs that open them are claimed', async () => {
    const ruleset = classicOgV18O as Ruleset;
    const keys = new Set<string>();
    const db = {
      playerUnlock: { findMany: async () => [...keys].map((key) => ({ key })) },
      npcGang: { findUnique: async () => null },
    } as unknown as Db;

    const access = await PermanentUnlockService.districtAccess(db, 'player-1', ruleset);
    expect([...access.keys()].sort()).toEqual(['CASINO', 'NIGHTCLUB']);
    for (const district of ['WINO_SLUMS', 'LOW_RENT', 'URBAN_GHETTO'] as const) {
      await expect(PermanentUnlockService.assertCanAccessDistrict(db, 'player-1', ruleset, district)).resolves.toBeUndefined();
    }
    await expect(PermanentUnlockService.assertCanAccessDistrict(db, 'player-1', ruleset, 'NIGHTCLUB'))
      .rejects.toMatchObject({ code: 'DISTRICT_ACCESS_LOCKED', message: expect.stringContaining('Keeping Them Happy') });
    await expect(PermanentUnlockService.assertCanAccessDistrict(db, 'player-1', ruleset, 'CASINO'))
      .rejects.toMatchObject({ code: 'DISTRICT_ACCESS_LOCKED', message: expect.stringContaining('Payday') });

    keys.add('DISTRICT_NIGHTCLUB_ACCESS');
    await expect(PermanentUnlockService.assertCanAccessDistrict(db, 'player-1', ruleset, 'NIGHTCLUB')).resolves.toBeUndefined();
    await expect(PermanentUnlockService.assertCanAccessDistrict(db, 'player-1', ruleset, 'CASINO')).rejects.toMatchObject({ code: 'DISTRICT_ACCESS_LOCKED' });
    keys.add('DISTRICT_CASINO_ACCESS');
    await expect(PermanentUnlockService.assertCanAccessDistrict(db, 'player-1', ruleset, 'CASINO')).resolves.toBeUndefined();
  });

  it('never gates an NPC gang, which runs no quests', async () => {
    const db = {
      playerUnlock: { findMany: async () => { throw new Error('an NPC gang needs no unlock lookup'); } },
      npcGang: { findUnique: async () => ({ id: 'gang-1' }) },
    } as unknown as Db;
    const access = await PermanentUnlockService.districtAccess(db, 'npc-player', classicOgV18O as Ruleset);
    expect([...access.values()].map((gate) => gate.unlocked)).toEqual([true, true]);
    await expect(PermanentUnlockService.assertCanAccessDistrict(db, 'npc-player', classicOgV18O as Ruleset, 'CASINO')).resolves.toBeUndefined();
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
      classicOgV07H,
      'PRODUCT_METH_ACCESS',
      'PIP_BULK_ORDER',
    );
    const second = await PermanentUnlockService.award(
      db,
      'player-1',
      classicOgV07H,
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
      classicOgV07H,
      'NOT_A_REAL_UNLOCK',
      'TEST_JOB',
    )).rejects.toMatchObject({ code: 'QUEST_REWARD_INVALID' });
  });

  it('awards every recipe on the ladder once per round player, whatever repeats it', async () => {
    const rows = new Map<string, { key: string; sourceQuestKey: string | null }>();
    const db = {
      playerUnlock: {
        upsert: async ({ where, create }: { where: { roundPlayerId_key: { roundPlayerId: string; key: string } }; create: { key: string; sourceQuestKey: string | null } }) => {
          const id = `${where.roundPlayerId_key.roundPlayerId}:${where.roundPlayerId_key.key}`;
          if (!rows.has(id)) rows.set(id, { key: create.key, sourceQuestKey: create.sourceQuestKey });
          return rows.get(id)!;
        },
        findMany: async ({ where }: { where: { roundPlayerId: string } }) =>
          [...rows.entries()].filter(([id]) => id.startsWith(`${where.roundPlayerId}:`)).map(([, row]) => ({ key: row.key })),
      },
    } as unknown as Db;
    const ruleset = classicOgV18M as Ruleset;
    const rungs = recipeLadder(ruleset);
    expect(rungs).toHaveLength(5);

    // Two claims of every rung (a retried claim, an admin replay): one row each, sourced to the first job.
    for (let pass = 0; pass < 2; pass += 1) {
      for (const rung of rungs) {
        const unlock = PermanentUnlockService.productProductionUnlock(ruleset, rung.product)!;
        await PermanentUnlockService.award(db, 'round-a-player', ruleset, unlock.key, pass ? 'REPLAY' : rung.questKey);
      }
    }
    expect(rows.size).toBe(5);
    expect([...rows.values()].every((row) => row.sourceQuestKey !== 'REPLAY')).toBe(true);
    for (const rung of rungs) await expect(PermanentUnlockService.assertCanProduceProduct(db, 'round-a-player', ruleset, rung.product)).resolves.toBeUndefined();

    // A player in another round (another round player row) holds none of it.
    expect(await PermanentUnlockService.keys(db, 'round-b-player')).toEqual(new Set());
    for (const rung of rungs) {
      await expect(PermanentUnlockService.assertCanProduceProduct(db, 'round-b-player', ruleset, rung.product)).rejects.toMatchObject({ code: 'PRODUCT_RECIPE_LOCKED' });
    }
    await expect(PermanentUnlockService.assertCanProduceProduct(db, 'round-b-player', ruleset, 'CRACK')).resolves.toBeUndefined();
  });
});
