import { describe, expect, it } from 'vitest';
import { CUSTOMIZABLE_ITEM_KEYS } from '@streets/shared';
import { itemCosmeticArtFile, SLICE_A_ART_FILES } from './itemCosmeticArt.js';
import { ITEM_ART } from './itemArt.js';

describe('item cosmetic art resolver', () => {
  it('keeps Classic mapped to the original item artwork', () => {
    for (const key of CUSTOMIZABLE_ITEM_KEYS) {
      expect(itemCosmeticArtFile(key, 'classic')).toBe(ITEM_ART[key].file);
    }
  });

  it('resolves each released Slice A collection to authored artwork', () => {
    expect(itemCosmeticArtFile('PISTOL', 'midnight-ops')).toBe('cosmetics/weapons/pistol-midnight-ops.svg');
    expect(itemCosmeticArtFile('AK47', 'urban-ghost')).toBe('cosmetics/weapons/ak47-urban-ghost.svg');
    expect(itemCosmeticArtFile('LOW_RIDER', 'cartel-gold')).toBe('cosmetics/rides/low-rider-cartel-gold.svg');
  });

  it('has three authored variants for every Slice A item', () => {
    for (const key of CUSTOMIZABLE_ITEM_KEYS) {
      expect(Object.keys(SLICE_A_ART_FILES[key])).toEqual([
        'midnight-ops',
        'urban-ghost',
        'cartel-gold',
      ]);
    }
  });
});
