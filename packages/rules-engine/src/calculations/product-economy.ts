import type { ProductEconomy, RestockRule, Ruleset } from '@streets/rulesets';
import { settleStock, type RestockSettlement } from './restock.js';
import { MAX_INVENTORY, StoreTradeError } from './stores.js';

/**
 * 0.4.0-D. The product economy: Pip's counter for every product, what can be
 * cooked, what a stash is worth, and how loot splits across products.
 *
 * Crack is not in here. It keeps Pip's Product item, its net worth value and
 * `production.crack`, exactly as every older round has them. Money is integer
 * cents throughout.
 */

export const CRACK_PRODUCT = 'CRACK';

export function productEconomy(ruleset: Ruleset, key: string): ProductEconomy | undefined {
  if (key === CRACK_PRODUCT) return undefined;
  return (ruleset.products?.[key] as { economy?: ProductEconomy } | undefined)?.economy;
}

/** Products in catalog order. */
function catalogKeys(ruleset: Ruleset): string[] {
  return Object.entries(ruleset.products ?? {}).sort(([, a], [, b]) => a.sortOrder - b.sortOrder).map(([key]) => key);
}

/** What non-crack product adds to net worth. Crack is valued with the other columns. */
export function productNetWorthCents(products: Readonly<Record<string, number>> | undefined, ruleset: Ruleset): bigint {
  let total = 0n;
  for (const [key, quantity] of Object.entries(products ?? {})) {
    const value = productEconomy(ruleset, key)?.netWorthCents ?? 0;
    if (quantity > 0 && value > 0) total += BigInt(quantity) * BigInt(value);
  }
  return total;
}

// --- Pip's counter -----------------------------------------------------------

/** A product shelf as a restock rule, so it settles exactly like every other shelf. */
export function productShelfRule(economy: ProductEconomy): RestockRule | null {
  if (!economy.pip) return null;
  const { cap, perInterval, intervalMinutes } = economy.pip.restock;
  return { cap, perInterval, intervalMinutes, stockField: 'stock', stockAtField: 'stockAt' } as unknown as RestockRule;
}

/**
 * Settle one product shelf. A player who has never bought that product has no
 * stored shelf, and walks in to a full one, as every new player does.
 */
export function settleProductShelf(
  shelf: { stock: number; stockAt: Date } | null,
  economy: ProductEconomy,
  now: Date,
  intervalMinutes?: number,
): RestockSettlement | null {
  const rule = productShelfRule(economy);
  if (!rule) return null;
  const settled = settleStock(shelf ?? { stock: rule.cap, stockAt: now }, rule, now, intervalMinutes ?? rule.intervalMinutes);
  return shelf ? settled : { ...settled, changed: true };
}

export interface ProductTrade {
  product: string;
  productName: string;
  direction: 'buy' | 'sell';
  quantity: number;
  unitCents: number;
  totalCents: bigint;
  cashChangeCents: bigint;
  quantityChange: number;
  /** Units taken off Pip's shelf. Selling never touches it. */
  stockTaken: number;
}

/** Price and validate a whole product order at Pip's. No partial fills. */
export function calculateProductTrade(input: {
  ruleset: Ruleset;
  product: string;
  direction: 'buy' | 'sell';
  quantity: number;
  owned: number;
  cashCents: bigint;
  shelfStock: number | null;
}): ProductTrade {
  const { ruleset, product, direction, quantity, owned, cashCents, shelfStock } = input;
  const economy = productEconomy(ruleset, product);
  const name = ruleset.products?.[product]?.name ?? product;
  if (!economy?.pip) throw new StoreTradeError('UNKNOWN_ITEM', 'Pip does not deal that product.', 'product');
  if (direction !== 'buy' && direction !== 'sell') throw new StoreTradeError('INVALID_TRADE', 'Choose buy or sell.', 'direction');
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_INVENTORY) {
    throw new StoreTradeError('INVALID_QUANTITY', 'Enter a positive whole quantity within the inventory limit.', 'quantity');
  }
  const buying = direction === 'buy';
  const unitCents = buying ? economy.pip.buyCents : economy.pip.sellCents;
  const totalCents = BigInt(unitCents) * BigInt(quantity);

  if (buying) {
    const stock = Math.max(0, shelfStock ?? 0);
    if (quantity > stock) {
      const { perInterval, intervalMinutes } = economy.pip.restock;
      const delivery = `Another ${perInterval.toLocaleString('en-US')} come in every ${intervalMinutes < 60 ? `${intervalMinutes} minutes` : intervalMinutes === 60 ? 'hour' : `${intervalMinutes / 60} hours`}.`;
      throw new StoreTradeError('OUT_OF_STOCK', stock === 0
        ? `Pip has no ${name} left. ${delivery}`
        : `Pip only has ${stock.toLocaleString('en-US')} ${name} right now. ${delivery}`, 'quantity');
    }
    if (totalCents > cashCents) {
      throw new StoreTradeError('NOT_ENOUGH_CASH', `You can afford ${maxProductBuy(cashCents, owned, unitCents, stock).toLocaleString('en-US')} ${name}.`, 'quantity');
    }
    if (quantity > MAX_INVENTORY - owned) throw new StoreTradeError('INVENTORY_LIMIT', 'That purchase would exceed your inventory limit.', 'quantity');
  } else if (quantity > owned) {
    throw new StoreTradeError('NOT_ENOUGH_ITEMS', `You only have ${owned.toLocaleString('en-US')} ${name}.`, 'quantity');
  }

  const cashChangeCents = buying ? -totalCents : totalCents;
  if (totalCents > BigInt(Number.MAX_SAFE_INTEGER) || cashCents + cashChangeCents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new StoreTradeError('CASH_LIMIT', 'That transaction would exceed the cash limit.', 'quantity');
  }
  return {
    product, productName: name, direction, quantity, unitCents, totalCents, cashChangeCents,
    quantityChange: buying ? quantity : -quantity,
    stockTaken: buying ? quantity : 0,
  };
}

export function maxProductBuy(cashCents: bigint, owned: number, unitCents: number, stock: number): number {
  const room = Math.max(0, MAX_INVENTORY - owned);
  const affordable = unitCents <= 0 ? room : Number(cashCents / BigInt(unitCents) < BigInt(room) ? cashCents / BigInt(unitCents) : BigInt(room));
  return Math.max(0, Math.min(affordable, stock));
}

// --- production ---------------------------------------------------------------

export interface ProductRecipe {
  product: string;
  name: string;
  perThugPerTurn: number;
  ingredientCentsPerUnit: number;
  variance: number;
  minHappinessMultiplier: number;
  heatPerUnit: number;
}

/** What Produce Product can make this round. Crack always, from `production.crack`. */
export function productRecipes(ruleset: Ruleset): ProductRecipe[] {
  const crack = ruleset.production.crack;
  const recipes: ProductRecipe[] = [{
    product: CRACK_PRODUCT,
    name: ruleset.products?.[CRACK_PRODUCT]?.name ?? 'Crack',
    perThugPerTurn: crack.perThugPerTurn,
    ingredientCentsPerUnit: crack.ingredientCentsPerRock,
    variance: crack.variance,
    minHappinessMultiplier: crack.minHappinessMultiplier,
    heatPerUnit: 0,
  }];
  if (!ruleset.productEconomy) return recipes;
  for (const key of catalogKeys(ruleset)) {
    const production = productEconomy(ruleset, key)?.production;
    if (production) recipes.push({ product: key, name: ruleset.products![key]!.name, ...production });
  }
  return recipes;
}

// --- loot and intel -------------------------------------------------------------

/**
 * Split `units` across a stash in proportion to what each product holds, by
 * largest remainder, so the parts always add up to exactly `units` and no
 * product gives up more than it has. Ties go to catalog order.
 */
export function splitProductUnits(stash: Readonly<Record<string, number>>, units: number, ruleset: Ruleset): Record<string, number> {
  const order = catalogKeys(ruleset);
  const entries = Object.entries(stash)
    .filter(([, quantity]) => quantity > 0)
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
  const total = entries.reduce((sum, [, quantity]) => sum + quantity, 0);
  const take = Math.max(0, Math.min(Math.floor(units), total));
  if (take === 0) return {};
  const shares = entries.map(([key, quantity]) => {
    const exact = (quantity * take) / total;
    return { key, quantity, whole: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let left = take - shares.reduce((sum, share) => sum + share.whole, 0);
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder)) {
    if (left <= 0) break;
    if (share.whole < share.quantity) { share.whole += 1; left -= 1; }
  }
  return Object.fromEntries(shares.filter((share) => share.whole > 0).map((share) => [share.key, share.whole]));
}

export type ProductStashLevel = 'none' | 'light' | 'stocked' | 'heavy';

/** Recon's read on a stash: how deep it runs for the crew, and what they hold most of. Never counts. */
export function productStashHint(stash: Readonly<Record<string, number>>, whores: number, ruleset: Ruleset): { level: ProductStashLevel; primary: string | null } {
  const rules = ruleset.productEconomy?.intel ?? { lightBelowPerWhore: 1, heavyFromPerWhore: 5 };
  const order = catalogKeys(ruleset);
  const held = Object.entries(stash).filter(([, quantity]) => quantity > 0)
    .sort(([a, qa], [b, qb]) => qb - qa || order.indexOf(a) - order.indexOf(b));
  const total = held.reduce((sum, [, quantity]) => sum + quantity, 0);
  if (total === 0) return { level: 'none', primary: null };
  const perWhore = total / Math.max(1, whores);
  const level = perWhore < rules.lightBelowPerWhore ? 'light' : perWhore >= rules.heavyFromPerWhore ? 'heavy' : 'stocked';
  const primary = held[0]![0];
  return { level, primary: ruleset.products?.[primary]?.name ?? primary };
}

/**
 * The 0.4.0-D gate: no product is a free money loop. Returns every broken rule;
 * an empty list passes.
 */
export function productLoops(ruleset: Ruleset): string[] {
  const problems: string[] = [];
  const crack = ruleset.stores.PIP.items.CRACK;
  const crackName = ruleset.products?.CRACK?.name ?? 'Crack';
  if (crack && crack.sellCents !== null) {
    if (crack.sellCents >= crack.buyCents) problems.push(`${crackName}: Pip buys back at or above his price.`);
    if (ruleset.economy.netWorth.perCrackCents > crack.sellCents) problems.push(`${crackName}: net worth values a unit above what Pip pays.`);
    if (ruleset.production.crack.ingredientCentsPerRock < crack.sellCents) problems.push(`${crackName}: cooking to sell makes money.`);
  }
  for (const key of catalogKeys(ruleset)) {
    const economy = productEconomy(ruleset, key);
    if (!economy) continue;
    const name = ruleset.products![key]!.name;
    const sell = economy.pip?.sellCents ?? 0;
    if (economy.pip && economy.pip.sellCents >= economy.pip.buyCents) problems.push(`${name}: Pip buys back at or above his price.`);
    if (economy.pip && economy.netWorthCents > economy.pip.sellCents) problems.push(`${name}: net worth values a unit above what Pip pays.`);
    if (!economy.pip && economy.netWorthCents > 0) problems.push(`${name}: valued in net worth with nowhere to sell it.`);
    if (economy.production && economy.production.ingredientCentsPerUnit < sell) problems.push(`${name}: cooking to sell makes money.`);
    if (economy.production && economy.production.ingredientCentsPerUnit < economy.netWorthCents) problems.push(`${name}: cooking raises net worth for less than it costs.`);
  }
  return problems;
}
