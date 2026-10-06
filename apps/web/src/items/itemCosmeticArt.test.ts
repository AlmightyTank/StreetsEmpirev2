import { describe, expect, it } from 'vitest';
import { CUSTOMIZABLE_ITEM_KEYS } from '@streets/shared';
import { itemCosmeticArtFile, PLANNED_SLICE_A_ART_FILES } from './itemCosmeticArt.js';
import { ITEM_ART } from './itemArt.js';

describe('item cosmetic art resolver', () => {
  it('keeps every Slice A item on its classic authored asset until a collection is released', () => {
    for (const key of CUSTOMIZABLE_ITEM_KEYS) {
      expect(itemCosmeticArtFile(key, 'classic')).toBe(ITEM_ART[key].file);
    }
  });

  it('falls back to Classic when planned art is not active yet', () => {
    expect(itemCosmeticArtFile('AK47', 'midnight-ops')).toBe(ITEM_ART.AK47.file);
    expect(itemCosmeticArtFile('LOW_RIDER', 'cartel-gold')).toBe(ITEM_ART.LOW_RIDER.file);
  });

  it('locks three planned authored files per Slice A item', () => {
    for (const key of CUSTOMIZABLE_ITEM_KEYS) {
      expect(Object.keys(PLANNED_SLICE_A_ART_FILES[key])).toEqual([
        'midnight-ops',
        'urban-ghost',
        'cartel-gold',
      ]);
    }
  });
});
