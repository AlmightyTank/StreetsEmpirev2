import type { PrismaClient } from '@prisma/client';
import { productEconomy, type Rng, type Ruleset } from '@streets/rules-engine';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

export type ProductInventory = Record<string, number>;

export interface FoundProduct {
  key: string;
  name: string;
  quantity: number;
}

const FIND_SUPPLY_WEIGHT = {
  PLENTIFUL: 6,
  NORMAL: 3,
  LOW: 1,
  OUT: 0.25,
} as const;

function cityFindWeight(ruleset: Ruleset, citySlug: string, key: string): number {
  const city = ruleset.cities?.[citySlug];
  if (!city) return 1;
  const supply = city.products[key]?.supply;
  if (supply === null || supply === undefined) return 0;
  return FIND_SUPPLY_WEIGHT[supply];
}

function findPointCost(ruleset: Ruleset, key: string): number {
  const crackValue = Math.max(1, ruleset.economy.netWorth.perCrackCents);
  const value = key === CRACK
    ? crackValue
    : productEconomy(ruleset, key)?.netWorthCents ?? crackValue;
  return Math.max(1, Math.ceil(value / crackValue));
}

/**
 * Turn the old crack-only street find into a city-flavoured product mix.
 *
 * The action engine still rolls the same find chance and 1..N "find points" it
 * always did. One point is worth one old crack find. Higher-value products cost
 * more points, so finding Cocaine/Ecstasy does not turn Scout into a money loop.
 * City supply only changes which eligible product is likely to turn up.
 *
 * Product-economy rounds use the full catalog. Older rounds stay exactly
 * crack-only.
 */
export function streetProductFinds(
  ruleset: Ruleset,
  citySlug: string,
  findPoints: number,
  rng: Rng = Math.random,
): FoundProduct[] {
  if (findPoints <= 0) return [];
  if (!ruleset.productEconomy || !ruleset.products) {
    return [{ key: CRACK, name: ruleset.products?.CRACK?.name ?? 'Product', quantity: findPoints }];
  }

  const keys = productKeys(ruleset);
  const counts: Record<string, number> = {};
  let points = findPoints;

  while (points > 0) {
    const eligible = keys
      .map((key) => ({
        key,
        cost: findPointCost(ruleset, key),
        weight: cityFindWeight(ruleset, citySlug, key),
      }))
      .filter((row) => row.cost <= points && row.weight > 0);

    // A city's normal shelf can omit products entirely. If the remaining point
    // budget cannot buy any locally weighted product, fall back to the cheapest
    // catalog item rather than silently throwing the find away.
    const pool = eligible.length
      ? eligible
      : keys
          .map((key) => ({ key, cost: findPointCost(ruleset, key), weight: 1 }))
          .filter((row) => row.cost <= points)
          .sort((a, b) => a.cost - b.cost);

    if (!pool.length) break;

    const totalWeight = pool.reduce((sum, row) => sum + row.weight, 0);
    let roll = rng() * totalWeight;
    let chosen = pool[pool.length - 1]!;
    for (const row of pool) {
      roll -= row.weight;
      if (roll < 0) {
        chosen = row;
        break;
      }
    }

    counts[chosen.key] = (counts[chosen.key] ?? 0) + 1;
    points -= chosen.cost;
  }

  return keys
    .filter((key) => (counts[key] ?? 0) > 0)
    .map((key) => ({
      key,
      name: ruleset.products![key]?.name ?? key,
      quantity: counts[key]!,
    }));
}


/** The column crack has always lived on. Every other product is a row. */
export const CRACK = 'CRACK';

/** Product keys this round knows, in display order. Rounds without a catalog only know crack. */
export function productKeys(ruleset: Ruleset): string[] {
  if (!ruleset.products) return [CRACK];
  return Object.entries(ruleset.products)
    .sort(([, a], [, b]) => a.sortOrder - b.sortOrder)
    .map(([key]) => key);
}

function assertKnown(ruleset: Ruleset, key: string): void {
  if (!productKeys(ruleset).includes(key)) {
    throw AppError.badRequest('UNKNOWN_PRODUCT', 'That product is not part of this round.');
  }
}

function assertWholeNumber(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${what} must be a whole number, got ${value}.`);
}

/**
 * 0.4.0-A. One inventory over every product. Crack reads and writes the player's
 * crack column, exactly as every older round does; other products read and
 * write PlayerProduct rows. Callers change stock inside a transaction that has
 * already locked the player, the same as every other resource.
 */
export const ProductInventoryService = {
  /** Whole inventory, with zero for products the player has never held. */
  async read(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset): Promise<ProductInventory> {
    const keys = productKeys(ruleset);
    const [player, rows] = await Promise.all([
      db.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { crack: true } }),
      keys.length > 1
        ? db.playerProduct.findMany({ where: { roundPlayerId, productKey: { in: keys.filter((key) => key !== CRACK) } }, select: { productKey: true, quantity: true } })
        : [],
    ]);
    const inventory: ProductInventory = Object.fromEntries(keys.map((key) => [key, 0]));
    inventory[CRACK] = player.crack;
    for (const row of rows) inventory[row.productKey] = row.quantity;
    return inventory;
  },

  /**
   * Apply signed changes, e.g. { ECSTASY: -16, CRACK: 4 }. The caller must hold
   * the player's row lock. Refuses the whole change if any product would go
   * negative or is not in this round's catalog; nothing is written in that case.
   */
  async adjust(tx: Db, roundPlayerId: string, ruleset: Ruleset, changes: Record<string, number>): Promise<ProductInventory> {
    const entries = Object.entries(changes).filter(([, delta]) => delta !== 0);
    for (const [key, delta] of entries) {
      assertKnown(ruleset, key);
      assertWholeNumber(delta, `${key} change`);
    }
    const before = await ProductInventoryService.read(tx, roundPlayerId, ruleset);
    const after = { ...before };
    for (const [key, delta] of entries) {
      after[key] = before[key]! + delta;
      if (after[key]! < 0) {
        throw AppError.conflict('NOT_ENOUGH_PRODUCT', `You only have ${before[key]} ${ruleset.products?.[key]?.name ?? key.toLowerCase()}.`);
      }
    }
    for (const [key] of entries) {
      if (key === CRACK) {
        await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { crack: after[key]! } });
      } else {
        await tx.playerProduct.upsert({
          where: { roundPlayerId_productKey: { roundPlayerId, productKey: key } },
          create: { roundPlayerId, productKey: key, quantity: after[key]! },
          update: { quantity: after[key]! },
        });
      }
    }
    return after;
  },
};
