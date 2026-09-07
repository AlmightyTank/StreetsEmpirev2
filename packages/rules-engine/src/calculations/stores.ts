import type { ResourceField, Ruleset, Store, StoreItem, StoreKey } from '@streets/rulesets';
import { hasWeaponAccess, type WeaponUnlockState } from './weapon-unlocks.js';

// Inventory columns are PostgreSQL Ints. This is a storage limit, not balance.
export const MAX_INVENTORY = 2_147_483_647;

export function findStore(ruleset: Ruleset, value: string): { key: StoreKey; store: Store } | undefined {
  return (Object.entries(ruleset.stores) as [StoreKey, Store][])
    .map(([key, store]) => ({ key, store }))
    .find(({ key, store }) => key === value.toUpperCase() || store.slug === value);
}

export function maxStoreBuy(cashCents: bigint, owned: number, item: StoreItem): number {
  const room = Math.max(0, MAX_INVENTORY - owned);
  if (item.buyCents === 0) return room;
  return Number(BigInt(room) < cashCents / BigInt(item.buyCents)
    ? BigInt(room) : cashCents / BigInt(item.buyCents));
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
  player: { cashCents: bigint } & Record<ResourceField, number> & WeaponUnlockState,
  input: StoreTradeInput,
  ruleset: Ruleset,
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
  const unitCents = buying ? item.buyCents : item.sellCents;
  if (unitCents === null) throw new StoreTradeError('SELL_NOT_ALLOWED', 'This store does not buy that item back.', 'item');
  const totalCents = BigInt(unitCents) * BigInt(input.quantity);
  const owned = player[item.field];
  if (buying && totalCents > player.cashCents) {
    throw new StoreTradeError('NOT_ENOUGH_CASH', `You can afford ${maxStoreBuy(player.cashCents, owned, item).toLocaleString('en-US')} of this item.`, 'quantity');
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
  };
}
