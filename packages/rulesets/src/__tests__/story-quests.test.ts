import { describe, expect, it } from 'vitest';
import { questContacts } from '../quest-contacts.js';
import { storyQuests } from '../classic-og-v0.7-d/story-quests.js';
import { classicOgV07D } from '../classic-og-v0.7-d/index.js';

describe('0.7-D handcrafted quest launch', () => {
  it('publishes six named underworld contacts', () => {
    expect(Object.keys(questContacts)).toEqual([
      'MAMA_KING',
      'PIP',
      'TOMMY',
      'WHEELS',
      'VIC',
      'BLOCKS',
    ]);
    expect(questContacts.MAMA_KING.shortName).toBe('Mama King');
    expect(questContacts.TOMMY.role).toBe('Weapons & Muscle');
  });

  it('publishes the first ten story jobs in order', () => {
    expect(Object.keys(storyQuests)).toEqual([
      'FIRST_NIGHT_OUT',
      'FRESH_FACES',
      'KEEPING_THEM_HAPPY',
      'COOKHOUSE',
      'PAYDAY',
      'HEAVY_HANDS',
      'EYES_OPEN',
      'COLLECTION_DAY',
      'PACK_YOUR_BAGS',
      'PLANT_THE_FLAG',
    ]);

    const expectedNext: Array<[keyof typeof storyQuests, string | null]> = [
      ['FIRST_NIGHT_OUT', 'FRESH_FACES'],
      ['FRESH_FACES', 'KEEPING_THEM_HAPPY'],
      ['KEEPING_THEM_HAPPY', 'COOKHOUSE'],
      ['COOKHOUSE', 'PAYDAY'],
      ['PAYDAY', 'HEAVY_HANDS'],
      ['HEAVY_HANDS', 'EYES_OPEN'],
      ['EYES_OPEN', 'COLLECTION_DAY'],
      ['COLLECTION_DAY', 'PACK_YOUR_BAGS'],
      ['PACK_YOUR_BAGS', 'PLANT_THE_FLAG'],
      ['PLANT_THE_FLAG', null],
    ];

    for (const [key, next] of expectedNext) {
      expect(storyQuests[key].type).toBe('STORY');
      expect(storyQuests[key].repeatability).toBe('ONCE');
      expect(storyQuests[key].followUpKeys).toEqual(next ? [next] : []);
    }
  });

  it('uses state objectives for ownership and event objectives for new work', () => {
    expect(storyQuests.FRESH_FACES.objectives.map((objective) => objective.kind)).toEqual([
      'STATE_AT_LEAST',
      'STATE_AT_LEAST',
    ]);
    expect(storyQuests.COOKHOUSE.objectives[0]).toMatchObject({
      kind: 'EVENT_SUM',
      target: 100,
      params: { eventTypes: ['PRODUCE_CRACK'], field: 'product', where: { productType: 'CRACK' } },
    });
    expect(storyQuests.COLLECTION_DAY.objectives[0]).toMatchObject({
      kind: 'WIN_EVENTS',
      params: { eventTypes: ['RAID_ATTACK'] },
    });
  });

  it('moves weapon purchasing access into story quest rewards', () => {
    expect(storyQuests.HEAVY_HANDS.rewards).toContainEqual({ kind: 'WEAPON_ACCESS', key: 'SHOTGUN' });
    expect(storyQuests.COLLECTION_DAY.rewards).toContainEqual({ kind: 'WEAPON_ACCESS', key: 'TEK9' });
    expect(storyQuests.PLANT_THE_FLAG.rewards).toContainEqual({ kind: 'WEAPON_ACCESS', key: 'AK47' });
  });

  it('enables contacts and new quests on the current beta ruleset', () => {
    expect(classicOgV07D.contacts).toBe(questContacts);
    expect(classicOgV07D.questDefinitions).toBe(storyQuests);
  });
});
