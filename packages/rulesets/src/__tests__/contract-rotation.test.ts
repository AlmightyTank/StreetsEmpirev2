import { describe, expect, it } from 'vitest';
import { classicOgV14B } from '../classic-og-v1.4-b/index.js';
import { moreDailyContracts } from '../classic-og-v1.4-b2/daily-contracts.js';
import { classicOgV14B2 } from '../classic-og-v1.4-b2/index.js';
import { seasonContracts } from '../classic-og-v1.4-b2/season-contracts.js';
import { moreWeeklyContracts } from '../classic-og-v1.4-b2/weekly-contracts.js';
import { factionProblems } from '../faction-definitions.js';
import { hideoutV2For } from '../hideout-v2.js';
import type { QuestDefinition, QuestRewardDefinition, Ruleset } from '../types.js';

const all = Object.values(classicOgV14B2.questDefinitions);
const added: QuestDefinition[] = [
  ...Object.values(moreDailyContracts),
  ...Object.values(moreWeeklyContracts),
  ...Object.values(seasonContracts),
];

/**
 * Signals no Job tracked before B2, each checked against the server code that logs
 * it: business.service (BUSINESS_COLLECT.collectedCents), block-war-settle
 * (BLOCK_WAR_FIGHT), convoy.service (CONVOY_ATTACK.won), boss-trip-settle
 * (BOSS_HIT_ATTACK.escaped/held, TRIP_RETURNED.city) and boss-presence (OUTPOST_VISIT).
 */
const NEW_SIGNALS = [
  'EVENT_SUM:BUSINESS_COLLECT:collectedCents',
  'EVENT_COUNT:BLOCK_WAR_FIGHT:',
  'WIN_EVENTS:CONVOY_ATTACK:',
  'EVENT_COUNT:BOSS_HIT_ATTACK:',
  'EVENT_COUNT:OUTPOST_VISIT:',
  'UNIQUE_VALUES:TRIP_RETURNED:city',
];

/** Every event type and field a Job in 1.4.0-B already tracks, plus the B2 additions. */
function knownSignals(): Set<string> {
  const signals = new Set<string>(NEW_SIGNALS);
  for (const quest of Object.values(classicOgV14B.questDefinitions) as QuestDefinition[]) {
    for (const objective of [...quest.objectives, ...quest.bonusObjectives]) {
      const types = (objective.params?.eventTypes ?? []) as string[];
      for (const type of types) signals.add(`${objective.kind}:${type}:${String(objective.params?.field ?? '')}`);
    }
  }
  return signals;
}

describe('1.4.0-B2 contract rotation', () => {
  it('pins a new ruleset on 1.4.0-B that only adds contracts and the rotation flag', () => {
    expect(classicOgV14B2.meta).toEqual({ id: 'classic-og-v1.4-b2', version: '1.4.0-B2', name: 'Classic OG - Contract Rotation' });
    expect({ ...classicOgV14B2, meta: null, questDefinitions: null, contractRotation: null })
      .toEqual({ ...classicOgV14B, meta: null, questDefinitions: null, contractRotation: null });
    expect(classicOgV14B2.contractRotation).toEqual({ perRoundDeck: true, freshCityBoards: true, cityJobs: true });
    expect((classicOgV14B as Ruleset).contractRotation).toBeUndefined();
    for (const [key, quest] of Object.entries(classicOgV14B.questDefinitions)) {
      expect(classicOgV14B2.questDefinitions[key as keyof typeof classicOgV14B2.questDefinitions]).toBe(quest);
    }
    expect(hideoutV2For(classicOgV14B2)).toEqual(hideoutV2For(classicOgV14B));
    expect(factionProblems(classicOgV14B2)).toEqual([]);
  });

  it('grows the daily pool to 36 and the weekly pool to 20, both a whole number of boards', () => {
    const dailies = all.filter((quest) => quest.type === 'DAILY' && quest.repeatability === 'DAILY');
    const weeklies = all.filter((quest) => quest.type === 'WEEKLY' && quest.repeatability === 'WEEKLY');
    expect(Object.keys(moreDailyContracts)).toHaveLength(28);
    expect(Object.keys(moreWeeklyContracts)).toHaveLength(14);
    expect(dailies).toHaveLength(36);
    expect(weeklies).toHaveLength(20);
    expect(dailies.length % 3).toBe(0);
    expect(weeklies.length % 2).toBe(0);
  });

  it('tracks only game signals an existing Job relies on or the server is known to log', () => {
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

  it('adds categories for businesses, block wars, convoys and boss trips', () => {
    const categories = new Set(added.map((quest) => quest.category));
    for (const category of ['BUSINESS', 'BLOCK_WAR', 'CONVOY', 'BOSS_TRIP', 'CASINO', 'HEAT', 'LAW']) {
      expect(categories.has(category), category).toBe(true);
    }
  });

  it('adds a nine-contract season pool of one-time, round-long goals', () => {
    const seasons = (all as QuestDefinition[]).filter((quest) => quest.type === 'SEASON');
    expect(seasons).toHaveLength(9);
    for (const quest of seasons) {
      expect(quest.repeatability).toBe('ONCE');
      expect(quest.expiresAfterMinutes).toBeNull();
      expect(quest.availability.rotationPool).toBe('SEASON_CONTRACTS');
    }
    expect(new Set(seasons.map((quest) => quest.category)).size).toBeGreaterThanOrEqual(7);
  });

  it('pays known contacts and favors, with modest bounded rewards', () => {
    const favors = classicOgV14B2.favors;
    const contacts = classicOgV14B2.contacts;
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
      expect(cash).toBeLessThanOrEqual(quest.type === 'DAILY' ? 1_500_000 : quest.type === 'WEEKLY' ? 6_000_000 : 15_000_000);
    }
  });
});
