import type { QuestCosmeticCatalog } from './types.js';

/**
 * Supporter rewards. Account-level and permanent: once granted they are never
 * taken back, and they never touch stats, prices, ranking or combat (roadmap
 * 1.9, "never sell"). They live outside any round ruleset because supporting
 * is not tied to a season.
 */
export const SUPPORTER_SOURCE = 'supporter';
export const SUPPORTER_SOURCE_VERSION = '1';

export const SUPPORTER_COSMETICS = {
  'supporter-midnight-chrome': {
    key: 'supporter-midnight-chrome',
    name: 'Midnight Chrome Collection',
    description: 'Deep graphite, brushed chrome and a narrow crimson accent for the Thug, the Hoe, the Sedan, the Van and the Low-Rider.',
    kind: 'ITEM_COLLECTION',
    rarity: 'legendary',
    styleKey: 'midnight-chrome',
  },
  'midnight-chrome-frame': {
    key: 'midnight-chrome-frame',
    name: 'Midnight Chrome Signature Card',
    description: 'A brushed-chrome profile card with a crimson pinstripe, a choice of surface finish and the supporter mark.',
    kind: 'PROFILE_FRAME',
    rarity: 'legendary',
    styleKey: 'midnight-chrome-frame',
  },
} as const satisfies QuestCosmeticCatalog;

export type SupporterCosmeticKey = keyof typeof SUPPORTER_COSMETICS;
