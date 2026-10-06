import type { ItemCosmeticStyleKey } from '@streets/shared';
import { ITEM_ART, type ItemArtKey } from './itemArt.js';

/**
 * Authored cosmetic art registry.
 *
 * Slice A deliberately keeps unreleased variants out of this table until their
 * image files are committed. ItemTile always falls back to Classic, so a stale
 * saved preference or partial deploy can never produce a broken image.
 *
 * Planned file paths are documented in docs/COSMETIC-ART-SLICE-A.md.
 */
const ITEM_COSMETIC_ART = {
  PISTOL: { classic: 'pistol.svg' },
  SHOTGUN: { classic: 'shotgun.svg' },
  TEK9: { classic: 'tek9.svg' },
  AK47: { classic: 'ak47.svg' },
  LOW_RIDER: { classic: 'low-rider.svg' },
} as const satisfies Partial<Record<ItemArtKey, Partial<Record<ItemCosmeticStyleKey, string>>>>;

export function itemCosmeticArtFile(item: ItemArtKey, style: ItemCosmeticStyleKey): string {
  const variants = ITEM_COSMETIC_ART[item] as Partial<Record<ItemCosmeticStyleKey, string>> | undefined;
  return variants?.[style] ?? variants?.classic ?? ITEM_ART[item].file;
}

export function itemCosmeticArtUrl(item: ItemArtKey, style: ItemCosmeticStyleKey): string {
  return `/items/${itemCosmeticArtFile(item, style)}`;
}
