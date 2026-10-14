import type { StoreCheckoutLineInput } from '@streets/shared';

export type StoreBasketLine = StoreCheckoutLineInput & {
  key: string;
  storeName: string;
  itemName: string;
  unitCents: number;
  stockLabel: string;
};

export const STORE_BASKET_MAX_AGE_MS = 24 * 3_600_000;

/** Reject stale or malformed browser data before it reaches checkout controls. */
export function isStoreBasket(value: unknown): value is StoreBasketLine[] {
  return Array.isArray(value) && value.every((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const line = candidate as Partial<StoreBasketLine>;
    return typeof line.key === 'string'
      && typeof line.store === 'string'
      && typeof line.item === 'string'
      && (line.direction === 'buy' || line.direction === 'sell')
      && Number.isSafeInteger(line.quantity) && (line.quantity ?? 0) > 0
      && typeof line.storeName === 'string'
      && typeof line.itemName === 'string'
      && Number.isSafeInteger(line.unitCents) && (line.unitCents ?? -1) >= 0
      && typeof line.stockLabel === 'string';
  });
}

/** A repeated add updates one checkout line rather than creating duplicates. */
export function addStoreBasketLine(current: StoreBasketLine[], line: StoreBasketLine): StoreBasketLine[] {
  const existing = current.find((entry) => entry.key === line.key);
  if (!existing) return [...current, line];
  return current.map((entry) => entry.key === line.key
    ? { ...entry, quantity: entry.quantity + line.quantity }
    : entry);
}

export function removeStoreBasketLine(current: StoreBasketLine[], key: string): StoreBasketLine[] {
  return current.filter((line) => line.key !== key);
}
