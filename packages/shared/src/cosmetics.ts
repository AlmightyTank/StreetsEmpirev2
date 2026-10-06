/**
 * Account-level visual skins for item and crew art.
 *
 * These never change gameplay stats, rarity, prices, combat math or inventory.
 * "Classic" is always the original SVG. The other styles are presentation filters
 * applied by ItemTile, so every existing item asset can participate without
 * duplicating art files.
 */
export const ITEM_COSMETIC_STYLE_KEYS = [
  'classic',
  'blackout',
  'crimson',
  'gold',
  'ice',
  'violet',
] as const;

export type ItemCosmeticStyleKey = typeof ITEM_COSMETIC_STYLE_KEYS[number];

export const ITEM_COSMETIC_STYLES = [
  { key: 'classic', label: 'Classic', description: 'The original StreetsEmpire item art.' },
  { key: 'blackout', label: 'Blackout', description: 'Dark, desaturated street gear with heavier contrast.' },
  { key: 'crimson', label: 'Crimson', description: 'A hot red treatment for a more aggressive loadout.' },
  { key: 'gold', label: 'Gold Trim', description: 'Warm gold styling for a high-roller look.' },
  { key: 'ice', label: 'Ice', description: 'Cool blue-white styling with a colder finish.' },
  { key: 'violet', label: 'Violet', description: 'Purple neon styling for a louder night-street look.' },
] as const satisfies ReadonlyArray<{
  key: ItemCosmeticStyleKey;
  label: string;
  description: string;
}>;

/** Crew is aggregate inventory in the current game, so each key styles that whole crew type. */
export const CREW_COSMETIC_KEYS = ['THUG', 'HOE'] as const;
export type CrewCosmeticKey = typeof CREW_COSMETIC_KEYS[number];

export const DEFAULT_CREW_COSMETICS = {
  THUG: 'classic',
  HOE: 'classic',
} as const satisfies Record<CrewCosmeticKey, ItemCosmeticStyleKey>;

export type CrewCosmeticLoadout = Record<CrewCosmeticKey, ItemCosmeticStyleKey>;

/** Items players can reskin today. Reward-only favors/currency keep their authored art. */
export const CUSTOMIZABLE_ITEM_KEYS = [
  'CONDOM',
  'MEDICINE',
  'BEER',
  'PISTOL',
  'SHOTGUN',
  'TEK9',
  'AK47',
  'LOW_RIDER',
  'CRACK',
  'WEED',
  'ECSTASY',
  'METH',
  'COCAINE',
  'HEROIN',
] as const;

export type CustomizableItemKey = typeof CUSTOMIZABLE_ITEM_KEYS[number];
export type ItemCosmeticLoadout = Partial<Record<CustomizableItemKey, ItemCosmeticStyleKey>>;
