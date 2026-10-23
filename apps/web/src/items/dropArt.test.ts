import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DROP_ITEMS, streetPassSkipPrice, STREET_PASS_SKIP_PRICES } from '@streets/rulesets';
import {
  collectionCovers,
  crewCosmeticLoadoutSchema,
  isHiddenStyle,
  isReleasedItemCosmeticStyle,
  itemCosmeticLoadoutSchema,
  profileAccentSchema,
  styleFitsItem,
  type ItemCosmeticStyleKey,
} from '@streets/shared';
import { skipPrice } from '../pages/DropPage.js';
import { ITEM_ART, type ItemArtKey } from './itemArt.js';
import { itemCosmeticArtFile } from './itemCosmeticArt.js';

const publicItems = path.resolve(import.meta.dirname, '../../public/items');
const looks = Object.values(DROP_ITEMS).filter((item) => item.kind === 'ITEM_COLLECTION');

describe('The Drop art', () => {
  it('has its own authored file for every item each look dresses', () => {
    for (const look of looks) {
      expect(look.preview.type).toBe('ITEM');
      const style = look.styleKey as ItemCosmeticStyleKey;
      expect(isReleasedItemCosmeticStyle(style), style).toBe(true);
      for (const key of look.preview.type === 'ITEM' ? look.preview.items : []) {
        const file = itemCosmeticArtFile(key as ItemArtKey, style);
        expect(file, `${key} ${style}`).not.toBe(ITEM_ART[key as ItemArtKey].file);
        expect(file.startsWith('cosmetics/drop/')).toBe(true);
        expect(existsSync(path.join(publicItems, file)), file).toBe(true);
        const svg = readFileSync(path.join(publicItems, file), 'utf8');
        expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 (128|256) 128"/);
      }
    }
  });

  it('only fits each look to the items it was drawn for', () => {
    for (const look of looks) {
      const style = look.styleKey!;
      const dressed = look.preview.type === 'ITEM' ? look.preview.items : [];
      for (const key of ['SEDAN', 'VAN', 'LOW_RIDER', 'TEK9', 'SHOTGUN', 'PISTOL', 'AK47', 'THUG', 'HOE']) {
        const fits = styleFitsItem(style, key) && collectionCovers(style, key);
        expect(fits, `${style} on ${key}`).toBe(dressed.includes(key));
      }
    }
  });

  it('lets the settings schema save Drop looks and accents only where they fit', () => {
    expect(itemCosmeticLoadoutSchema.safeParse({ SEDAN: 'kingpin-luxe-sedan' }).success).toBe(true);
    expect(itemCosmeticLoadoutSchema.safeParse({ VAN: 'kingpin-luxe-sedan' }).success).toBe(false);
    expect(crewCosmeticLoadoutSchema.safeParse({ THUG: 'winter-heist-crew', HOE: 'winter-heist-crew' }).success).toBe(true);
    expect(crewCosmeticLoadoutSchema.safeParse({ THUG: 'classic', HOE: 'neon-underworld-thug' }).success).toBe(false);
    const accents = Object.values(DROP_ITEMS).filter((item) => item.kind === 'ACCENT').map((item) => item.styleKey!);
    expect(accents).toHaveLength(30);
    for (const accent of accents) expect(profileAccentSchema.safeParse(accent).success, accent).toBe(true);
  });
});

describe('The Drop holiday sets', () => {
  it('keeps every holiday look out of the locker until it is owned', () => {
    const holidayLooks = looks.filter((look) => ['graveyard-shift', 'naughty-list', 'heartbreaker', 'block-party'].includes(look.collection));
    expect(holidayLooks.length).toBeGreaterThan(0);
    for (const look of holidayLooks) expect(isHiddenStyle(look.styleKey!), look.styleKey).toBe(true);
    for (const look of looks.filter((candidate) => !holidayLooks.includes(candidate))) expect(isHiddenStyle(look.styleKey!), look.styleKey).toBe(false);
  });
});

describe('The Drop shell themes', () => {
  it('styles every shell and gives it a backdrop scene', () => {
    const css = readFileSync(path.resolve(import.meta.dirname, '../styles/drop-shells.css'), 'utf8');
    const decor = readFileSync(path.resolve(import.meta.dirname, '../components/SiteThemeDecor.tsx'), 'utf8');
    const shells = Object.values(DROP_ITEMS).filter((item) => item.kind === 'SITE_THEME');
    expect(shells).toHaveLength(24);
    for (const shell of shells) {
      expect(css).toContain(`.se-site-theme--${shell.styleKey} {`);
      expect(css).toContain(`.se-site-theme-decor--${shell.styleKey}`);
      expect(decor).toContain(`'${shell.styleKey}': lazy(`);
    }
  });
});

describe('Street Pass skip price', () => {
  it('matches the server rule', () => {
    for (const count of [1, 2, 9, 10, 11, 20, 29]) {
      expect(skipPrice(count, STREET_PASS_SKIP_PRICES.single, STREET_PASS_SKIP_PRICES.tenPack)).toBe(streetPassSkipPrice(count));
    }
  });
});
