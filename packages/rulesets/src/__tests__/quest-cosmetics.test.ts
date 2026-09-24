import { describe, expect, it } from 'vitest';
import { classicOgV07W } from '../classic-og-v0.7-w/index.js';
import { classicOgV07X } from '../classic-og-v0.7-x/index.js';
import { questDefinitionProblems } from '../quest-definitions.js';

describe('Phase Y-C quest-only cosmetics', () => {
  it('pins a new ruleset without changing the quest catalog size', () => {
    expect(classicOgV07X.meta).toEqual({
      id: 'classic-og-v0.7-x',
      version: '0.7.0-X',
      name: 'Classic OG - Quest Cosmetics',
    });
    expect(Object.keys(classicOgV07X.questDefinitions ?? {}))
      .toHaveLength(Object.keys(classicOgV07W.questDefinitions ?? {}).length);
  });

  it('defines six permanent title/badge cosmetics', () => {
    expect(Object.values(classicOgV07X.cosmetics ?? {})).toHaveLength(6);
    expect(Object.values(classicOgV07X.cosmetics ?? {}).every(
      (cosmetic) => cosmetic.kind === 'TITLE_BADGE',
    )).toBe(true);
    expect(classicOgV07X.cosmetics?.['ghost-of-the-block']?.rarity).toBe('legendary');
    expect(classicOgV07X.cosmetics?.['road-king']?.rarity).toBe('epic');
  });

  it('awards cosmetics only from one-time contact finales', () => {
    const expected = {
      MAMA_QUIET_HOUR: 'ghost-of-the-block',
      PIP_TOP_SHELF: 'top-shelf-operator',
      TOMMY_FULL_RACK: 'full-rack-enforcer',
      WHEELS_HOME_SAFE: 'road-king',
      VIC_CLEAN_SLATE: 'no-paper-trail',
      BLOCKS_OUT_OF_TOWN: 'corner-boss',
    } as const;

    for (const questKey of Object.keys(expected) as Array<keyof typeof expected>) {
      const cosmeticKey = expected[questKey];
      const quest = classicOgV07X.questDefinitions?.[questKey];
      expect(quest?.repeatability).toBe('ONCE');
      expect(quest?.rewards).toContainEqual({
        kind: 'COSMETIC_UNLOCK',
        key: cosmeticKey,
      });
      expect(classicOgV07X.cosmetics?.[cosmeticKey as keyof typeof classicOgV07X.cosmetics]).toBeDefined();
    }
  });

  it('does not add permanent cosmetics to repeatable work', () => {
    const repeatable = Object.values(classicOgV07X.questDefinitions ?? {})
      .filter((definition) => definition.repeatability !== 'ONCE');

    expect(repeatable.flatMap((definition) => definition.rewards.map((reward) => reward.kind)))
      .not.toContain('COSMETIC_UNLOCK');
  });

  it('rejects future repeatable quests that try to grant permanent cosmetics', () => {
    const source = classicOgV07X.questDefinitions!.WHEELS_HOME_SAFE;
    const invalid = {
      ...classicOgV07X.questDefinitions!,
      TEST_REPEATABLE_COSMETIC: {
        ...source,
        key: 'TEST_REPEATABLE_COSMETIC',
        repeatability: 'REPEATABLE' as const,
        rewards: [{ kind: 'COSMETIC_UNLOCK' as const, key: 'road-king' }],
        prerequisites: [],
        followUpKeys: [],
      },
    };

    expect(questDefinitionProblems(invalid))
      .toContain('TEST_REPEATABLE_COSMETIC: permanent cosmetic rewards require ONCE repeatability');
  });
});
