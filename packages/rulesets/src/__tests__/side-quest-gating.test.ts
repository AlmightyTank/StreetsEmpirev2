import { describe, expect, it } from 'vitest';
import { classicOgV19C } from '../classic-og-v1.9-c/index.js';
import { classicOgV19D } from '../classic-og-v1.9-d/index.js';
import type { QuestDefinitionCatalog } from '../types.js';

const previous: QuestDefinitionCatalog = classicOgV19C.questDefinitions!;

describe('side quest availability pacing', () => {
  it('keeps the previously pinned 3.0-C catalog unchanged', () => {
    expect(previous.VIC_FACE_TO_FACE!.prerequisites).toEqual([]);
    expect(previous.ACE_HOUSE_RULES!.followUpKeys)
      .toEqual(['ACE_FLOOR_TOUR', 'ACE_KNOWN_FACE', 'ACE_NATURAL']);
    expect(previous.LEDGER_OPEN_FILE!.followUpKeys)
      .toEqual(['LEDGER_COOLING_OFF', 'LEDGER_FRIENDS_DOWNTOWN', 'LEDGER_RIGHT_TO_COUNSEL']);
  });

  it('time-gates standalone side quest introductions', () => {
    expect(classicOgV19D.questDefinitions.ACE_HOUSE_RULES!.prerequisites)
      .toContainEqual({ kind: 'TIME_SINCE_JOIN', params: { minutes: 360 } });
    expect(classicOgV19D.questDefinitions.VIC_FACE_TO_FACE!.prerequisites)
      .toContainEqual({ kind: 'TIME_SINCE_JOIN', params: { minutes: 720 } });
    expect(classicOgV19D.questDefinitions.LEDGER_OPEN_FILE!.prerequisites)
      .toContainEqual({ kind: 'TIME_SINCE_JOIN', params: { minutes: 1_440 } });
    expect(classicOgV19D.questDefinitions.CIVIC_SHAKE_HANDS!.prerequisites)
      .toContainEqual({ kind: 'TIME_SINCE_JOIN', params: { minutes: 2_880 } });
  });

  it('uses persisted player actions as unlock gates', () => {
    expect(classicOgV19D.questDefinitions.WHEELS_RIDING_SHOTGUN!.prerequisites).toContainEqual({
      kind: 'ACTION_COUNT',
      params: { eventTypes: ['SCOUT'], count: 10, label: 'Scout the streets' },
    });
    expect(classicOgV19D.questDefinitions.VIC_SCOPE_THE_STRIP!.prerequisites).toContainEqual({
      kind: 'ACTION_COUNT',
      params: { eventTypes: ['TRIP_RETURNED'], count: 2, label: 'Complete trips to other cities' },
    });
  });

  it('serializes the largest side quest fanouts', () => {
    expect(classicOgV19D.questDefinitions.ACE_HOUSE_RULES!.followUpKeys).toEqual(['ACE_FLOOR_TOUR']);
    expect(classicOgV19D.questDefinitions.ACE_KNOWN_FACE!.prerequisites)
      .toContainEqual({ kind: 'QUEST_COMPLETED', params: { questKey: 'ACE_FLOOR_TOUR' } });
    expect(classicOgV19D.questDefinitions.ACE_NATURAL!.prerequisites)
      .toContainEqual({ kind: 'QUEST_COMPLETED', params: { questKey: 'ACE_KNOWN_FACE' } });

    expect(classicOgV19D.questDefinitions.LEDGER_OPEN_FILE!.followUpKeys).toEqual(['LEDGER_COOLING_OFF']);
    expect(classicOgV19D.questDefinitions.LEDGER_RIGHT_TO_COUNSEL!.prerequisites)
      .toContainEqual({ kind: 'QUEST_COMPLETED', params: { questKey: 'LEDGER_COOLING_OFF' } });
    expect(classicOgV19D.questDefinitions.LEDGER_FRIENDS_DOWNTOWN!.prerequisites)
      .toContainEqual({ kind: 'QUEST_COMPLETED', params: { questKey: 'LEDGER_RIGHT_TO_COUNSEL' } });
  });

  it('leaves no immediately available side quest in the latest catalog', () => {
    const ungated = Object.values(classicOgV19D.questDefinitions)
      .filter((quest) => quest.type === 'SIDE' && quest.prerequisites.length === 0)
      .map((quest) => quest.key);

    expect(ungated).toEqual([]);
  });
});
