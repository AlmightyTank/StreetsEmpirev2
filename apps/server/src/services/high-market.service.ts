import type { PrismaClient } from '@prisma/client';
import { settlePush, type Ruleset } from '@streets/rules-engine';
import type { Db } from '../utils/db.js';

/**
 * 0.5.0-C. The high market's stored half: how far trades have pushed each round,
 * city and product off its baseline, and when. The baseline itself is the round's
 * seeded schedule (rules-engine `marketView`), so it needs no row.
 *
 * A trade locks its market row after the player's own lock, and only one market per
 * trade, so two runs selling into the same market line up instead of both selling at
 * the old price, and no two locks are ever taken in opposite orders.
 */
export const HighMarketService = {
  /** Lock one market for a trade and settle its push to `now`. Creates it, unpushed, the first time. */
  async lock(tx: Db, ruleset: Ruleset, roundId: string, city: string, productKey: string, now: Date): Promise<{ id: string; push: number }> {
    await tx.$executeRaw`
      INSERT INTO "HighMarket" ("id", "roundId", "city", "productKey", "push", "pushAt")
      VALUES (${`hm_${roundId}_${city}_${productKey}`}, ${roundId}, ${city}, ${productKey}, 0, ${now})
      ON CONFLICT DO NOTHING`;
    const [row] = await tx.$queryRaw<Array<{ id: string; push: number; pushAt: Date }>>`
      SELECT "id", "push", "pushAt" FROM "HighMarket"
      WHERE "roundId" = ${roundId} AND "city" = ${city} AND "productKey" = ${productKey}
      FOR UPDATE`;
    const rules = ruleset.travel?.market;
    return { id: row!.id, push: rules ? settlePush({ push: row!.push, pushAt: row!.pushAt }, rules, now) : 0 };
  },

  async write(tx: Db, id: string, push: number, now: Date): Promise<void> {
    await tx.highMarket.update({ where: { id }, data: { push, pushAt: now } });
  },

  /** Every product's push in a city as of `now`, for showing prices. Unlocked: a trade re-reads under its lock. */
  async pushes(db: Db | PrismaClient, ruleset: Ruleset, roundId: string, city: string, now: Date): Promise<Map<string, number>> {
    const rules = ruleset.travel?.market;
    if (!rules) return new Map();
    const rows = await db.highMarket.findMany({ where: { roundId, city }, select: { productKey: true, push: true, pushAt: true } });
    return new Map(rows.map((row) => [row.productKey, settlePush(row, rules, now)]));
  },
};
