import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV16H, classicOgV165A, type Ruleset } from '@streets/rulesets';
import { calculateNetWorthCents, startingStock } from '@streets/rules-engine';
import { LoanService } from '../loan.service.js';
import { LoanSettleService } from '../loan-settle.service.js';
import { reconcileLoans } from '../loan-reconcile.service.js';
import { ReputationService } from '../reputation.service.js';
import { lockRoundPlayer } from '../../utils/db.js';

const rules = classicOgV165A.loanShark;
const HOUR = 3_600_000;
const terms = (principal: bigint, fee: bigint, installmentCount = 2) => ({ principalCents: principal, contractFeeCents: fee, installmentCount });

describe.runIf(process.env.LOAN_INTEGRATION === '1')('1.6.5-A loan shark debt foundation with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];

  async function fixture(ruleset: Ruleset = classicOgV165A, cashCents = 1_000_000n): Promise<string> {
    const round = await app.prisma.round.create({
      data: {
        name: 'Loan A fixture',
        slug: `loan-a-${randomUUID()}`,
        rulesetId: ruleset.meta.id,
        rulesetVersion: ruleset.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    roundIds.push(round.id);
    const cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } })).id;
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...ruleset.round.startingPlayer,
        ...startingStock(ruleset),
        cashCents,
        roundId: round.id,
        accountId,
        cityId,
        displayName: `loan-${round.id.slice(-6)}`,
        publicPimpId: 8800,
        reputation: { create: ReputationService.seedFor(ruleset) },
      },
    });
    return player.id;
  }

  const settle = (playerId: string, now: Date) => app.prisma.$transaction(async (tx) => {
    await lockRoundPlayer(tx, playerId);
    return LoanSettleService.settle(tx, playerId, classicOgV165A, now);
  });
  const player = (playerId: string) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
  const ledger = (playerId: string, source: string) => app.prisma.economyLedgerEntry.findMany({ where: { roundPlayerId: playerId, source } });
  const accept = (playerId: string, requestKey: string, loanTerms = terms(1_000_000n, 200_000n), actionId?: string) =>
    LoanService.accept(app.prisma, playerId, { requestKey, offerKey: 'TEST', terms: loanTerms, ...(actionId ? { actionId } : {}) });

  beforeAll(async () => {
    app = await (await import('../../app.js')).buildApp();
    const name = `loan_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() },
    });
    accountId = registered.json().account.id;
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('credits a loan once, reserves its whole obligation, and replays retries', async () => {
    const id = await fixture();
    const before = await player(id);
    const first = await accept(id, 'first', terms(1_000_001n, 200_003n, 3), randomUUID());
    expect(first.result).toMatchObject({ creditedCents: 1_000_001, replayed: false });
    expect(first.result.loan.installments).toHaveLength(3);
    expect(first.result.account).toMatchObject({ debtCents: 1_200_004, debtCeilingCents: rules.debtCeilingCents, feeCapCents: rules.feeCapCents });

    // Same request key, new action id: the same loan, no second advance.
    const again = await accept(id, 'first', terms(1_000_001n, 200_003n, 3), randomUUID());
    expect(again.result).toMatchObject({ replayed: true, creditedCents: 0, loan: { id: first.result.loan.id } });
    // Same key, different terms: refused, not a second loan.
    await expect(accept(id, 'first', terms(5n, 0n, 1))).rejects.toMatchObject({ code: 'LOAN_REQUEST_KEY_REUSED' });

    const after = await player(id);
    expect(after.cashCents - before.cashCents).toBe(1_000_001n);
    expect(after.loanDebtCents).toBe(1_200_004n);
    expect(await app.prisma.loan.count({ where: { roundPlayerId: id } })).toBe(1);
    expect(await ledger(id, 'LOAN_PROCEEDS')).toHaveLength(1);
    // Borrowing never buys rank: the advance comes back off as debt, and the fee with it.
    const worth = (row: typeof after) => calculateNetWorthCents({ ...row, products: {} }, classicOgV165A);
    expect(after.netWorthCents).toBe(worth(after));
    expect(worth(after)).toBeLessThan(worth(before));
    expect(await reconcileLoans(app.prisma as never, id)).toEqual([]);
  });

  it('never lets stacked or parallel loans pass the ceiling', async () => {
    const id = await fixture();
    const big = terms(3_000_000n, 1_000_000n, 4);
    const fits = Math.floor(rules.debtCeilingCents / 4_000_000);
    const results = await Promise.allSettled(Array.from({ length: fits + 3 }, (_, index) => accept(id, `stack-${index}`, big)));
    const accepted = results.filter((result) => result.status === 'fulfilled');
    const refused = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(accepted).toHaveLength(fits);
    for (const result of refused) expect(result.reason).toMatchObject({ code: 'LOAN_DEBT_CEILING' });
    const after = await player(id);
    expect(after.loanDebtCents).toBe(BigInt(fits) * 4_000_000n);
    expect(after.loanDebtCents).toBeLessThanOrEqual(after.loanDebtCeilingCents);
    // The database refuses it too, whatever path tried.
    await expect(app.prisma.roundPlayer.update({ where: { id }, data: { loanDebtCents: after.loanDebtCeilingCents + 1n } })).rejects.toThrow();
    expect(await reconcileLoans(app.prisma as never, id)).toEqual([]);
  });

  it('refuses terms the ruleset would never quote', async () => {
    const id = await fixture();
    await expect(accept(id, 'greedy', terms(100n, 41n, 1))).rejects.toMatchObject({ code: 'LOAN_TERMS_INVALID' });
    await expect(accept(id, 'long', terms(100n, 0n, rules.maxInstallments + 1))).rejects.toMatchObject({ code: 'LOAN_TERMS_INVALID' });
    expect(await app.prisma.loan.count({ where: { roundPlayerId: id } })).toBe(0);
  });

  it('collects due installments on the server clock exactly once', async () => {
    const id = await fixture();
    const { result } = await accept(id, 'scheduled', terms(1_000_000n, 200_000n, 2));
    const acceptedAt = new Date(result.loan.acceptedAt).getTime();

    // Not due yet: nothing happens.
    expect(await settle(id, new Date(acceptedAt + rules.installmentIntervalHours * HOUR - 1))).toBeNull();

    const due = new Date(acceptedAt + rules.installmentIntervalHours * HOUR);
    const cashBefore = (await player(id)).cashCents;
    await settle(id, due);
    await settle(id, due);
    await settle(id, new Date(due.getTime() + 60_000));
    const after = await player(id);
    expect(cashBefore - after.cashCents).toBe(600_000n);
    expect(after.loanDebtCents).toBe(600_000n);
    const payments = await app.prisma.loanPayment.findMany({ where: { roundPlayerId: id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ kind: 'SCHEDULED', amountCents: 600_000n, contractFeeCents: 100_000n, principalCents: 500_000n });
    expect((await ledger(id, 'LOAN_PRINCIPAL')).map((row) => row.amountCents)).toEqual([-500_000n]);
    expect((await ledger(id, 'LOAN_CONTRACT_FEE')).map((row) => row.amountCents)).toEqual([-100_000n]);

    // The last installment pays it off.
    await settle(id, new Date(acceptedAt + 2 * rules.installmentIntervalHours * HOUR));
    const loan = await app.prisma.loan.findUniqueOrThrow({ where: { id: result.loan.id } });
    expect(loan.status).toBe('PAID_OFF');
    expect((await player(id)).loanDebtCents).toBe(0n);
    expect(await reconcileLoans(app.prisma as never, id)).toEqual([]);
  });

  it('records a missed installment once, charges one capped late fee, and recovers on payment', async () => {
    const id = await fixture(classicOgV165A, 0n);
    const { result } = await accept(id, 'missed', terms(1_000_000n, 200_000n, 2));
    // Spend the advance so the installment cannot be covered.
    await app.prisma.roundPlayer.update({ where: { id }, data: { cashCents: 0n } });
    const due = new Date(new Date(result.loan.acceptedAt).getTime() + rules.installmentIntervalHours * HOUR);
    await settle(id, due);
    await settle(id, due);
    await settle(id, new Date(due.getTime() + HOUR));

    let state = await player(id);
    expect(state.loanCollectionState).toBe('DELINQUENT');
    expect(state.loanFeesAssessedCents).toBe(BigInt(rules.lateFeeCents));
    expect(state.loanDebtCents).toBe(1_200_000n + BigInt(rules.lateFeeCents));
    expect(await app.prisma.loanFee.count({ where: { roundPlayerId: id } })).toBe(1);
    expect(await app.prisma.loanEvent.count({ where: { roundPlayerId: id, kind: 'INSTALLMENT_MISSED' } })).toBe(1);
    const missed = await app.prisma.loanInstallment.findFirstOrThrow({ where: { loanId: result.loan.id, sequence: 1 } });
    expect(missed).toMatchObject({ status: 'MISSED', missedAt: due });

    // A manual payment clears the late fee first, then the missed installment.
    await app.prisma.roundPlayer.update({ where: { id }, data: { cashCents: 1_000_000n } });
    const paid = await LoanService.repay(app.prisma, id, { requestKey: 'catch-up', loanId: result.loan.id, amountCents: BigInt(rules.lateFeeCents) + 600_000n });
    expect(paid.result).toMatchObject({ lateFeeCents: rules.lateFeeCents, contractFeeCents: 100_000, principalCents: 500_000, replayed: false });
    expect(paid.result.account.collectionState).toBe('CLEAR');
    state = await player(id);
    expect(state.loanCollectionState).toBe('CLEAR');
    expect(state.loanDebtCents).toBe(600_000n);
    expect((await app.prisma.loan.findUniqueOrThrow({ where: { id: result.loan.id } })).status).toBe('ACTIVE');
    expect(await reconcileLoans(app.prisma as never, id)).toEqual([]);
  });

  it('keeps fees under every cap however many installments are missed', async () => {
    const id = await fixture(classicOgV165A, 0n);
    for (let index = 0; index < 4; index += 1) await accept(id, `deep-${index}`, terms(2_000_000n, 800_000n, rules.maxInstallments));
    await app.prisma.roundPlayer.update({ where: { id }, data: { cashCents: 0n } });
    await settle(id, new Date(Date.now() + 365 * 86_400_000));
    const state = await player(id);
    expect(await app.prisma.loanInstallment.count({ where: { roundPlayerId: id, status: 'MISSED' } })).toBe(4 * rules.maxInstallments);
    expect(state.loanFeesAssessedCents).toBeLessThanOrEqual(state.loanFeeCapCents);
    expect(state.loanDebtCents).toBeLessThanOrEqual(state.loanDebtCeilingCents);
    for (const loan of await app.prisma.loan.findMany({ where: { roundPlayerId: id } })) {
      expect(loan.lateFeesAssessedCents).toBeLessThanOrEqual(loan.lateFeeCapCents);
    }
    expect(state.loanFeesAssessedCents).toBe(BigInt(Math.min(rules.feeCapCents, 4 * rules.lateFeeCapPerLoanCents)));
    // Settling again finds nothing new to charge.
    expect(await settle(id, new Date(Date.now() + 400 * 86_400_000))).toBeNull();
    expect(await reconcileLoans(app.prisma as never, id)).toEqual([]);
  });

  it('pays partly, early and off from cash only, once per request', async () => {
    const id = await fixture(classicOgV165A, 0n);
    const { result } = await accept(id, 'manual', terms(1_000_000n, 100_000n, 2));
    const loanId = result.loan.id;

    const actionId = randomUUID();
    const part = await LoanService.repay(app.prisma, id, { actionId, requestKey: 'part', loanId, amountCents: 30_000n });
    // The fee share of the first installment goes before its principal.
    expect(part.result).toMatchObject({ paidCents: 30_000, contractFeeCents: 30_000, principalCents: 0 });
    const replay = await LoanService.repay(app.prisma, id, { requestKey: 'part', loanId, amountCents: 30_000n });
    expect(replay.result).toMatchObject({ replayed: true, paidCents: 30_000 });
    const sameAction = await LoanService.repay(app.prisma, id, { actionId, requestKey: 'part', loanId, amountCents: 30_000n });
    expect(sameAction.result.replayed).toBe(false);
    expect(await app.prisma.loanPayment.count({ where: { roundPlayerId: id } })).toBe(1);

    await expect(LoanService.repay(app.prisma, id, { requestKey: 'zero', loanId, amountCents: 0n })).rejects.toMatchObject({ code: 'LOAN_PAYMENT_AMOUNT' });
    await app.prisma.roundPlayer.update({ where: { id }, data: { cashCents: 5_000n } });
    await expect(LoanService.repay(app.prisma, id, { requestKey: 'broke', loanId, amountCents: 50_000n })).rejects.toMatchObject({ code: 'NOT_ENOUGH_CASH' });

    // Asking for more than is owed pays exactly what is owed.
    await app.prisma.roundPlayer.update({ where: { id }, data: { cashCents: 5_000_000n } });
    const off = await LoanService.repay(app.prisma, id, { requestKey: 'off', loanId, amountCents: 9_999_999n });
    expect(off.result.paidCents).toBe(1_100_000 - 30_000);
    expect(off.result.loan).toMatchObject({ status: 'PAID_OFF', outstandingCents: 0 });
    const state = await player(id);
    expect(state.cashCents).toBe(5_000_000n - 1_070_000n);
    expect(state.loanDebtCents).toBe(0n);
    await expect(LoanService.repay(app.prisma, id, { requestKey: 'again', loanId, amountCents: 1n })).rejects.toMatchObject({ code: 'LOAN_PAID_OFF' });
    // Nothing is left for the clock to collect.
    expect(await settle(id, new Date(Date.now() + 30 * 86_400_000))).toBeNull();
    expect(await app.prisma.loanPayment.count({ where: { roundPlayerId: id } })).toBe(2);
    expect(await reconcileLoans(app.prisma as never, id)).toEqual([]);
  });

  it('settles due installments inside the action pipeline', async () => {
    const id = await fixture();
    const { result } = await accept(id, 'pipeline', terms(1_000_000n, 0n, 1));
    await app.prisma.loanInstallment.updateMany({ where: { loanId: result.loan.id }, data: { dueAt: new Date(Date.now() - 60_000) } });
    // Any action settles the clock first; this one is a second loan.
    await accept(id, 'pipeline-2', terms(100_000n, 0n, 1));
    expect((await app.prisma.loan.findUniqueOrThrow({ where: { id: result.loan.id } })).status).toBe('PAID_OFF');
    expect((await player(id)).loanDebtCents).toBe(100_000n);
    expect(await reconcileLoans(app.prisma as never, id)).toEqual([]);
  });

  it('leaves rounds pinned before 1.6.5 without a loan shark', async () => {
    const id = await fixture(classicOgV16H);
    await expect(accept(id, 'old')).rejects.toMatchObject({ code: 'LOAN_SHARK_CLOSED' });
    const state = await player(id);
    expect(state).toMatchObject({ loanDebtCents: 0n, loanDebtCeilingCents: 0n, loanCollectionState: 'CLEAR' });
    expect(await app.prisma.$transaction((tx) => LoanSettleService.settle(tx, id, classicOgV16H, new Date()))).toBeNull();
  });
});
