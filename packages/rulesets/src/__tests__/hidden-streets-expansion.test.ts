import { describe, expect, it } from 'vitest';
import { classicOgV18R } from '../classic-og-v1.8-r/index.js';
import { classicOgV18S } from '../classic-og-v1.8-s/index.js';
import { rulesets } from '../index.js';
import { questCosmeticProblems, questDefinitionProblems } from '../quest-definitions.js';
import type { QuestCosmeticCatalog, QuestDefinitionCatalog, RandomEncounterEntryRules } from '../types.js';

const rCatalog = classicOgV18R.questDefinitions as QuestDefinitionCatalog;
const sCatalog = classicOgV18S.questDefinitions as QuestDefinitionCatalog;
const sCosmetics = classicOgV18S.cosmetics as unknown as QuestCosmeticCatalog | undefined;

function entry(key: string): RandomEncounterEntryRules | undefined {
  return Object.values(classicOgV18S.randomEncounters?.triggers ?? {})
    .flatMap((trigger) => trigger?.entries ?? [])
    .find((candidate) => candidate.key === key);
}

function rEntry(key: string): RandomEncounterEntryRules | undefined {
  return Object.values(classicOgV18R.randomEncounters?.triggers ?? {})
    .flatMap((trigger) => trigger?.entries ?? [])
    .find((candidate) => candidate.key === key);
}

describe('Hidden Streets complete expansion', () => {
  it('ships as a versioned ruleset without mutating Slice E', () => {
    expect(classicOgV18S.meta).toMatchObject({
      id: 'classic-og-v1.8-s',
      version: '1.8.0-S',
      name: 'Classic OG - Hidden Streets Complete',
    });
    expect(rulesets[classicOgV18S.meta.id]).toBe(classicOgV18S);

    expect(rCatalog.SECRET_LOST_FORTUNE).toBeUndefined();
    expect(rEntry('scout-old-coin')).toBeUndefined();
    expect((classicOgV18R.cosmetics as unknown as QuestCosmeticCatalog | undefined)?.['lost-fortune-badge']).toBeUndefined();
  });

  it('adds reliable encounter acquisition paths on existing action surfaces', () => {
    const keys = [
      'scout-old-coin',
      'scout-missing-witness',
      'scout-dream-static',
      'scout-star-chart-fragment',
      'scout-night-watcher-signal',
      'scout-forgotten-runestone',
      'travel-three-travelers',
      'travel-timekeeper-anomaly',
      'travel-extraction-cache',
      'travel-rune-merchant',
      'store-dockyard-manifest',
      'store-red-storm-device',
      'turf-laughing-card',
      'combat-five-names',
    ];

    for (const key of keys) {
      const candidate = entry(key);
      expect(candidate, key).toBeTruthy();
      expect(candidate?.weight, key).toBeGreaterThan(0);
      expect(candidate?.choices, key).toHaveLength(3);
    }
  });

  it('adds independent secret families with clue milestones and cosmetic-only permanent rewards', () => {
    const secretKeys = [
      'SECRET_LOST_FORTUNE',
      'SECRET_THREE_TRAVELERS',
      'SECRET_DOCKYARD_INVESTIGATION',
      'SECRET_MISSING_WITNESS',
      'SECRET_THE_PATTERN',
      'SECRET_BLACKWOOD_MANOR',
      'SECRET_THIRTEEN_CHAMBERS',
      'SECRET_DONT_FALL_ASLEEP',
      'SECRET_NEW_EARTH',
      'SECRET_TIMEKEEPER',
      'SECRET_RED_STORM',
      'SECRET_FIVE_NAMES',
      'SECRET_EXTRACTION_REQUIRED',
      'SECRET_NIGHT_WATCHER',
      'SECRET_LAUGHING_KING',
      'SECRET_ONE_BAD_NIGHT',
      'SECRET_FORGOTTEN_GUILD',
      'SECRET_WANDERING_RUNE_MERCHANT',
      'SECRET_THREE_GUILD_TRIALS',
      'SECRET_ANCIENT_SEALS',
      'SECRET_YOU_HAD_TO_BE_THERE',
    ];
    const families = new Set<string>();

    for (const key of secretKeys) {
      const quest = sCatalog[key]!;
      expect(quest, key).toBeTruthy();
      expect(quest.type, key).toBe('SECRET');
      expect(quest.repeatability, key).toBe('ONCE');
      expect(quest.availability.hidden, key).toBe(true);
      expect(quest.availability.secretContent?.clueMilestones?.length, key).toBeGreaterThan(0);
      expect(quest.availability.secretContent?.cooldownMinutes, key).toBeGreaterThan(0);
      expect(quest.rewards.some((reward) => reward.kind === 'PERMANENT_UNLOCK' || reward.kind === 'WEAPON_ACCESS'), key).toBe(false);
      families.add(quest.availability.secretContent?.family ?? '');
    }

    expect(families).toEqual(new Set([
      'LOST_ADVENTURE',
      'DETECTIVE',
      'BLACKWOOD',
      'SCI_FI',
      'DANGEROUS',
      'SHADOW_CITY',
      'FORGOTTEN_GUILD',
      'LEGENDARY_CROSSOVER',
    ]));
  });

  it('wires final cosmetics and completion rewards through the existing catalog', () => {
    for (const key of [
      'lost-fortune-badge',
      'lost-fortune-frame',
      'pattern-board-badge',
      'manor-unmasked-badge',
      'star-chart-frame',
      'extraction-badge',
      'shadow-city-badge',
      'shadow-city-frame',
      'guildmaster-badge',
      'guild-arcane-frame',
      'you-had-to-be-there-badge',
      'you-had-to-be-there-frame',
    ]) {
      expect(sCosmetics?.[key], key).toBeTruthy();
    }

    expect(sCatalog.SECRET_BLACKWOOD_MANOR?.rewards).toContainEqual({ kind: 'COSMETIC_UNLOCK', key: 'blackwood-manor-theme' });
    expect(sCatalog.SECRET_YOU_HAD_TO_BE_THERE?.rewards).toEqual(expect.arrayContaining([
      { kind: 'COSMETIC_UNLOCK', key: 'you-had-to-be-there-badge' },
      { kind: 'COSMETIC_UNLOCK', key: 'you-had-to-be-there-frame' },
    ]));
  });

  it('passes quest and cosmetic validation before runtime', () => {
    expect(questDefinitionProblems(sCatalog)).toEqual([]);
    expect(questCosmeticProblems(sCatalog, sCosmetics)).toEqual([]);
  });
});
