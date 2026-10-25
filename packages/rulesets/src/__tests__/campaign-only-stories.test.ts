import { describe, expect, it } from 'vitest';
import { CAMPAIGN_UNLOCKS, classicOgV26H, classicOgV26I, isRetiredStoryJob, LATEST_RULESET } from '../index.js';
import { questDefinitionProblems } from '../quest-definitions.js';
import type { QuestDefinitionCatalog } from '../types.js';

const before = classicOgV26H.questDefinitions as QuestDefinitionCatalog;
const after = classicOgV26I.questDefinitions as QuestDefinitionCatalog;
const unlocksIn = (catalog: QuestDefinitionCatalog) => Object.values(catalog).flatMap((definition) =>
  definition.rewards.filter((reward) => reward.kind === 'PERMANENT_UNLOCK').map((reward) => ({ unlock: reward.key!, quest: definition.key })));

describe('2.6.0-I The Missing Line is the only story', () => {
  it('carries into the latest ruleset with a valid catalog', () => {
    expect(LATEST_RULESET.questDefinitions).toBe(classicOgV26I.questDefinitions);
    expect(questDefinitionProblems(after)).toEqual([]);
  });

  it('retires every older story and side job, and the contracts that could only follow them', () => {
    const retired = Object.values(before).filter(isRetiredStoryJob).map((definition) => definition.key);
    expect(retired).toHaveLength(106);
    expect(retired).toEqual(expect.arrayContaining(['ORIGIN_MEET_CONTACT', 'PLANT_THE_FLAG', 'PIP_BULK_ORDER', 'TAKING_SIDES', 'BOARD_COMMISSIONER_UNOFFICIAL_ARRANGEMENT']));
    for (const key of retired) expect(after).not.toHaveProperty(key);
    const stories = Object.values(after).filter((definition) => definition.type === 'STORY' || definition.type === 'SIDE' || definition.type === 'CONTRACT');
    expect(stories.every((definition) => definition.key.startsWith('ML_'))).toBe(true);
    expect(stories).toHaveLength(40);
  });

  it('keeps the boards, events and secrets exactly as they were', () => {
    const kept = Object.values(before).filter((definition) => !definition.key.startsWith('ML_') && !isRetiredStoryJob(definition));
    expect(new Set(kept.map((definition) => definition.type))).toEqual(new Set(['DAILY', 'WEEKLY', 'SECRET', 'CITY_CONTRACT', 'ALLIANCE', 'EVENT', 'SEASON']));
    for (const definition of kept) expect(after[definition.key]).toBe(definition);
  });

  it('moves every permanent unlock the retired jobs granted onto exactly one campaign chapter', () => {
    const retiredUnlocks = unlocksIn(before).filter(({ quest }) => isRetiredStoryJob(before[quest]!)).map(({ unlock }) => unlock).sort();
    expect(retiredUnlocks).toHaveLength(12);
    const now = unlocksIn(after);
    expect(now.map(({ unlock }) => unlock).sort()).toEqual(retiredUnlocks);
    expect(now.every(({ quest }) => quest.startsWith('ML_'))).toBe(true);
    expect(new Set(now.map(({ unlock }) => unlock)).size).toBe(now.length);
    for (const { unlock } of now) expect(classicOgV26I.permanentUnlocks).toHaveProperty(unlock);
    expect(Object.fromEntries(Object.keys(CAMPAIGN_UNLOCKS).map((key) => [key, unlocksIn({ [key]: after[key]! }).map(({ unlock }) => unlock)]))).toEqual(CAMPAIGN_UNLOCKS);
  });

  it('changes nothing else about the campaign chapters that now carry unlocks', () => {
    for (const key of Object.keys(CAMPAIGN_UNLOCKS)) {
      const { rewards, ...rest } = after[key]!;
      const { rewards: was, ...restWas } = before[key]!;
      expect(rest).toEqual(restWas);
      expect(rewards.slice(0, was.length)).toEqual(was);
    }
    for (const [key, definition] of Object.entries(before)) {
      if (key.startsWith('ML_') && !(key in CAMPAIGN_UNLOCKS)) expect(after[key]).toBe(definition);
    }
  });
});
