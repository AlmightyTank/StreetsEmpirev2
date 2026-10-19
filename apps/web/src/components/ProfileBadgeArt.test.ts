import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BADGE_ART_KEYS } from './ProfileBadgeArt.js';

const badgeDir = path.resolve(import.meta.dirname, '../../public/assets/profile-badges/items');

describe('profile badge art', () => {
  it('has a generated illustration for every listed badge key, and no strays', () => {
    const files = readdirSync(badgeDir).filter((name) => name.endsWith('.svg')).map((name) => name.replace(/\.svg$/, '')).sort();
    expect(files).toEqual([...BADGE_ART_KEYS].sort());
  });
});
