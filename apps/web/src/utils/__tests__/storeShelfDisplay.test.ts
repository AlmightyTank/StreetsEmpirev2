import { describe, expect, it } from 'vitest';
import { matchesStoreShelf } from '../storeShelfDisplay.js';

const crack = { name: 'Crack', purchaseUnlocked: true, soldOut: false };
const weed = { name: 'Weed', purchaseUnlocked: false, soldOut: false };
const ecstasy = { name: 'Ecstasy', purchaseUnlocked: true, soldOut: true };

describe('store shelf display filters', () => {
  it('shows every product by default, including gated shelves', () => {
    expect([crack, weed, ecstasy].filter((shelf) => matchesStoreShelf(shelf, '', 'all'))).toHaveLength(3);
  });

  it('separates purchasable, purchase-locked, and sold-out inventory', () => {
    expect([crack, weed, ecstasy].filter((shelf) => matchesStoreShelf(shelf, '', 'available'))).toEqual([crack]);
    expect([crack, weed, ecstasy].filter((shelf) => matchesStoreShelf(shelf, '', 'locked'))).toEqual([weed]);
    expect([crack, weed, ecstasy].filter((shelf) => matchesStoreShelf(shelf, '', 'sold-out'))).toEqual([ecstasy]);
  });

  it('searches product names without case or surrounding-space sensitivity', () => {
    expect([crack, weed, ecstasy].filter((shelf) => matchesStoreShelf(shelf, '  WE  ', 'all'))).toEqual([weed]);
  });
});
