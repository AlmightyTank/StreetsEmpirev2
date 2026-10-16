import { describe, expect, it } from 'vitest';
import type { Ruleset } from '../types.js';
import { classicOgV18S, classicOgV30D } from '../index.js';
import { defineLivingStoryCatalog, livingStoryCatalogForRuleset, LIVING_STORIES_STARTER_CATALOG } from '../living-stories.js';

describe('2.0.0-A Living Streets ruleset catalog', () => {
  it('does not activate content on historical or current pinned rounds', () => {
    expect(livingStoryCatalogForRuleset(classicOgV18S)).toEqual({});
    expect(livingStoryCatalogForRuleset(classicOgV30D)).toEqual({});
    expect(Object.values(LIVING_STORIES_STARTER_CATALOG).every((def) => !def.enabled && def.rewardBudgetCents === 0)).toBe(true);
  });
  it('rejects mismatched definition keys and nonexistent cases', () => {
    expect(() => defineLivingStoryCatalog({
      STORY_ONE: { ...LIVING_STORIES_STARTER_CATALOG.STORY_AFTER_THE_SMOKE, key: 'STORY_TWO' },
    })).toThrow(/definition key/);
    expect(() => defineLivingStoryCatalog({
      STORY_ONE: { ...LIVING_STORIES_STARTER_CATALOG.STORY_AFTER_THE_SMOKE, key: 'STORY_ONE', caseKey: 'CASE_FAKE' as never },
    })).toThrow(/case key/);
  });
  it('is explicitly pinned by a ruleset and validates trigger ownership', () => {
    const ruleset = { meta: { id: 'test', version: '1' }, livingStories: LIVING_STORIES_STARTER_CATALOG } as unknown as Ruleset;
    expect(livingStoryCatalogForRuleset(ruleset).STORY_MISSING_LEDGER?.trigger.eventKinds).toEqual(['business_flip']);
    expect(() => defineLivingStoryCatalog({
      STORY_ONE: { ...LIVING_STORIES_STARTER_CATALOG.STORY_AFTER_THE_SMOKE, key: 'STORY_ONE',
        trigger: { sourceKind: 'OTHER' as never, eventKinds: ['war_win'] } },
    })).toThrow(/source owner/);
  });
});
