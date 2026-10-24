import {
  QUEST_STORY_VARIANT_FIELDS,
  type QuestDefinitionCatalog,
  type QuestStoryCondition,
  type QuestStoryDefinition,
} from './types.js';

/**
 * Story campaign Slice H. What a player has done that story lines can depend on, and how a
 * quest's lines resolve against it. Resolved on the server; the client only ever sees text.
 */
export interface StoryFacts {
  /** Quests the player has completed. */
  readonly completed: ReadonlySet<string>;
  /** The turn-in choice recorded on each quest's latest attempt. */
  readonly branches: ReadonlyMap<string, string>;
  /** Scene responses on each quest's latest attempt, by quest then scene. */
  readonly responses: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

export const NO_STORY_FACTS: StoryFacts = { completed: new Set(), branches: new Map(), responses: new Map() };

export function storyConditionHolds(condition: QuestStoryCondition, facts: StoryFacts): boolean {
  switch (condition.kind) {
    case 'QUEST_COMPLETED': return facts.completed.has(condition.questKey);
    case 'BRANCH_CHOSEN': return facts.branches.get(condition.questKey) === condition.branchKey;
    case 'SCENE_RESPONSE': return facts.responses.get(condition.questKey)?.get(condition.sceneKey) === condition.responseKey;
  }
}

/** A quest's story lines for this player: each line from the first matching variant, else its default. */
export function resolveStoryCopy(story: QuestStoryDefinition, facts: StoryFacts): Omit<QuestStoryDefinition, 'variants'> {
  const { variants, ...base } = story;
  if (!variants?.length) return base;
  const resolved: Record<string, unknown> = { ...base };
  const matching = variants.filter((variant) => storyConditionHolds(variant.when, facts));
  for (const field of QUEST_STORY_VARIANT_FIELDS) {
    const line = matching.find((variant) => typeof variant[field] === 'string')?.[field];
    if (line !== undefined) resolved[field] = line;
  }
  return resolved as Omit<QuestStoryDefinition, 'variants'>;
}

/** Quests whose outcomes some story line in the catalog depends on. Empty when nothing varies. */
export function storyFactQuestKeys(catalog: QuestDefinitionCatalog | undefined): string[] {
  const keys = new Set<string>();
  for (const quest of Object.values(catalog ?? {})) {
    for (const variant of quest.story?.variants ?? []) keys.add(variant.when.questKey);
  }
  return [...keys];
}
