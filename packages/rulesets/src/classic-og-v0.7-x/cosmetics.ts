import type { QuestCosmeticCatalog } from '../types.js';

/**
 * Phase Y-C quest-only cosmetics.
 *
 * TITLE_BADGE unlocks use the existing profile title/badge picker. The broader
 * kind union is intentional groundwork for later frames, accents and hideout
 * decor without changing the permanent ownership table again.
 */
export const questCosmetics = {
  GHOST_OF_THE_BLOCK: {
    key: 'GHOST_OF_THE_BLOCK',
    name: 'Ghost of the Block',
    description: 'Finished Mama King’s Quiet Hour and learned how to move the street without making noise.',
    kind: 'TITLE_BADGE',
    rarity: 'legendary',
  },

  TOP_SHELF_OPERATOR: {
    key: 'TOP_SHELF_OPERATOR',
    name: 'Top Shelf Operator',
    description: 'Earned Pip’s trust at the very top of his product ladder.',
    kind: 'TITLE_BADGE',
    rarity: 'legendary',
  },

  FULL_RACK_ENFORCER: {
    key: 'FULL_RACK_ENFORCER',
    name: 'Full Rack Enforcer',
    description: 'Finished Tommy’s Full Rack job and earned a permanent mark as a fully armed operator.',
    kind: 'TITLE_BADGE',
    rarity: 'legendary',
  },

  ROAD_KING: {
    key: 'ROAD_KING',
    name: 'Road King',
    description: 'Brought enough interstate work home safe that Wheels put your name on the road map.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },

  NO_PAPER_TRAIL: {
    key: 'NO_PAPER_TRAIL',
    name: 'No Paper Trail',
    description: 'Closed Vic’s Clean Slate with nothing left for the law to hold onto.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },

  CORNER_BOSS: {
    key: 'CORNER_BOSS',
    name: 'Corner Boss',
    description: 'Proved to Blocks that your influence can hold turf beyond your home city.',
    kind: 'TITLE_BADGE',
    rarity: 'legendary',
  },
} as const satisfies QuestCosmeticCatalog;
