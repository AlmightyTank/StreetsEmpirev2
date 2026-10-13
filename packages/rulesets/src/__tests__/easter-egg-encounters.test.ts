import { describe, expect, it } from 'vitest';
import { EASTER_EGG_ENCOUNTERS } from '@streets/shared';
import { classicOgV18L } from '../classic-og-v1.8-l/index.js';
import { classicOgV18M, easterEggEncounters } from '../classic-og-v1.8-m/index.js';

describe('1.8.0-M Easter egg encounters', () => {
  it('adds one rare egg entry to four triggers and changes nothing else', () => {
    const before = classicOgV18L.randomEncounters!.triggers;
    const after = classicOgV18M.randomEncounters!.triggers;
    for (const [trigger, egg] of Object.entries(easterEggEncounters)) {
      const key = trigger as keyof typeof after;
      expect(after[key]!.entries).toEqual([...before[key]!.entries, egg]);
      expect(after[key]!.chance).toBe(before[key]!.chance);
      expect(egg.weight).toBe(1);
    }
    expect(after.STORE).toBe(before.STORE);
    expect(after.COMBAT).toBe(before.COMBAT);

    // Slice M also balances recipes and A Better Cut; their differences have dedicated tests.
    const { meta: _meta, randomEncounters: _encounters, products: _products, questDefinitions: _quests, ...rest } = classicOgV18M;
    const { meta: _baseMeta, randomEncounters: _baseEncounters, products: _baseProducts, questDefinitions: _baseQuests, ...base } = classicOgV18L;
    expect(rest).toEqual(base);
  });

  it('offers every choice the egg catalog expects', () => {
    const entries = Object.values(easterEggEncounters);
    for (const [encounterKey, choices] of Object.entries(EASTER_EGG_ENCOUNTERS)) {
      const entry = entries.find((candidate) => candidate.key === encounterKey);
      expect(entry, encounterKey).toBeDefined();
      for (const choice of Object.keys(choices)) {
        expect(entry!.choices.map((candidate) => candidate.key)).toContain(choice);
      }
    }
  });
});
