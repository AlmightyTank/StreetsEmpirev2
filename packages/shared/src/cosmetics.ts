/**
 * Account-level cosmetic loadouts.
 *
 * Slice A ships the weapon/ride pipeline first. Every non-classic weapon/ride style
 * resolves to its own authored image; CSS color filters are not part of the contract.
 * Products/supplies join this catalog in Slice B and crew outfit keys in Slice C.
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
    description: 'A dark premium tactical build with low-reflective hardware and street-ready details.',
    released: false,
  },
  {
    key: 'urban-ghost',
    label: 'Urban Ghost',
    description: 'Graphite, concrete and pale urban camouflage with a clean blueprint finish.',
    released: false,
  },
  {
    key: 'cartel-gold',
    label: 'Cartel Gold',
    description: 'Engraved metal, polished trim and high-roller custom work.',
    released: false,
  },
] as const;

export type ItemCosmeticStyleKey = typeof ITEM_COSMETIC_STYLES[number]['key'];
export const ITEM_COSMETIC_STYLE_KEYS = ITEM_COSMETIC_STYLES.map((style) => style.key) as readonly ItemCosmeticStyleKey[];
export const RELEASED_ITEM_COSMETIC_STYLES = ITEM_COSMETIC_STYLES.filter((style) => style.released);

/** Slice A: only weapons and the Low-Rider can be reskinned. */
export const CUSTOMIZABLE_ITEM_KEYS = [
  'PISTOL',
  'SHOTGUN',
  'TEK9',
  'AK47',
  'LOW_RIDER',
] as const;

export type CustomizableItemKey = typeof CUSTOMIZABLE_ITEM_KEYS[number];
export type ItemCosmeticLoadout = Partial<Record<CustomizableItemKey, ItemCosmeticStyleKey>>;

/**
 * Crew remains aggregate inventory. Slice C replaces this Classic-only contract
 * with authored outfit sets for THUG and HOE.
 */
export const CREW_COSMETIC_KEYS = ['THUG', 'HOE'] as const;
export type CrewCosmeticKey = typeof CREW_COSMETIC_KEYS[number];
export const CREW_COSMETIC_STYLE_KEYS = ['classic'] as const;
export type CrewCosmeticStyleKey = typeof CREW_COSMETIC_STYLE_KEYS[number];

export const DEFAULT_CREW_COSMETICS = {
  THUG: 'classic',
  HOE: 'classic',
} as const satisfies Record<CrewCosmeticKey, CrewCosmeticStyleKey>;

export type CrewCosmeticLoadout = Record<CrewCosmeticKey, CrewCosmeticStyleKey>;

export function isReleasedItemCosmeticStyle(key: string): key is ItemCosmeticStyleKey {
  return RELEASED_ITEM_COSMETIC_STYLES.some((style) => style.key === key);
}
