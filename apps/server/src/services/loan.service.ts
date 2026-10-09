import type { PrismaClient } from '@prisma/client';
import {
  LoanError,
  debtLimits,
  loanOfferRefusal,
  loanOfferTerms,
  loanOffers,
  loanSharkRules,
  quoteLoan,
  type LoanTerms,
} from '@streets/rules-engine';
import type { LoanSharkRules } from '@streets/rulesets';
import type { LoanAcceptResult, LoanPaymentResult } from '@streets/shared';
import { ActionService, type ActionContext } from './action.service.js';
import {
  applyLoanPayment,
  loadLoan,
  loanAccountDto,
  loanDto,
  loanPayoff,
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
 * numbers through: 1.6.5-B's `acceptOffer` resolves an offer tier to its terms on the
 * server, inside the transaction, after the replay check.
 */

/** Terms as given, or resolved under the player's lock (and free to refuse). */
type LoanTermsSource = LoanTerms | ((rules: LoanSharkRules, context: ActionContext) => LoanTerms);

export interface LoanAcceptInput {
  actionId?: string;
  /** Durable key: the same key always answers with the same loan. */
  requestKey: string;
  offerKey: string;
  terms: LoanTermsSource;
}

export interface LoanOfferAcceptInput {
  actionId?: string;
  requestKey: string;
  offerKey: string;
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
  accept(prisma: PrismaClient, roundPlayerId: string, input: LoanAcceptInput, now: Date = new Date()) {
    return ActionService.run<LoanAcceptResult>(prisma, roundPlayerId, {
      action: 'LOAN_ACCEPT',
      idempotencyScope: 'LOAN_ACCEPT',
      actionId: input.actionId,
      execute: async (context) => {
        const { tx, current, player, round, ruleset, now } = context;
        const rules = loanSharkRules(ruleset);
        if (!rules) throw AppError.notFound('LOAN_SHARK_CLOSED', 'Nobody is lending in this round.');
        assertRequestKey(input.requestKey);

        const account = {
          loanDebtCents: current.loanDebtCents,
          loanFeesAssessedCents: player.loanFeesAssessedCents,
          loanCollectionState: player.loanCollectionState,
        };

        const prior = await tx.loan.findUnique({
          where: { roundPlayerId_requestKey: { roundPlayerId, requestKey: input.requestKey } },
          include: { installments: { orderBy: { sequence: 'asc' } } },
        });
        if (prior) {
          const given = typeof input.terms === 'function' ? null : input.terms;
          if (prior.offerKey !== input.offerKey || (given && (
            prior.principalCents !== given.principalCents
            || prior.contractFeeCents !== given.contractFeeCents
            || prior.installmentCount !== given.installmentCount))) {
            throw AppError.conflict('LOAN_REQUEST_KEY_REUSED', 'That loan request was already used for a different loan.');
          }
          return {
            next: current,
            result: { loan: loanDto(prior, now), account: loanAccountDto(rules, account), creditedCents: 0, replayed: true },
            ledger: [],
          };
        }

        const terms = typeof input.terms === 'function' ? input.terms(rules, context) : input.terms;
        // The limits are whatever the round's ruleset sets now, never a per-player snapshot.
        let quote;
        try {
          quote = quoteLoan(rules, terms, {
            debtCents: account.loanDebtCents,
            feesAssessedCents: account.loanFeesAssessedCents,
            ...debtLimits(rules),
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
          result: { loan: loanDto(loan, now), account: loanAccountDto(rules, account), creditedCents: Number(quote.principalCents), replayed: false },
          ledger: [proceedsLedger(loan)],
          // Borrowed cash is not earned cash: nothing here may count toward an earning Job.
          questProgress: { type: 'LOAN_ACCEPTED', payload: { loanId: loan.id, offerKey: input.offerKey, installments: quote.installments.length } },
        };
      },
    }, now);
  },

  /**
   * 1.6.5-B. Accept one of the ruleset's fixed offers. The terms come from the round's own
   * ruleset under the player's lock, never from the request, and the offer must be open to
   * the player and fit under the ceiling. A retry with the same request key answers with the
   * loan it already made, whatever has changed since.
   */
  acceptOffer(prisma: PrismaClient, roundPlayerId: string, input: LoanOfferAcceptInput, now: Date = new Date()) {
    return LoanService.accept(prisma, roundPlayerId, {
      ...input,
      terms: (rules, { current, player, netWorthCents }) => {
        const offer = loanOffers(rules).find((row) => row.key === input.offerKey);
        if (!offer) throw AppError.notFound('LOAN_OFFER_NOT_FOUND', 'The loan shark is not offering that.');
        const refused = loanOfferRefusal(rules, offer, {
          position: { debtCents: current.loanDebtCents, feesAssessedCents: player.loanFeesAssessedCents, ...debtLimits(rules) },
          netWorthCents,
        });
        if (refused) refusal(new LoanError(refused.code, refused.message));
        return loanOfferTerms(offer);
      },
    }, now);
  },

  /**
   * A payment from cash toward one loan: early, partial or a full payoff. A request for more
   * than the payoff amount pays exactly the payoff amount, and an early payoff waives the
   * contract fee not yet earned. Never from another loan's proceeds: it
   * only ever spends the player's cash.
   */
  repay(prisma: PrismaClient, roundPlayerId: string, input: LoanRepayInput, now: Date = new Date()) {
    return ActionService.run<LoanPaymentResult>(prisma, roundPlayerId, {
      action: 'LOAN_PAYMENT',
      idempotencyScope: 'LOAN_PAYMENT',
      actionId: input.actionId,
      execute: async ({ tx, current, player, ruleset, now }) => {
        const rules = loanSharkRules(ruleset);
        if (!rules) throw AppError.notFound('LOAN_SHARK_CLOSED', 'Nobody is lending in this round.');
        assertRequestKey(input.requestKey);
        const paymentKey = `manual:${input.requestKey}`;
        const account = {
          loanDebtCents: current.loanDebtCents,
          loanFeesAssessedCents: player.loanFeesAssessedCents,
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
              loan: loanDto(loan!, now),
              account: loanAccountDto(rules, account),
              kind: prior.kind,
              paidCents: Number(prior.amountCents),
              lateFeeCents: Number(prior.lateFeeCents),
              contractFeeCents: Number(prior.contractFeeCents),
              principalCents: Number(prior.principalCents),
              contractFeeWaivedCents: Number(prior.contractFeeWaivedCents),
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
        // An early payoff owes only the contract fee earned so far.
        const owed = loanPayoff(loan, now);
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
        const debtAfterCents = current.loanDebtCents - applied.debtReductionCents;
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
            loan: loanDto(applied.loan, now),
            account: loanAccountDto(rules, account),
            kind: 'MANUAL' as const,
            paidCents: Number(applied.allocation.appliedCents),
            lateFeeCents: Number(applied.allocation.lateFeeCents),
            contractFeeCents: Number(applied.allocation.contractFeeCents),
            principalCents: Number(applied.allocation.principalCents),
            contractFeeWaivedCents: Number(applied.allocation.contractFeeWaivedCents),
            replayed: false,
          },
          ledger: applied.ledger,
          questProgress: { type: 'LOAN_PAYMENT', payload: { loanId: loan.id, paidOff: applied.allocation.paidOff } },
        };
      },
    }, now);
  },
};
