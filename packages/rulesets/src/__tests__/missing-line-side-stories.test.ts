import { describe, expect, it } from 'vitest';
import { classicOgV26G, classicOgV26H, missingLineSideEchoes, missingLineSideQuests } from '../index.js';
import { questDefinitionProblems } from '../quest-definitions.js';
import { resolveStoryCopy, type StoryFacts } from '../story-copy.js';
import type { QuestDefinition, QuestDefinitionCatalog } from '../types.js';

const before = classicOgV26G.questDefinitions as QuestDefinitionCatalog;
const catalog = classicOgV26H.questDefinitions as QuestDefinitionCatalog;
const quest = (key: string) => catalog[key] as QuestDefinition;
const SIDE = Object.keys(missingLineSideQuests);
const isScene = (objective: QuestDefinition['objectives'][number]) => (objective.params?.eventTypes as string[] | undefined)?.includes('QUEST_STORY_SCENE');
const opens = (key: string) => quest(key).prerequisites.map((prerequisite) => prerequisite.params?.questKey);

describe('2.6.0-H The Missing Line side stories', () => {
  it('ships in 2.6.0-H, adding fifteen side quests after the 2.6.0-G catalog', () => {
    expect(classicOgV26H.meta).toMatchObject({ id: 'classic-og-v2.6-h', version: '2.6.0-H' });
    expect(questDefinitionProblems(catalog)).toEqual([]);
    expect(SIDE).toEqual([
      'ML_S01_KEY_UNDER_MAT', 'ML_S02_RENT_ENVELOPE', 'ML_S03_WARM_ROOM',
      'ML_S04_WEIGHT_ON_THE_SCALE', 'ML_S05_BOX_WITH_NO_LABEL', 'ML_S06_LAST_HONEST_COUNT',
      'ML_S07_OTHER_SERIAL', 'ML_S08_LAST_SHIFT', 'ML_S09_RACK_KEPT_OPEN',
      'ML_S10_MILE_MARKER_ZERO', 'ML_S11_PASSENGER_WINDOW', 'ML_S12_EVERY_ROAD_HOME',
      'ML_S13_COPY_FOR_LEDGER', 'ML_S14_HOLDING_COMPANY', 'ML_S15_PLAIN_ENGLISH',
    ]);
    expect(Object.keys(catalog)).toEqual([...Object.keys(before), ...SIDE]);
    for (const [key, definition] of Object.entries(before)) {
      if (!(key in missingLineSideEchoes)) expect(catalog[key]).toBe(definition);
    }
  });

  it('opens each arc from its main chapter, and S15 only once both its threads are done', () => {
    expect(Object.fromEntries(SIDE.map((key) => [key, opens(key)]))).toEqual({
      ML_S01_KEY_UNDER_MAT: ['ML_M04_ROLL_CALL'],
      ML_S02_RENT_ENVELOPE: ['ML_S01_KEY_UNDER_MAT'],
      ML_S03_WARM_ROOM: ['ML_M18_WHAT_MAMA_BOUGHT'],
      ML_S04_WEIGHT_ON_THE_SCALE: ['ML_M06_PIPS_COUNT'],
      ML_S05_BOX_WITH_NO_LABEL: ['ML_S04_WEIGHT_ON_THE_SCALE'],
      ML_S06_LAST_HONEST_COUNT: ['ML_S05_BOX_WITH_NO_LABEL'],
      ML_S07_OTHER_SERIAL: ['ML_M08_TOMMYS_SERIAL'],
      ML_S08_LAST_SHIFT: ['ML_S07_OTHER_SERIAL'],
      ML_S09_RACK_KEPT_OPEN: ['ML_S08_LAST_SHIFT'],
      ML_S10_MILE_MARKER_ZERO: ['ML_M07_NORTH_ROAD'],
      ML_S11_PASSENGER_WINDOW: ['ML_M17_PASSENGER_NINE'],
      ML_S12_EVERY_ROAD_HOME: ['ML_S11_PASSENGER_WINDOW'],
      ML_S13_COPY_FOR_LEDGER: ['ML_M12_CLERK_ON_THE_STAIRS'],
      ML_S14_HOLDING_COMPANY: ['ML_M20_MAP_IN_THE_MARGINS'],
      ML_S15_PLAIN_ENGLISH: ['ML_S13_COPY_FOR_LEDGER', 'ML_S14_HOLDING_COMPANY'],
    });
  });

  it('never gates the main story or its ending', () => {
    for (const [key, definition] of Object.entries(catalog)) {
      if (!key.startsWith('ML_M')) continue;
      const needs = definition.prerequisites.map((prerequisite) => String(prerequisite.params?.questKey ?? ''));
      expect(needs.filter((needed) => needed.startsWith('ML_S')), key).toEqual([]);
      expect(definition.followUpKeys.filter((followUp) => followUp.startsWith('ML_S')), key).toEqual([]);
    }
    for (const key of ['ML_M22_NO_ONE_OWES_ALONE', 'ML_M24_EVERYBODY_AT_THE_TABLE', 'ML_M25_MISSING_LINE']) {
      const { story, ...rest } = quest(key);
      const { story: storyWas, ...restWas } = before[key]!;
      expect(rest).toEqual(restWas);
      const { variants, ...lines } = story!;
      const { variants: variantsWas, ...linesWas } = storyWas!;
      expect(lines).toEqual(linesWas);
      expect(variants!.slice(0, variantsWas?.length ?? 0)).toEqual(variantsWas ?? []);
    }
  });

  it('tells each side story as work, then its scene, with no lesson text and no branches', () => {
    for (const key of SIDE) {
      const definition = quest(key);
      expect(definition).toMatchObject({ type: 'SIDE', category: 'CAMPAIGN', repeatability: 'ONCE' });
      expect(definition.story?.chapter).toMatch(/^Side story · /);
      expect(definition.story?.lesson).toBeUndefined();
      expect(definition.branches).toBeUndefined();
      const work = definition.objectives.filter((objective) => !isScene(objective)).map((objective) => objective.id);
      expect(definition.story?.scenes).toHaveLength(1);
      expect(definition.story!.scenes![0]!.after).toEqual(work.length ? work : undefined);
    }
  });

  it('uses only verified evidence, and keeps the supply lane optional', () => {
    const work = SIDE.flatMap((key) => quest(key).objectives.filter((objective) => !isScene(objective)).map((objective) => [
      key, objective.kind, objective.target, objective.params?.eventTypes, objective.params?.where ?? objective.params?.field ?? null,
    ]));
    expect(work).toEqual([
      ['ML_S01_KEY_UNDER_MAT', 'EVENT_COUNT', 1, ['SCOUT'], { districtKey: 'LOW_RENT' }],
      ['ML_S03_WARM_ROOM', 'EVENT_SUM', 5, ['STORE_BUY'], { storeKey: 'CORNER', itemKey: 'MEDICINE' }],
      ['ML_S04_WEIGHT_ON_THE_SCALE', 'EVENT_SUM', 10, ['STORE_BUY'], { storeKey: 'PIP' }],
      ['ML_S05_BOX_WITH_NO_LABEL', 'EVENT_COUNT', 1, ['PRODUCE_CRACK'], null],
      ['ML_S06_LAST_HONEST_COUNT', 'EVENT_SUM', 15, ['STORE_SELL'], { storeKey: 'PIP' }],
      ['ML_S07_OTHER_SERIAL', 'EVENT_SUM', 3, ['STORE_BUY'], { storeKey: 'TOMMY', itemKey: 'PISTOL' }],
      ['ML_S09_RACK_KEPT_OPEN', 'EVENT_COUNT', 1, ['STORE_BUY'], { storeKey: 'TOMMY' }],
      ['ML_S10_MILE_MARKER_ZERO', 'EVENT_COUNT', 1, ['RUN_RETURNED'], null],
      ['ML_S12_EVERY_ROAD_HOME', 'EVENT_COUNT', 1, ['RUN_RETURNED'], null],
      ['ML_S14_HOLDING_COMPANY', 'UNIQUE_VALUES', 2, ['SCOUT'], 'districtKey'],
    ]);
    expect(SIDE.flatMap((key) => quest(key).bonusObjectives.map((objective) => [key, objective.params?.eventTypes])))
      .toEqual([['ML_S05_BOX_WITH_NO_LABEL', ['SUPPLY_LANE_ARRIVED']]]);
  });

  it('pays less than the main chapters around it, in cash and contact standing only', () => {
    for (const key of SIDE) {
      const rewards = quest(key).rewards;
      expect(rewards.map((reward) => reward.kind)).toEqual(['CASH', 'CONTACT_REP']);
      expect(rewards[0]!.amount).toBeLessThanOrEqual(600_000);
      expect(rewards[1]).toEqual({ kind: 'CONTACT_REP', key: quest(key).contactKey, amount: 3 });
    }
  });

  it('lets each finished arc change its own line of the finale, so the echoes combine', () => {
    const arcEnds = ['ML_S06_LAST_HONEST_COUNT', 'ML_S09_RACK_KEPT_OPEN', 'ML_S12_EVERY_ROAD_HOME', 'ML_S15_PLAIN_ENGLISH', 'ML_S03_WARM_ROOM'];
    const echoes = Object.entries(missingLineSideEchoes).flatMap(([key, definition]) => definition.story!.variants!
      .filter((variant) => variant.when.kind === 'QUEST_COMPLETED' && variant.when.questKey.startsWith('ML_S'))
      .map((variant) => ({ key, arc: variant.when.questKey, fields: Object.keys(variant).filter((field) => field !== 'when') })));
    expect(echoes.map((entry) => entry.arc).sort()).toEqual([...arcEnds].sort());
    const lines = echoes.flatMap((entry) => entry.fields.map((field) => `${entry.key}.${field}`));
    expect(new Set(lines).size).toBe(lines.length);

    const everything: StoryFacts = { completed: new Set(arcEnds), branches: new Map(), responses: new Map() };
    const finale = resolveStoryCopy(quest('ML_M25_MISSING_LINE').story!, everything);
    expect(finale.intro).toContain('the rival’s statement');
    expect(finale.inProgress).toContain('families from Delancey');
    const table = resolveStoryCopy(quest('ML_M24_EVERYBODY_AT_THE_TABLE').story!, everything);
    expect(table.ready).toContain('apprentice');
    expect(table.completed).toContain('driver who took Wheels’ offer');
    expect(resolveStoryCopy(quest('ML_M22_NO_ONE_OWES_ALONE').story!, everything).inProgress).toContain('Pip’s supplier came too');
  });
});
