import { describe, expect, it } from 'vitest';
import { LIVING_CASE_BLUEPRINTS, validateCaseBlueprint } from '../living-cases.js';
import { LIVING_STORIES_STARTER_CATALOG } from '../living-stories.js';

describe('Living Streets 2.0.0-B case blueprints', () => {
  it('defines five stable case identities with unique ordered evidence kinds', () => {
    expect(Object.keys(LIVING_CASE_BLUEPRINTS)).toHaveLength(5);
    for (const [key, blueprint] of Object.entries(LIVING_CASE_BLUEPRINTS)) {
      expect(blueprint.key).toBe(key);
      expect(blueprint.clues.length).toBeGreaterThanOrEqual(3);
      expect(() => validateCaseBlueprint(blueprint)).not.toThrow();
      expect(new Set(blueprint.clues.map((clue) => clue.eventType)).size).toBe(blueprint.clues.length);
    }
  });
  it('only exposes server-defined choices and recognized verified source types', () => {
    const blueprint = LIVING_CASE_BLUEPRINTS.CASE_THE_FIFTH_WITNESS;
    expect(LIVING_STORIES_STARTER_CATALOG.STORY_AFTER_THE_SMOKE.caseKey).toBe(blueprint.key);
    expect(blueprint.branchKeys).toEqual(['REVEAL_INSTIGATOR', 'SEEK_TRUCE']);
    expect(() => validateCaseBlueprint({
      ...blueprint,
      clues: [blueprint.clues[0], { ...blueprint.clues[1], sourceKind: blueprint.clues[0].sourceKind }],
    })).toThrow(/distinct/);
  });
});
