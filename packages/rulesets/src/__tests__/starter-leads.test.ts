import { describe, expect, it } from 'vitest';
import { classicOgV18S, classicOgV24A } from '../index.js';
import type { QuestDefinitionCatalog } from '../types.js';

const starterKeys = [
  'BOARD_MAMA_FIRST_LOOK',
  'BOARD_TOMMY_MUSCLE',
  'BOARD_PIP_FIRST_BATCH',
  'BOARD_WHEELS_FIRST_RUN',
  'BOARD_BLOCKS_MARK_CORNER',
] as const;

describe('current quest board starter leads', () => {
  it('offers five lore-led leads without a linear prerequisite chain', () => {
    const catalog = classicOgV24A.questDefinitions as QuestDefinitionCatalog;
    for (const key of starterKeys) {
      const quest = catalog[key];
      expect(quest).toBeDefined();
      if (!quest) throw new Error(`Missing starter quest ${key}`);
      expect(quest.prerequisites).toEqual([]);
      expect(quest.description.length).toBeGreaterThan(20);
      expect(quest.story?.intro.length).toBeGreaterThan(20);
      expect(quest.story?.inProgress.length).toBeGreaterThan(20);
      expect(quest.story?.completed.length).toBeGreaterThan(20);
      expect(quest.story?.actionHint.length).toBeGreaterThan(10);
      expect(quest.objectives[0]?.description.length).toBeGreaterThan(10);
    }
  });

  it('retires the old linear jobs only from the current catalog', () => {
    const current = classicOgV24A.questDefinitions as QuestDefinitionCatalog;
    const historical = classicOgV18S.questDefinitions as QuestDefinitionCatalog;
    for (const key of ['FIRST_NIGHT_OUT', 'FRESH_FACES', 'KEEPING_THEM_HAPPY', 'COOKHOUSE', 'PAYDAY', 'HEAVY_HANDS', 'EYES_OPEN', 'COLLECTION_DAY', 'PACK_YOUR_BAGS']) {
      expect(current[key]).toBeUndefined();
      expect(historical[key]).toBeDefined();
    }
    expect(current.PLANT_THE_FLAG?.prerequisites).toEqual([
      { kind: 'QUEST_COMPLETED', params: { questKey: 'BOARD_BLOCKS_MARK_CORNER' } },
    ]);
  });
});
