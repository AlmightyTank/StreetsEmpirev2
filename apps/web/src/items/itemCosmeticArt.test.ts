import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CUSTOMIZABLE_ITEM_KEYS, ITEM_COSMETIC_STYLE_KEYS, RELEASED_ITEM_COSMETIC_STYLES, type ItemCosmeticStyleKey } from '@streets/shared';
import { itemCosmeticArtFile, itemCosmeticArtUrl, SLICE_A_ART_FILES } from './itemCosmeticArt.js';
import { ITEM_ART } from './itemArt.js';

const ITEMS_DIR = path.resolve(import.meta.dirname, '../../public/items');
const MASTERS_DIR = path.resolve(import.meta.dirname, '../../art/cosmetics');
const AUTHORED_STYLES = ['midnight-ops', 'urban-ghost', 'cartel-gold'] as const;

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
  it('keeps every Slice A item on its classic authored asset for the Classic style', () => {
    for (const key of CUSTOMIZABLE_ITEM_KEYS) {
      expect(itemCosmeticArtFile(key, 'classic')).toBe(ITEM_ART[key].file);
    }
  });

  it('locks three authored files per Slice A item', () => {
    for (const key of CUSTOMIZABLE_ITEM_KEYS) {
      expect(Object.keys(SLICE_A_ART_FILES[key])).toEqual([...AUTHORED_STYLES]);
    }
  });

  it('releases every collection that has authored art', () => {
    expect(RELEASED_ITEM_COSMETIC_STYLES.map((style) => style.key)).toEqual([...ITEM_COSMETIC_STYLE_KEYS]);
  });

  it('resolves every released style to its own explicit asset', () => {
    for (const key of CUSTOMIZABLE_ITEM_KEYS) {
      for (const style of AUTHORED_STYLES) {
        expect(itemCosmeticArtFile(key, style)).toBe(SLICE_A_ART_FILES[key][style]);
        expect(itemCosmeticArtUrl(key, style)).toBe(`/items/${SLICE_A_ART_FILES[key][style]}`);
      }
    }
  });

  it('falls back to Classic for unknown styles and items without cosmetic art', () => {
    expect(itemCosmeticArtFile('AK47', 'gilded-ghost' as ItemCosmeticStyleKey)).toBe(ITEM_ART.AK47.file);
    expect(itemCosmeticArtFile('BEER', 'cartel-gold')).toBe(ITEM_ART.BEER.file);
    expect(itemCosmeticArtFile('THUG', 'midnight-ops')).toBe(ITEM_ART.THUG.file);
  });

  it('ships every authored file as a lossless WebP with alpha on the Slice A canvas', () => {
    for (const key of CUSTOMIZABLE_ITEM_KEYS) {
      for (const style of AUTHORED_STYLES) {
        const file = path.join(ITEMS_DIR, SLICE_A_ART_FILES[key][style]);
        expect(existsSync(file), file).toBe(true);
        const header = readLosslessWebp(file);
        expect(header, file).toEqual({
          width: key === 'PISTOL' ? 512 : 1024,
          height: 512,
          alpha: true,
        });
      }
    }
  });

  it('keeps a source master for every authored file and no orphan renders', () => {
    const expected = CUSTOMIZABLE_ITEM_KEYS.flatMap((key) => AUTHORED_STYLES.map((style) => SLICE_A_ART_FILES[key][style]))
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
});
