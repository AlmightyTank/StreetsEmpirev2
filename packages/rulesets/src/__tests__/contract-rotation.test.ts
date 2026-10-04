import { describe, expect, it } from 'vitest';
import { classicOgV14A } from '../classic-og-v1.4-a/index.js';
import { moreDailyContracts } from '../classic-og-v1.4-a2/daily-contracts.js';
import { classicOgV14A2 } from '../classic-og-v1.4-a2/index.js';
import { moreWeeklyContracts } from '../classic-og-v1.4-a2/weekly-contracts.js';
import { factionProblems } from '../faction-definitions.js';
import { hideoutV2For } from '../hideout-v2.js';
import type { QuestDefinition, QuestRewardDefinition, Ruleset } from '../types.js';

const all = Object.values(classicOgV14A2.questDefinitions);
const added: QuestDefinition[] = [...Object.values(moreDailyContracts), ...Object.values(moreWeeklyContracts)];

/** Every event type and field a Job in 1.4.0-A already tracks. New contracts may only use these. */
function knownSignals(): Set<string> {
  const signals = new Set<string>();
  for (const quest of Object.values(classicOgV14A.questDefinitions) as QuestDefinition[]) {
    for (const objective of [...quest.objectives, ...quest.bonusObjectives]) {
      const types = (objective.params?.eventTypes ?? []) as string[];
      for (const type of types) signals.add(`${objective.kind}:${type}:${String(objective.params?.field ?? '')}`);
    }
  }
  return signals;
}

describe('1.4.0-A2 contract rotation', () => {
  it('pins a new ruleset on 1.4.0-A that only adds contracts and the rotation flag', () => {
    expect(classicOgV14A2.meta).toEqual({ id: 'classic-og-v1.4-a2', version: '1.4.0-A2', name: 'Classic OG - Contract Rotation' });
    expect({ ...classicOgV14A2, meta: null, questDefinitions: null, contractRotation: null })
      .toEqual({ ...classicOgV14A, meta: null, questDefinitions: null, contractRotation: null });
    expect(classicOgV14A2.contractRotation).toEqual({ perRoundDeck: true, freshCityBoards: true });
    expect((classicOgV14A as Ruleset).contractRotation).toBeUndefined();
    for (const [key, quest] of Object.entries(classicOgV14A.questDefinitions)) {
      expect(classicOgV14A2.questDefinitions[key as keyof typeof classicOgV14A2.questDefinitions]).toBe(quest);
    }
    expect(hideoutV2For(classicOgV14A2)).toEqual(hideoutV2For(classicOgV14A));
    expect(factionProblems(classicOgV14A2)).toEqual([]);
  });

  it('grows the daily pool to 30 and the weekly pool to 16, both a whole number of boards', () => {
    const dailies = all.filter((quest) => quest.type === 'DAILY' && quest.repeatability === 'DAILY');
    const weeklies = all.filter((quest) => quest.type === 'WEEKLY' && quest.repeatability === 'WEEKLY');
    expect(Object.keys(moreDailyContracts)).toHaveLength(22);
    expect(Object.keys(moreWeeklyContracts)).toHaveLength(10);
    expect(dailies).toHaveLength(30);
    expect(weeklies).toHaveLength(16);
    expect(dailies.length % 3).toBe(0);
    expect(weeklies.length % 2).toBe(0);
  });

  it('tracks only game signals an existing Job already relies on', () => {
    const known = knownSignals();
    for (const quest of added) {
      expect(quest.prerequisites).toEqual([]);
      for (const objective of quest.objectives) {
        const types = (objective.params?.eventTypes ?? []) as string[];
        expect(types.length, quest.key).toBeGreaterThan(0);
        for (const type of types) {
          expect(known.has(`${objective.kind}:${type}:${String(objective.params?.field ?? '')}`), `${quest.key} ${objective.kind} ${type}`).toBe(true);
        }
      }
    }
  });

  it('pays known contacts and favors, with modest bounded rewards', () => {
    const favors = classicOgV14A2.favors;
    const contacts = classicOgV14A2.contacts;
    for (const quest of added) {
      expect(contacts[quest.contactKey as keyof typeof contacts], quest.key).toBeDefined();
      const rewards: QuestRewardDefinition[] = [...quest.rewards];
      expect(rewards.some((reward) => reward.kind === 'PERMANENT_UNLOCK' || reward.kind === 'WEAPON_ACCESS')).toBe(false);
      for (const reward of rewards.filter((entry) => entry.kind === 'FAVOR_ITEM')) {
        const favor = favors[reward.key as keyof typeof favors];
        expect(favor, `${quest.key} ${reward.key}`).toBeDefined();
        expect((favor as { rarity?: string }).rarity).not.toBe('LEGENDARY');
      }
      const cash = rewards.filter((reward) => reward.kind === 'CASH').reduce((sum, reward) => sum + (reward.amount ?? 0), 0);
      expect(cash).toBeLessThanOrEqual(quest.type === 'DAILY' ? 1_500_000 : 6_000_000);
    }
  });
});
