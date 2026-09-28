import type { PrismaClient } from '@prisma/client';
import {
  awayHappinessPenalty,
  calculateThugHappiness,
  calculateWhoreHappiness,
  tripRules,
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

  /**
   * `awayPenalty` (Trips E): points off whore happiness while the boss is away. It is read
   * from the trip's and the run's own timestamps (`awayPenalty` below), so nothing is
   * stored and it is gone the moment the boss is home.
   */
  recalculate(player: HappinessInput, ruleset: Ruleset, awayPenalty = 0): Happiness {
    return {
      whoreHappiness: Math.max(ruleset.happiness.min, calculateWhoreHappiness(player, ruleset) - Math.max(0, awayPenalty)),
      thugHappiness: calculateThugHappiness(player, ruleset),
    };
  },

  /** Trips E. The happiness the girls lose to the boss being away, as of `now`. Zero at home. */
  async awayPenalty(db: Db | PrismaClient, ruleset: Ruleset, roundPlayerId: string, now: Date): Promise<number> {
    const rules = tripRules(ruleset);
    if (!rules?.awayHappiness) return 0;
    const [trip, run] = await Promise.all([
      db.bossTrip.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { departedAt: true } }),
      db.run.findFirst({ where: { roundPlayerId, status: 'ACTIVE', bossAboard: true }, select: { launchedAt: true } }),
    ]);
    const since = [trip?.departedAt, run?.launchedAt].filter((at): at is Date => Boolean(at)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    return awayHappinessPenalty(rules, since, now);
  },
};
