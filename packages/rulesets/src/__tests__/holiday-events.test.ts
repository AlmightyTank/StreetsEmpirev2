import { describe, expect, it } from 'vitest';
import { classicOgV07AA } from '../classic-og-v0.7-aa/index.js';

describe('Phase Y-F holiday event quests', () => {
  it('adds the two 2026 holiday jobs without changing the Y-E cosmetic catalog', () => {
    const quests = classicOgV07AA.questDefinitions!;
    expect(quests.HALLOWEEN_WITCHING_RUN).toBeDefined();
    expect(quests.CHRISTMAS_MIDNIGHT_DELIVERY).toBeDefined();

    expect(quests.HALLOWEEN_WITCHING_RUN.rewards).toEqual([
      { kind: 'COSMETIC_UNLOCK', key: 'halloween-moon-2026' },
    ]);
    expect(quests.CHRISTMAS_MIDNIGHT_DELIVERY.rewards).toEqual([
      { kind: 'COSMETIC_UNLOCK', key: 'winter-christmas-2026' },
    ]);

    expect(classicOgV07AA.cosmetics?.['halloween-moon-2026']?.styleKey).toBe('halloween-moon');
    expect(classicOgV07AA.cosmetics?.['winter-christmas-2026']?.styleKey).toBe('winter-lights');
  });

  it('keeps both holiday jobs one-time and date-windowed', () => {
    for (const key of ['HALLOWEEN_WITCHING_RUN', 'CHRISTMAS_MIDNIGHT_DELIVERY'] as const) {
      const quest = classicOgV07AA.questDefinitions![key];
      expect(quest.type).toBe('EVENT');
      expect(quest.repeatability).toBe('ONCE');
      expect(quest.availability.seasonalEvent?.eventKey).toMatch(/_2026$/);
      expect(new Date(quest.availability.seasonalEvent!.startsAt).getTime())
        .toBeLessThan(new Date(quest.availability.seasonalEvent!.endsAt).getTime());
    }
  });

  it('uses meaningful event-only progress objectives instead of gameplay buffs', () => {
    const halloween = classicOgV07AA.questDefinitions!.HALLOWEEN_WITCHING_RUN;
    const christmas = classicOgV07AA.questDefinitions!.CHRISTMAS_MIDNIGHT_DELIVERY;

    expect(halloween.objectives.map((objective) => objective.kind)).toEqual(['EVENT_COUNT', 'EVENT_COUNT']);
    expect(christmas.objectives.map((objective) => objective.kind))
      .toEqual(['EVENT_COUNT', 'EVENT_SUM', 'RECRUIT_CREW']);
  });
});
