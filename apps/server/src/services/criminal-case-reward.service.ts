import type { Db } from '../utils/db.js';
import { LIVING_CASE_REWARD_CENTS, LIVING_CASE_ROUND_REWARD_MAX_CENTS } from '@streets/rulesets';
import { EconomyLedgerService } from './economy-ledger.service.js';

/** Must be called from the owner-locked, case-locked close transaction only. */
export const CriminalCaseRewardService = {
  async grant(tx: Db, input: {
    roundId: string; ownerId: string; caseId: string; caseKey: string;
    budgetCents: number; now: Date;
  }): Promise<number> {
    if (!Number.isSafeInteger(input.budgetCents) || input.budgetCents <= 0) return 0;
    const total = await tx.criminalCaseFile.aggregate({
      where: { roundId: input.roundId, ownerId: input.ownerId, status: 'CLOSED' },
      _sum: { rewardCents: true },
    });
    const previousCents = total._sum.rewardCents ?? 0;
    const available = Math.max(0, LIVING_CASE_ROUND_REWARD_MAX_CENTS - previousCents);
    const payout = Math.min(LIVING_CASE_REWARD_CENTS, input.budgetCents, available);
    if (payout <= 0) return 0;
    await tx.roundPlayer.update({
      where: { id: input.ownerId },
      data: {
        cashCents: { increment: BigInt(payout) },
        netWorthCents: { increment: BigInt(payout) },
      },
    });
    await EconomyLedgerService.record(tx, input.ownerId, [{
      source: 'LIVING_CASE_REWARD',
      label: 'Criminal Case File · investigation conclusion',
      amountCents: BigInt(payout),
      metadata: { caseFileId: input.caseId, caseKey: input.caseKey },
    }], input.now);
    return payout;
  },
};
