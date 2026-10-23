import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readRemembered, rememberedKey, writeRemembered } from './remembered.js';
import {
  addStoreBasketLine,
  basketOverStockReason,
  capBasketToStock,
  isStoreBasket,
  quantityInBasket,
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
  stockLimit: 12,
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
    expect(isStoreBasket([{ ...line, stockLimit: -1 }])).toBe(false);
  });

  it('will not put more of a stocked item in the basket than the shelf can sell', () => {
    const capped = addStoreBasketLine([line], { ...line, quantity: 20 });
    expect(capped).toEqual([{ ...line, quantity: 12 }]);
    expect(addStoreBasketLine(capped, { ...line, quantity: 1 })).toEqual(capped);
    expect(addStoreBasketLine([], { ...line, quantity: 40 })).toEqual([{ ...line, quantity: 12 }]);
    expect(addStoreBasketLine([{ ...line, quantity: 9 }], { ...line, quantity: 2, stockLimit: 4 }))
      .toEqual([{ ...line, quantity: 4, stockLimit: 4 }]);
    expect(addStoreBasketLine([line], { ...line, quantity: 1, stockLimit: 0 })).toEqual([]);
    expect(addStoreBasketLine([], { ...line, quantity: 1, stockLimit: 0 })).toEqual([]);
    expect(addStoreBasketLine([{ ...line, stockLimit: null }], { ...line, quantity: 30, stockLimit: null }))
      .toEqual([{ ...line, quantity: 32, stockLimit: null }]);
    expect(quantityInBasket(capped, line.key)).toBe(12);
    expect(basketOverStockReason({
      quantity: 3, inBasket: 10, stock: 12, itemName: 'Medicine', keeper: 'The clerk',
    })).toBe('The clerk has 12 Medicine in stock. Your basket can take 2 more.');
    expect(basketOverStockReason({
      quantity: 1, inBasket: 12, stock: 12, itemName: 'Medicine', keeper: 'The clerk',
    })).toBe('Your basket already has all 12 Medicine The clerk has in stock.');
    expect(basketOverStockReason({
      quantity: 4, inBasket: 0, stock: null, itemName: 'Sedan', keeper: 'Charlie',
    })).toBeNull();
    const sell = { ...line, key: 'corner:medicine:sell', direction: 'sell' as const, quantity: 8, stockLimit: null };
    const held = [capped[0]!, sell];
    expect(capBasketToStock(held, { [line.key]: 4 })).toEqual([
      { ...line, quantity: 4, stockLimit: 4 },
      sell,
    ]);
    expect(capBasketToStock(held, { [line.key]: 12 })).toBe(held);
    expect(capBasketToStock([line], { [line.key]: 0 })).toEqual([]);
  });
});
