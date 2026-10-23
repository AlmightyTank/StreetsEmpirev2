import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BADGE_ART_KEYS, BADGE_HOLDER_RARITIES } from './ProfileBadgeArt.js';

const badgeDir = path.resolve(import.meta.dirname, '../../public/assets/profile-badges/items');
const holderDir = path.resolve(import.meta.dirname, '../../public/assets/profile-badges/holders');
const svgNames = (dir: string) => readdirSync(dir).filter((name) => name.endsWith('.svg')).map((name) => name.replace(/\.svg$/, '')).sort();

describe('profile badge art', () => {
  it('has a generated illustration for every listed badge key, and no strays', () => {
    expect(svgNames(badgeDir)).toEqual([...BADGE_ART_KEYS].sort());
  });

  it('has a diamond holder for every rarity, and no strays', () => {
    expect(svgNames(holderDir)).toEqual([...BADGE_HOLDER_RARITIES].sort());
  });
});
