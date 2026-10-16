import { classicOgV30D } from '../classic-og-v3.0-d/index.js';
import { defineLivingStoryCatalog, LIVING_STORIES_STARTER_CATALOG } from '../living-stories.js';
import type { Ruleset } from '../types.js';

/**
 * Living Streets opt-in for newly created rounds only. Gameplay rules still
 * inherit Classic OG 3.0-D; the release slice is 2.0.0-C (story subsystem).
 * Existing rounds are pinned to their original ruleset and remain unchanged.
 */
export const classicOgV30E = {
  ...classicOgV30D,
  meta: { ...classicOgV30D.meta, id: 'classic-og-v3.0-e', version: '3.0.0-E',
    name: 'Classic OG - Living Streets C' },
  livingStories: defineLivingStoryCatalog({
    STORY_AFTER_THE_SMOKE: { ...LIVING_STORIES_STARTER_CATALOG.STORY_AFTER_THE_SMOKE, enabled: true },
    STORY_MISSING_LEDGER: {
      key: 'STORY_MISSING_LEDGER', title: 'Missing Ledger', caseKey: 'CASE_MISSING_LEDGER',
      trigger: { sourceKind: 'CITY_MEMORY', eventKinds: ['operation_complete'] },
      audience: 'ACTORS', visibility: 'OWNER_ONLY',
      expiresAfterActiveMinutes: 24 * 60, rewardBudgetCents: 0, enabled: true,
    },
    STORY_GHOST_SHIPMENT: {
      key: 'STORY_GHOST_SHIPMENT', title: 'Ghost Shipment', caseKey: 'CASE_GHOST_SHIPMENT',
      trigger: { sourceKind: 'CITY_MEMORY', eventKinds: ['npc_gang_migration'] },
      audience: 'ACTORS', visibility: 'OWNER_ONLY',
      expiresAfterActiveMinutes: 24 * 60, rewardBudgetCents: 0, enabled: true,
    },
    STORY_FALSE_COLORS: {
      key: 'STORY_FALSE_COLORS', title: 'False Colors', caseKey: 'CASE_FALSE_COLORS',
      trigger: { sourceKind: 'CITY_MEMORY', eventKinds: ['takeover'] },
      audience: 'CITY_PLAYERS', visibility: 'OWNER_ONLY',
      expiresAfterActiveMinutes: 24 * 60, rewardBudgetCents: 0, enabled: true,
    },
    STORY_MIDNIGHT_SIGNAL: {
      key: 'STORY_MIDNIGHT_SIGNAL', title: 'Midnight Signal', caseKey: 'CASE_MIDNIGHT_SIGNAL',
      trigger: { sourceKind: 'CITY_MEMORY', eventKinds: ['city_condition_follow_up'] },
      audience: 'CITY_PLAYERS', visibility: 'OWNER_ONLY',
      expiresAfterActiveMinutes: 12 * 60, rewardBudgetCents: 0, enabled: true,
    },
  }),
} as const satisfies Ruleset;
