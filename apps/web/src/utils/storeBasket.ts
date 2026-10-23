import type { StoreCheckoutLineInput } from '@streets/shared';

export type StoreBasketLine = StoreCheckoutLineInput & {
  key: string;
  storeName: string;
  itemName: string;
  unitCents: number;
  stockLabel: string;
  /**
   * Units the shelf can sell for this buy. Null when the line is a sale or the
   * item is not limited by stock.
   */
  stockLimit: number | null;
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
      && typeof line.stockLabel === 'string'
      && (line.stockLimit == null || (Number.isSafeInteger(line.stockLimit) && line.stockLimit >= 0));
  });
}

function shelfLimit(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : value;
}

/**
 * A repeated add updates one checkout line rather than creating duplicates.
 * A stocked buy never grows past the units the shelf can actually sell.
 */
export function addStoreBasketLine(current: StoreBasketLine[], line: StoreBasketLine): StoreBasketLine[] {
  const existing = current.find((entry) => entry.key === line.key);
  const stockLimit = line.stockLimit !== undefined ? shelfLimit(line.stockLimit) : shelfLimit(existing?.stockLimit);
  const combined = (existing?.quantity ?? 0) + line.quantity;
  const quantity = stockLimit === null ? combined : Math.min(combined, stockLimit);
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    return existing && stockLimit === 0 ? current.filter((entry) => entry.key !== line.key) : current;
  }
  const next: StoreBasketLine = { ...line, stockLimit, quantity };
  if (!existing) return [...current, next];
  return current.map((entry) => entry.key === line.key ? { ...entry, ...next } : entry);
}

/**
 * Pull basket buys back to the shelves we just loaded. Lines for shelves that
 * are not in `limits` are left alone. A sold-out shelf drops its buy line.
 */
export function capBasketToStock(
  current: StoreBasketLine[],
  limits: Readonly<Record<string, number>>,
): StoreBasketLine[] {
  let changed = false;
  const next: StoreBasketLine[] = [];
  for (const line of current) {
    if (line.direction !== 'buy' || !Object.hasOwn(limits, line.key)) {
      next.push(line);
      continue;
    }
    const stock = limits[line.key] ?? 0;
    if (!Number.isSafeInteger(stock) || stock < 0) {
      next.push(line);
      continue;
    }
    if (stock < 1) {
      changed = true;
      continue;
    }
    const quantity = Math.min(line.quantity, stock);
    if (quantity === line.quantity && line.stockLimit === stock) {
      next.push(line);
      continue;
    }
    changed = true;
    next.push({ ...line, quantity, stockLimit: stock });
  }
  return changed ? next : current;
}

export function removeStoreBasketLine(current: StoreBasketLine[], key: string): StoreBasketLine[] {
  return current.filter((line) => line.key !== key);
}

/** Units of this line already waiting in the basket. */
export function quantityInBasket(current: readonly StoreBasketLine[], key: string): number {
  return current.find((entry) => entry.key === key)?.quantity ?? 0;
}

/**
 * Why this add cannot join the basket, or null when the shelf can still fill it.
 * Sales and unstocked items pass `stock: null` and are not limited here.
 */
export function basketOverStockReason(input: {
  quantity: number | '';
  inBasket: number;
  stock: number | null;
  itemName: string;
  keeper: string;
}): string | null {
  const { quantity, inBasket, stock, itemName, keeper } = input;
  if (stock === null || typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1) return null;
  if (inBasket + quantity <= stock) return null;
  if (inBasket >= stock) {
    return `Your basket already has all ${stock.toLocaleString('en-US')} ${itemName} ${keeper} has in stock.`;
  }
  const room = stock - inBasket;
  return `${keeper} has ${stock.toLocaleString('en-US')} ${itemName} in stock. Your basket can take ${room.toLocaleString('en-US')} more.`;
}
