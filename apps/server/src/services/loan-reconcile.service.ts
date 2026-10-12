import type { Ruleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { LOAN_LEDGER, loanOutstanding } from './loan-ledger.service.js';

/**
 * 1.6.5-A. Read-only proof that a player's loan books agree with themselves and with the
 * cash ledger. An empty list is clean. 1.6.5-F puts this in front of admins.
 *
 * - The player's debt is every loan's outstanding balance, summed.
 * - Debt and assessed fees sit inside the ruleset's limits, unless the ruleset has since
 *   lowered them (then they are reported as over, for an admin to look at).
 * - Each loan's paid and waived columns are its receipts, summed; its installments sum to its terms.
 * - Assessed fees are the fee records, summed, per loan and for the player.
 * - The cash ledger carries every advance and every payment exactly once.
 *
 * 1.6.5-F exploit checks, each a way money could be duplicated or a limit dodged:
 * - every loan was accepted once (one ACCEPTED entry, one advance in the ledger);
 * - every payment is journaled once;
 * - every miss was charged at most one late fee, and every late fee has its miss;
 * - waived late fees match their fee records;
 * - the player's standing agrees with whether anything is missed and still owing.
 */
export async function reconcileLoans(db: Db, roundPlayerId: string, ruleset: Ruleset): Promise<string[]> {
  const problems: string[] = [];
  const [player, loans, payments, fees, ledger, events, proceedsLines] = await Promise.all([
    db.roundPlayer.findUniqueOrThrow({
      where: { id: roundPlayerId },
      select: { loanDebtCents: true, loanFeesAssessedCents: true, loanCollectionState: true },
    }),
    db.loan.findMany({ where: { roundPlayerId }, include: { installments: true } }),
    db.loanPayment.findMany({ where: { roundPlayerId } }),
    db.loanFee.findMany({ where: { roundPlayerId } }),
    db.economyLedgerEntry.groupBy({ by: ['source'], where: { roundPlayerId, source: { startsWith: 'LOAN_' } }, _sum: { amountCents: true } }),
    db.loanEvent.findMany({ where: { roundPlayerId }, select: { kind: true, loanId: true, metadata: true } }),
    db.economyLedgerEntry.count({ where: { roundPlayerId, source: LOAN_LEDGER.PROCEEDS } }),
  ]);
  const meta = (value: unknown, key: string): unknown => (value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined);

  const owed = loans.reduce((sum, loan) => sum + loanOutstanding(loan), 0n);
  if (owed !== player.loanDebtCents) problems.push(`debt ${player.loanDebtCents} is not the loans' outstanding ${owed}`);
  const rules = ruleset.loanShark;
  if (player.loanDebtCents > BigInt(rules?.debtCeilingCents ?? 0)) problems.push('debt is above the ceiling');
  if (player.loanFeesAssessedCents > BigInt(rules?.feeCapCents ?? 0)) problems.push('assessed fees are above the fee cap');
  const feeTotal = fees.reduce((sum, fee) => sum + fee.amountCents, 0n);
  if (feeTotal !== player.loanFeesAssessedCents) problems.push(`assessed fees ${player.loanFeesAssessedCents} are not the fee records ${feeTotal}`);

  for (const loan of loans) {
    const mine = payments.filter((row) => row.loanId === loan.id);
    const sum = (field: 'lateFeeCents' | 'contractFeeCents' | 'principalCents' | 'contractFeeWaivedCents') => mine.reduce((total, row) => total + row[field], 0n);
    if (sum('principalCents') !== loan.principalPaidCents) problems.push(`loan ${loan.id}: principal paid does not match its receipts`);
    if (sum('contractFeeCents') !== loan.contractFeePaidCents) problems.push(`loan ${loan.id}: contract fee paid does not match its receipts`);
    if (sum('lateFeeCents') !== loan.lateFeesPaidCents) problems.push(`loan ${loan.id}: late fees paid do not match its receipts`);
    if (sum('contractFeeWaivedCents') !== loan.contractFeeWaivedCents) problems.push(`loan ${loan.id}: contract fee waived does not match its receipts`);
    const assessed = fees.filter((fee) => fee.loanId === loan.id).reduce((total, fee) => total + fee.amountCents, 0n);
    if (assessed !== loan.lateFeesAssessedCents) problems.push(`loan ${loan.id}: late fees assessed do not match its fee records`);
    const scheduled = loan.installments.reduce((total, row) => ({
      principal: total.principal + row.principalCents,
      fee: total.fee + row.contractFeeCents,
      principalPaid: total.principalPaid + row.principalPaidCents,
      feePaid: total.feePaid + row.contractFeePaidCents,
      feeWaived: total.feeWaived + row.contractFeeWaivedCents,
    }), { principal: 0n, fee: 0n, principalPaid: 0n, feePaid: 0n, feeWaived: 0n });
    if (loan.installments.length !== loan.installmentCount) problems.push(`loan ${loan.id}: has ${loan.installments.length} of ${loan.installmentCount} installments`);
    if (scheduled.principal !== loan.principalCents || scheduled.fee !== loan.contractFeeCents) problems.push(`loan ${loan.id}: installments do not sum to its terms`);
    if (scheduled.principalPaid !== loan.principalPaidCents || scheduled.feePaid !== loan.contractFeePaidCents || scheduled.feeWaived !== loan.contractFeeWaivedCents) problems.push(`loan ${loan.id}: installment payments do not sum to the loan's`);
    if ((loan.status === 'PAID_OFF') !== (loanOutstanding(loan) === 0n)) problems.push(`loan ${loan.id}: status ${loan.status} disagrees with its balance`);

    // 1.6.5-F exploit checks.
    const waived = fees.filter((fee) => fee.loanId === loan.id).reduce((total, fee) => total + fee.waivedCents, 0n);
    if (waived !== loan.lateFeesWaivedCents) problems.push(`loan ${loan.id}: late fees waived do not match its fee records`);
    const accepted = events.filter((event) => event.kind === 'ACCEPTED' && event.loanId === loan.id).length;
    if (accepted !== 1) problems.push(`duplicate: loan ${loan.id} was accepted ${accepted} times in the journal`);
    for (const payment of mine) {
      const journaled = events.filter((event) => event.kind === 'PAYMENT' && meta(event.metadata, 'paymentId') === payment.id).length;
      if (journaled !== 1) problems.push(`duplicate: payment ${payment.id} is journaled ${journaled} times`);
    }
    for (const row of loan.installments) {
      const misses = events.filter((event) => event.kind === 'INSTALLMENT_MISSED' && event.loanId === loan.id && meta(event.metadata, 'sequence') === row.sequence).length;
      const lateFees = fees.filter((fee) => fee.installmentId === row.id && fee.kind === 'LATE').length;
      if (lateFees > misses) problems.push(`duplicate: installment ${row.sequence} of loan ${loan.id} has ${lateFees} late fees for ${misses} misses`);
      if (row.missedAt && misses === 0) problems.push(`loan ${loan.id}: installment ${row.sequence} is marked missed with no miss on record`);
      if (row.status === 'MISSED' && lateFees === 0) problems.push(`loan ${loan.id}: installment ${row.sequence} was missed without a late fee assessment`);
    }
  }

  // A standing that disagrees with the loans is how a delinquency could be dodged.
  const missedOwing = loans.some((loan) => loan.installments.some((row) => row.status === 'MISSED'));
  const behind = player.loanCollectionState === 'DELINQUENT' || player.loanCollectionState === 'COLLECTIONS';
  if (missedOwing !== behind) problems.push(`standing ${player.loanCollectionState} disagrees with ${missedOwing ? 'missed installments still owing' : 'nothing missed'}`);
  if (proceedsLines !== loans.length) problems.push(`duplicate: ${proceedsLines} advances in the ledger for ${loans.length} loans`);

  const bySource = new Map(ledger.map((row) => [row.source, row._sum.amountCents ?? 0n]));
  const proceeds = loans.reduce((sum, loan) => sum + loan.principalCents, 0n);
  if ((bySource.get(LOAN_LEDGER.PROCEEDS) ?? 0n) !== proceeds) problems.push('ledger proceeds do not match the loans advanced');
  const paidOut = -[LOAN_LEDGER.PRINCIPAL, LOAN_LEDGER.CONTRACT_FEE, LOAN_LEDGER.LATE_FEE, LOAN_LEDGER.COLLECTION]
    .reduce((sum, source) => sum + (bySource.get(source) ?? 0n), 0n);
  const receipts = payments.reduce((sum, row) => sum + row.amountCents, 0n);
  if (paidOut !== receipts) problems.push(`ledger payments ${paidOut} do not match the receipts ${receipts}`);
  return problems;
}
