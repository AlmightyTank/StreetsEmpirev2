import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { rulesets } from '@streets/rulesets';
import { ITEM_ART, hasItemArt } from './itemArt.js';

const ART_DIR = path.resolve(import.meta.dirname, '../../public/items');
const CELL = 128;

describe('item art', () => {
  it('has a picture for every store item, weapon, product and favor in every ruleset', () => {
    const missing = new Set<string>();
    for (const ruleset of Object.values(rulesets)) {
      const keys = [
        ...Object.values(ruleset.stores).flatMap((store) => Object.keys(store.items)),
        ...Object.keys(ruleset.weapons ?? {}),
        ...Object.keys(ruleset.products ?? {}),
        ...Object.keys(ruleset.favors ?? {}),
      ];
      for (const key of keys) if (!hasItemArt(key)) missing.add(`${ruleset.meta.id}: ${key}`);
    }
    expect([...missing]).toEqual([]);
  });

  it('points every entry at an SVG whose canvas matches its footprint', () => {
    for (const [key, art] of Object.entries(ITEM_ART)) {
      const svg = readFileSync(path.join(ART_DIR, art.file), 'utf8');
      const [w, h] = art.cells;
      expect(svg, key).toContain(`viewBox="0 0 ${w * CELL} ${h * CELL}"`);
    }
  });

  it('has no picture that the catalog does not use', () => {
    const used = new Set<string>(Object.values(ITEM_ART).map((art) => art.file));
    const orphans = readdirSync(ART_DIR).filter((file) => file.endsWith('.svg') && !used.has(file));
    expect(orphans).toEqual([]);
  });

  it('keeps corner labels short enough to fit a small tile', () => {
    for (const [key, art] of Object.entries(ITEM_ART)) expect(art.shortName.length, key).toBeLessThanOrEqual(11);
  });
});
