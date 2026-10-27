import { describe, expect, it } from 'vitest';
import { classicOgV26K, LATEST_RULESET } from '../index.js';

describe('sports influence jobs', () => {
  it('ships the Vic contract in a new pinned ruleset', () => {
    const quest = classicOgV26K.questDefinitions?.FAVOR_ON_THE_LINE;
    expect(quest).toMatchObject({ key: 'FAVOR_ON_THE_LINE', contactKey: 'VIC', type: 'SIDE', expiresAfterMinutes: 180 });
    expect(quest?.objectives[0]?.params).toEqual({
      eventTypes: ['QUEST_STORY_SCENE'],
      where: { questKey: 'FAVOR_ON_THE_LINE', sceneKey: 'choose_approach' },
    });
    expect(quest?.branches).toHaveLength(5);
    expect(quest?.story?.scenes?.[0]?.responses).toHaveLength(5);
    expect(LATEST_RULESET.meta.id).toBe('classic-og-v2.6-k');
  });
});
