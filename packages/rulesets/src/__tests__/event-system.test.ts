import { describe, expect, it } from 'vitest';
import { classicOgV07AA, classicOgV07T, classicOgV16F, classicOgV18F, classicOgV18G, classicOgV18H, classicOgV18I, classicOgV18J } from '../index.js';
import { activeRoundEventTime, eventCatalogForRuleset } from '../event-system.js';

describe('first-class event catalog adapter', () => {
  it('pins first-class community ownership to the new ruleset version', () => {
    expect('eventSystem' in classicOgV18F.meta).toBe(false);
    expect(classicOgV18G.meta.eventSystem?.communityEvents).toBe('FIRST_CLASS');
    expect(eventCatalogForRuleset(classicOgV18G).filter((entry) => entry.type === 'COMMUNITY')).toHaveLength(4);
    expect(classicOgV18H.meta.eventSystem).toEqual({ communityEvents: 'FIRST_CLASS', seasonalEvents: 'FIRST_CLASS' });
    expect(eventCatalogForRuleset(classicOgV18H).filter((entry) => entry.type === 'SEASONAL')).toHaveLength(2);
    expect(classicOgV18I.meta.eventSystem).toEqual({ communityEvents: 'FIRST_CLASS', seasonalEvents: 'FIRST_CLASS', randomEncounters: 'FIRST_CLASS' });
    expect(eventCatalogForRuleset(classicOgV18I).filter((entry) => entry.type === 'RANDOM_ENCOUNTER').length)
      .toBeGreaterThan(eventCatalogForRuleset(classicOgV18H).filter((entry) => entry.type === 'RANDOM_ENCOUNTER').length);
    expect(classicOgV18J.meta.eventSystem?.cityConditions).toBe('FIRST_CLASS');
    const conditions = eventCatalogForRuleset(classicOgV18J).filter((entry) => entry.type === 'CITY_CONDITION');
    expect(conditions).toHaveLength(5);
    expect(conditions.every((entry) => entry.scope === 'CITY' && entry.legacySource.kind === 'CITY_CONDITION')).toBe(true);
    expect(conditions.find((entry) => entry.key === 'CITY:money-in-motion-follow-up')?.schedule).toEqual({
      kind: 'EVENT_FOLLOW_UP', parentType: 'COMMUNITY', parentKey: 'EVENT_MONEY_IN_MOTION', durationMinutes: 360,
    });
    expect(eventCatalogForRuleset(classicOgV18I).filter((entry) => entry.type === 'CITY_CONDITION')).toHaveLength(0);
    expect(classicOgV18H.randomEncounters).toEqual(classicOgV16F.randomEncounters);
  });

  it('maps Phase U community jobs to round-scoped quarter windows', () => {
    const entries = eventCatalogForRuleset(classicOgV07T).filter((entry) => entry.type === 'COMMUNITY');

    expect(entries).toHaveLength(4);
    const windows = Object.fromEntries(entries.map((entry) => [entry.key, entry.schedule]));
    expect(windows).toMatchObject({
      EVENT_OPENING_RUSH: { kind: 'ROUND_FRACTION', startFraction: 0, endFraction: 0.25 },
      EVENT_MONEY_IN_MOTION: { kind: 'ROUND_FRACTION', startFraction: 0.25, endFraction: 0.5 },
      EVENT_INTERSTATE_PUSH: { kind: 'ROUND_FRACTION', startFraction: 0.5, endFraction: 0.75 },
      EVENT_LAST_CALL: { kind: 'ROUND_FRACTION', startFraction: 0.75, endFraction: 1 },
    });
    expect(entries.every((entry) => entry.scope === 'ROUND' && entry.legacySource.kind === 'QUEST_DEFINITION')).toBe(true);
    expect(entries.find((entry) => entry.key === 'EVENT_MONEY_IN_MOTION')?.config).toMatchObject({
      personalContributionTarget: 1_000_000,
      contributionLabel: 'personal store sales',
    });
  });

  it('maps Phase Y-F seasonal jobs to their fixed UTC windows and preserves rewards', () => {
    const entries = eventCatalogForRuleset(classicOgV07AA).filter((entry) => entry.type === 'SEASONAL');

    expect(entries).toHaveLength(2);
    expect(entries.find((entry) => entry.key === 'HALLOWEEN_2026')?.schedule).toEqual({
      kind: 'UTC_WINDOW',
      eventKey: 'HALLOWEEN_2026',
      startsAt: '2026-10-15T00:00:00.000Z',
      endsAt: '2026-11-03T00:00:00.000Z',
    });
    expect(entries.find((entry) => entry.key === 'CHRISTMAS_2026')?.config).toMatchObject({
      rewards: [{ kind: 'COSMETIC_UNLOCK', key: 'winter-christmas-2026' }],
      expiresAfterMinutes: 72 * 60,
    });
  });

  it('maps every configured action encounter to a player-scoped trigger definition', () => {
    const entries = eventCatalogForRuleset(classicOgV16F).filter((entry) => entry.type === 'RANDOM_ENCOUNTER');

    expect(entries.length).toBeGreaterThan(0);
    expect(new Set(entries.map((entry) => entry.schedule.kind))).toEqual(new Set(['ACTION_TRIGGER']));
    expect(new Set(entries.map((entry) => entry.scope))).toEqual(new Set(['PLAYER']));
    expect(entries.some((entry) => entry.key === 'SCOUT:scout-back-alley-choice')).toBe(true);
    expect(entries.some((entry) => entry.key === 'COMBAT:combat-block-watch')).toBe(true);
  });

  it('upgrades all six encounter triggers only in the new pinned ruleset', () => {
    const expected = {
      SCOUT: 'scout-bus-stop-whisper',
      PRODUCE: 'produce-supplier-shortfall',
      TRAVEL: 'travel-bridge-detour',
      STORE: 'store-miscounted-crate',
      TURF: 'turf-block-cleanup',
      COMBAT: 'combat-witness-at-the-deli',
    };
    for (const [trigger, entryKey] of Object.entries(expected)) {
      const upgraded = classicOgV18I.randomEncounters!.triggers[trigger as keyof typeof expected]!;
      const baseline = classicOgV18H.randomEncounters!.triggers[trigger as keyof typeof expected]!;
      expect(upgraded.entries.some((entry) => entry.key === entryKey), trigger).toBe(true);
      expect(upgraded.chance, trigger).toBeLessThan(baseline.chance);
      expect(upgraded.cooldownMinutes, trigger).toBeGreaterThanOrEqual(baseline.cooldownMinutes ?? 0);
      expect(upgraded.entries.find((entry) => entry.key === entryKey)?.choices?.length, trigger).toBeGreaterThan(1);
    }
  });
});

describe('active round event clock', () => {
  it('subtracts completed pause time from the event clock', () => {
    expect(activeRoundEventTime(
      { pausedAt: null, pausedMinutesTotal: 45 },
      new Date('2026-10-10T12:00:00.000Z'),
    )).toEqual(new Date('2026-10-10T11:15:00.000Z'));
  });

  it('freezes the event clock during an open pause', () => {
    expect(activeRoundEventTime(
      { pausedAt: new Date('2026-10-10T11:30:00.000Z'), pausedMinutesTotal: 15 },
      new Date('2026-10-10T12:00:00.000Z'),
    )).toEqual(new Date('2026-10-10T11:15:00.000Z'));
  });
});
