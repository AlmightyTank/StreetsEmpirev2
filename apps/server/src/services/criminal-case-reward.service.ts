import type { Db } from '../utils/db.js';
import type { Ruleset } from '@streets/rules-engine';
import { rulesetForCity } from '@streets/rules-engine';
import { LIVING_CASE_REWARD_CENTS, LIVING_CASE_ROUND_REWARD_MAX_CENTS } from '@streets/rulesets';
import { EconomyLedgerService } from './economy-ledger.service.js';
import { HappinessService } from './happiness.service.js';
import { NetWorthService } from './net-worth.service.js';
import { pokerCommittedCents } from './casino-poker-committed.js';

/** Must be called from the owner-locked, case-locked close transaction only. */
export const CriminalCaseRewardService = {
  async grant(tx: Db, input: {
    roundId: string; ownerId: string; caseId: string; caseKey: string;
    budgetCents: number; ruleset: Ruleset; now: Date;
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

    // Net worth is a ruleset-weighted liquidation value, NOT the full cash
    // balance. Recalculate from authoritative assets, product inventory,
    // outstanding debt and casino committed chips using the same calculator
    // as PlayerStateService. This avoids temporary inflated ranks/pricing.
    const player = await tx.roundPlayer.findUniqueOrThrow({
      where: { id: input.ownerId },
      include: { city: { select: { slug: true } } },
    });
    const ruleset = rulesetForCity(input.ruleset, player.city.slug);
    const products = await HappinessService.otherProducts(tx, input.ownerId, ruleset);
    let casinoNetWorthCents = 0n;
    if (ruleset.casino?.enabled) {
      const [wallet, sessions, blackjack, poker] = await Promise.all([
        tx.casinoWallet.aggregate({ where: { roundPlayerId: input.ownerId }, _sum: { chipsCents: true } }),
        tx.casinoSession.aggregate({ where: { roundPlayerId: input.ownerId, status: 'OPEN' }, _sum: { bankrollCents: true } }),
        tx.casinoBlackjackHand.aggregate({ where: { roundPlayerId: input.ownerId, status: 'ACTIVE' }, _sum: { committedWagerCents: true } }),
        pokerCommittedCents(tx, input.ownerId),
      ]);
      casinoNetWorthCents = (wallet._sum.chipsCents ?? 0n) + (sessions._sum.bankrollCents ?? 0n)
        + (blackjack._sum.committedWagerCents ?? 0n) + poker;
    }
    const netWorthCents = NetWorthService.calculate({
      ...player, cashCents: player.cashCents + BigInt(payout), products, casinoNetWorthCents,
    }, ruleset);

    await tx.roundPlayer.update({
      where: { id: input.ownerId },
      data: { cashCents: { increment: BigInt(payout) }, netWorthCents },
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
