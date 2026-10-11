import { describe, expect, it } from 'vitest';
import { classicOgV18K, classicOgV18L } from '../index.js';
import { ACCENT_REWARDS, questAccents } from '../classic-og-v1.8-l/accents.js';

describe('1.8.0-L quest accents', () => {
  it('pays each new accent from exactly the contract it names', () => {
    for (const [questKey, accentKey] of Object.entries(ACCENT_REWARDS)) {
      const quest = classicOgV18L.questDefinitions[questKey as keyof typeof classicOgV18L.questDefinitions]!;
      expect(quest.rewards, questKey).toContainEqual({ kind: 'COSMETIC_UNLOCK', key: accentKey });
      const before = classicOgV18K.questDefinitions[questKey as keyof typeof classicOgV18K.questDefinitions]!;
      expect(quest.rewards.slice(0, -1)).toEqual(before.rewards);
    }
    const paid = Object.values(ACCENT_REWARDS);
    expect(new Set(paid).size).toBe(paid.length);
  });

  it('ships each accent as a selectable, ruleset-known cosmetic', () => {
    for (const accent of Object.values(questAccents)) {
      expect(classicOgV18L.cosmetics[accent.key]).toEqual(accent);
      expect(accent.kind).toBe('ACCENT');
    }
  });

  it('changes nothing but cosmetics and those quest rewards from 1.8.0-K', () => {
    const { meta: _meta, cosmetics: _cosmetics, questDefinitions: quests, ...next } = classicOgV18L;
    const { meta: _baseMeta, cosmetics: _baseCosmetics, questDefinitions: baseQuests, ...base } = classicOgV18K;
    expect(next).toEqual(base);
    expect(Object.keys(quests)).toEqual(Object.keys(baseQuests));
    for (const key of Object.keys(baseQuests)) {
      if (key in ACCENT_REWARDS) continue;
      expect(quests[key as keyof typeof quests]).toBe(baseQuests[key as keyof typeof baseQuests]);
    }
  });
});
