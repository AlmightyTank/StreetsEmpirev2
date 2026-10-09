import type { LoanEvent, PrismaClient, RoundPlayer } from '@prisma/client';
import {
  buildInstallmentSchedule,
  debtLimits,
  debtRoomCents,
  loanOfferRefusal,
  loanOfferTerms,
  loanOffers,
  loanPayoffCents,
  loanSharkRules,
  priceLoanOffer,
  debtUtilizationPercent,
  type Ruleset,
} from '@streets/rules-engine';
import type { LoanCreditDto, LoanHistoryDto, LoanOfferDto, LoanSharkPageDto } from '@streets/shared';
import { countMissedInstallments } from './loan.service.js';
import { installmentDue, lateFeesDueCents, loanAccountDto, loanDto, loanFeeBudget } from './loan-ledger.service.js';

/**
 * 1.6.5-B. The Loan Shark page: every fixed offer quoted against the player's debt as it
 * stands, with the full cost, schedule, late-fee terms and room under the ceiling, and why
 * any offer is out of reach. Then what the player owes, when it falls due, and what has
 * happened. Read-only: the route settles the player first, so due installments are in.
 */

const HISTORY_LIMIT = 25;
const CLOSED_LIMIT = 10;

const money = (cents: bigint | number): string => `$${(Number(cents) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

function numberAt(metadata: unknown, key: string): number | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : null;
}

function stringAt(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

/** One journal line in words. */
export function loanHistoryLabel(event: Pick<LoanEvent, 'kind' | 'metadata'>, offerName: string | null): string {
  const name = offerName ?? 'loan';
  const meta = event.metadata;
  switch (event.kind) {
    case 'ACCEPTED':
      return `Borrowed ${money(numberAt(meta, 'principalCents') ?? 0)} · ${name}`;
    case 'PAYMENT': {
      const waived = numberAt(meta, 'contractFeeWaivedCents') ?? 0;
      const base = stringAt(meta, 'kind') === 'SCHEDULED' ? 'Installment collected' : 'Payment';
      return waived > 0 ? `${base} · ${name} · ${money(waived)} of unearned fee waived` : `${base} · ${name}`;
    }
    case 'INSTALLMENT_MISSED': {
      const sequence = numberAt(meta, 'sequence');
      const short = numberAt(meta, 'shortCents');
      return `${sequence ? `Installment ${sequence}` : 'Installment'} missed · ${name}${short ? ` · ${money(short)} short` : ''}`;
    }
    case 'FEE_ASSESSED':
      return meta && (meta as Record<string, unknown>).capped === true ? `Late fee (capped) · ${name}` : `Late fee · ${name}`;
    case 'PAID_OFF':
      return meta && (meta as Record<string, unknown>).early === true ? `Paid off early · ${name}` : `Paid off · ${name}`;
    case 'COLLECTION_CHANGED': {
      const to = stringAt(meta, 'to');
      if (to === 'CLEAR') return 'Back in good standing';
      if (to === 'COLLECTIONS') return 'Sent to collections';
      return 'Marked delinquent';
    }
  }
}

export const LoanSharkService = {
  async page(prisma: PrismaClient, ruleset: Ruleset, player: RoundPlayer, now: Date): Promise<LoanSharkPageDto> {
    const rules = loanSharkRules(ruleset);
    const base = { cashCents: Number(player.cashCents), netWorthCents: Number(player.netWorthCents) };
    if (!rules) return { enabled: false, account: null, credit: null, ...base, offers: [], activeLoans: [], closedLoans: [], history: [] };

    const [loans, events, missedInstallments] = await Promise.all([
      prisma.loan.findMany({
        where: { roundPlayerId: player.id },
        include: { installments: { orderBy: { sequence: 'asc' } } },
        orderBy: [{ acceptedAt: 'asc' }, { id: 'asc' }],
      }),
      prisma.loanEvent.findMany({
        where: { roundPlayerId: player.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: HISTORY_LIMIT,
      }),
      countMissedInstallments(prisma, player.id),
    ]);

    const catalog = loanOffers(rules);
    const offerName = (key: string): string => catalog.find((offer) => offer.key === key)?.name ?? 'Loan';
    const limits = debtLimits(rules);
    const position = { debtCents: player.loanDebtCents, feesAssessedCents: player.loanFeesAssessedCents, ...limits };

    // 1.6.5-C: each offer priced for this player as they stand, exactly as acceptance prices it.
    const offers: LoanOfferDto[] = catalog.map((offer) => {
      const priced = priceLoanOffer(rules, offer, { position, missedInstallments });
      const terms = loanOfferTerms(offer, priced.contractFeeCents);
      const obligation = terms.principalCents + terms.contractFeeCents;
      const schedule = buildInstallmentSchedule(terms, rules.installmentIntervalHours, now);
      const refused = loanOfferRefusal(rules, offer, { position, netWorthCents: player.netWorthCents, contractFeeCents: priced.contractFeeCents });
      const debtAfter = position.debtCents + obligation;
      return {
        key: offer.key,
        name: offer.name,
        description: offer.description,
        principalCents: offer.principalCents,
        contractFeeCents: Number(priced.contractFeeCents),
        obligationCents: Number(obligation),
        feePercent: Math.round((Number(priced.contractFeeCents) / offer.principalCents) * 1000) / 10,
        pricing: {
          baseFeeCents: Number(priced.baseFeeCents),
          utilizationPercent: priced.utilizationPercent,
          tierLabel: priced.tierLabel,
          tierSurchargePercent: priced.tierSurchargePercent,
          missedInstallments: priced.missedInstallments,
          historySurchargePercent: priced.historySurchargePercent,
          surchargeCents: Number(priced.surchargeCents),
          capped: priced.capped,
        },
        installmentCount: offer.installmentCount,
        installmentIntervalHours: rules.installmentIntervalHours,
        installments: schedule.map((row) => ({
          sequence: row.sequence,
          dueAfterHours: row.sequence * rules.installmentIntervalHours,
          amountCents: Number(row.amountCents),
        })),
        lateFeeCents: rules.lateFeeCents,
        lateFeeCapCents: rules.lateFeeCapPerLoanCents,
        minNetWorthCents: offer.minNetWorthCents ?? null,
        debtAfterCents: Number(debtAfter),
        availableAfterCents: Number(debtRoomCents({ debtCents: debtAfter, ceilingCents: limits.ceilingCents })),
        available: refused === null,
        unavailableReason: refused?.message ?? null,
      };
    });

    const activeLoans = loans.filter((loan) => loan.status !== 'PAID_OFF').map((loan) => {
      const next = loan.installments.find((row) => row.status === 'SCHEDULED');
      // What the server will collect at the next due time: late fees, anything missed, and it.
      const nextDueCents = next
        ? loanPayoffCents(
          lateFeesDueCents(loan),
          loan.installments.filter((row) => row.sequence <= next.sequence).map(installmentDue),
          loanFeeBudget(loan, next.dueAt),
        )
        : 0n;
      return {
        ...loanDto(loan, now),
        offerName: offerName(loan.offerKey),
        nextDueAt: next?.dueAt.toISOString() ?? null,
        nextDueCents: Number(nextDueCents),
      };
    });
    const closedLoans = loans.filter((loan) => loan.status === 'PAID_OFF')
      .sort((a, b) => (b.paidOffAt?.getTime() ?? 0) - (a.paidOffAt?.getTime() ?? 0))
      .slice(0, CLOSED_LIMIT)
      .map((loan) => ({ ...loanDto(loan, now), offerName: offerName(loan.offerKey) }));

    const loanOffer = new Map(loans.map((loan) => [loan.id, offerName(loan.offerKey)]));
    const history: LoanHistoryDto[] = events.map((event) => {
      const name = event.loanId ? loanOffer.get(event.loanId) ?? null : null;
      return {
        id: event.id,
        kind: event.kind,
        loanId: event.loanId,
        offerName: name,
        label: loanHistoryLabel(event, name),
        debtDeltaCents: Number(event.debtDeltaCents),
        debtAfterCents: Number(event.debtAfterCents),
        createdAt: event.createdAt.toISOString(),
      };
    });

    let credit: LoanCreditDto | null = null;
    if (rules.pricing) {
      const utilizationPercent = debtUtilizationPercent(position);
      const tiers = rules.pricing.utilizationTiers;
      const reached = [...tiers].reverse().find((tier) => utilizationPercent >= tier.fromPercent) ?? null;
      const next = tiers.find((tier) => tier.fromPercent > utilizationPercent) ?? null;
      credit = {
        utilizationPercent,
        tierLabel: reached?.label ?? null,
        tierSurchargePercent: reached?.surchargePercent ?? 0,
        missedInstallments,
        historySurchargePercent: Math.min(rules.pricing.maxHistorySurchargePercent, missedInstallments * rules.pricing.missedInstallmentSurchargePercent),
        nextTier: next ? { label: next.label, fromPercent: next.fromPercent, surchargePercent: next.surchargePercent } : null,
        maxFeePercent: rules.maxContractFeePercent,
      };
    }

    return {
      enabled: true,
      account: loanAccountDto(rules, player),
      credit,
      ...base,
      offers,
      activeLoans,
      closedLoans,
      history,
    };
  },
};
