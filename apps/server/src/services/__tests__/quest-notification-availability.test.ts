import { describe, expect, it } from 'vitest';
import { classicOgV18O, classicOgV19D, type QuestDefinition } from '@streets/rulesets';
import { announceableQuestKeys } from '../handcrafted-quest.service.js';

const definitions = {
  ...classicOgV18O.questDefinitions,
  ...classicOgV19D.questDefinitions,
} as Record<string, QuestDefinition | undefined>;
const now = new Date('2026-10-17T12:00:00.000Z');

function statuses(entries: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(entries));
}

describe('announceableQuestKeys', () => {
  it('keeps a follow-up the player can take right now', () => {
    expect(definitions.FRESH_FACES).toBeDefined();
    expect(announceableQuestKeys(
      ['FRESH_FACES'],
      definitions,
      statuses({ FRESH_FACES: 'AVAILABLE' }),
      now,
    )).toEqual(['FRESH_FACES']);
  });

  it('does not announce a holiday job before its public window', () => {
    expect(definitions.CHRISTMAS_MIDNIGHT_DELIVERY).toBeDefined();
    expect(definitions.HALLOWEEN_WITCHING_RUN).toBeDefined();
    expect(announceableQuestKeys(
      ['CHRISTMAS_MIDNIGHT_DELIVERY', 'HALLOWEEN_WITCHING_RUN', 'FRESH_FACES'],
      definitions,
      statuses({
        CHRISTMAS_MIDNIGHT_DELIVERY: 'AVAILABLE',
        HALLOWEEN_WITCHING_RUN: 'AVAILABLE',
        FRESH_FACES: 'AVAILABLE',
      }),
      now,
    )).toEqual(['HALLOWEEN_WITCHING_RUN', 'FRESH_FACES']);
  });

  it('announces a holiday job once the public window is open', () => {
    expect(announceableQuestKeys(
      ['CHRISTMAS_MIDNIGHT_DELIVERY'],
      definitions,
      statuses({ CHRISTMAS_MIDNIGHT_DELIVERY: 'AVAILABLE' }),
      new Date('2026-12-15T00:00:00.000Z'),
    )).toEqual(['CHRISTMAS_MIDNIGHT_DELIVERY']);
  });

  it('drops work that auto-accept already started', () => {
    expect(definitions.CITY_JOB_C).toBeDefined();
    expect(announceableQuestKeys(
      ['CITY_JOB_C', 'FRESH_FACES'],
      definitions,
      statuses({ CITY_JOB_C: 'ACTIVE', FRESH_FACES: 'AVAILABLE' }),
      now,
    )).toEqual(['FRESH_FACES']);
  });

  it('drops a job that still needs a locked recipe or district', () => {
    expect(definitions.DAILY_METH_COOK).toBeDefined();
    expect(definitions.MAMA_NIGHT_SHIFT).toBeDefined();
    expect(announceableQuestKeys(
      ['DAILY_METH_COOK', 'MAMA_NIGHT_SHIFT', 'FRESH_FACES'],
      definitions,
      statuses({
        DAILY_METH_COOK: 'AVAILABLE',
        MAMA_NIGHT_SHIFT: 'AVAILABLE',
        FRESH_FACES: 'AVAILABLE',
      }),
      now,
      { lockedRecipes: new Set(['METH']), lockedDistricts: new Set(['NIGHTCLUB']) },
    )).toEqual(['FRESH_FACES']);
  });

  it('keeps a paced side quest off the bell until it is actually available', () => {
    expect(definitions.ACE_HOUSE_RULES).toBeDefined();
    expect(announceableQuestKeys(
      ['ACE_HOUSE_RULES', 'FRESH_FACES'],
      definitions,
      statuses({ ACE_HOUSE_RULES: 'LOCKED', FRESH_FACES: 'AVAILABLE' }),
      now,
    )).toEqual(['FRESH_FACES']);
    expect(announceableQuestKeys(
      ['ACE_HOUSE_RULES'],
      definitions,
      statuses({ ACE_HOUSE_RULES: 'AVAILABLE' }),
      now,
    )).toEqual(['ACE_HOUSE_RULES']);
  });
});
