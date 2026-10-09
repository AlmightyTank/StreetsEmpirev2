import type { PrismaClient } from '@prisma/client';
import { LoanError, debtLimits, loanSharkRules, quoteLoan, type LoanTerms } from '@streets/rules-engine';
import type { LoanAcceptResult, LoanPaymentResult } from '@streets/shared';
import { ActionService } from './action.service.js';
import {
  applyLoanPayment,
  loadLoan,
  loanAccountDto,
  loanDto,
  loanOutstanding,
  proceedsLedger,
  refreshCollectionState,
  writeLoanEvent,
} from './loan-ledger.service.js';
import { AppError } from '../utils/errors.js';

/**
 * 1.6.5-A. Borrowing from and repaying the loan shark, as server actions. Both run through
 * the action pipeline: the player is locked, settled (due installments included) and
 * replay-guarded before anything is read, and every write commits or none does.
 *
 * Acceptance takes terms the server has already quoted. Callers never pass a client's
 * numbers through: 1.6.5-B resolves an offer tier to its terms on the server.
 */

export interface LoanAcceptInput {
  actionId?: string;
  /** Durable key: the same key always answers with the same loan. */
  requestKey: string;
  offerKey: string;
  terms: LoanTerms;
}

export interface LoanRepayInput {
  actionId?: string;
  requestKey: string;
  loanId: string;
  amountCents: bigint;
}

/** Keys are namespaced in the journal, so a client key is kept well inside the column. */
function assertRequestKey(requestKey: string): void {
  if (typeof requestKey !== 'string' || requestKey.length < 1 || requestKey.length > 96) {
    throw AppError.badRequest('LOAN_REQUEST_KEY', 'A loan request needs a key of 1 to 96 characters.', { requestKey: 'Invalid.' });
  }
}

function refusal(error: unknown): never {
  if (error instanceof LoanError) {
    if (error.code === 'LOAN_TERMS_INVALID') throw AppError.badRequest(error.code, error.message);
    throw AppError.conflict(error.code, error.message);
  }
  throw error;
}

export const LoanService = {
  accept(prisma: PrismaClient, roundPlayerId: string, input: LoanAcceptInput) {
    return ActionService.run<LoanAcceptResult>(prisma, roundPlayerId, {
      action: 'LOAN_ACCEPT',
      idempotencyScope: 'LOAN_ACCEPT',
      actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        const rules = loanSharkRules(ruleset);
        if (!rules) throw AppError.notFound('LOAN_SHARK_CLOSED', 'Nobody is lending in this round.');
        assertRequestKey(input.requestKey);

        const account = {
          loanDebtCents: current.loanDebtCents,
          loanDebtCeilingCents: player.loanDebtCeilingCents,
          loanFeesAssessedCents: player.loanFeesAssessedCents,
          loanFeeCapCents: player.loanFeeCapCents,
          loanCollectionState: player.loanCollectionState,
        };

        const prior = await tx.loan.findUnique({
          where: { roundPlayerId_requestKey: { roundPlayerId, requestKey: input.requestKey } },
          include: { installments: { orderBy: { sequence: 'asc' } } },
        });
        if (prior) {
          if (prior.offerKey !== input.offerKey
            || prior.principalCents !== input.terms.principalCents
            || prior.contractFeeCents !== input.terms.contractFeeCents
            || prior.installmentCount !== input.terms.installmentCount) {
            throw AppError.conflict('LOAN_REQUEST_KEY_REUSED', 'That loan request was already used for a different loan.');
          }
          return {
            next: current,
            result: { loan: loanDto(prior), account: loanAccountDto(account), creditedCents: 0, replayed: true },
            ledger: [],
          };
        }

        // The round's limits are fixed for this player the first time they borrow.
        if (account.loanDebtCeilingCents === 0n && account.loanFeeCapCents === 0n) {
          const limits = debtLimits(rules);
          account.loanDebtCeilingCents = limits.ceilingCents;
          account.loanFeeCapCents = limits.feeCapCents;
          await tx.roundPlayer.update({
            where: { id: roundPlayerId },
            data: { loanDebtCeilingCents: limits.ceilingCents, loanFeeCapCents: limits.feeCapCents },
          });
        }

        let quote;
        try {
          quote = quoteLoan(rules, input.terms, {
            debtCents: account.loanDebtCents,
            ceilingCents: account.loanDebtCeilingCents,
            feesAssessedCents: account.loanFeesAssessedCents,
            feeCapCents: account.loanFeeCapCents,
          }, now);
        } catch (error) {
          refusal(error);
        }

        const loan = await tx.loan.create({
          data: {
            roundPlayerId,
            offerKey: input.offerKey,
            rulesetId: round.rulesetId,
            rulesetVersion: round.rulesetVersion,
            principalCents: quote.principalCents,
            contractFeeCents: quote.contractFeeCents,
            obligationCents: quote.obligationCents,
            lateFeeCents: quote.lateFeeCents,
            lateFeeCapCents: quote.lateFeeCapCents,
            installmentCount: quote.installments.length,
            installmentIntervalHours: rules.installmentIntervalHours,
            requestKey: input.requestKey,
            acceptedAt: now,
            installments: {
              create: quote.installments.map((row) => ({
                roundPlayerId,
                sequence: row.sequence,
                dueAt: row.dueAt,
                principalCents: row.principalCents,
                contractFeeCents: row.contractFeeCents,
              })),
            },
          },
          include: { installments: { orderBy: { sequence: 'asc' } } },
        });
        await writeLoanEvent(tx, {
          roundPlayerId,
          loanId: loan.id,
          kind: 'ACCEPTED',
          debtDeltaCents: quote.obligationCents,
          debtAfterCents: quote.debtAfterCents,
          requestKey: `accepted:${input.requestKey}`,
          metadata: {
            offerKey: input.offerKey,
            principalCents: Number(quote.principalCents),
            contractFeeCents: Number(quote.contractFeeCents),
            installments: quote.installments.length,
          },
          at: now,
        });

        account.loanDebtCents = quote.debtAfterCents;
        return {
          next: { ...current, cashCents: current.cashCents + quote.principalCents, loanDebtCents: quote.debtAfterCents },
          result: { loan: loanDto(loan), account: loanAccountDto(account), creditedCents: Number(quote.principalCents), replayed: false },
          ledger: [proceedsLedger(loan)],
          // Borrowed cash is not earned cash: nothing here may count toward an earning Job.
          questProgress: { type: 'LOAN_ACCEPTED', payload: { loanId: loan.id, offerKey: input.offerKey, installments: quote.installments.length } },
        };
      },
    });
  },

  /**
   * A payment from cash toward one loan: early, partial or a full payoff. A request for more
   * than the loan owes pays exactly what it owes. Never from another loan's proceeds: it
   * only ever spends the player's cash.
   */
  repay(prisma: PrismaClient, roundPlayerId: string, input: LoanRepayInput) {
    return ActionService.run<LoanPaymentResult>(prisma, roundPlayerId, {
      action: 'LOAN_PAYMENT',
      idempotencyScope: 'LOAN_PAYMENT',
      actionId: input.actionId,
      execute: async ({ tx, current, player, ruleset, now }) => {
        if (!loanSharkRules(ruleset)) throw AppError.notFound('LOAN_SHARK_CLOSED', 'Nobody is lending in this round.');
        assertRequestKey(input.requestKey);
        const paymentKey = `manual:${input.requestKey}`;
        const account = {
          loanDebtCents: current.loanDebtCents,
          loanDebtCeilingCents: player.loanDebtCeilingCents,
          loanFeesAssessedCents: player.loanFeesAssessedCents,
          loanFeeCapCents: player.loanFeeCapCents,
          loanCollectionState: player.loanCollectionState,
        };

        const prior = await tx.loanPayment.findUnique({
          where: { roundPlayerId_requestKey: { roundPlayerId, requestKey: paymentKey } },
        });
        if (prior) {
          if (prior.loanId !== input.loanId || prior.kind !== 'MANUAL') {
            throw AppError.conflict('LOAN_REQUEST_KEY_REUSED', 'That payment request was already used for a different payment.');
          }
          const loan = await loadLoan(tx, prior.loanId);
          return {
            next: current,
            result: {
              loan: loanDto(loan!),
              account: loanAccountDto(account),
              kind: prior.kind,
              paidCents: Number(prior.amountCents),
              lateFeeCents: Number(prior.lateFeeCents),
              contractFeeCents: Number(prior.contractFeeCents),
              principalCents: Number(prior.principalCents),
              replayed: true,
            },
            ledger: [],
          };
        }

        if (input.amountCents <= 0n) {
          throw AppError.badRequest('LOAN_PAYMENT_AMOUNT', 'Pay at least one cent.', { amountCents: 'Must be positive.' });
        }
        const loan = await loadLoan(tx, input.loanId);
        if (!loan || loan.roundPlayerId !== roundPlayerId) throw AppError.notFound('LOAN_NOT_FOUND', 'That loan is not yours.');
        const owed = loanOutstanding(loan);
        if (loan.status === 'PAID_OFF' || owed === 0n) throw AppError.conflict('LOAN_PAID_OFF', 'That loan is already paid off.');
        const paying = input.amountCents < owed ? input.amountCents : owed;
        if (paying > current.cashCents) {
          throw AppError.badRequest('NOT_ENOUGH_CASH', 'You do not have that much cash on hand.', { amountCents: 'Not enough cash.' });
        }

        const applied = await applyLoanPayment(tx, {
          roundPlayerId,
          loan,
          kind: 'MANUAL',
          requestKey: paymentKey,
          amountCents: paying,
          debtBeforeCents: current.loanDebtCents,
          at: now,
        });
        const debtAfterCents = current.loanDebtCents - applied.allocation.appliedCents;
        account.loanDebtCents = debtAfterCents;
        account.loanCollectionState = await refreshCollectionState(tx, {
          roundPlayerId,
          current: player.loanCollectionState,
          debtAfterCents,
          requestKey: paymentKey,
          at: now,
        });

        return {
          next: { ...current, cashCents: current.cashCents - applied.allocation.appliedCents, loanDebtCents: debtAfterCents },
          result: {
            loan: loanDto(applied.loan),
            account: loanAccountDto(account),
            kind: 'MANUAL' as const,
            paidCents: Number(applied.allocation.appliedCents),
            lateFeeCents: Number(applied.allocation.lateFeeCents),
            contractFeeCents: Number(applied.allocation.contractFeeCents),
            principalCents: Number(applied.allocation.principalCents),
            replayed: false,
          },
          ledger: applied.ledger,
          questProgress: { type: 'LOAN_PAYMENT', payload: { loanId: loan.id, paidOff: applied.allocation.paidOff } },
        };
      },
    });
  },
};
