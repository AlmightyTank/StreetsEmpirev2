import { describe, expect, it } from 'vitest';
import {
  classicOgV06F,
  classicOgV07A,
  hideoutV2For,
  hideoutV2Problems,
} from '../index.js';

describe('classic-og-v0.7-a hideout foundation', () => {
  it('keeps the 0.6 hideout balance and adds extension metadata only to 0.7', () => {
    expect(classicOgV07A.hideout).toEqual(classicOgV06F.hideout);
    expect(hideoutV2For(classicOgV06F)).toBeNull();

    const extension = hideoutV2For(classicOgV07A);
    expect(extension?.version).toBe(2);
    expect(extension?.rooms.SAFE_ROOM?.requirements?.[3]).toEqual([
      { key: 'RAIDS_DONE', label: 'Raids completed', amount: 1 },
    ]);
    expect(extension?.rooms.WORKSHOP?.specialization?.choices.map((choice) => choice.key))
      .toEqual(['DRUG_LAB', 'GARAGE']);
  });

  it('passes the static extension validator', () => {
    expect(hideoutV2Problems(classicOgV07A)).toEqual([]);
  });
});
