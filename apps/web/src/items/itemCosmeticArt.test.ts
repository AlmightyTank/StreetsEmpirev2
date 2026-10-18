import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COLLECTION_COVERAGE,
  CREW_COSMETIC_KEYS,
  CUSTOMIZABLE_ITEM_KEYS,
  isHiddenStyle,
  ITEM_COSMETIC_GROUPS,
  ITEM_COSMETIC_STYLE_KEYS,
  PRODUCT_SUPPLY_COSMETIC_KEYS,
  RELEASED_ITEM_COSMETIC_STYLES,
  styleFitsItem,
  VEHICLE_COSMETIC_KEYS,
  WEAPON_RIDE_COSMETIC_KEYS,
  type ItemCosmeticStyleKey,
} from '@streets/shared';
import {
  AUTHORED_ITEM_ART_FILES,
  EIGHT_BIT_ART_FILES,
  SINGLE_ITEM_ART_FILES,
  itemCosmeticArtFile,
  itemCosmeticArtUrl,
  itemCosmeticZoomUrl,
  SLICE_A_ART_FILES,
  SLICE_B_ART_FILES,
  SLICE_C_ART_FILES,
  VEHICLE_ART_FILES,
} from './itemCosmeticArt.js';
import { STREET_PASS_S1, STREET_PASS_S1_COSMETICS, SUPPORTER_COSMETICS } from '@streets/rulesets';
import { ITEM_ART } from './itemArt.js';

const ITEMS_DIR = path.resolve(import.meta.dirname, '../../public/items');
const MASTERS_DIR = path.resolve(import.meta.dirname, '../../art/cosmetics');
const AUTHORED_STYLES = ['midnight-ops', 'urban-ghost', 'cartel-gold', 'midnight-chrome', 'eight-bit', 'time-machine', 'blue-sky', 'holiday-road'] as const;
/** Items (Slices A and B) and crew (Slice C). */
const AUTHORED_KEYS = [...CUSTOMIZABLE_ITEM_KEYS, ...CREW_COSMETIC_KEYS] as const;
type AuthoredKey = typeof AUTHORED_KEYS[number];
/**
 * The authored collections for one key: every collection, less single-item
 * looks drawn for another item and collections with no art for this key.
 */
function stylesFor(key: AuthoredKey): ItemCosmeticStyleKey[] {
  return AUTHORED_STYLES.filter((style) => styleFitsItem(style, key) && (COLLECTION_COVERAGE[style]?.includes(key) ?? true));
}
function fileFor(key: AuthoredKey, style: ItemCosmeticStyleKey): string {
  return (AUTHORED_ITEM_ART_FILES[key] as Partial<Record<ItemCosmeticStyleKey, string>>)[style]
    ?? (EIGHT_BIT_ART_FILES[key as keyof typeof EIGHT_BIT_ART_FILES] as Partial<Record<ItemCosmeticStyleKey, string>> | undefined)?.[style]
    ?? (SINGLE_ITEM_ART_FILES[key as keyof typeof SINGLE_ITEM_ART_FILES] as Partial<Record<ItemCosmeticStyleKey, string>> | undefined)?.[style]!;
}

/** Width, height and alpha flag from a lossless (VP8L) WebP header. */
function readLosslessWebp(file: string) {
  const bytes = readFileSync(file);
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
  expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('VP8L');
  expect(bytes[20]).toBe(0x2f);
  const bits = bytes.readUInt32LE(21);
  return {
    width: (bits & 0x3fff) + 1,
    height: ((bits >>> 14) & 0x3fff) + 1,
    alpha: ((bits >>> 28) & 1) === 1,
  };
}

describe('item cosmetic art resolver', () => {
  it('keeps every customizable item and crew type on its classic asset for the Classic style', () => {
    for (const key of AUTHORED_KEYS) {
      expect(itemCosmeticArtFile(key, 'classic')).toBe(ITEM_ART[key].file);
    }
  });

  it('locks one authored file per covered collection for each item and crew type, split by slice', () => {
    expect(Object.keys(SLICE_A_ART_FILES)).toEqual([...WEAPON_RIDE_COSMETIC_KEYS]);
    expect(Object.keys(SLICE_B_ART_FILES)).toEqual([...PRODUCT_SUPPLY_COSMETIC_KEYS]);
    expect(Object.keys(SLICE_C_ART_FILES)).toEqual([...CREW_COSMETIC_KEYS]);
    // 1.5.0-F: the Sedan and Van.
    expect(Object.keys(VEHICLE_ART_FILES)).toEqual([...VEHICLE_COSMETIC_KEYS]);
    for (const key of AUTHORED_KEYS) {
      for (const style of stylesFor(key)) {
        expect(fileFor(key, style), `${key} ${style}`).toBeDefined();
      }
    }
    // Midnight Chrome is drawn for crew and rides only; single-item looks stay on their own item.
    expect(stylesFor('AK47')).not.toContain('midnight-chrome');
    expect(stylesFor('VAN')).toContain('midnight-chrome');
    expect(stylesFor('HOE')).toContain('midnight-chrome');
    expect(stylesFor('SEDAN')).toContain('time-machine');
    expect(stylesFor('VAN')).not.toContain('time-machine');
    expect(stylesFor('METH')).toContain('blue-sky');
    expect(stylesFor('CRACK')).not.toContain('blue-sky');
  });

  it('shows every customizable item in exactly one locker section', () => {
    expect(ITEM_COSMETIC_GROUPS.flatMap((group) => group.items)).toEqual([...CUSTOMIZABLE_ITEM_KEYS]);
  });

  it('releases every collection that has authored art', () => {
    expect(RELEASED_ITEM_COSMETIC_STYLES.map((style) => style.key)).toEqual([...ITEM_COSMETIC_STYLE_KEYS]);
  });

  it('resolves every released style to its own explicit asset', () => {
    for (const key of AUTHORED_KEYS) {
      for (const style of stylesFor(key)) {
        expect(itemCosmeticArtFile(key, style)).toBe(fileFor(key, style));
        expect(itemCosmeticArtUrl(key, style)).toBe(`/items/${fileFor(key, style)}`);
      }
    }
  });

  it('falls back to Classic for unknown styles and items without cosmetic art', () => {
    expect(itemCosmeticArtFile('AK47', 'gilded-ghost' as ItemCosmeticStyleKey)).toBe(ITEM_ART.AK47.file);
    expect(itemCosmeticArtFile('CASH', 'cartel-gold')).toBe(ITEM_ART.CASH.file);
    expect(itemCosmeticArtFile('MAMA_ADVICE', 'urban-ghost')).toBe(ITEM_ART.MAMA_ADVICE.file);
  });

  it('ships every authored file as a lossless WebP with alpha on a 512px-per-cell canvas', () => {
    for (const key of AUTHORED_KEYS) {
      for (const style of stylesFor(key)) {
        if (style === 'holiday-road') continue; // This hand-drawn Easter egg ships as a vector SVG.
        const file = path.join(ITEMS_DIR, fileFor(key, style));
        expect(existsSync(file), file).toBe(true);
        const header = readLosslessWebp(file);
        expect(header, file).toEqual({
          width: 512 * ITEM_ART[key].cells[0],
          height: 512 * ITEM_ART[key].cells[1],
          alpha: true,
        });
      }
    }
  });

  it('ships the Easter egg looks: 8-Bit for everything, Time Machine and Blue Sky for one item each', () => {
    const eggFiles = [
      ...AUTHORED_KEYS.map((key) => [key, 'eight-bit', EIGHT_BIT_ART_FILES[key]['eight-bit']] as const),
      ['SEDAN', 'time-machine', SINGLE_ITEM_ART_FILES.SEDAN['time-machine']] as const,
      ['METH', 'blue-sky', SINGLE_ITEM_ART_FILES.METH['blue-sky']] as const,
    ];
    for (const [key, style, file] of eggFiles) {
      expect(itemCosmeticArtFile(key, style)).toBe(file);
      const header = readLosslessWebp(path.join(ITEMS_DIR, file));
      expect(header, file).toEqual({ width: 512 * ITEM_ART[key].cells[0], height: 512 * ITEM_ART[key].cells[1], alpha: true });
    }
    // A single-item look never leaks onto another item.
    expect(itemCosmeticArtFile('VAN', 'time-machine')).toBe(ITEM_ART.VAN.file);
    expect(itemCosmeticArtFile('CRACK', 'blue-sky')).toBe(ITEM_ART.CRACK.file);
  });

  it('keeps a source master for every authored file and no orphan renders', () => {
    const expected = AUTHORED_KEYS.flatMap((key) => stylesFor(key).map((style) => fileFor(key, style)))
      .filter((file) => file.endsWith('.webp'))
      .map((file) => file.replace(/^cosmetics\//, ''))
      .sort();
    const list = (dir: string, ext: string) => readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((group) => readdirSync(path.join(dir, group.name))
        .filter((name) => name.endsWith(ext))
        .map((name) => `${group.name}/${name.slice(0, -ext.length)}.webp`))
      .sort();

    expect(list(MASTERS_DIR, '.svg')).toEqual(expected);
    expect(list(path.join(ITEMS_DIR, 'cosmetics'), '.webp')).toEqual(expected);
  });

  it('zooms every rendered skin from its vector master and leaves vector art as it is', () => {
    for (const [item, styles] of Object.entries(AUTHORED_ITEM_ART_FILES)) {
      for (const [style, file] of Object.entries(styles as Record<string, string>)) {
        const zoom = itemCosmeticZoomUrl(item as keyof typeof ITEM_ART, style as ItemCosmeticStyleKey);
        if (file.endsWith('.webp')) {
          // Vite inlines small masters as data: URIs and emits the rest as .svg assets.
          expect(zoom, `${item} ${style}`).toMatch(/^data:image\/svg\+xml|\.svg(\?|$)/);
          expect(zoom).not.toBe(itemCosmeticArtUrl(item as keyof typeof ITEM_ART, style as ItemCosmeticStyleKey));
        } else {
          expect(zoom).toBe(itemCosmeticArtUrl(item as keyof typeof ITEM_ART, style as ItemCosmeticStyleKey));
        }
      }
    }
    expect(itemCosmeticZoomUrl('PISTOL', 'classic')).toBe(itemCosmeticArtUrl('PISTOL', 'classic'));
  });

  it('ships the hidden Holiday Road Sedan as a transparent 256x128 SVG and never on another vehicle', () => {
    const file = SINGLE_ITEM_ART_FILES.SEDAN['holiday-road'];
    expect(itemCosmeticArtFile('SEDAN', 'holiday-road')).toBe(file);
    expect(itemCosmeticArtFile('VAN', 'holiday-road')).toBe(ITEM_ART.VAN.file);
    const art = readFileSync(path.join(ITEMS_DIR, file), 'utf8');
    expect(art).toContain('viewBox="0 0 256 128"');
    expect(art).not.toMatch(/<image\\b/i);
    expect(art).not.toMatch(/<rect[^>]+(?:width="256"|width="100%")/i);
  });

  it('makes every non-classic collection earnable on the Season 1 Street Pass or as a supporter reward', () => {
    const paid = STREET_PASS_S1.tiers.flatMap((tier) => tier.rewards)
      .filter((reward) => reward.kind === 'COSMETIC_UNLOCK')
      .map((reward) => STREET_PASS_S1_COSMETICS[reward.key as keyof typeof STREET_PASS_S1_COSMETICS])
      .filter((cosmetic) => cosmetic.kind === 'ITEM_COLLECTION')
      .map((cosmetic) => ('styleKey' in cosmetic ? cosmetic.styleKey : null));
    const supporter = Object.values(SUPPORTER_COSMETICS)
      .filter((cosmetic) => cosmetic.kind === 'ITEM_COLLECTION')
      .map((cosmetic) => cosmetic.styleKey);

    // Easter egg looks are hidden until found, never on the pass or a supporter drop.
    const earnable = AUTHORED_STYLES.filter((style) => !isHiddenStyle(style));
    expect([...paid, ...supporter].sort()).toEqual([...earnable].sort());
    for (const key of [...paid, ...supporter]) expect(ITEM_COSMETIC_STYLE_KEYS).toContain(key);
    expect(paid).not.toContain('midnight-chrome');
  });
});
