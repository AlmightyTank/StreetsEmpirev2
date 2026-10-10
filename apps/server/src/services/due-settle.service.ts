import { Prisma, type PrismaClient } from '@prisma/client';
import { rulesets, type Ruleset } from '@streets/rulesets';
import { PlayerStateService } from './player-state.service.js';

/**
 * 1.6.5-D. Money that falls due on the clock, settled on time even when its owner is away:
 * loan installments (1.6.5-A), property upkeep (1.6.0-D), and (1.6.5-E) income garnished
 * from players in collections. The alerts poller runs this
 * every minute, so an installment is collected (or missed, and the bell told) at its due
 * time from the cash on hand then, not whenever the player next looks.
 *
 * Each owner is settled through the ordinary read-path settle, under their own lock, exactly
 * as if they had opened a page: nothing here moves money itself. Only live rounds are swept;
 * a paused or finished round waits, so a pause never costs anyone an installment.
 */

const SWEEP_LIMIT = 200;

/** 1.6.5-E. Every income source any ruleset garnishes; the settle applies the round's own list. */
const GARNISH_SOURCES = [...new Set((Object.values(rulesets) as Ruleset[]).flatMap((ruleset) => ruleset.loanShark?.collections?.garnishSources ?? []))];

export const DueSettleService = {
  /** Players with a loan installment past its due time that has not been settled yet. */
  async loanOwners(prisma: PrismaClient, now: Date, limit = SWEEP_LIMIT): Promise<string[]> {
    const rows = await prisma.loanInstallment.findMany({
      where: {
        status: 'SCHEDULED',
        dueAt: { lte: now },
        roundPlayer: { round: { status: 'ACTIVE', endsAt: { gt: now }, pausedAt: null } },
      },
      distinct: ['roundPlayerId'],
      orderBy: { roundPlayerId: 'asc' },
      select: { roundPlayerId: true },
      take: limit,
    });
    return rows.map((row) => row.roundPlayerId);
  },

  /**
   * Players with property upkeep fallen due that their cash can cover at least one period
   * of. A property that is behind for want of cash stays behind until there is cash; the
   * owner is not re-settled every minute for nothing in the meantime.
   */
  async upkeepOwners(prisma: PrismaClient, now: Date, limit = SWEEP_LIMIT): Promise<string[]> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT DISTINCT due."roundPlayerId" AS id FROM (
        SELECT w."roundPlayerId", w."upkeepCents" FROM "SupplyWarehouse" w
        WHERE w."isActive" AND w.kind = 'WAREHOUSE' AND w."paidThrough" <= ${now}
        UNION ALL
        SELECT s."roundPlayerId", s."upkeepCents" FROM "SupplySafehouse" s
        WHERE s."isActive" AND s."paidThrough" <= ${now}
      ) due
      JOIN "RoundPlayer" p ON p.id = due."roundPlayerId"
      JOIN "Round" r ON r.id = p."roundId"
      WHERE p."cashCents" >= due."upkeepCents"
        AND r.status = 'ACTIVE' AND r."endsAt" > ${now} AND r."pausedAt" IS NULL
      ORDER BY due."roundPlayerId"
      LIMIT ${limit}
    `);
    return rows.map((row) => row.id);
  },

  /**
   * 1.6.5-E. Players in collections with garnishable income not yet considered, so income is
   * garnished within a minute of being earned whether or not the player comes back.
   */
  async collectionsOwners(prisma: PrismaClient, now: Date, limit = SWEEP_LIMIT): Promise<string[]> {
    if (!GARNISH_SOURCES.length) return [];
    const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT p.id FROM "RoundPlayer" p
      JOIN "Round" r ON r.id = p."roundId"
      WHERE p."loanCollectionState" = 'COLLECTIONS' AND p."loanCollectionsSince" IS NOT NULL
        AND r.status = 'ACTIVE' AND r."endsAt" > ${now} AND r."pausedAt" IS NULL
        AND EXISTS (
          SELECT 1 FROM "EconomyLedgerEntry" e
          WHERE e."roundPlayerId" = p.id AND e."loanCollectedAt" IS NULL AND e."amountCents" > 0
            AND e."createdAt" >= p."loanCollectionsSince" AND e.source IN (${Prisma.join(GARNISH_SOURCES)})
        )
      ORDER BY p.id
      LIMIT ${limit}
    `);
    return rows.map((row) => row.id);
  },

  /**
   * Settle every owner with something due. One owner's failure is reported and skipped,
   * never allowed to stop the others or the rest of the alerts tick.
   */
  async sweep(
    prisma: PrismaClient,
    now: Date = new Date(),
    onError?: (roundPlayerId: string, error: unknown) => void,
  ): Promise<{ settled: number; failed: number }> {
    const owners = [...new Set([
      ...await DueSettleService.loanOwners(prisma, now),
      ...await DueSettleService.upkeepOwners(prisma, now),
      ...await DueSettleService.collectionsOwners(prisma, now),
    ])];
    let failed = 0;
    for (const ownerId of owners) {
      try {
        await PlayerStateService.settle(prisma, ownerId, { markActive: false, now });
      } catch (error) {
        failed += 1;
        onError?.(ownerId, error);
      }
    }
    return { settled: owners.length - failed, failed };
  },
};
