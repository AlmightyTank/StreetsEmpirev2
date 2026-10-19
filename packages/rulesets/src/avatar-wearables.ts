import type { QuestCosmeticDefinition } from './types.js';

/**
 * Avatar wearables earned in play (docs/ROADMAP-AVATAR-COSMETICS.md). Each is
 * an AccountCosmeticUnlock of kind AVATAR_PART whose key matches an `unlock`
 * in AVATAR_PART_OPTIONS (@streets/shared) and whose style key names the slot
 * and option it unlocks. Drop wearables live in drop.ts. None is ever sold.
 */
export const AVATAR_WEARABLES = {
  'street-pass-s1-snapback': {
    key: 'street-pass-s1-snapback',
    name: 'Snapback · Season 1',
    description: 'A flat-brim snapback for your built avatar. Worn in Account → Profile.',
    kind: 'AVATAR_PART',
    rarity: 'uncommon',
    styleKey: 'headwear:snapback',
  },
  'avatar-prison-jumpsuit': {
    key: 'avatar-prison-jumpsuit',
    name: 'Prison Jumpsuit',
    description: 'County orange, earned the hard way: your first arrest. For your built avatar.',
    kind: 'AVATAR_PART',
    rarity: 'rare',
    styleKey: 'shirt:prison-jumpsuit',
  },
  'holiday-road-santa-hat': {
    key: 'holiday-road-santa-hat',
    name: 'Santa Hat',
    description: 'For strapping down a stranger\'s Christmas tree. A hidden hat for your built avatar.',
    kind: 'AVATAR_PART',
    rarity: 'epic',
    styleKey: 'headwear:santa-hat',
  },
} as const satisfies Record<string, QuestCosmeticDefinition>;

export type AvatarWearableKey = keyof typeof AVATAR_WEARABLES;

/** Account-level grants, not tied to a round's ruleset. */
export const AVATAR_WEARABLE_SOURCE = 'avatar';
export const AVATAR_WEARABLE_SOURCE_VERSION = '1';
