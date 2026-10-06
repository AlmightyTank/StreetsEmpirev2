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
} as const satisfies Partial<Record<ItemArtKey, Partial<Record<ItemCosmeticStyleKey, string>>>>;

export function itemCosmeticArtFile(item: ItemArtKey, style: ItemCosmeticStyleKey): string {
  const registry: Partial<Record<ItemArtKey, Partial<Record<ItemCosmeticStyleKey, string>>>> = ITEM_COSMETIC_ART;
  const variants = registry[item];
  return variants?.[style] ?? variants?.classic ?? ITEM_ART[item].file;
}

export function itemCosmeticArtUrl(item: ItemArtKey, style: ItemCosmeticStyleKey): string {
  return `/items/${itemCosmeticArtFile(item, style)}`;
}
