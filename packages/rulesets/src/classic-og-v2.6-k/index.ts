import { classicOgV26JBoard } from '../classic-og-v2.6-j/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { HideoutV2Rules } from '../hideout-v2.js';
import type { Ruleset } from '../types.js';
import { vicSportsJobs } from './vic-sports-jobs.js';

const questDefinitions = defineQuestCatalog({
  ...classicOgV26JBoard.questDefinitions,
  ...vicSportsJobs,
});

/**
 * K removes activity-based progression gates from hideout upgrades. Cash,
 * turns, components, build time, and all inherited room effects still apply;
 * only the separate raid/territory/supply/vehicle requirements are retired.
 * This is deliberately a new ruleset value so older pinned rounds retain
 * their original progression.
 */
const progressionFreeHideoutV2: HideoutV2Rules = {
  ...classicOgV26JBoard.hideoutV2!,
  rooms: Object.fromEntries(Object.entries(classicOgV26JBoard.hideoutV2!.rooms).map(([key, room]) => {
    const { requirements: _requirements, ...roomWithoutRequirements } = room;
    return [key, roomWithoutRequirements];
  })) as HideoutV2Rules['rooms'],
};

export const classicOgV26K = {
  ...classicOgV26JBoard,
  meta: {
    ...classicOgV26JBoard.meta,
    id: 'classic-og-v2.6-k',
    version: '2.6.0-K',
    name: 'Classic OG - Sports Favors',
  },
  questDefinitions,
  hideoutV2: progressionFreeHideoutV2,
} as const satisfies Ruleset;
