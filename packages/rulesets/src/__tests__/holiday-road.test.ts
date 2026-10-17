import { describe, expect, it } from 'vitest';
import { classicOgV21A, classicOgV21B, type RandomEncounterEntryRules } from '../index.js';
import { HOLIDAY_ROAD_CHOICE_KEY, HOLIDAY_ROAD_COSMETIC_KEY, HOLIDAY_ROAD_ENCOUNTER_KEY, HOLIDAY_ROAD_WINDOW } from '../holiday-road.js';

describe('Holiday Road Sedan', () => {
  const prior = classicOgV21A.randomEncounters!.triggers.TRAVEL!.entries;
  const next = classicOgV21B.randomEncounters!.triggers.TRAVEL!.entries;
  const event = (next as readonly RandomEncounterEntryRules[]).find((entry) => entry.key === HOLIDAY_ROAD_ENCOUNTER_KEY);

  it('adds one rare Christmas travel encounter to a new pinned ruleset without changing older rounds', () => {
    expect(Object.hasOwn(classicOgV21A.cosmetics ?? {}, HOLIDAY_ROAD_COSMETIC_KEY)).toBe(false);
    expect(prior.some((entry) => entry.key === HOLIDAY_ROAD_ENCOUNTER_KEY)).toBe(false);
    expect(next).toHaveLength(prior.length + 1);
    expect(event).toMatchObject({ weight: 1, tone: 'good', availableUtc: HOLIDAY_ROAD_WINDOW });
    expect(classicOgV21B.meta.id).toBe('classic-og-v2.1-b');
  });

  it('keeps the cosmetic permanent and limited to sedans', () => {
    expect(classicOgV21B.cosmetics?.[HOLIDAY_ROAD_COSMETIC_KEY]).toMatchObject({
      kind: 'ITEM_COLLECTION', styleKey: 'holiday-road', rarity: 'legendary',
    });
    expect(event?.choices?.map((choice) => choice.key)).toContain(HOLIDAY_ROAD_CHOICE_KEY);
  });
});
