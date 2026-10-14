import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readRemembered, rememberedKey, writeRemembered } from './remembered.js';
import {
  addStoreBasketLine,
  isStoreBasket,
  removeStoreBasketLine,
  STORE_BASKET_MAX_AGE_MS,
  type StoreBasketLine,
} from './storeBasket.js';

const line: StoreBasketLine = {
  key: 'corner:medicine:buy',
  store: 'corner',
  item: 'medicine',
  direction: 'buy',
  quantity: 2,
  storeName: 'Corner Store',
  itemName: 'Medicine',
  unitCents: 1_500,
  stockLabel: '12 in stock',
};

function installStorage() {
  const store = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  };
}

describe('remembered store basket', () => {
  beforeEach(installStorage);
  afterEach(() => delete (globalThis as unknown as { window?: unknown }).window);

  it('survives store routes for the same player and expires after one day', () => {
    const key = rememberedKey('store.basket', 'player-1');
    writeRemembered(key, [line], 1_000);
    expect(readRemembered(key, { accept: isStoreBasket, maxAgeMs: STORE_BASKET_MAX_AGE_MS }, 2_000))
      .toEqual({ found: true, value: [line] });
    expect(readRemembered(rememberedKey('store.basket', 'player-2'), { accept: isStoreBasket }))
      .toEqual({ found: false });
    expect(readRemembered(key, { accept: isStoreBasket, maxAgeMs: STORE_BASKET_MAX_AGE_MS }, 1_000 + STORE_BASKET_MAX_AGE_MS + 1))
      .toEqual({ found: false });
  });

  it('merges matching lines, removes one line, and rejects malformed storage', () => {
    const merged = addStoreBasketLine([line], { ...line, quantity: 3 });
    expect(merged).toEqual([{ ...line, quantity: 5 }]);
    expect(removeStoreBasketLine(merged, line.key)).toEqual([]);
    expect(isStoreBasket([{ ...line, quantity: 0 }])).toBe(false);
    expect(isStoreBasket([{ ...line, direction: 'borrow' }])).toBe(false);
  });
});
