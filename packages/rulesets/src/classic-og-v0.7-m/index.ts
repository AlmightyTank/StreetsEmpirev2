import { classicOgV07L } from '../classic-og-v0.7-l/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { capstoneQuests } from './capstone-quests.js';

const base = classicOgV07L.questDefinitions!;

const questDefinitions = defineQuestCatalog({
  ...base,
  PIP_MOVE_THE_WEIGHT: {
    ...base.PIP_MOVE_THE_WEIGHT,
    followUpKeys: ['PIP_TOP_SHELF'],
  },
  TOMMY_PATCH_JOB: {
    ...base.TOMMY_PATCH_JOB,
    followUpKeys: ['TOMMY_FULL_RACK'],
  },
  ...capstoneQuests,
});

/**
 * Quest roadmap Phase N: complete the first handcrafted 30-Job catalog.
 *
 * N adds Pip and Tommy capstone contracts while preserving every existing
 * unlock, favor, Hideout rule and balance number from 0.7-L.
 */
export const classicOgV07M = {
  ...classicOgV07L,
  meta: { id: 'classic-og-v0.7-m', version: '0.7.0-M', name: 'Classic OG - First 30 Jobs' },
  questDefinitions,
} as const satisfies Ruleset;
