import { classicOgV26B } from '../classic-og-v2.6-b/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { QuestDefinitionCatalog, Ruleset } from '../types.js';
import { missingLineDepth } from './missing-line-depth.js';

/**
 * 2.6.0-C. The Missing Line depth pass: Acts I and II ask for real work before their reveals.
 * Same keys, chain, rewards and catalog order as 2.6.0-B; rounds pinned to it are unaffected.
 */
export const classicOgV26C = {
  ...classicOgV26B,
  meta: { ...classicOgV26B.meta, id: 'classic-og-v2.6-c', version: '2.6.0-C', name: 'Classic OG - The Missing Line (depth)' },
  questDefinitions: defineQuestCatalog({
    ...(classicOgV26B.questDefinitions as QuestDefinitionCatalog),
    ...missingLineDepth,
  }),
} as const satisfies Ruleset;
