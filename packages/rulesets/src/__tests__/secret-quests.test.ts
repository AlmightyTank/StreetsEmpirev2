import { describe, expect, it } from 'vitest';
import type { QuestRewardDefinition } from '../types.js';
import { classicOgV07O } from '../classic-og-v0.7-o/index.js';
import { classicOgV07P } from '../classic-og-v0.7-p/index.js';
import { secretQuests } from '../classic-og-v0.7-p/secret-quests.js';
import { hideoutV2For, hideoutV2Problems } from '../hideout-v2.js';

describe('quest roadmap Phase Q secret Jobs', () => {
  it('preserves P and adds seven hidden one-time definitions', () => {
    expect(Object.keys(classicOgV07O.questDefinitions ?? {})).toHaveLength(44);
    expect(Object.keys(secretQuests)).toHaveLength(7);
    expect(Object.keys(classicOgV07P.questDefinitions ?? {})).toHaveLength(51);
    expect(Object.values(secretQuests).every((quest) => quest.type === 'SECRET')).toBe(true);
    expect(Object.values(secretQuests).every((quest) => quest.repeatability === 'ONCE')).toBe(true);
    expect(Object.values(secretQuests).every((quest) => quest.availability.hidden === true)).toBe(true);
    expect(Object.values(secretQuests).every((quest) => Boolean(quest.availability.secretTrigger))).toBe(true);
  });

  it('covers each planned discovery condition', () => {
    const triggers = Object.values(secretQuests).map((quest) => quest.availability.secretTrigger as { kind: string; field?: string });
    expect(triggers).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'STATE_AT_LEAST', field: 'heat' }),
      expect.objectContaining({ kind: 'ACTIVITY_COUNT' }),
      expect.objectContaining({ kind: 'ACTIVITY_OBJECT_SUM_AT_LEAST', field: 'cargoBack' }),
      expect.objectContaining({ kind: 'STATE_AT_LEAST', field: 'whores' }),
      expect.objectContaining({ kind: 'TURF_COUNT_AT_LEAST' }),
      expect.objectContaining({ kind: 'STATE_AT_LEAST', field: 'netWorthCents' }),
    ]));
  });

  it('does not hide permanent progression behind secret discovery', () => {
    const rewards: QuestRewardDefinition[] = Object.values(secretQuests).flatMap((quest) => [...quest.rewards]);
    expect(rewards.some((reward) => reward.kind === 'PERMANENT_UNLOCK')).toBe(false);
    expect(rewards.some((reward) => reward.kind === 'WEAPON_ACCESS')).toBe(false);
  });

  it('inherits daily, weekly, favors, unlocks and Hideout behavior unchanged', () => {
    for (const definition of Object.values(classicOgV07O.questDefinitions ?? {})) {
      expect(classicOgV07P.questDefinitions?.[definition.key]).toEqual(definition);
    }
    expect(classicOgV07P.favors).toEqual(classicOgV07O.favors);
    expect(classicOgV07P.permanentUnlocks).toEqual(classicOgV07O.permanentUnlocks);
    expect(hideoutV2For(classicOgV07P)).toEqual(hideoutV2For(classicOgV07O));
    expect(hideoutV2Problems(classicOgV07P)).toEqual([]);
  });
});
