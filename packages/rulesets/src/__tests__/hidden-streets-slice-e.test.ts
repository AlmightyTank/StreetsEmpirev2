import { describe, expect, it } from 'vitest';
import { classicOgV18Q } from '../classic-og-v1.8-q/index.js';
import { classicOgV18R } from '../classic-og-v1.8-r/index.js';
import { rulesets } from '../index.js';
import { questCosmeticProblems, questDefinitionProblems } from '../quest-definitions.js';
import type { QuestCosmeticCatalog, QuestDefinitionCatalog, RandomEncounterEntryRules } from '../types.js';

const qCatalog = classicOgV18Q.questDefinitions as QuestDefinitionCatalog;
const rCatalog = classicOgV18R.questDefinitions as QuestDefinitionCatalog;
const qCosmetics = classicOgV18Q.cosmetics as unknown as QuestCosmeticCatalog | undefined;
const rCosmetics = classicOgV18R.cosmetics as unknown as QuestCosmeticCatalog | undefined;

function entry(key: string): RandomEncounterEntryRules | undefined {
  return Object.values(classicOgV18R.randomEncounters?.triggers ?? {})
    .flatMap((trigger) => trigger?.entries ?? [])
    .find((candidate) => candidate.key === key);
}

function qEntry(key: string): RandomEncounterEntryRules | undefined {
  return Object.values(classicOgV18Q.randomEncounters?.triggers ?? {})
    .flatMap((trigger) => trigger?.entries ?? [])
    .find((candidate) => candidate.key === key);
}

describe('Hidden Streets Slice E comedy collection', () => {
  it('ships as a versioned ruleset without mutating Slice D', () => {
    expect(classicOgV18R.meta).toMatchObject({
      id: 'classic-og-v1.8-r',
      version: '1.8.0-R',
      name: 'Classic OG - Hidden Streets Comedy',
    });
    expect(rulesets[classicOgV18R.meta.id]).toBe(classicOgV18R);

    expect(qCatalog.SECRET_TRAVELING_SAMPLE_CASE).toBeUndefined();
    expect(qEntry('scout-tin-can-golfer')).toBeUndefined();
    expect(qCosmetics?.['comedy-roadshow-badge']).toBeUndefined();
  });

  it('adds five comedy families through existing encounter keys', () => {
    const keys = [
      'travel-traveling-salesman',
      'scout-tin-can-golfer',
      'scout-junkyard-meteorite',
      'scout-block-matriarch',
      'store-regional-management',
    ];
    for (const key of keys) {
      const candidate = entry(key);
      expect(candidate, key).toBeTruthy();
      expect(candidate?.weight, key).toBeGreaterThan(0);
      expect(candidate?.choices, key).toHaveLength(3);
    }

    expect(classicOgV18R.randomEncounters?.triggers.SCOUT?.perKeyCooldownMinutes).toBeGreaterThan(0);
    expect(classicOgV18R.randomEncounters?.triggers.STORE?.perKeyCooldownMinutes).toBeGreaterThan(0);
  });

  it('adds hidden one-time comedy secrets with clue milestones and bounded rewards', () => {
    const secretKeys = [
      'SECRET_TRAVELING_SAMPLE_CASE',
      'SECRET_TIN_CAN_GOLFER',
      'SECRET_JUNKYARD_STAR',
      'SECRET_BLOCK_MATRIARCH',
      'SECRET_REGIONAL_MANAGEMENT',
    ];

    for (const key of secretKeys) {
      const quest = rCatalog[key]!;
      expect(quest.type, key).toBe('SECRET');
      expect(quest.repeatability, key).toBe('ONCE');
      expect(quest.availability.hidden, key).toBe(true);
      expect(quest.availability.secretContent?.family, key).toBe('COMEDY');
      expect(quest.availability.secretContent?.clueMilestones?.length, key).toBeGreaterThan(0);
      expect(quest.availability.secretContent?.cooldownMinutes, key).toBeGreaterThan(0);
      expect(quest.rewards.some((reward) => reward.kind === 'PERMANENT_UNLOCK' || reward.kind === 'WEAPON_ACCESS'), key).toBe(false);
    }

    expect(rCatalog.SECRET_TRAVELING_SAMPLE_CASE?.rewards).toContainEqual({ kind: 'COSMETIC_UNLOCK', key: 'comedy-roadshow-badge' });
    expect(rCatalog.SECRET_REGIONAL_MANAGEMENT?.rewards).toContainEqual({ kind: 'COSMETIC_UNLOCK', key: 'comedy-roadshow-frame' });
  });

  it('defines only permanent cosmetic rewards for the comedy collection', () => {
    expect(rCosmetics?.['comedy-roadshow-badge']).toMatchObject({ kind: 'TITLE_BADGE', rarity: 'rare' });
    expect(rCosmetics?.['comedy-roadshow-frame']).toMatchObject({ kind: 'PROFILE_FRAME', styleKey: 'comedy-roadshow-frame' });
  });

  it('passes quest and cosmetic validation before runtime', () => {
    expect(questDefinitionProblems(rCatalog)).toEqual([]);
    expect(questCosmeticProblems(rCatalog, rCosmetics)).toEqual([]);

    expect(questCosmeticProblems({
      ...rCatalog,
      SECRET_TRAVELING_SAMPLE_CASE: {
        ...rCatalog.SECRET_TRAVELING_SAMPLE_CASE!,
        rewards: [{ kind: 'COSMETIC_UNLOCK', key: 'missing-comedy-cosmetic' }],
      },
    }, rCosmetics)).toEqual([
      'SECRET_TRAVELING_SAMPLE_CASE: COSMETIC_UNLOCK reward missing-comedy-cosmetic is not in ruleset cosmetics',
    ]);
  });
});
