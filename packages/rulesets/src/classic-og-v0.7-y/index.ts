import { classicOgV07X } from '../classic-og-v0.7-x/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { QuestCosmeticCatalog, Ruleset } from '../types.js';
import { appearanceCosmetics } from './cosmetics.js';

const base = classicOgV07X.questDefinitions!;

const withAppearance = (
  definition: (typeof base)[keyof typeof base],
  accentKey: keyof typeof appearanceCosmetics,
  frameKey: keyof typeof appearanceCosmetics,
) => ({
  ...definition,
  rewards: [
    ...definition.rewards,
    { kind: 'COSMETIC_UNLOCK' as const, key: accentKey },
    { kind: 'COSMETIC_UNLOCK' as const, key: frameKey },
  ],
});

const questDefinitions = defineQuestCatalog({
  ...base,
  MAMA_QUIET_HOUR: withAppearance(base.MAMA_QUIET_HOUR, 'mama-ghost-violet', 'mama-ghost-frame'),
  PIP_TOP_SHELF: withAppearance(base.PIP_TOP_SHELF, 'pip-top-shelf-teal', 'pip-top-shelf-frame'),
  TOMMY_FULL_RACK: withAppearance(base.TOMMY_FULL_RACK, 'tommy-enforcer-red', 'tommy-full-rack-frame'),
  WHEELS_HOME_SAFE: withAppearance(base.WHEELS_HOME_SAFE, 'wheels-open-road-blue', 'wheels-open-road-frame'),
  VIC_CLEAN_SLATE: withAppearance(base.VIC_CLEAN_SLATE, 'vic-clean-slate-ice', 'vic-clean-slate-frame'),
  BLOCKS_OUT_OF_TOWN: withAppearance(base.BLOCKS_OUT_OF_TOWN, 'blocks-corner-amber', 'blocks-corner-boss-frame'),
});

const cosmetics = {
  ...classicOgV07X.cosmetics!,
  ...appearanceCosmetics,
} as const satisfies QuestCosmeticCatalog;

/**
 * Phase Y-D: Global Accents + Profile Frames.
 *
 * Every Contact finale now pays three permanent prestige layers:
 * title/badge (Y-C), site-wide accent, and profile frame.
 */
export const classicOgV07Y = {
  ...classicOgV07X,
  meta: { id: 'classic-og-v0.7-y', version: '0.7.0-Y', name: 'Classic OG - Global Accents & Frames' },
  cosmetics,
  questDefinitions,
} as const satisfies Ruleset;
