import { describe, expect, it } from 'vitest';
import { classicOgV18O, classicOgV18P } from '../index.js';
import { questDefinitionProblems } from '../quest-definitions.js';
import type { QuestDefinition, QuestDefinitionCatalog, QuestRewardDefinition } from '../types.js';

const catalogP = classicOgV18P.questDefinitions as unknown as QuestDefinitionCatalog;

const ORIGINAL_SECRETS = [
  'SECRET_RED_LINE',
  'SECRET_BLOOD_IN_WATER',
  'SECRET_ONE_PHONE_CALL',
  'SECRET_HEAVY_FREIGHT',
  'SECRET_HOUSE_FULL',
  'SECRET_CORNER_KING',
  'SECRET_SEVEN_FIGURES',
];

describe('hidden streets slice B ruleset', () => {
  it('adds the salesman and van encounters with three choices each', () => {
    const travel = classicOgV18P.randomEncounters!.triggers.TRAVEL!;
    const scout = classicOgV18P.randomEncounters!.triggers.SCOUT!;
    const salesman = travel.entries.find((entry) => entry.key === 'travel-traveling-salesman')!;
    const van = scout.entries.find((entry) => entry.key === 'scout-colorful-van')!;
    expect(salesman).toBeDefined();
    expect(van).toBeDefined();
    expect(salesman.choices).toHaveLength(3);
    expect(van.choices).toHaveLength(3);
    for (const entry of [salesman, van]) {
      expect(entry.weight).toBeGreaterThan(0);
      const keys = entry.choices!.map((choice) => choice.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const choice of entry.choices!) {
        expect(choice.label.trim().length).toBeGreaterThan(0);
        expect(choice.text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every encounter effect bounded and capped-safe', () => {
    const entries = [
      ...classicOgV18P.randomEncounters!.triggers.TRAVEL!.entries,
      ...classicOgV18P.randomEncounters!.triggers.SCOUT!.entries,
    ].filter((entry) => entry.key === 'travel-traveling-salesman' || entry.key === 'scout-colorful-van');
    for (const entry of entries) {
      for (const choice of entry.choices!) {
        const cash = choice.cash;
        if (cash) {
          expect(Math.abs(cash.minCents)).toBeLessThanOrEqual(28_000);
          expect(Math.abs(cash.maxCents)).toBeLessThanOrEqual(28_000);
        }
        const heat = choice.heat;
        if (heat) {
          expect(Math.abs(heat.min)).toBeLessThanOrEqual(2);
          expect(Math.abs(heat.max)).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('adds the Blackwood Gate secret with a valid van-linked trigger', () => {
    const quest = catalogP.SECRET_BLACKWOOD_GATE! as QuestDefinition;
    expect(quest.type).toBe('SECRET');
    expect(quest.repeatability).toBe('ONCE');
    expect(quest.availability.hidden).toBe(true);
    expect(quest.availability.secretTrigger).toEqual({
      kind: 'ACTIVITY_COUNT',
      eventTypes: ['SCOUT'],
      where: { 'encounter.key': 'scout-colorful-van' },
      target: 1,
    });
    expect(quest.availability.secretContent).toMatchObject({
      family: 'BLACKWOOD',
      discoveryTier: 'HIDDEN',
      clueMilestones: ['trace_steps'],
    });
    const rewards: QuestRewardDefinition[] = [...quest.rewards];
    expect(rewards.some((reward) => reward.kind === 'PERMANENT_UNLOCK')).toBe(false);
    expect(rewards.some((reward) => reward.kind === 'WEAPON_ACCESS')).toBe(false);
  });

  it('passes full catalog validation', () => {
    expect(questDefinitionProblems(catalogP)).toEqual([]);
  });

  it('preserves the original seven secrets', () => {
    for (const key of ORIGINAL_SECRETS) {
      expect(catalogP[key]).toBeDefined();
    }
  });

  it('leaves the previous pinned ruleset untouched', () => {
    const oldTravel = classicOgV18O.randomEncounters!.triggers.TRAVEL!.entries.map((entry) => entry.key);
    const oldScout = classicOgV18O.randomEncounters!.triggers.SCOUT!.entries.map((entry) => entry.key);
    expect(oldTravel).not.toContain('travel-traveling-salesman');
    expect(oldScout).not.toContain('scout-colorful-van');
    expect(classicOgV18O.questDefinitions!['SECRET_BLACKWOOD_GATE' as never]).toBeUndefined();
  });

  it('stays on first-class encounters with cooldowns intact', () => {
    expect(classicOgV18P.meta.eventSystem?.randomEncounters).toBe('FIRST_CLASS');
    expect(classicOgV18P.randomEncounters!.triggers.TRAVEL!.perKeyCooldownMinutes).toBeGreaterThan(0);
    expect(classicOgV18P.randomEncounters!.triggers.SCOUT!.perKeyCooldownMinutes).toBeGreaterThan(0);
  });
});
