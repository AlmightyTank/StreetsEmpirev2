import { classicOgV26H } from '../classic-og-v2.6-h/index.js';
import type { QuestDefinition, QuestDefinitionCatalog, QuestRewardDefinition } from '../types.js';

/**
 * 2.6.0-I. The Missing Line becomes the game's only story. Every older story and side job is
 * retired from new rounds, along with the two contracts that could only open after them. The
 * repeatable boards (daily, weekly, season, city, alliance), events and Hidden Streets secrets
 * stay. The permanent unlocks those older jobs used to grant move onto campaign chapters, so
 * every weapon, vehicle and product stays reachable.
 */

const RETIRED_CONTRACTS = new Set(['TAKING_SIDES', 'BOARD_COMMISSIONER_UNOFFICIAL_ARRANGEMENT']);

export function isRetiredStoryJob(definition: QuestDefinition): boolean {
  if (definition.key.startsWith('ML_')) return false;
  return definition.type === 'STORY' || definition.type === 'SIDE' || RETIRED_CONTRACTS.has(definition.key);
}

/** Where each permanent unlock is earned now. */
export const CAMPAIGN_UNLOCKS: Readonly<Record<string, readonly string[]>> = {
  ML_M03_OTHER_DOOR: ['PRODUCT_WEED_RECIPE'],
  ML_M06_PIPS_COUNT: ['PRODUCT_ECSTASY_ACCESS', 'PRODUCT_ECSTASY_RECIPE'],
  ML_M13_DATE_CHANGED_IN_INK: ['WEAPON_AK47_ACCESS'],
  ML_M16_MILE_MARKER_NINE: ['VEHICLE_VAN_ACCESS'],
  ML_M19_HONEST_SCALE: ['PRODUCT_COCAINE_RECIPE', 'PRODUCT_HEROIN_RECIPE'],
  ML_S04_WEIGHT_ON_THE_SCALE: ['PRODUCT_METH_ACCESS', 'PRODUCT_METH_RECIPE'],
  ML_S06_LAST_HONEST_COUNT: ['PRODUCT_COCAINE_ACCESS', 'PRODUCT_HEROIN_ACCESS'],
  ML_S09_RACK_KEPT_OPEN: ['OUT_OF_TOWN_IRON'],
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
