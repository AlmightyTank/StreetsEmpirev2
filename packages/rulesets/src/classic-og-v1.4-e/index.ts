import { classicOgV14D } from '../classic-og-v1.4-d/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { factionArcs, factionCapstoneCosmetics, vicIntroductions } from './faction-arcs.js';

const questDefinitions = defineQuestCatalog({
  ...classicOgV14D.questDefinitions,
  ...factionArcs,
  ...vicIntroductions,
});

/**
 * 1.4.0-E — Rivalries & Inner Circle.
 *
 * - The lock. Reaching Inner Circle with a faction locks each of its rivals' Inner Circles for
 *   the season: standing with a locked faction keeps climbing but stops one point short. The
 *   step that would set the lock off says so before you take it. Nothing below Inner Circle
 *   costs standing anywhere.
 * - Vic's introductions. For a fee (a share of net worth with a floor), Vic starts you at Known
 *   with a faction you have no standing with. It never touches Inner Circle.
 * - Arcs. Each faction gets a Connected Job and an Inner Circle capstone that pays standing and a
 *   title, never cash or power.
 *
 * Everything else is exactly 1.4.0-D's. See docs/ROADMAP-1.4.0.md.
 */
export const classicOgV14E = {
  ...classicOgV14D,
  meta: { id: 'classic-og-v1.4-e', version: '1.4.0-E', name: 'Classic OG - Rivalries & Inner Circle' },
  questDefinitions,
  cosmetics: { ...classicOgV14D.cosmetics, ...factionCapstoneCosmetics },
  factionRivalry: { innerCircleLock: true },
} as const satisfies Ruleset;
