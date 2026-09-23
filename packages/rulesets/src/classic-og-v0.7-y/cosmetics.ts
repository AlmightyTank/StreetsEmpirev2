import type { QuestCosmeticCatalog } from '../types.js';

export const appearanceCosmetics = {
  'mama-ghost-violet': {
    key: 'mama-ghost-violet',
    name: 'Ghost Violet',
    description: 'Mama King’s quiet-work accent. Recolors the player-facing game with a violet street-glow.',
    kind: 'ACCENT',
    rarity: 'legendary',
    styleKey: 'ghost-violet',
  },
  'mama-ghost-frame': {
    key: 'mama-ghost-frame',
    name: 'Ghost Wire Frame',
    description: 'A violet, low-profile frame earned from Mama King’s Quiet Hour.',
    kind: 'PROFILE_FRAME',
    rarity: 'legendary',
    styleKey: 'ghost-frame',
  },

  'pip-top-shelf-teal': {
    key: 'pip-top-shelf-teal',
    name: 'Top Shelf Teal',
    description: 'Pip’s premium teal accent for operators trusted with the top shelf.',
    kind: 'ACCENT',
    rarity: 'legendary',
    styleKey: 'top-shelf-teal',
  },
  'pip-top-shelf-frame': {
    key: 'pip-top-shelf-frame',
    name: 'Top Shelf Frame',
    description: 'A clean double-line teal profile frame earned from Pip’s Top Shelf.',
    kind: 'PROFILE_FRAME',
    rarity: 'legendary',
    styleKey: 'top-shelf-frame',
  },

  'tommy-enforcer-red': {
    key: 'tommy-enforcer-red',
    name: 'Enforcer Red',
    description: 'Tommy’s hard red accent for a crew that finished the full rack.',
    kind: 'ACCENT',
    rarity: 'legendary',
    styleKey: 'enforcer-red',
  },
  'tommy-full-rack-frame': {
    key: 'tommy-full-rack-frame',
    name: 'Full Rack Frame',
    description: 'A heavy red profile frame with reinforced top and bottom rails.',
    kind: 'PROFILE_FRAME',
    rarity: 'legendary',
    styleKey: 'full-rack-frame',
  },

  'wheels-open-road-blue': {
    key: 'wheels-open-road-blue',
    name: 'Open Road Blue',
    description: 'Wheels’ electric-blue accent for crews that know how to get home safe.',
    kind: 'ACCENT',
    rarity: 'epic',
    styleKey: 'open-road-blue',
  },
  'wheels-open-road-frame': {
    key: 'wheels-open-road-frame',
    name: 'Open Road Frame',
    description: 'A blue road-marked profile frame earned from Home Safe.',
    kind: 'PROFILE_FRAME',
    rarity: 'epic',
    styleKey: 'open-road-frame',
  },

  'vic-clean-slate-ice': {
    key: 'vic-clean-slate-ice',
    name: 'Clean Slate Ice',
    description: 'Vic’s pale ice accent for a record scrubbed clean.',
    kind: 'ACCENT',
    rarity: 'epic',
    styleKey: 'clean-slate-ice',
  },
  'vic-clean-slate-frame': {
    key: 'vic-clean-slate-frame',
    name: 'Clean Slate Frame',
    description: 'A cold, minimal profile frame earned from Vic’s Clean Slate.',
    kind: 'PROFILE_FRAME',
    rarity: 'epic',
    styleKey: 'clean-slate-frame',
  },

  'blocks-corner-amber': {
    key: 'blocks-corner-amber',
    name: 'Corner Amber',
    description: 'Blocks’ amber street-control accent for operators who can hold influence out of town.',
    kind: 'ACCENT',
    rarity: 'legendary',
    styleKey: 'corner-amber',
  },
  'blocks-corner-boss-frame': {
    key: 'blocks-corner-boss-frame',
    name: 'Corner Boss Frame',
    description: 'A double-rail amber profile frame earned from Out-of-Town Box.',
    kind: 'PROFILE_FRAME',
    rarity: 'legendary',
    styleKey: 'corner-boss-frame',
  },
} as const satisfies QuestCosmeticCatalog;
