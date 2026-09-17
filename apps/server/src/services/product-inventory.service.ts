import type { PrismaClient } from '@prisma/client';
import { loadRulesetForRound, type Ruleset } from '@streets/rules-engine';
import type { ProductsDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

export type ProductInventory = Record<string, number>;

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

  /** The products page: the round's catalog with the player's stock. */
  async page(prisma: PrismaClient, roundPlayerId: string): Promise<ProductsDto> {
    const player = await prisma.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, include: { round: true } });
    const ruleset = loadRulesetForRound(player.round);
    if (!ruleset.products) return { enabled: false, products: [] };
    const inventory = await ProductInventoryService.read(prisma, roundPlayerId, ruleset);
    return {
      enabled: true,
      products: productKeys(ruleset).map((key) => ({
        key,
        name: ruleset.products![key]!.name,
        blurb: ruleset.products![key]!.blurb,
        quantity: inventory[key] ?? 0,
      })),
    };
  },
};
