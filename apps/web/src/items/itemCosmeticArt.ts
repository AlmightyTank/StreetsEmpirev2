import type { ItemCosmeticStyleKey } from '@streets/shared';
import { ITEM_ART, type ItemArtKey } from './itemArt.js';

/**
 * Slice A authored art, relative to public/items/.
 *
 * Rendered from the SVG masters in apps/web/art/cosmetics/ by
 * scripts/art/render-cosmetic-art.mjs. Every path here must exist on disk;
 * itemCosmeticArt.test.ts checks the files and their canvas sizes.
 */
export const SLICE_A_ART_FILES = {
  PISTOL: {
    'midnight-ops': 'cosmetics/weapons/pistol-midnight-ops.webp',
    'urban-ghost': 'cosmetics/weapons/pistol-urban-ghost.webp',
    'cartel-gold': 'cosmetics/weapons/pistol-cartel-gold.webp',
  },
  SHOTGUN: {
    'midnight-ops': 'cosmetics/weapons/shotgun-midnight-ops.webp',
    'urban-ghost': 'cosmetics/weapons/shotgun-urban-ghost.webp',
    'cartel-gold': 'cosmetics/weapons/shotgun-cartel-gold.webp',
  },
  TEK9: {
    'midnight-ops': 'cosmetics/weapons/tek9-midnight-ops.webp',
    'urban-ghost': 'cosmetics/weapons/tek9-urban-ghost.webp',
    'cartel-gold': 'cosmetics/weapons/tek9-cartel-gold.webp',
  },
  AK47: {
    'midnight-ops': 'cosmetics/weapons/ak47-midnight-ops.webp',
    'urban-ghost': 'cosmetics/weapons/ak47-urban-ghost.webp',
    'cartel-gold': 'cosmetics/weapons/ak47-cartel-gold.webp',
  },
  LOW_RIDER: {
    'midnight-ops': 'cosmetics/rides/low-rider-midnight-ops.webp',
    'urban-ghost': 'cosmetics/rides/low-rider-urban-ghost.webp',
    'cartel-gold': 'cosmetics/rides/low-rider-cartel-gold.webp',
  },
} as const satisfies Partial<Record<ItemArtKey, Partial<Record<ItemCosmeticStyleKey, string>>>>;

/**
 * Slice B authored packaging art, relative to public/items/. Same render
 * pipeline and checks as Slice A; file names follow the Classic art.
 */
export const SLICE_B_ART_FILES = {
  CRACK: {
    'midnight-ops': 'cosmetics/products/crack-midnight-ops.webp',
    'urban-ghost': 'cosmetics/products/crack-urban-ghost.webp',
    'cartel-gold': 'cosmetics/products/crack-cartel-gold.webp',
  },
  WEED: {
    'midnight-ops': 'cosmetics/products/weed-midnight-ops.webp',
    'urban-ghost': 'cosmetics/products/weed-urban-ghost.webp',
    'cartel-gold': 'cosmetics/products/weed-cartel-gold.webp',
  },
  ECSTASY: {
    'midnight-ops': 'cosmetics/products/ecstasy-midnight-ops.webp',
    'urban-ghost': 'cosmetics/products/ecstasy-urban-ghost.webp',
    'cartel-gold': 'cosmetics/products/ecstasy-cartel-gold.webp',
  },
  METH: {
    'midnight-ops': 'cosmetics/products/meth-midnight-ops.webp',
    'urban-ghost': 'cosmetics/products/meth-urban-ghost.webp',
    'cartel-gold': 'cosmetics/products/meth-cartel-gold.webp',
  },
  COCAINE: {
    'midnight-ops': 'cosmetics/products/cocaine-midnight-ops.webp',
    'urban-ghost': 'cosmetics/products/cocaine-urban-ghost.webp',
    'cartel-gold': 'cosmetics/products/cocaine-cartel-gold.webp',
  },
  HEROIN: {
    'midnight-ops': 'cosmetics/products/heroin-midnight-ops.webp',
    'urban-ghost': 'cosmetics/products/heroin-urban-ghost.webp',
    'cartel-gold': 'cosmetics/products/heroin-cartel-gold.webp',
  },
  CONDOM: {
    'midnight-ops': 'cosmetics/supplies/condoms-midnight-ops.webp',
    'urban-ghost': 'cosmetics/supplies/condoms-urban-ghost.webp',
    'cartel-gold': 'cosmetics/supplies/condoms-cartel-gold.webp',
  },
  MEDICINE: {
    'midnight-ops': 'cosmetics/supplies/medicine-midnight-ops.webp',
    'urban-ghost': 'cosmetics/supplies/medicine-urban-ghost.webp',
    'cartel-gold': 'cosmetics/supplies/medicine-cartel-gold.webp',
  },
  BEER: {
    'midnight-ops': 'cosmetics/supplies/beer-midnight-ops.webp',
    'urban-ghost': 'cosmetics/supplies/beer-urban-ghost.webp',
    'cartel-gold': 'cosmetics/supplies/beer-cartel-gold.webp',
  },
} as const satisfies Partial<Record<ItemArtKey, Partial<Record<ItemCosmeticStyleKey, string>>>>;

/** Every authored non-classic file, by item. */
export const AUTHORED_ITEM_ART_FILES = { ...SLICE_A_ART_FILES, ...SLICE_B_ART_FILES };

/**
 * Authored cosmetic art registry.
 *
 * Only files that exist in the repository belong here. ItemTile always falls
 * back to Classic, so a stale saved preference or partial deploy cannot produce
 * a broken image.
 */
const ITEM_COSMETIC_ART = {
  PISTOL: { classic: 'pistol.svg', ...SLICE_A_ART_FILES.PISTOL },
  SHOTGUN: { classic: 'shotgun.svg', ...SLICE_A_ART_FILES.SHOTGUN },
  TEK9: { classic: 'tek9.svg', ...SLICE_A_ART_FILES.TEK9 },
  AK47: { classic: 'ak47.svg', ...SLICE_A_ART_FILES.AK47 },
  LOW_RIDER: { classic: 'low-rider.svg', ...SLICE_A_ART_FILES.LOW_RIDER },
  CRACK: { classic: 'crack.svg', ...SLICE_B_ART_FILES.CRACK },
  WEED: { classic: 'weed.svg', ...SLICE_B_ART_FILES.WEED },
  ECSTASY: { classic: 'ecstasy.svg', ...SLICE_B_ART_FILES.ECSTASY },
  METH: { classic: 'meth.svg', ...SLICE_B_ART_FILES.METH },
  COCAINE: { classic: 'cocaine.svg', ...SLICE_B_ART_FILES.COCAINE },
  HEROIN: { classic: 'heroin.svg', ...SLICE_B_ART_FILES.HEROIN },
  CONDOM: { classic: 'condoms.svg', ...SLICE_B_ART_FILES.CONDOM },
  MEDICINE: { classic: 'medicine.svg', ...SLICE_B_ART_FILES.MEDICINE },
  BEER: { classic: 'beer.svg', ...SLICE_B_ART_FILES.BEER },
} as const satisfies Partial<Record<ItemArtKey, Partial<Record<ItemCosmeticStyleKey, string>>>>;

export function itemCosmeticArtFile(item: ItemArtKey, style: ItemCosmeticStyleKey): string {
  const registry: Partial<Record<ItemArtKey, Partial<Record<ItemCosmeticStyleKey, string>>>> = ITEM_COSMETIC_ART;
  const variants = registry[item];
  return variants?.[style] ?? variants?.classic ?? ITEM_ART[item].file;
}

export function itemCosmeticArtUrl(item: ItemArtKey, style: ItemCosmeticStyleKey): string {
  return `/items/${itemCosmeticArtFile(item, style)}`;
}
