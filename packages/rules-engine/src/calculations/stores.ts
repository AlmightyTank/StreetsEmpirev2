import type {
  ResourceField,
  Ruleset,
  Store,
  StoreItem,
  StockField,
  StoreKey,
} from '@streets/rulesets';
import { hasWeaponAccess, type WeaponUnlockState } from './weapon-unlocks.js';

/** Settled shelf counts, as they sit on a turn-settled player. */
export type StockHolder = Partial<Record<StockField, number>>;

/**
 * What the shelf allows right now. Null means the item has no restock rule at
 * all, which is not the same as a shelf that happens to be empty.
 */
export function stockOnHand(player: StockHolder, item: StoreItem): number | null {
  if (!item.restock) return null;
  return Math.max(0, Math.min(item.restock.cap, player[item.restock.stockField] ?? 0));
}

// Inventory columns are PostgreSQL Ints. This is a storage limit, not balance.
export const MAX_INVENTORY = 2_147_483_647;

export function findStore(ruleset: Ruleset, value: string): { key: StoreKey; store: Store } | undefined {
  return (Object.entries(ruleset.stores) as [StoreKey, Store][])
    .map(([key, store]) => ({ key, store }))
    .find(({ key, store }) => key === value.toUpperCase() || store.slug === value);
}

/**
 * The largest order that would actually go through: inventory room, cash, and
 * - for the guns Tommy has to source - what is on the shelf.
 */
export function maxStoreBuy(
  cashCents: bigint,
  owned: number,
  item: StoreItem,
  stock: number | null = null,
): number {
  const room = Math.max(0, MAX_INVENTORY - owned);
  const affordable = item.buyCents === 0
    ? room
    : Number(BigInt(room) < cashCents / BigInt(item.buyCents)
      ? BigInt(room) : cashCents / BigInt(item.buyCents));
  return stock === null ? affordable : Math.min(affordable, stock);
}

export class StoreTradeError extends Error {
  constructor(public readonly code: string, message: string, public readonly field?: string) {
    super(message);
  }
}

export interface StoreTradeInput {
  store: string;
  item: string;
  direction: 'buy' | 'sell';
  quantity: number;
}

/** Price and validate the entire order. No partial fills and no turn costs. */
export function calculateStoreTrade(
  player: { cashCents: bigint } & Record<ResourceField, number> & WeaponUnlockState &
    StockHolder,
  input: StoreTradeInput,
  ruleset: Ruleset,
  options?: { buyUnitCents?: number },
) {
  const found = findStore(ruleset, input.store);
  if (!found) throw new StoreTradeError('UNKNOWN_STORE', 'That store is not open.', 'store');
  const item = Object.hasOwn(found.store.items, input.item) ? found.store.items[input.item] : undefined;
  if (!item) throw new StoreTradeError('UNKNOWN_ITEM', 'That item is not sold at this store.', 'item');
  if (input.direction !== 'buy' && input.direction !== 'sell') {
    throw new StoreTradeError('INVALID_TRADE', 'Choose buy or sell.', 'direction');
  }
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_INVENTORY) {
    throw new StoreTradeError('INVALID_QUANTITY', 'Enter a positive whole quantity within the inventory limit.', 'quantity');
  }

  const buying = input.direction === 'buy';
  if (buying && item.unlockKey && !hasWeaponAccess(player, item.unlockKey)) {
    throw new StoreTradeError('WEAPON_LOCKED', `Complete Tommy’s favor to unlock ${item.name} purchases.`, 'item');
  }
  if (options?.buyUnitCents !== undefined && (!Number.isSafeInteger(options.buyUnitCents) || options.buyUnitCents <= 0)) {
    throw new StoreTradeError('INVALID_TRADE', 'The quoted store price is invalid.', 'item');
  }
  const effectiveBuyCents = options?.buyUnitCents ?? item.buyCents;
  const safeBuyCents = item.sellCents === null ? effectiveBuyCents : Math.max(item.sellCents + 1, effectiveBuyCents);
  const unitCents = buying ? safeBuyCents : item.sellCents;
  if (unitCents === null) throw new StoreTradeError('SELL_NOT_ALLOWED', 'This store does not buy that item back.', 'item');
  const totalCents = BigInt(unitCents) * BigInt(input.quantity);
  const owned = player[item.field];
  // Supply, not money. Selling back is always allowed: the shelf tracks what
  // Tommy can get for you, not what the two of you have traded.
  const stock = stockOnHand(player, item);
  if (buying && item.restock && stock !== null && input.quantity > stock) {
    const wait = item.restock.intervalMinutes >= 60
      ? `${item.restock.intervalMinutes / 60} hours`
      : `${item.restock.intervalMinutes} minutes`;
    const per = item.restock.perInterval ?? 1;
    const delivery = per === 1
      ? `One more comes in every ${wait}.`
      : `Another ${per.toLocaleString('en-US')} come in every ${wait}.`;
    throw new StoreTradeError(
      'OUT_OF_STOCK',
      stock === 0
        ? `${found.store.keeper} has no ${item.name} left. ${delivery}`
        : `${found.store.keeper} only has ${stock.toLocaleString('en-US')} ${item.name} right now. ${delivery}`,
      'quantity',
    );
  }

  if (buying && totalCents > player.cashCents) {
    throw new StoreTradeError('NOT_ENOUGH_CASH', `You can afford ${maxStoreBuy(player.cashCents, owned, { ...item, buyCents: safeBuyCents }, stock).toLocaleString('en-US')} of this item.`, 'quantity');
  }
  if (buying && input.quantity > MAX_INVENTORY - owned) {
    throw new StoreTradeError('INVENTORY_LIMIT', 'That purchase would exceed your inventory limit.', 'quantity');
  }
  if (!buying && input.quantity > owned) {
    throw new StoreTradeError('NOT_ENOUGH_ITEMS', `You only own ${owned.toLocaleString('en-US')} of this item.`, 'quantity');
  }
  // API money values are JSON numbers; never silently lose cents in a result.
  const cashChangeCents = buying ? -totalCents : totalCents;
  if (totalCents > BigInt(Number.MAX_SAFE_INTEGER) || player.cashCents + cashChangeCents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new StoreTradeError('CASH_LIMIT', 'That transaction would exceed the cash limit.', 'quantity');
  }
  return {
    storeKey: found.key, storeName: found.store.name, itemName: item.name,
    field: item.field, unitCents, totalCents, cashChangeCents,
    quantityChange: buying ? input.quantity : -input.quantity,
    /** Set only when this purchase came off a restocked shelf. */
    stockField: buying && item.restock ? item.restock.stockField : null,
    stockTaken: buying && item.restock ? input.quantity : 0,
  };
}
