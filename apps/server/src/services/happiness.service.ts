import type { PrismaClient } from '@prisma/client';
import {
  calculateThugHappiness,
  calculateWhoreHappiness,
  type Ruleset,
  type ThugHappinessInput,
  type WhoreHappinessInput,
} from '@streets/rules-engine';
import type { Db } from '../utils/db.js';

/**
 * Everything happiness reads: the cut, the shelves and the muscle. It is a
 * pure reading of current state - nothing accumulates between actions.
 */
export type HappinessInput = ThugHappinessInput & WhoreHappinessInput;

export interface Happiness {
  whoreHappiness: number;
  thugHappiness: number;
}

/**
 * Section 19. The only place in the server allowed to produce happiness.
 * Routes and other services call recalculate() after touching resources -
 * they never reimplement the formulas.
 */
export const HappinessService = {
  /**
   * Non-crack product stock, for rounds with a product catalog: 0.4.0-C counts it
   * toward whore happiness and 0.4.0-D toward net worth. Undefined on older
   * rounds, which costs no query.
   */
  async otherProducts(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset): Promise<Record<string, number> | undefined> {
    if (!ruleset.products) return undefined;
    const rows = await db.playerProduct.findMany({ where: { roundPlayerId }, select: { productKey: true, quantity: true } });
    return Object.fromEntries(rows.filter((row) => row.productKey !== 'CRACK').map((row) => [row.productKey, row.quantity]));
  },

  recalculate(player: HappinessInput, ruleset: Ruleset): Happiness {
    return {
      whoreHappiness: calculateWhoreHappiness(player, ruleset),
      thugHappiness: calculateThugHappiness(player, ruleset),
    };
  },
};
