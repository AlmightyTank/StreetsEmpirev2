import { describe, expect, it } from 'vitest';
import { classicOgV30F, classicOgV30G } from '../index.js';
import { HOLIDAY_ROAD_CHOICE_KEY, HOLIDAY_ROAD_COSMETIC_KEY, HOLIDAY_ROAD_ENCOUNTER_KEY, HOLIDAY_ROAD_WINDOW } from '../holiday-road.js';

describe('Holiday Road Sedan', () => {
  const prior = classicOgV30F.randomEncounters!.triggers.TRAVEL!.entries;
  const next = classicOgV30G.randomEncounters!.triggers.TRAVEL!.entries;
  const event = next.find((entry) => entry.key === HOLIDAY_ROAD_ENCOUNTER_KEY);

  it('adds one rare Christmas travel encounter to a new pinned ruleset without changing older rounds', () => {
    expect(classicOgV30F.cosmetics?.[HOLIDAY_ROAD_COSMETIC_KEY]).toBeUndefined();
    expect(prior.some((entry) => entry.key === HOLIDAY_ROAD_ENCOUNTER_KEY)).toBe(false);
    expect(next).toHaveLength(prior.length + 1);
    expect(event).toMatchObject({ weight: 1, tone: 'good', availableUtc: HOLIDAY_ROAD_WINDOW });
    expect(classicOgV30G.meta.id).toBe('classic-og-v3.0-g');
  });

  it('keeps the cosmetic permanent and limited to sedans', () => {
    expect(classicOgV30G.cosmetics?.[HOLIDAY_ROAD_COSMETIC_KEY]).toMatchObject({
      kind: 'ITEM_COLLECTION', styleKey: 'holiday-road', rarity: 'legendary',
    });
    expect(event?.choices?.map((choice) => choice.key)).toContain(HOLIDAY_ROAD_CHOICE_KEY);
  });
});
