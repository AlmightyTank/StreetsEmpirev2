import { describe, expect, it } from 'vitest';
import { classicOgV26E, classicOgV26F, missingLineEchoes } from '../index.js';
import { questDefinitionProblems } from '../quest-definitions.js';
import type { QuestDefinition, QuestDefinitionCatalog } from '../types.js';

const before = classicOgV26E.questDefinitions as QuestDefinitionCatalog;
const catalog = classicOgV26F.questDefinitions as QuestDefinitionCatalog;
const ECHOING = ['ML_M16_MILE_MARKER_NINE', 'ML_M17_PASSENGER_NINE', 'ML_M18_WHAT_MAMA_BOUGHT'];
const quest = (key: string) => catalog[key] as QuestDefinition;
const conditions = (key: string) => quest(key).story!.variants!.map((variant) => variant.when);

describe('2.6.0-F The Missing Line remembers', () => {
  it('ships in 2.6.0-F and changes only the story lines of three chapters', () => {
    expect(classicOgV26F.meta).toMatchObject({ id: 'classic-og-v2.6-f', version: '2.6.0-F' });
    expect(questDefinitionProblems(catalog)).toEqual([]);
    expect(Object.keys(catalog)).toEqual(Object.keys(before));
    expect(Object.keys(missingLineEchoes)).toEqual(ECHOING);
    for (const [key, definition] of Object.entries(before)) {
      if (ECHOING.includes(key)) {
        const { story, ...rest } = quest(key);
        const { story: storyWas, ...restWas } = definition;
        expect(rest).toEqual(restWas);
        const { variants, ...lines } = story!;
        expect(lines).toEqual(storyWas);
        expect(variants!.length).toBeGreaterThan(0);
      } else {
        expect(catalog[key]).toBe(definition);
      }
    }
  });

  it('answers every Your Name in the Margin choice in Mile Marker Nine', () => {
    const branches = quest('ML_M15_NAME_IN_THE_MARGIN').branches!.map((branch) => branch.key);
    expect(conditions('ML_M16_MILE_MARKER_NINE')).toEqual(branches.map((branchKey) => ({ kind: 'BRANCH_CHOSEN', questKey: 'ML_M15_NAME_IN_THE_MARGIN', branchKey })));
    const lines = quest('ML_M16_MILE_MARKER_NINE').story!.variants!.map((variant) => variant.inProgress);
    expect(new Set(lines).size).toBe(branches.length);
    // Every version still tells the player what to do.
    for (const line of lines) expect(line).toContain('Send a car out past the split and bring it back');
  });

  it('answers every way of handling the depot in Passenger No. 9', () => {
    const responses = quest('ML_M16_MILE_MARKER_NINE').story!.scenes![0]!.responses.map((response) => response.key);
    expect(conditions('ML_M17_PASSENGER_NINE')).toEqual(responses.map((responseKey) => ({ kind: 'SCENE_RESPONSE', questKey: 'ML_M16_MILE_MARKER_NINE', sceneKey: 'depot_found', responseKey })));
  });

  it('remembers Mr. Alvarez’s name and how Mama settled her debt', () => {
    const alvarez = quest('ML_M14_WOMAN_AT_CLOSING').story!.scenes![0]!.responses.map((response) => response.key);
    const mama = quest('ML_M18_WHAT_MAMA_BOUGHT').story!.scenes![0]!.responses.map((response) => response.key);
    expect(conditions('ML_M18_WHAT_MAMA_BOUGHT')).toEqual([
      ...alvarez.map((responseKey) => ({ kind: 'SCENE_RESPONSE', questKey: 'ML_M14_WOMAN_AT_CLOSING', sceneKey: 'second_receipt_returned', responseKey })),
      ...mama.map((responseKey) => ({ kind: 'SCENE_RESPONSE', questKey: 'ML_M18_WHAT_MAMA_BOUGHT', sceneKey: 'mama_debt_reckoned', responseKey })),
    ]);
    const variants = quest('ML_M18_WHAT_MAMA_BOUGHT').story!.variants!;
    expect(variants.slice(0, 2).every((variant) => variant.intro && !variant.completed)).toBe(true);
    expect(variants.slice(2).every((variant) => variant.completed && !variant.intro)).toBe(true);
  });
});
