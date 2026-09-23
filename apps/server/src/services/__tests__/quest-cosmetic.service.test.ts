import { describe, expect, it } from 'vitest';
import { classicOgV07X, classicOgV07Y } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import { QuestCosmeticService } from '../quest-cosmetic.service.js';

describe('QuestCosmeticService', () => {
  it('snapshots a quest cosmetic onto the permanent account row', async () => {
    const upserts: unknown[] = [];
    const db = {
      accountCosmeticUnlock: {
        upsert: async (args: unknown) => { upserts.push(args); },
      },
    } as unknown as Db;
    const at = new Date('2026-09-23T03:45:00Z');

    const cosmetic = await QuestCosmeticService.award(
      db,
      'account-1',
      classicOgV07X,
      'road-king',
      'WHEELS_HOME_SAFE',
      at,
    );

    expect(cosmetic).toMatchObject({
      key: 'road-king',
      name: 'Road King',
      kind: 'TITLE_BADGE',
      rarity: 'epic',
    });
    expect(upserts).toEqual([{
      where: { accountId_key: { accountId: 'account-1', key: 'road-king' } },
      create: {
        accountId: 'account-1',
        key: 'road-king',
        kind: 'TITLE_BADGE',
        title: 'Road King',
        description: cosmetic.description,
        rarity: 'epic',
        styleKey: null,
        sourceQuestKey: 'WHEELS_HOME_SAFE',
        sourceRulesetId: 'classic-og-v0.7-x',
        sourceRulesetVersion: '0.7.0-X',
        awardedAt: at,
      },
      update: {},
    }]);
  });

  it('snapshots presentation keys for Y-D appearance cosmetics', async () => {
    const upserts: Array<{ create: Record<string, unknown> }> = [];
    const db = {
      accountCosmeticUnlock: {
        upsert: async (args: { create: Record<string, unknown> }) => { upserts.push(args); },
      },
    } as unknown as Db;

    await QuestCosmeticService.award(
      db,
      'account-1',
      classicOgV07Y,
      'wheels-open-road-blue',
      'WHEELS_HOME_SAFE',
      new Date('2026-09-23T14:10:00Z'),
    );

    expect(upserts[0]?.create).toMatchObject({
      key: 'wheels-open-road-blue',
      kind: 'ACCENT',
      styleKey: 'open-road-blue',
      sourceRulesetId: 'classic-og-v0.7-y',
      sourceRulesetVersion: '0.7.0-Y',
    });
  });

  it('returns style keys as selectable accent/frame option keys', async () => {
    const db = {
      accountCosmeticUnlock: {
        findMany: async () => [{
          key: 'wheels-open-road-frame',
          title: 'Open Road Frame',
          description: 'Road frame',
          styleKey: 'open-road-frame',
          awardedAt: new Date('2026-09-23T14:10:00Z'),
        }],
      },
    } as unknown as Db;

    await expect(QuestCosmeticService.optionsForAccount(db, 'account-1', 'PROFILE_FRAME'))
      .resolves.toEqual([{
        key: 'open-road-frame',
        label: 'Open Road Frame',
        description: 'Road frame',
      }]);
  });

  it('maps stored title/badge cosmetics to permanent profile awards', async () => {
    const awardedAt = new Date('2026-09-23T03:45:00Z');
    const db = {
      accountCosmeticUnlock: {
        findMany: async () => [{
          key: 'road-king',
          title: 'Road King',
          description: 'Road description',
          rarity: 'epic',
          awardedAt,
        }],
      },
    } as unknown as Db;

    await expect(QuestCosmeticService.awardsForAccount(db, 'account-1'))
      .resolves.toEqual([{
        key: 'road-king',
        title: 'Road King',
        description: 'Road description',
        category: 'quest',
        rarity: 'epic',
        unlocked: true,
        earnedAt: awardedAt.toISOString(),
        progress: { current: 1, target: 1, label: 'quest cosmetic' },
      }]);
  });

  it('rejects cosmetic keys not present in the pinned ruleset', async () => {
    const db = {
      accountCosmeticUnlock: {
        upsert: async () => { throw new Error('should not write'); },
      },
    } as unknown as Db;

    await expect(QuestCosmeticService.award(
      db,
      'account-1',
      classicOgV07X,
      'NOT_A_COSMETIC',
      'WHEELS_HOME_SAFE',
    )).rejects.toMatchObject({ code: 'QUEST_COSMETIC_UNKNOWN' });
  });
});
