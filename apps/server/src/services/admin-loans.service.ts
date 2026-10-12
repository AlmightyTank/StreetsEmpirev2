import type { LoanCollectionState, PrismaClient } from '@prisma/client';
import { debtUtilizationPercent, loadRulesetForRound, loanSharkRules } from '@streets/rules-engine';
import type { AdminLoanPlayerDto, AdminLoansDto, AdminPlayerRefDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { loanAccountDto, loanDto, loanOfferName, loanOverdue } from './loan-ledger.service.js';
import { reconcileLoans } from './loan-reconcile.service.js';
import { loanHistoryLabel } from './loan-shark.service.js';

/**
 * 1.6.5-F. Read-only operator views of the loan shark: a round's debt, standings, fees and
 * collections with every borrower reconciled and exploit-checked, and one player's contracts,
 * schedules, payments, fees, journal and cash ledger in full. Corrections live in
 * `AdminLoanCorrectionService`.
 */

const playerSelect = { id: true, displayName: true, publicPimpId: true, accountId: true } as const;
const playerRef = (row: { id: string; displayName: string; publicPimpId: number; accountId: string }): AdminPlayerRefDto => ({
  id: row.id, displayName: row.displayName, publicPimpId: row.publicPimpId, accountId: row.accountId,
});

/** Borrowers checked in full per report; the rest are counted in the totals. */
const CHECK_LIMIT = 500;
const JOURNAL_LIMIT = 100;
const DAY_MS = 86_400_000;

export const AdminLoansService = {
  async report(prisma: PrismaClient, roundId: string, now = new Date()): Promise<AdminLoansDto> {
    const round = await prisma.round.findUnique({ where: { id: roundId } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    const ruleset = loadRulesetForRound(round);
    const rules = loanSharkRules(ruleset);
    const inRound = { roundPlayer: { roundId } };

    const [borrowers, loanCounts, sums, paidByKind, garnished, waivedFees, events] = await Promise.all([
      prisma.roundPlayer.findMany({
        where: { roundId, loans: { some: {} } },
        orderBy: [{ loanDebtCents: 'desc' }, { id: 'asc' }],
        take: CHECK_LIMIT,
        select: {
          ...playerSelect, loanDebtCents: true, loanFeesAssessedCents: true, loanCollectionState: true, loanRecoveryNeeded: true,
          loans: { include: { installments: true } },
        },
      }),
      prisma.loan.groupBy({ by: ['status'], where: inRound, _count: { _all: true } }),
      prisma.loan.aggregate({ where: inRound, _sum: { principalCents: true, lateFeesAssessedCents: true, contractFeeWaivedCents: true } }),
      prisma.loanPayment.groupBy({ by: ['kind'], where: inRound, _sum: { amountCents: true } }),
      prisma.loanPayment.aggregate({ where: { ...inRound, kind: 'COLLECTION', createdAt: { gt: new Date(now.getTime() - DAY_MS) } }, _sum: { amountCents: true } }),
      prisma.loan.aggregate({ where: inRound, _sum: { lateFeesWaivedCents: true } }),
      prisma.loanEvent.findMany({
        where: inRound,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: JOURNAL_LIMIT,
        include: { roundPlayer: { select: playerSelect }, loan: { select: { offerKey: true } } },
      }),
    ]);
    const [debtTotal, standingRows, borrowerCount] = await Promise.all([
      prisma.roundPlayer.aggregate({ where: { roundId }, _sum: { loanDebtCents: true } }),
      prisma.roundPlayer.groupBy({ by: ['loanCollectionState'], where: { roundId, loans: { some: {} } }, _count: { _all: true } }),
      prisma.roundPlayer.count({ where: { roundId, loans: { some: {} } } }),
    ]);

    const statusCount = (status: string) => loanCounts.find((row) => row.status === status)?._count._all ?? 0;
    const standings: Record<LoanCollectionState, number> = { CLEAR: 0, DELINQUENT: 0, COLLECTIONS: 0, RECOVERING: 0 };
    for (const row of standingRows) standings[row.loanCollectionState] = row._count._all;
    const paid = (kind: string) => Number(paidByKind.find((row) => row.kind === kind)?._sum.amountCents ?? 0n);

    const problems: AdminLoansDto['problems'] = [];
    const players: AdminLoansDto['players'] = [];
    for (const row of borrowers) {
      const found = await reconcileLoans(prisma as never, row.id, ruleset);
      if (found.length) problems.push({ player: playerRef(row), problems: found });
      const active = row.loans.filter((loan) => loan.status !== 'PAID_OFF');
      players.push({
        player: playerRef(row),
        debtCents: Number(row.loanDebtCents),
        ceilingUsePercent: rules ? debtUtilizationPercent({ debtCents: row.loanDebtCents, ceilingCents: BigInt(rules.debtCeilingCents) }) : 0,
        feesAssessedCents: Number(row.loanFeesAssessedCents),
        standing: row.loanCollectionState,
        recoveryNeeded: row.loanRecoveryNeeded,
        activeLoans: active.length,
        delinquentLoans: row.loans.filter((loan) => loan.status === 'DELINQUENT').length,
        missedInstallments: row.loans.reduce((sum, loan) => sum + loan.installments.filter((item) => item.status === 'MISSED').length, 0),
        overdueCents: Number(active.reduce((sum, loan) => sum + loanOverdue(loan, now), 0n)),
        problems: found.length,
      });
    }

    return {
      round: { id: round.id, name: round.name, status: round.status, rulesetId: round.rulesetId },
      enabled: Boolean(rules),
      limits: rules ? {
        debtCeilingCents: rules.debtCeilingCents,
        feeCapCents: rules.feeCapCents,
        lateFeeCents: rules.lateFeeCents,
        lateFeeCapPerLoanCents: rules.lateFeeCapPerLoanCents,
        collections: rules.collections ? {
          missedInstallmentsThreshold: rules.collections.missedInstallmentsThreshold,
          garnishPercent: rules.collections.garnishPercent,
          garnishCapPerDayCents: rules.collections.garnishCapPerDayCents,
          recoveryOnTimeInstallments: rules.collections.recoveryOnTimeInstallments,
        } : null,
      } : null,
      totals: {
        borrowers: borrowerCount,
        loans: loanCounts.reduce((sum, row) => sum + row._count._all, 0),
        activeLoans: statusCount('ACTIVE') + statusCount('DELINQUENT'),
        delinquentLoans: statusCount('DELINQUENT'),
        paidOffLoans: statusCount('PAID_OFF'),
        debtCents: Number(debtTotal._sum.loanDebtCents ?? 0n),
        principalAdvancedCents: Number(sums._sum.principalCents ?? 0n),
        lateFeesAssessedCents: Number(sums._sum.lateFeesAssessedCents ?? 0n),
        lateFeesWaivedCents: Number(waivedFees._sum.lateFeesWaivedCents ?? 0n),
        contractFeeWaivedCents: Number(sums._sum.contractFeeWaivedCents ?? 0n),
        paidCents: { SCHEDULED: paid('SCHEDULED'), MANUAL: paid('MANUAL'), COLLECTION: paid('COLLECTION') },
        garnished24hCents: Number(garnished._sum.amountCents ?? 0n),
        standings,
      },
      players,
      checkedPlayers: borrowers.length,
      problems,
      journal: events.map((event) => {
        const offerName = event.loan ? loanOfferName(rules, event.loan.offerKey) : null;
        return {
          id: event.id,
          kind: event.kind,
          loanId: event.loanId,
          offerName,
          label: loanHistoryLabel(event, offerName),
          debtDeltaCents: Number(event.debtDeltaCents),
          debtAfterCents: Number(event.debtAfterCents),
          createdAt: event.createdAt.toISOString(),
          player: playerRef(event.roundPlayer),
        };
      }),
    };
  },

  async player(prisma: PrismaClient, roundPlayerId: string, now = new Date()): Promise<AdminLoanPlayerDto> {
    const player = await prisma.roundPlayer.findUnique({
      where: { id: roundPlayerId },
      select: {
        ...playerSelect, loanDebtCents: true, loanFeesAssessedCents: true, loanCollectionState: true, loanRecoveryNeeded: true,
        round: true,
      },
    });
    if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player does not exist.');
    const ruleset = loadRulesetForRound(player.round);
    const rules = loanSharkRules(ruleset);
    const [loans, payments, fees, events, ledger, problems] = await Promise.all([
      prisma.loan.findMany({ where: { roundPlayerId }, include: { installments: { orderBy: { sequence: 'asc' } } }, orderBy: [{ acceptedAt: 'asc' }, { id: 'asc' }] }),
      prisma.loanPayment.findMany({ where: { roundPlayerId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      prisma.loanFee.findMany({ where: { roundPlayerId }, include: { installment: { select: { sequence: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      prisma.loanEvent.findMany({ where: { roundPlayerId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      prisma.economyLedgerEntry.findMany({ where: { roundPlayerId, source: { startsWith: 'LOAN_' } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 200 }),
      reconcileLoans(prisma as never, roundPlayerId, ruleset),
    ]);
    const offerOf = new Map(loans.map((loan) => [loan.id, loanOfferName(rules, loan.offerKey)]));

    return {
      player: playerRef(player),
      round: { id: player.round.id, name: player.round.name, status: player.round.status, rulesetId: player.round.rulesetId },
      frozen: player.round.status !== 'ACTIVE' && player.round.status !== 'REGISTRATION',
      account: rules ? loanAccountDto(rules, player) : null,
      loans: loans.map((loan) => ({ ...loanDto(loan, now), offerName: offerOf.get(loan.id) ?? 'Loan', rulesetId: loan.rulesetId, rulesetVersion: loan.rulesetVersion })),
      payments: payments.map((row) => ({
        id: row.id,
        loanId: row.loanId,
        offerName: offerOf.get(row.loanId) ?? 'Loan',
        kind: row.kind,
        paidCents: Number(row.amountCents),
        lateFeeCents: Number(row.lateFeeCents),
        contractFeeCents: Number(row.contractFeeCents),
        principalCents: Number(row.principalCents),
        contractFeeWaivedCents: Number(row.contractFeeWaivedCents),
        debtAfterCents: Number(row.debtAfterCents),
        createdAt: row.createdAt.toISOString(),
      })),
      fees: fees.map((row) => ({
        id: row.id,
        loanId: row.loanId,
        offerName: offerOf.get(row.loanId) ?? 'Loan',
        installmentId: row.installmentId,
        sequence: row.installment?.sequence ?? null,
        kind: row.kind,
        amountCents: Number(row.amountCents),
        quotedCents: Number(row.quotedCents),
        waivedCents: Number(row.waivedCents),
        waivedAt: row.waivedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      journal: events.map((event) => {
        const offerName = event.loanId ? offerOf.get(event.loanId) ?? null : null;
        return {
          id: event.id,
          kind: event.kind,
          loanId: event.loanId,
          offerName,
          label: loanHistoryLabel(event, offerName),
          debtDeltaCents: Number(event.debtDeltaCents),
          debtAfterCents: Number(event.debtAfterCents),
          createdAt: event.createdAt.toISOString(),
        };
      }),
      ledger: ledger.map((row) => ({ id: row.id, source: row.source, label: row.label, amountCents: Number(row.amountCents), createdAt: row.createdAt.toISOString() })),
      problems,
    };
  },
};
