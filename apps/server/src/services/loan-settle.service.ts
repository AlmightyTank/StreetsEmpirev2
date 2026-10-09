import { debtLimits, lateFeeChargeCents, loanPayoffCents, loanSharkRules, type Ruleset } from '@streets/rules-engine';
import type { Db } from '../utils/db.js';
import { EconomyLedgerService, type EconomyLedgerWrite } from './economy-ledger.service.js';
import { ActivityService } from './activity.service.js';
import { garnishIncome } from './loan-collections.service.js';
import {
  applyLoanPayment,
  installmentDue,
  lateFeesDueCents,
  loadLoan,
  loanFeeBudget,
  loanOfferName,
  loanPaymentActivity,
  refreshCollectionState,
  writeLoanEvent,
} from './loan-ledger.service.js';

/**
 * 1.6.5-A. Installments, settled lazily under the player's lock before anything reads cash,
 * like property upkeep. Only the server's clock decides what is due.
 *
 * Each installment whose due time has passed is settled once, oldest first. The server
 * collects what the loan currently has due through that installment: unpaid late fees, any
 * earlier missed installment, and this one. When cash covers all of it, the installment is
 * paid. When it does not, the server takes whatever cash there is toward it, the installment
 * is missed, and the loan's fixed late fee is assessed once, cut down to the loan's cap and
 * the ruleset's fee cap and debt ceiling. A missed installment stays owed and is collected
 * with the next one, or by any payment the player makes.
 *
 * 1.6.5-E. Then the player's standing is refreshed, and a player in collections has a capped
 * share of new income garnished toward what is overdue (see `garnishIncome`).
 */
export const LoanSettleService = {
  /** Settle everything due by `now`. Returns the cash left, or null when nothing was due. */
  async settle(tx: Db, roundPlayerId: string, ruleset: Ruleset, now: Date): Promise<bigint | null> {
    const rules = loanSharkRules(ruleset);
    if (!rules) return null;
    const due = await tx.loanInstallment.findMany({
      where: { roundPlayerId, status: 'SCHEDULED', dueAt: { lte: now } },
      orderBy: [{ dueAt: 'asc' }, { sequence: 'asc' }, { id: 'asc' }],
      select: { id: true, loanId: true },
    });
    const player = await tx.roundPlayer.findUniqueOrThrow({
      where: { id: roundPlayerId },
      select: {
        cashCents: true, loanDebtCents: true, loanFeesAssessedCents: true,
        loanCollectionState: true, loanRecoveryNeeded: true, loanCollectionsSince: true,
      },
    });
    // 1.6.5-E: a player in collections is settled for garnishing even with nothing due.
    const inCollections = Boolean(rules.collections) && player.loanCollectionState === 'COLLECTIONS';
    if (!due.length && !inCollections) return null;
    const limits = debtLimits(rules);
    let cash = player.cashCents;
    let debt = player.loanDebtCents;
    let feesAssessed = player.loanFeesAssessedCents;
    const ledger: EconomyLedgerWrite[] = [];
    let onTimeCleared = 0;

    for (const next of due) {
      let loan = await loadLoan(tx, next.loanId);
      if (!loan || loan.status === 'PAID_OFF') continue;
      const installment = loan.installments.find((row) => row.id === next.id);
      // Paid in full already by an earlier payment, or settled by an earlier pass.
      if (!installment || installment.status !== 'SCHEDULED') continue;

      const through = loan.installments.filter((row) => row.sequence <= installment.sequence);
      const dueNow = loanPayoffCents(lateFeesDueCents(loan), through.map(installmentDue), loanFeeBudget(loan, now));
      const key = `scheduled:${installment.id}`;

      if (dueNow === 0n) {
        await tx.loanInstallment.update({ where: { id: installment.id }, data: { status: 'PAID', paidAt: installment.dueAt } });
        continue;
      }

      // Everything due if cash covers it, otherwise whatever cash there is.
      const collect = cash < dueNow ? cash : dueNow;
      if (collect > 0n) {
        const applied = await applyLoanPayment(tx, {
          roundPlayerId,
          loan,
          kind: 'SCHEDULED',
          requestKey: key,
          amountCents: collect,
          debtBeforeCents: debt,
          at: now,
        });
        cash -= applied.allocation.appliedCents;
        debt -= applied.debtReductionCents;
        ledger.push(...applied.ledger);
        onTimeCleared += applied.onTimeCleared;
        await ActivityService.log(tx, roundPlayerId, 'LOAN_PAYMENT', loanPaymentActivity(loan, rules, 'SCHEDULED', applied.allocation, debt));
        loan = applied.loan;
      }
      if (collect === dueNow) continue;

      // Missed: recorded once, at its due time, whenever the server first finds it.
      const marked = await tx.loanInstallment.updateMany({
        where: { id: installment.id, status: 'SCHEDULED' },
        data: { status: 'MISSED', missedAt: installment.dueAt },
      });
      if (marked.count !== 1) continue;
      await writeLoanEvent(tx, {
        roundPlayerId,
        loanId: loan.id,
        kind: 'INSTALLMENT_MISSED',
        debtAfterCents: debt,
        requestKey: `missed:${installment.id}`,
        metadata: { sequence: installment.sequence, dueCents: Number(dueNow), collectedCents: Number(collect), shortCents: Number(dueNow - collect) },
        at: now,
      });

      const charge = lateFeeChargeCents({
        lateFeeCents: loan.lateFeeCents,
        loanLateFeesAssessedCents: loan.lateFeesAssessedCents,
        loanLateFeeCapCents: loan.lateFeeCapCents,
        position: { debtCents: debt, feesAssessedCents: feesAssessed, ...limits },
      });
      await tx.loanFee.create({
        data: {
          loanId: loan.id,
          roundPlayerId,
          installmentId: installment.id,
          kind: 'LATE',
          requestKey: `late:${installment.id}`,
          amountCents: charge,
          quotedCents: loan.lateFeeCents,
          createdAt: now,
        },
      });
      await tx.loan.update({
        where: { id: loan.id },
        data: { status: 'DELINQUENT', ...(charge > 0n ? { lateFeesAssessedCents: { increment: charge } } : {}) },
      });
      debt += charge;
      feesAssessed += charge;
      await writeLoanEvent(tx, {
        roundPlayerId,
        loanId: loan.id,
        kind: 'FEE_ASSESSED',
        debtDeltaCents: charge,
        debtAfterCents: debt,
        requestKey: `late:${installment.id}:fee`,
        metadata: { sequence: installment.sequence, quotedCents: Number(loan.lateFeeCents), capped: charge < loan.lateFeeCents },
        at: now,
      });
      // 1.6.5-D: the feed and the bell, so a player who is away hears about it.
      await ActivityService.log(tx, roundPlayerId, 'LOAN_INSTALLMENT_MISSED', {
        loanId: loan.id,
        offerName: loanOfferName(rules, loan.offerKey),
        sequence: installment.sequence,
        dueCents: Number(dueNow),
        collectedCents: Number(collect),
        shortCents: Number(dueNow - collect),
        lateFeeCents: Number(charge),
        debtAfterCents: Number(debt),
      });
    }

    if (due.length) {
      await tx.roundPlayer.update({
        where: { id: roundPlayerId },
        data: { cashCents: cash, loanDebtCents: debt, loanFeesAssessedCents: feesAssessed },
      });
    }
    let standing = await refreshCollectionState(tx, {
      roundPlayerId,
      rules,
      current: player,
      debtAfterCents: debt,
      onTimeCleared,
      requestKey: `settle:${due.at(-1)?.id ?? 'collections'}:${now.getTime()}`,
      at: now,
    });

    // 1.6.5-E: in collections, a capped share of new income goes to what is overdue.
    let garnished = false;
    if (standing.loanCollectionState === 'COLLECTIONS') {
      const taken = await garnishIncome(tx, { roundPlayerId, rules, since: standing.loanCollectionsSince, cashCents: cash, debtCents: debt, at: now });
      if (taken && taken.takenCents > 0n) {
        garnished = true;
        cash -= taken.takenCents;
        debt -= taken.debtReductionCents;
        ledger.push(...taken.ledger);
        await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { cashCents: cash, loanDebtCents: debt } });
        standing = await refreshCollectionState(tx, {
          roundPlayerId,
          rules,
          current: standing,
          debtAfterCents: debt,
          onTimeCleared: 0,
          requestKey: `garnish:${roundPlayerId}:${now.getTime()}`,
          at: now,
        });
      }
    }

    if (ledger.length) await EconomyLedgerService.record(tx, roundPlayerId, ledger, now);
    return due.length || garnished ? cash : null;
  },
};
