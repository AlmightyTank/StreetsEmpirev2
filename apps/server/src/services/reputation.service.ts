import type { Prisma, PrismaClient } from '@prisma/client';
import { emptyStandings, traderKeys, type Ruleset, type Standings } from '@streets/rules-engine';
import type { TraderKey } from '@streets/rulesets';

type Db = PrismaClient | Prisma.TransactionClient;

/** A standing change an action wants written, alongside the player update. */
export interface ReputationChange {
  trader: TraderKey;
  points: number;
  creditedOn?: Date;
  questDoneAt?: Date;
}

/**
 * Standing with the traders, section 34.
 *
 * Rows rather than columns, so a ruleset with a different set of shops needs
 * no migration. Reads tolerate missing rows and answer zero: a player who
 * joined before this shipped, or a trader a variant added later, should read
 * as a stranger rather than as an error.
 */
export const ReputationService = {
  async load(db: Db, roundPlayerId: string, ruleset: Ruleset): Promise<Standings> {
    const rows = await db.playerReputation.findMany({ where: { roundPlayerId } });
    const standings = emptyStandings(ruleset);

    for (const row of rows) {
      const key = row.trader as TraderKey;
      if (!(key in standings)) continue; // A shop this ruleset does not have.
      standings[key] = {
        points: row.points,
        creditedOn: row.creditedOn,
        questDone: row.questDoneAt !== null,
      };
    }
    return standings;
  },

  /**
   * Upserted rather than updated, so a player who predates a trader picks up
   * a row the first time they deal with them.
   */
  async write(db: Db, roundPlayerId: string, changes: ReputationChange[]): Promise<void> {
    for (const change of changes) {
      await db.playerReputation.upsert({
        where: { roundPlayerId_trader: { roundPlayerId, trader: change.trader } },
        create: {
          roundPlayerId,
          trader: change.trader,
          points: change.points,
          creditedOn: change.creditedOn ?? null,
          questDoneAt: change.questDoneAt ?? null,
        },
        update: {
          points: change.points,
          ...(change.creditedOn ? { creditedOn: change.creditedOn } : {}),
          ...(change.questDoneAt ? { questDoneAt: change.questDoneAt } : {}),
        },
      });
    }
  },

  /** Rows for a player joining a round: a stranger to everybody. */
  seedFor(ruleset: Ruleset): { trader: string; points: number }[] {
    return traderKeys(ruleset).map((trader) => ({ trader, points: 0 }));
  },
};
