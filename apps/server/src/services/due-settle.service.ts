import { Prisma, type PrismaClient } from '@prisma/client';
import { PlayerStateService } from './player-state.service.js';

/**
 * 1.6.5-D. Money that falls due on the clock, settled on time even when its owner is away:
 * loan installments (1.6.5-A) and property upkeep (1.6.0-D). The alerts poller runs this
 * every minute, so an installment is collected (or missed, and the bell told) at its due
 * time from the cash on hand then, not whenever the player next looks.
 *
 * Each owner is settled through the ordinary read-path settle, under their own lock, exactly
 * as if they had opened a page: nothing here moves money itself. Only live rounds are swept;
 * a paused or finished round waits, so a pause never costs anyone an installment.
 */

const SWEEP_LIMIT = 200;

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
   * Settle every owner with something due. One owner's failure is reported and skipped,
   * never allowed to stop the others or the rest of the alerts tick.
   */
  async sweep(
    prisma: PrismaClient,
    now: Date = new Date(),
    onError?: (roundPlayerId: string, error: unknown) => void,
  ): Promise<{ settled: number; failed: number }> {
    const owners = [...new Set([...await DueSettleService.loanOwners(prisma, now), ...await DueSettleService.upkeepOwners(prisma, now)])];
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
