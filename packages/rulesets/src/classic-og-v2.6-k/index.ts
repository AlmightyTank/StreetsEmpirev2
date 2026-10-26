import { classicOgV26JBoard } from '../classic-og-v2.6-j/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { vicSportsJobs } from './vic-sports-jobs.js';

const questDefinitions = defineQuestCatalog({
  ...classicOgV26JBoard.questDefinitions,
  ...vicSportsJobs,
});

export const classicOgV26K = {
  ...classicOgV26JBoard,
  meta: {
    ...classicOgV26JBoard.meta,
    id: 'classic-og-v2.6-k',
    version: '2.6.0-K',
    name: 'Classic OG - Sports Favors',
  },
  questDefinitions,
} as const satisfies Ruleset;
