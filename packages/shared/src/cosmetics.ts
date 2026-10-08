/**
 * Account-level cosmetic loadouts.
 *
 * One style catalog covers every customizable item: Slice A weapons/rides and
 * Slice B products/supplies. Every non-classic style resolves to its own
 * authored image; CSS color filters are not part of the contract. Crew outfit
 * keys arrive separately in Slice C.
 */
export const ITEM_COSMETIC_STYLES = [
  {
    key: 'classic',
    label: 'Classic',
    description: 'The original StreetsEmpire artwork.',
    released: true,
  },
  {
    key: 'midnight-ops',
    label: 'Midnight Ops',
    description: 'Blacked-out tactical builds and matte black packaging with teal stencil marks.',
    released: true,
  },
  {
    key: 'urban-ghost',
    label: 'Urban Ghost',
    description: 'Graphite, concrete and pale urban camouflage on hardware and packaging alike.',
    released: true,
  },
  {
    key: 'cartel-gold',
    label: 'Cartel Gold',
    description: 'Engraved metal, polished gold trim and high-roller presentation.',
    released: true,
  },
] as const;

export type ItemCosmeticStyleKey = typeof ITEM_COSMETIC_STYLES[number]['key'];
export const ITEM_COSMETIC_STYLE_KEYS = ITEM_COSMETIC_STYLES.map((style) => style.key) as readonly ItemCosmeticStyleKey[];
export const RELEASED_ITEM_COSMETIC_STYLES = ITEM_COSMETIC_STYLES.filter((style) => style.released);

/** Slice A: weapons and the Low-Rider. */
export const WEAPON_RIDE_COSMETIC_KEYS = [
  'PISTOL',
  'SHOTGUN',
  'TEK9',
  'AK47',
  'LOW_RIDER',
] as const;

/** Slice B: products and Corner Store supplies get redrawn packaging. */
export const PRODUCT_SUPPLY_COSMETIC_KEYS = [
  'CRACK',
  'WEED',
  'ECSTASY',
  'METH',
  'COCAINE',
  'HEROIN',
  'CONDOM',
  'MEDICINE',
  'BEER',
] as const;

/**
 * 1.5.0-F: the Sedan and Van join the rides. Same collections, presentation only: a look never
 * changes cargo, seats, route risk, price or anything else a car does.
 */
export const VEHICLE_COSMETIC_KEYS = [
  'SEDAN',
  'VAN',
] as const;

export const CUSTOMIZABLE_ITEM_KEYS = [
  ...WEAPON_RIDE_COSMETIC_KEYS,
  ...VEHICLE_COSMETIC_KEYS,
  ...PRODUCT_SUPPLY_COSMETIC_KEYS,
] as const;

/** Locker sections, in display order. */
export const ITEM_COSMETIC_GROUPS = [
  { key: 'weapons-rides', label: 'Weapons & rides', items: [...WEAPON_RIDE_COSMETIC_KEYS, ...VEHICLE_COSMETIC_KEYS] },
  { key: 'products-supplies', label: 'Products & supplies', items: PRODUCT_SUPPLY_COSMETIC_KEYS },
] as const;

export type CustomizableItemKey = typeof CUSTOMIZABLE_ITEM_KEYS[number];
export type ItemCosmeticLoadout = Partial<Record<CustomizableItemKey, ItemCosmeticStyleKey>>;

/**
 * Slice C: crew outfit sets. Crew stay aggregate inventory; the loadout picks
 * one authored outfit per crew type from the same collection catalog as items,
 * so a collection's `released` flag and its Street Pass unlock (Slice D) cover
 * items and crew together.
 */
export const CREW_COSMETIC_KEYS = ['THUG', 'HOE'] as const;
export type CrewCosmeticKey = typeof CREW_COSMETIC_KEYS[number];
export const CREW_COSMETIC_STYLE_KEYS = ITEM_COSMETIC_STYLE_KEYS;
export type CrewCosmeticStyleKey = ItemCosmeticStyleKey;

const CREW_OUTFIT_DESCRIPTIONS: Record<ItemCosmeticStyleKey, string> = {
  classic: 'The original crew artwork.',
  'midnight-ops': 'Blacked-out night fits: hood up, leather, matte black with teal accents.',
  'urban-ghost': 'Concrete-grey streetwear: camo puffers, beanies and caps, silver chains.',
  'cartel-gold': 'High-roller dress: cream suit and fedora, velvet and fur, heavy gold.',
};

export const RELEASED_CREW_COSMETIC_STYLES = RELEASED_ITEM_COSMETIC_STYLES.map((style) => ({
  key: style.key,
  label: style.label,
  description: CREW_OUTFIT_DESCRIPTIONS[style.key],
}));

export const DEFAULT_CREW_COSMETICS = {
  THUG: 'classic',
  HOE: 'classic',
} as const satisfies Record<CrewCosmeticKey, CrewCosmeticStyleKey>;

export type CrewCosmeticLoadout = Record<CrewCosmeticKey, CrewCosmeticStyleKey>;

export function isReleasedItemCosmeticStyle(key: string): key is ItemCosmeticStyleKey {
  return RELEASED_ITEM_COSMETIC_STYLES.some((style) => style.key === key);
}

/**
 * Slice D: every non-classic collection is earned (Street Pass), so a player
 * owns Classic plus the collection keys on their account unlocks. The server
 * decides ownership; these helpers keep its options and the web fallback in
 * the same shape.
 */
export const DEFAULT_COLLECTION_UNLOCK_HINT = 'Earned on the Street Pass.';

export function isOwnedCollection(key: string, owned: ReadonlySet<string>): boolean {
  return key === 'classic' || owned.has(key);
}

export function collectionOptions(
  styles: readonly { key: ItemCosmeticStyleKey; label: string; description: string }[],
  owned: ReadonlySet<string>,
  hints: Partial<Record<ItemCosmeticStyleKey, string>> = {},
): { key: ItemCosmeticStyleKey; label: string; description: string; locked: boolean; unlockHint: string | null }[] {
  return styles.map((style) => {
    const locked = !isOwnedCollection(style.key, owned);
    return {
      key: style.key,
      label: style.label,
      description: style.description,
      locked,
      unlockHint: locked ? hints[style.key] ?? DEFAULT_COLLECTION_UNLOCK_HINT : null,
    };
  });
}
