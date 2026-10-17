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
    'midnight-chrome': 'cosmetics/rides/low-rider-midnight-chrome.webp',
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

/** Slice C authored crew outfits, relative to public/items/. Midnight Chrome (supporter) covers crew and rides only. */
export const SLICE_C_ART_FILES = {
  THUG: {
    'midnight-ops': 'cosmetics/crew/thug-midnight-ops.webp',
    'urban-ghost': 'cosmetics/crew/thug-urban-ghost.webp',
    'cartel-gold': 'cosmetics/crew/thug-cartel-gold.webp',
    'midnight-chrome': 'cosmetics/crew/thug-midnight-chrome.webp',
    'obsidian-signal-crew': 'round-roll-call/thug-obsidian-signal.svg',
  },
  HOE: {
    'midnight-ops': 'cosmetics/crew/hoe-midnight-ops.webp',
    'urban-ghost': 'cosmetics/crew/hoe-urban-ghost.webp',
    'cartel-gold': 'cosmetics/crew/hoe-cartel-gold.webp',
    'midnight-chrome': 'cosmetics/crew/hoe-midnight-chrome.webp',
    'obsidian-signal-crew': 'round-roll-call/hoe-obsidian-signal.svg',
  },
} as const satisfies Partial<Record<ItemArtKey, Partial<Record<ItemCosmeticStyleKey, string>>>>;

/** 1.5.0-F authored Sedan and Van looks, relative to public/items/. Same render pipeline and checks. */
export const VEHICLE_ART_FILES = {
  SEDAN: {
    'midnight-ops': 'cosmetics/rides/sedan-midnight-ops.webp',
    'urban-ghost': 'cosmetics/rides/sedan-urban-ghost.webp',
    'cartel-gold': 'cosmetics/rides/sedan-cartel-gold.webp',
    'midnight-chrome': 'cosmetics/rides/sedan-midnight-chrome.webp',
  },
  VAN: {
    'midnight-ops': 'cosmetics/rides/van-midnight-ops.webp',
    'urban-ghost': 'cosmetics/rides/van-urban-ghost.webp',
    'cartel-gold': 'cosmetics/rides/van-cartel-gold.webp',
    'midnight-chrome': 'cosmetics/rides/van-midnight-chrome.webp',
  },
} as const satisfies Partial<Record<ItemArtKey, Partial<Record<ItemCosmeticStyleKey, string>>>>;

/** Every authored non-classic file, by item or crew key. */
export const AUTHORED_ITEM_ART_FILES = { ...SLICE_A_ART_FILES, ...VEHICLE_ART_FILES, ...SLICE_B_ART_FILES, ...SLICE_C_ART_FILES };

/**
 * Easter egg: the 8-Bit collection (the Konami code). Generated from the
 * Classic art by scripts/art/generate-eight-bit-art.mjs, then rendered like
 * every other master.
 */
export const EIGHT_BIT_ART_FILES = {
  PISTOL: { 'eight-bit': 'cosmetics/weapons/pistol-eight-bit.webp' },
  SHOTGUN: { 'eight-bit': 'cosmetics/weapons/shotgun-eight-bit.webp' },
  TEK9: { 'eight-bit': 'cosmetics/weapons/tek9-eight-bit.webp' },
  AK47: { 'eight-bit': 'cosmetics/weapons/ak47-eight-bit.webp' },
  LOW_RIDER: { 'eight-bit': 'cosmetics/rides/low-rider-eight-bit.webp' },
  SEDAN: { 'eight-bit': 'cosmetics/rides/sedan-eight-bit.webp' },
  VAN: { 'eight-bit': 'cosmetics/rides/van-eight-bit.webp' },
  CRACK: { 'eight-bit': 'cosmetics/products/crack-eight-bit.webp' },
  WEED: { 'eight-bit': 'cosmetics/products/weed-eight-bit.webp' },
  ECSTASY: { 'eight-bit': 'cosmetics/products/ecstasy-eight-bit.webp' },
  METH: { 'eight-bit': 'cosmetics/products/meth-eight-bit.webp' },
  COCAINE: { 'eight-bit': 'cosmetics/products/cocaine-eight-bit.webp' },
  HEROIN: { 'eight-bit': 'cosmetics/products/heroin-eight-bit.webp' },
  CONDOM: { 'eight-bit': 'cosmetics/supplies/condoms-eight-bit.webp' },
  MEDICINE: { 'eight-bit': 'cosmetics/supplies/medicine-eight-bit.webp' },
  BEER: { 'eight-bit': 'cosmetics/supplies/beer-eight-bit.webp' },
  THUG: { 'eight-bit': 'cosmetics/crew/thug-eight-bit.webp' },
  HOE: { 'eight-bit': 'cosmetics/crew/hoe-eight-bit.webp' },
} as const satisfies Partial<Record<ItemArtKey, Partial<Record<ItemCosmeticStyleKey, string>>>>;

/** Easter egg looks drawn for a single item. */
export const SINGLE_ITEM_ART_FILES = {
  SEDAN: { 'time-machine': 'cosmetics/rides/sedan-time-machine.webp' },
  METH: { 'blue-sky': 'cosmetics/products/meth-blue-sky.webp' },
} as const satisfies Partial<Record<ItemArtKey, Partial<Record<ItemCosmeticStyleKey, string>>>>;

/**
 * Authored cosmetic art registry.
 *
 * Only files that exist in the repository belong here. ItemTile always falls
 * back to Classic, so a stale saved preference or partial deploy cannot produce
 * a broken image.
 */
const ITEM_COSMETIC_ART = {
  PISTOL: { classic: 'pistol.svg', ...SLICE_A_ART_FILES.PISTOL, ...EIGHT_BIT_ART_FILES.PISTOL },
  SHOTGUN: { classic: 'shotgun.svg', ...SLICE_A_ART_FILES.SHOTGUN, ...EIGHT_BIT_ART_FILES.SHOTGUN },
  TEK9: { classic: 'tek9.svg', ...SLICE_A_ART_FILES.TEK9, ...EIGHT_BIT_ART_FILES.TEK9 },
  AK47: { classic: 'ak47.svg', ...SLICE_A_ART_FILES.AK47, ...EIGHT_BIT_ART_FILES.AK47 },
  LOW_RIDER: { classic: 'low-rider.svg', ...SLICE_A_ART_FILES.LOW_RIDER, ...EIGHT_BIT_ART_FILES.LOW_RIDER },
  SEDAN: { classic: 'sedan.svg', ...VEHICLE_ART_FILES.SEDAN, ...EIGHT_BIT_ART_FILES.SEDAN, ...SINGLE_ITEM_ART_FILES.SEDAN },
  VAN: { classic: 'van.svg', ...VEHICLE_ART_FILES.VAN, ...EIGHT_BIT_ART_FILES.VAN },
  CRACK: { classic: 'crack.svg', ...SLICE_B_ART_FILES.CRACK, ...EIGHT_BIT_ART_FILES.CRACK },
  WEED: { classic: 'weed.svg', ...SLICE_B_ART_FILES.WEED, ...EIGHT_BIT_ART_FILES.WEED },
  ECSTASY: { classic: 'ecstasy.svg', ...SLICE_B_ART_FILES.ECSTASY, ...EIGHT_BIT_ART_FILES.ECSTASY },
  METH: { classic: 'meth.svg', ...SLICE_B_ART_FILES.METH, ...EIGHT_BIT_ART_FILES.METH, ...SINGLE_ITEM_ART_FILES.METH },
  COCAINE: { classic: 'cocaine.svg', ...SLICE_B_ART_FILES.COCAINE, ...EIGHT_BIT_ART_FILES.COCAINE },
  HEROIN: { classic: 'heroin.svg', ...SLICE_B_ART_FILES.HEROIN, ...EIGHT_BIT_ART_FILES.HEROIN },
  CONDOM: { classic: 'condoms.svg', ...SLICE_B_ART_FILES.CONDOM, ...EIGHT_BIT_ART_FILES.CONDOM },
  MEDICINE: { classic: 'medicine.svg', ...SLICE_B_ART_FILES.MEDICINE, ...EIGHT_BIT_ART_FILES.MEDICINE },
  BEER: { classic: 'beer.svg', ...SLICE_B_ART_FILES.BEER, ...EIGHT_BIT_ART_FILES.BEER },
  THUG: { classic: 'thug.svg', ...SLICE_C_ART_FILES.THUG, ...EIGHT_BIT_ART_FILES.THUG },
  HOE: { classic: 'hoe.svg', ...SLICE_C_ART_FILES.HOE, ...EIGHT_BIT_ART_FILES.HOE },
} as const satisfies Partial<Record<ItemArtKey, Partial<Record<ItemCosmeticStyleKey, string>>>>;

export function itemCosmeticArtFile(item: ItemArtKey, style: ItemCosmeticStyleKey): string {
  const registry: Partial<Record<ItemArtKey, Partial<Record<ItemCosmeticStyleKey, string>>>> = ITEM_COSMETIC_ART;
  const variants = registry[item];
  return variants?.[style] ?? variants?.classic ?? ITEM_ART[item].file;
}

export function itemCosmeticArtUrl(item: ItemArtKey, style: ItemCosmeticStyleKey): string {
  return `/items/${itemCosmeticArtFile(item, style)}`;
}
