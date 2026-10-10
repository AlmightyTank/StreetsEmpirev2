import { describe, expect, it } from 'vitest';
import { classicOgV07D } from '../classic-og-v0.7-d/index.js';
import { classicOgV16H2 } from '../classic-og-v1.6-h2/index.js';
import { questDefinitionProblems } from '../quest-definitions.js';
import type { QuestDefinitionCatalog } from '../types.js';

describe('1.6-H2 guided empire campaign', () => {
  const quests: QuestDefinitionCatalog = classicOgV16H2.questDefinitions!;
  const paths = [
    'STREET_OPERATOR_PATH', 'BUSINESS_BUILDER_PATH', 'CREW_BOSS_PATH', 'ENFORCER_PATH',
    'ROAD_BOSS_PATH', 'FIXER_PATH', 'UNDERWORLD_NETWORK_PATH', 'HIGH_ROLLER_PATH',
    'SUPPLY_BROKER_PATH', 'CAREER_AND_COMMUNITY_PATH',
  ];

  it('keeps the campaign content valid and leaves older pinned quests unchanged', () => {
    expect(questDefinitionProblems(quests)).toEqual([]);
    expect(classicOgV07D.questDefinitions?.COLLECTION_DAY?.objectives[0]?.kind).toBe('WIN_EVENTS');
    expect(classicOgV07D.questDefinitions?.PLANT_THE_FLAG?.followUpKeys).toEqual([]);
  });

  it('lets a resolved raid attempt teach combat without requiring a win', () => {
    expect(quests.COLLECTION_DAY?.objectives).toEqual([
      expect.objectContaining({ kind: 'EVENT_COUNT', params: { eventTypes: ['RAID_ATTACK'] } }),
    ]);
    expect(quests.COLLECTION_DAY?.story?.actionHint).toContain('You do not need to win');
  });

  it('opens ten independent specialty starts from the campaign capstone', () => {
    expect(quests.PLANT_THE_FLAG?.title).toBe('First Empire');
    expect(quests.PLANT_THE_FLAG?.followUpKeys).toEqual(paths);
    for (const key of paths) {
      expect(quests[key]?.prerequisites).toContainEqual({
        kind: 'QUEST_COMPLETED', params: { questKey: 'PLANT_THE_FLAG' },
      });
    }
  });

  it('holds the deeper contact arcs behind their matching specialty start', () => {
    const gates: Array<[string, string]> = [
      ['PIP_MOVE_THE_WEIGHT', 'STREET_OPERATOR_PATH'],
      ['OUTFIT_THE_BOOKS', 'BUSINESS_BUILDER_PATH'],
      ['TOMMY_STOCK_THE_CREW', 'CREW_BOSS_PATH'],
      ['BLOCKS_TAKE_SOMETHING', 'ENFORCER_PATH'],
      ['WHEELS_ROAD_TEST', 'ROAD_BOSS_PATH'],
      ['LEDGER_RIGHT_TO_COUNSEL', 'FIXER_PATH'],
      ['VIC_INTRO_CARTEL_LINE', 'UNDERWORLD_NETWORK_PATH'],
      ['ACE_FLOOR_TOUR', 'HIGH_ROLLER_PATH'],
      ['CARTEL_THE_PIPELINE', 'SUPPLY_BROKER_PATH'],
    ];
    for (const [questKey, pathKey] of gates) {
      expect(quests[questKey]?.prerequisites).toContainEqual({
        kind: 'QUEST_COMPLETED', params: { questKey: pathKey },
      });
    }
  });
});
