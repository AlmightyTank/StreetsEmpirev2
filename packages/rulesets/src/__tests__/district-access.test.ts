import { describe, expect, it } from 'vitest';
import { classicOgV18N } from '../classic-og-v1.8-n/index.js';
import { classicOgV18O } from '../classic-og-v1.8-o/index.js';
import { classicOgV18S } from '../classic-og-v1.8-s/index.js';
import { ENCOUNTER_GANG_RULES } from '../encounter-gangs.js';
import { rulesets } from '../index.js';
import { questRequiredDistricts } from '../quest-definitions.js';
import type { DistrictKey, QuestDefinition, QuestDefinitionCatalog, RandomEncounterRules, Ruleset } from '../types.js';

function districtGates(ruleset: Ruleset): Map<DistrictKey, string> {
  const gates = new Map<DistrictKey, string>();
  for (const unlock of Object.values(ruleset.permanentUnlocks ?? {})) {
    if (unlock.effect.kind === 'DISTRICT_ACCESS') gates.set(unlock.effect.districtKey, unlock.key);
  }
  return gates;
}

function grantingQuests(ruleset: Ruleset, unlockKey: string): QuestDefinition[] {
  return Object.values(ruleset.questDefinitions ?? {}).filter((quest) =>
    quest.rewards.some((reward) => reward.kind === 'PERMANENT_UNLOCK' && reward.key === unlockKey));
}

/** Every quest that must be claimed before this one can be offered, through QUEST_COMPLETED prerequisites. */
function questsBefore(catalog: QuestDefinitionCatalog, key: string, seen = new Set<string>()): Set<string> {
  for (const prerequisite of catalog[key]?.prerequisites ?? []) {
    if (prerequisite.kind !== 'QUEST_COMPLETED') continue;
    const before = String(prerequisite.params?.questKey);
    if (seen.has(before)) continue;
    seen.add(before);
    questsBefore(catalog, before, seen);
  }
  return seen;
}

/** Scout districts a quest's objectives (main or bonus) are tied to. */
function districtsWorked(quest: QuestDefinition): DistrictKey[] {
  return [...quest.objectives, ...quest.bonusObjectives]
    .map((objective) => (objective.params as { where?: { districtKey?: DistrictKey } }).where?.districtKey)
    .filter((district): district is DistrictKey => Boolean(district));
}

describe('1.8.0-O district access (Quest Access A)', () => {
  const ruleset: Ruleset = classicOgV18O;
  const catalog: QuestDefinitionCatalog = ruleset.questDefinitions!;

  it('ships pinned on top of 1.8.0-N and stays inherited by the newest ruleset', () => {
    expect(classicOgV18O.meta).toMatchObject({ id: 'classic-og-v1.8-o', version: '1.8.0-O', name: 'Classic OG - District Access' });
    expect(rulesets[classicOgV18O.meta.id]).toBe(classicOgV18O);
    expect(rulesets[classicOgV18S.meta.id]).toBe(classicOgV18S);
    expect(classicOgV18S.permanentUnlocks).toBe(classicOgV18O.permanentUnlocks);
    expect(Object.values(rulesets).at(-1)?.permanentUnlocks).toBe(classicOgV18O.permanentUnlocks);
  });

  it('locks only the Nightclub and Casino, each opened by one story job', () => {
    expect(Object.fromEntries(districtGates(ruleset))).toEqual({ NIGHTCLUB: 'DISTRICT_NIGHTCLUB_ACCESS', CASINO: 'DISTRICT_CASINO_ACCESS' });
    expect(grantingQuests(ruleset, 'DISTRICT_NIGHTCLUB_ACCESS').map((quest) => quest.key)).toEqual(['KEEPING_THEM_HAPPY']);
    expect(grantingQuests(ruleset, 'DISTRICT_CASINO_ACCESS').map((quest) => quest.key)).toEqual(['PAYDAY']);
    for (const key of ['KEEPING_THEM_HAPPY', 'PAYDAY']) {
      expect(catalog[key]).toMatchObject({ type: 'STORY', repeatability: 'ONCE' });
    }
  });

  it('opens each district before any quest asks the player to work it', () => {
    const gates = districtGates(ruleset);
    for (const quest of Object.values(catalog)) {
      // Dailies are dealt per player and skip a card whose district is locked (daily-contract.service).
      if (quest.type === 'DAILY') {
        for (const district of districtsWorked({ ...quest, bonusObjectives: [] })) expect(questRequiredDistricts(quest), quest.key).toContain(district);
        continue;
      }
      // A weekly runs seven days on the shared board; its district opens on a short story job well inside that.
      if (quest.type === 'WEEKLY') {
        for (const district of districtsWorked(quest)) {
          const unlock = gates.get(district);
          if (unlock) expect(grantingQuests(ruleset, unlock).every((granting) => granting.type === 'STORY'), quest.key).toBe(true);
        }
        continue;
      }
      for (const district of districtsWorked(quest)) {
        const unlock = gates.get(district);
        if (!unlock) continue;
        const granting = grantingQuests(ruleset, unlock).map((row) => row.key);
        const before = questsBefore(catalog, quest.key);
        expect(granting.some((key) => before.has(key)), `${quest.key} works ${district}`).toBe(true);
      }
    }
  });

  it('places both opening jobs on the story path every player walks', () => {
    const lastStoryJob = Object.values(catalog).find((quest) => quest.key === 'PLANT_THE_FLAG')!;
    const path = questsBefore(catalog, lastStoryJob.key);
    expect(path.has('KEEPING_THEM_HAPPY')).toBe(true);
    expect(path.has('PAYDAY')).toBe(true);
  });

  it('changes only the district unlocks, encounter gangs, and the two story jobs from 1.8.0-N', () => {
    const { meta: _meta, permanentUnlocks, questDefinitions: next, randomEncounters: nextEncounters, ...rest } = classicOgV18O;
    const { meta: _baseMeta, permanentUnlocks: baseUnlocks, questDefinitions: base, randomEncounters: baseEncounters, ...baseRest } = classicOgV18N;
    expect(rest).toEqual(baseRest);
    const { gangs: nextGangs, ...nextEncounterRest } = nextEncounters! as RandomEncounterRules;
    const { gangs: _baseGangs, ...baseEncounterRest } = baseEncounters! as RandomEncounterRules;
    expect(nextEncounterRest).toEqual(baseEncounterRest);
    expect((baseEncounters! as RandomEncounterRules).gangs).toBeUndefined();
    expect(nextGangs).toEqual(ENCOUNTER_GANG_RULES);
    expect(permanentUnlocks).toMatchObject(baseUnlocks);
    expect(Object.keys(permanentUnlocks).filter((key) => !(key in baseUnlocks)).sort()).toEqual(['DISTRICT_CASINO_ACCESS', 'DISTRICT_NIGHTCLUB_ACCESS']);
    const nextQuests: QuestDefinitionCatalog = next;
    const baseQuests: QuestDefinitionCatalog = base;
    expect(Object.keys(nextQuests).filter((key) => nextQuests[key] !== baseQuests[key]).sort()).toEqual(['KEEPING_THEM_HAPPY', 'PAYDAY']);
    for (const key of ['KEEPING_THEM_HAPPY', 'PAYDAY']) {
      expect(nextQuests[key]!.objectives).toBe(baseQuests[key]!.objectives);
      expect(nextQuests[key]!.rewards.slice(0, -1)).toEqual(baseQuests[key]!.rewards);
    }
  });

  it('leaves every pre-O ruleset ungated', () => {
    for (const earlier of Object.values(rulesets) as Ruleset[]) {
      if (earlier === classicOgV18O) break;
      expect(districtGates(earlier).size, earlier.meta.id).toBe(0);
    }
  });
});

