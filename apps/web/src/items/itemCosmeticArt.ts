import type { ItemCosmeticStyleKey } from '@streets/shared';
import { ITEM_ART, type ItemArtKey } from './itemArt.js';

/**
 * Slice A authored weapon/ride asset registry.
 *
 * Every non-classic choice points to a separate SVG drawing. ItemTile falls back
 * to Classic if a stale or unknown cosmetic key ever reaches the renderer.
 */
export const SLICE_A_ART_FILES = {
  PISTOL: {
    'midnight-ops': 'cosmetics/weapons/pistol-midnight-ops.svg',
    'urban-ghost': 'cosmetics/weapons/pistol-urban-ghost.svg',
    'cartel-gold': 'cosmetics/weapons/pistol-cartel-gold.svg',
  },
  SHOTGUN: {
    'midnight-ops': 'cosmetics/weapons/shotgun-midnight-ops.svg',
    'urban-ghost': 'cosmetics/weapons/shotgun-urban-ghost.svg',
    'cartel-gold': 'cosmetics/weapons/shotgun-cartel-gold.svg',
  },
  TEK9: {
    'midnight-ops': 'cosmetics/weapons/tek9-midnight-ops.svg',
    'urban-ghost': 'cosmetics/weapons/tek9-urban-ghost.svg',
    'cartel-gold': 'cosmetics/weapons/tek9-cartel-gold.svg',
  },
  AK47: {
    'midnight-ops': 'cosmetics/weapons/ak47-midnight-ops.svg',
    'urban-ghost': 'cosmetics/weapons/ak47-urban-ghost.svg',
    'cartel-gold': 'cosmetics/weapons/ak47-cartel-gold.svg',
  },
  LOW_RIDER: {
    'midnight-ops': 'cosmetics/rides/low-rider-midnight-ops.svg',
    'urban-ghost': 'cosmetics/rides/low-rider-urban-ghost.svg',
    'cartel-gold': 'cosmetics/rides/low-rider-cartel-gold.svg',
  },
} as const satisfies Partial<Record<ItemArtKey, Partial<Record<ItemCosmeticStyleKey, string>>>>;

const ITEM_COSMETIC_ART = {
  PISTOL: { classic: 'pistol.svg', ...SLICE_A_ART_FILES.PISTOL },
  SHOTGUN: { classic: 'shotgun.svg', ...SLICE_A_ART_FILES.SHOTGUN },
  TEK9: { classic: 'tek9.svg', ...SLICE_A_ART_FILES.TEK9 },
  AK47: { classic: 'ak47.svg', ...SLICE_A_ART_FILES.AK47 },
  LOW_RIDER: { classic: 'low-rider.svg', ...SLICE_A_ART_FILES.LOW_RIDER },
} as const satisfies Partial<Record<ItemArtKey, Partial<Record<ItemCosmeticStyleKey, string>>>>;

export function itemCosmeticArtFile(item: ItemArtKey, style: ItemCosmeticStyleKey): string {
  const variants = ITEM_COSMETIC_ART[item] as Partial<Record<ItemCosmeticStyleKey, string>> | undefined;
  return variants?.[style] ?? variants?.classic ?? ITEM_ART[item].file;
}

export function itemCosmeticArtUrl(item: ItemArtKey, style: ItemCosmeticStyleKey): string {
  return `/items/${itemCosmeticArtFile(item, style)}`;
}
