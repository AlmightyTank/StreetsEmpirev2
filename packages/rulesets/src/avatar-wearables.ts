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
  'avatar-scar': {
    key: 'avatar-scar',
    name: 'Scar',
    description: 'From the first raid you lost on your own block. A face mark for your built avatar.',
    kind: 'AVATAR_PART',
    rarity: 'uncommon',
    styleKey: 'faceMark:scar',
  },
  'avatar-dice': {
    key: 'avatar-dice',
    name: 'Gold Dice',
    description: 'For hitting a jackpot or a mega win at the casino. A prop for your built avatar.',
    kind: 'AVATAR_PART',
    rarity: 'rare',
    styleKey: 'prop:dice',
  },
  'avatar-briefcase': {
    key: 'avatar-briefcase',
    name: 'Briefcase',
    description: 'For paying off a loan. A prop for your built avatar.',
    kind: 'AVATAR_PART',
    rarity: 'uncommon',
    styleKey: 'prop:briefcase',
  },
  'avatar-top-ten-laurel': {
    key: 'avatar-top-ten-laurel',
    name: 'Top 10 Laurel',
    description: 'For finishing a round in the national top 10. A gold laurel for your built avatar.',
    kind: 'AVATAR_PART',
    rarity: 'epic',
    styleKey: 'headwear:laurel',
  },
  'avatar-top-three-diamonds': {
    key: 'avatar-top-three-diamonds',
    name: 'Diamond Studs',
    description: 'For finishing a round in the national top 3. Diamond earrings for your built avatar.',
    kind: 'AVATAR_PART',
    rarity: 'legendary',
    styleKey: 'earrings:diamond-studs',
  },
} as const satisfies Record<string, QuestCosmeticDefinition>;

/** Must match AVATAR_SKYLINE_CITIES in @streets/shared (a server test checks). */
export const AVATAR_SKYLINE_CITIES = [
  ['new-york-city', 'New York City'], ['detroit', 'Detroit'], ['miami-beach', 'Miami Beach'], ['seattle', 'Seattle'],
  ['beverly-hills', 'Beverly Hills'], ['las-vegas', 'Las Vegas'], ['los-angeles', 'Los Angeles'], ['atlanta', 'Atlanta'],
  ['san-francisco', 'San Francisco'], ['chicago', 'Chicago'], ['tulsa', 'Tulsa'], ['dallas', 'Dallas'],
] as const;

export type AvatarSkylineKey = `avatar-skyline-${(typeof AVATAR_SKYLINE_CITIES)[number][0]}`;

/** City skyline backdrops: held turf in that city when a round ended. */
export const AVATAR_SKYLINE_WEARABLES = Object.fromEntries(AVATAR_SKYLINE_CITIES.map(([slug, name]) => [`avatar-skyline-${slug}`, {
  key: `avatar-skyline-${slug}`,
  name: `${name} Skyline`,
  description: `For holding turf in ${name} when a round ended. A backdrop for your built avatar.`,
  kind: 'AVATAR_PART',
  rarity: 'rare',
  styleKey: `background:skyline-${slug}`,
} satisfies QuestCosmeticDefinition])) as Record<AvatarSkylineKey, QuestCosmeticDefinition>;

export type AvatarWearableKey = keyof typeof AVATAR_WEARABLES | AvatarSkylineKey;

/** Every earned wearable's definition, skylines included. */
export function avatarWearable(key: AvatarWearableKey): QuestCosmeticDefinition {
  return (AVATAR_WEARABLES as Record<string, QuestCosmeticDefinition>)[key] ?? AVATAR_SKYLINE_WEARABLES[key as AvatarSkylineKey];
}

export function isAvatarSkylineKey(key: string): key is AvatarSkylineKey {
  return Object.hasOwn(AVATAR_SKYLINE_WEARABLES, key);
}

/** Account-level grants, not tied to a round's ruleset. */
export const AVATAR_WEARABLE_SOURCE = 'avatar';
export const AVATAR_WEARABLE_SOURCE_VERSION = '1';
