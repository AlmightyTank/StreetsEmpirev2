import { classicOgV26H } from '../classic-og-v2.6-h/index.js';
import type { QuestDefinition, QuestDefinitionCatalog, QuestRewardDefinition } from '../types.js';

/**
 * 2.6.0-I. The Missing Line becomes the game's only story. Every older story and side job is
 * retired from new rounds, along with the two contracts that could only open after them. The
 * repeatable boards (daily, weekly, season, city, alliance), events and Hidden Streets secrets
 * stay. Weapon access and the drug market/cookhouse ladder remain
 * quest-earned through campaign chapters; districts and general feature
 * access are not permanent quest unlocks.
 */

const RETIRED_CONTRACTS = new Set(['TAKING_SIDES', 'BOARD_COMMISSIONER_UNOFFICIAL_ARRANGEMENT']);

export function isRetiredStoryJob(definition: QuestDefinition): boolean {
  if (definition.key.startsWith('ML_')) return false;
  return definition.type === 'STORY' || definition.type === 'SIDE' || RETIRED_CONTRACTS.has(definition.key);
}

/** Where each permanent unlock is earned now. */
export const CAMPAIGN_UNLOCKS: Readonly<Record<string, readonly string[]>> = {
  // The Missing Line keeps the production ladder and Pip's purchase access
  // behind the same side stories that replaced the retired trader jobs.
  ML_M03_OTHER_DOOR: ['PRODUCT_WEED_RECIPE'],
  ML_M06_PIPS_COUNT: ['PRODUCT_ECSTASY_ACCESS', 'PRODUCT_ECSTASY_RECIPE'],
  // Tommy's armory side story is the replacement for the retired weapon jobs.
  ML_S07_OTHER_SERIAL: ['WEAPON_SHOTGUN_ACCESS'],
  ML_S08_LAST_SHIFT: ['WEAPON_TEK9_ACCESS'],
  ML_M13_DATE_CHANGED_IN_INK: ['WEAPON_AK47_ACCESS'],
  ML_M19_HONEST_SCALE: ['PRODUCT_COCAINE_RECIPE', 'PRODUCT_HEROIN_RECIPE'],
  ML_S04_WEIGHT_ON_THE_SCALE: ['PRODUCT_METH_ACCESS', 'PRODUCT_METH_RECIPE'],
  ML_S06_LAST_HONEST_COUNT: ['PRODUCT_COCAINE_ACCESS', 'PRODUCT_HEROIN_ACCESS'],
};

const previous = classicOgV26H.questDefinitions as QuestDefinitionCatalog;

export const campaignOnlyStories: QuestDefinitionCatalog = Object.fromEntries(
  Object.entries(previous)
    .filter(([, definition]) => !isRetiredStoryJob(definition))
    .map(([key, definition]) => {
      const unlocks = CAMPAIGN_UNLOCKS[key];
      if (!unlocks) return [key, definition];
      return [key, {
        ...definition,
        rewards: [...definition.rewards, ...unlocks.map((unlock): QuestRewardDefinition => ({ kind: 'PERMANENT_UNLOCK', key: unlock }))],
      } satisfies QuestDefinition];
    }),
);
