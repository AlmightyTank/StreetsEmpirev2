import type { PrismaClient } from '@prisma/client';
import { loadRulesetForRound, loanSharkRules } from '@streets/rules-engine';
import type { AdminLoanCorrectionInput, AdminLoanCorrectionResult } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { lateFeesDueCents, loadLoan, loanOutstanding, refreshCollectionState, writeLoanEvent, type LoanWithInstallments } from './loan-ledger.service.js';
import { reconcileLoans } from './loan-reconcile.service.js';
import { PlayerStateService } from './player-state.service.js';

/**
 * 1.6.5-F. Audited corrections to a player's loans, for verified errors only. Each one:
 *
 * - settles the player first, under their lock, so it starts from the true state;
 * - refuses finished rounds, a round without the loan shark, and an admin's own player;
 * - never creates cash and never deletes history: a waived fee stays assessed and on
 *   record, an excused miss keeps its miss and its original due time;
 * - is bounded to one fee or one installment, journaled as CORRECTED with the reason and
 *   the staff member, and written to the admin audit log with before and after;
 * - answers with the reconciliation afterwards.
 *
 * WAIVE_LATE_FEE forgives the unpaid part of one late fee. EXCUSE_MISS reschedules one
 * missed installment one interval from now, waives its late fee, and, when nothing else is
 * missed, restores the player's standing outright (the miss was not theirs).
 */

/** Forgive what is still owed of one late fee, bounded by what the loan owes in late fees. */
async function waiveFee(db: Db, loan: LoanWithInstallments, fee: { id: string; amountCents: bigint; waivedCents: bigint }, at: Date): Promise<bigint> {
  const fromFee = fee.amountCents - fee.waivedCents;
  const fromLoan = lateFeesDueCents(loan);
  const waive = fromFee < fromLoan ? fromFee : fromLoan;
  if (waive <= 0n) return 0n;
  await db.loanFee.update({ where: { id: fee.id }, data: { waivedCents: { increment: waive }, waivedAt: at } });
  await db.loan.update({ where: { id: loan.id }, data: { lateFeesWaivedCents: { increment: waive } } });
  return waive;
}

export const AdminLoanCorrectionService = {
  async correct(
    prisma: PrismaClient,
    actor: AuditActor,
    roundPlayerId: string,
    input: AdminLoanCorrectionInput,
    now = new Date(),
  ): Promise<AdminLoanCorrectionResult> {
    return prisma.$transaction(async (tx) => {
      const exists = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { accountId: true, round: { select: { status: true } } } });
      if (!exists) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player does not exist.');
      if (exists.accountId === actor.id) throw AppError.conflict('ADMIN_SELF_ACTION', 'Another admin has to correct your own loans.');
      if (exists.round.status !== 'ACTIVE' && exists.round.status !== 'REGISTRATION') {
        throw AppError.conflict('ROUND_FINISHED', 'That round has finished, so its loans are frozen.');
      }
      // Settle first: anything due is collected or missed before the correction looks.
      await PlayerStateService.settleInTransaction(tx, roundPlayerId, { markActive: false, now });
      const player = await tx.roundPlayer.findUniqueOrThrow({
        where: { id: roundPlayerId },
        select: {
          displayName: true, loanDebtCents: true, loanCollectionState: true, loanRecoveryNeeded: true, loanCollectionsSince: true,
          round: { select: { id: true, rulesetId: true, rulesetVersion: true } },
        },
      });
      const ruleset = loadRulesetForRound(player.round);
      const rules = loanSharkRules(ruleset);
      if (!rules) throw AppError.conflict('LOAN_SHARK_CLOSED', 'This round has no loan shark.');

      let loan: LoanWithInstallments;
      let waived = 0n;
      let dueAgainAt: Date | null = null;
      let detail: Record<string, string | number | null>;
      if (input.kind === 'WAIVE_LATE_FEE') {
        const fee = await tx.loanFee.findFirst({ where: { id: input.feeId, roundPlayerId } });
        if (!fee) throw AppError.notFound('LOAN_FEE_NOT_FOUND', 'That fee is not this player’s.');
        loan = (await loadLoan(tx, fee.loanId))!;
        waived = await waiveFee(tx, loan, fee, now);
        if (waived === 0n) throw AppError.conflict('LOAN_CORRECTION_UNCHANGED', 'Nothing is left to waive on that fee: it was paid or already waived.');
        detail = { feeId: fee.id, feeCents: Number(fee.amountCents) };
      } else {
        const installment = await tx.loanInstallment.findFirst({ where: { id: input.installmentId, roundPlayerId } });
        if (!installment) throw AppError.notFound('LOAN_INSTALLMENT_NOT_FOUND', 'That installment is not this player’s.');
        if (installment.status !== 'MISSED') throw AppError.conflict('LOAN_NOT_MISSED', 'Only a missed installment that is still owed can be excused.');
        loan = (await loadLoan(tx, installment.loanId))!;
        // Its latest late fee, from the miss being excused.
        const fee = await tx.loanFee.findFirst({ where: { installmentId: installment.id, kind: 'LATE' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
        if (fee) waived = await waiveFee(tx, loan, fee, now);
        dueAgainAt = new Date(now.getTime() + rules.installmentIntervalHours * 3_600_000);
        await tx.loanInstallment.update({
          where: { id: installment.id },
          data: { status: 'SCHEDULED', dueAt: dueAgainAt, excusedAt: now, originalDueAt: installment.originalDueAt ?? installment.dueAt },
        });
        detail = {
          installmentId: installment.id,
          sequence: installment.sequence,
          missedAt: installment.missedAt?.toISOString() ?? null,
          originalDueAt: (installment.originalDueAt ?? installment.dueAt).toISOString(),
          dueAgainAt: dueAgainAt.toISOString(),
          feeId: fee?.id ?? null,
        };
      }

      // The loan's own state, then the player's debt and standing.
      const after = (await loadLoan(tx, loan.id))!;
      const outstanding = loanOutstanding(after);
      const status = outstanding === 0n ? 'PAID_OFF' : after.installments.some((row) => row.status === 'MISSED') ? 'DELINQUENT' : 'ACTIVE';
      if (status !== after.status) await tx.loan.update({ where: { id: loan.id }, data: { status, ...(status === 'PAID_OFF' ? { paidOffAt: now } : {}) } });
      const debtAfter = player.loanDebtCents - waived;
      if (waived > 0n) await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { loanDebtCents: debtAfter } });
      const key = `admin:${input.kind}:${input.kind === 'WAIVE_LATE_FEE' ? input.feeId : input.installmentId}:${now.getTime()}`;
      await writeLoanEvent(tx, {
        roundPlayerId,
        loanId: loan.id,
        kind: 'CORRECTED',
        debtDeltaCents: -waived,
        debtAfterCents: debtAfter,
        requestKey: key,
        metadata: { correction: input.kind, waivedCents: Number(waived), reason: input.reason, actor: actor.username, ...detail },
        at: now,
      });
      const standing = await refreshCollectionState(tx, {
        roundPlayerId,
        rules,
        current: player,
        debtAfterCents: debtAfter,
        onTimeCleared: 0,
        requestKey: key,
        at: now,
        skipRecovery: input.kind === 'EXCUSE_MISS',
      });
      const audit = await AdminAuditService.record(tx, actor, {
        action: input.kind === 'WAIVE_LATE_FEE' ? 'loans.waive-late-fee' : 'loans.excuse-miss',
        targetType: input.kind === 'WAIVE_LATE_FEE' ? 'loan-fee' : 'loan-installment',
        targetId: input.kind === 'WAIVE_LATE_FEE' ? input.feeId : input.installmentId,
        reason: input.reason,
        before: { roundId: player.round.id, roundPlayerId, displayName: player.displayName, loanId: loan.id, debtCents: Number(player.loanDebtCents), standing: player.loanCollectionState, ...detail },
        after: { debtCents: Number(debtAfter), waivedCents: Number(waived), standing: standing.loanCollectionState, loanStatus: status },
      });
      return {
        kind: input.kind,
        waivedCents: Number(waived),
        debtBeforeCents: Number(player.loanDebtCents),
        debtAfterCents: Number(debtAfter),
        standing: standing.loanCollectionState,
        dueAgainAt: dueAgainAt?.toISOString() ?? null,
        auditId: audit?.id ?? null,
        problems: await reconcileLoans(tx, roundPlayerId, ruleset),
      };
    });
  },
};
