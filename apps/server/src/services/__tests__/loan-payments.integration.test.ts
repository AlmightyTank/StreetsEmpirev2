import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV165C } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { GameActionResult, LoanAcceptResult, LoanPaymentPreviewDto, LoanPaymentResult, LoanSharkPageDto } from '@streets/shared';
import { RoundService } from '../round.service.js';
import { ReputationService } from '../reputation.service.js';
import { reconcileLoans } from '../loan-reconcile.service.js';

const rules = classicOgV165C.loanShark;
const HOUR = 3_600_000;
const quick = rules.offers[0]!;

/**
 * 1.6.5-D release gate, over HTTP: a loan can be paid early, partly or on schedule; a missed
 * installment is recorded once; no settlement takes more than is owed; every payment matches
 * its preview and its receipt; and all cash reconciles.
 */
describe.runIf(process.env.LOAN_INTEGRATION === '1')('1.6.5-D repayment and delinquency with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  let cookie = '';
  const roundIds: string[] = [];

  async function fixture(cashCents = 0n): Promise<string> {
    const round = await app.prisma.round.create({
      data: {
        name: 'Loan D fixture',
        slug: `loan-d-${randomUUID()}`,
        rulesetId: classicOgV165C.meta.id,
        rulesetVersion: classicOgV165C.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    roundIds.push(round.id);
    vi.spyOn(RoundService, 'requireCurrent').mockResolvedValue(round);
    const cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: classicOgV165C.round.startingCitySlug } })).id;
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...classicOgV165C.round.startingPlayer,
        ...startingStock(classicOgV165C),
        cashCents,
        roundId: round.id,
        accountId,
        cityId,
        displayName: `loand-${round.id.slice(-6)}`,
        publicPimpId: 9200,
        reputation: { create: ReputationService.seedFor(classicOgV165C) },
      },
    });
    return player.id;
  }

  const page = async () => {
    const response = await app.inject({ method: 'GET', url: '/api/game/loans', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    return response.json() as LoanSharkPageDto;
  };
  const takeQuick = async () => {
    const response = await app.inject({
      method: 'POST', url: '/api/game/loans/accept', headers: { cookie },
      payload: { offerKey: quick.key, quotedFeeCents: quick.contractFeeCents, requestKey: randomUUID(), actionId: randomUUID() },
    });
    expect(response.statusCode).toBe(200);
    return (response.json() as GameActionResult<LoanAcceptResult>).result.loan;
  };
  const preview = async (loanId: string, amountCents: number) => {
    const response = await app.inject({ method: 'GET', url: `/api/game/loans/${loanId}/preview?amountCents=${amountCents}`, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    return response.json() as LoanPaymentPreviewDto;
  };
  const pay = (loanId: string, amountCents: number, requestKey = randomUUID()) => app.inject({
    method: 'POST', url: `/api/game/loans/${loanId}/pay`, headers: { cookie },
    payload: { amountCents, requestKey, actionId: randomUUID() },
  });
  const player = (id: string) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id } });
  /** Move a loan's clock back, as if it had been accepted `hours` ago. */
  const age = async (loanId: string, hours: number) => {
    const shift = hours * HOUR;
    const loan = await app.prisma.loan.findUniqueOrThrow({ where: { id: loanId }, include: { installments: true } });
    await app.prisma.loan.update({ where: { id: loanId }, data: { acceptedAt: new Date(loan.acceptedAt.getTime() - shift) } });
    for (const row of loan.installments) {
      await app.prisma.loanInstallment.update({ where: { id: row.id }, data: { dueAt: new Date(row.dueAt.getTime() - shift) } });
    }
  };

  beforeAll(async () => {
    app = await (await import('../../app.js')).buildApp();
    const name = `loand_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() },
    });
    accountId = registered.json().account.id;
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('pays part of a loan exactly as previewed, once, with a receipt', async () => {
    const playerId = await fixture();
    const loan = await takeQuick();
    await age(loan.id, 6);
    const before = await player(playerId);
    const shown = await preview(loan.id, 300_000);
    // A quarter through the term, a quarter of the fee is earned (the test's own few seconds
    // round up a cent or so): the fee share goes first, the rest to principal.
    expect(shown).toMatchObject({ requestedCents: 300_000, paidCents: 300_000, lateFeeCents: 0, paysOff: false, statusAfter: 'ACTIVE', enoughCash: true });
    expect(shown.contractFeeCents).toBeGreaterThanOrEqual(37_500);
    expect(shown.contractFeeCents).toBeLessThan(37_600);
    expect(shown.principalCents).toBe(300_000 - shown.contractFeeCents);
    expect(shown.debtAfterCents).toBe(Number(before.loanDebtCents) - 300_000);

    const key = randomUUID();
    const first = await pay(loan.id, 300_000, key);
    expect(first.statusCode).toBe(200);
    const receipt = (first.json() as GameActionResult<LoanPaymentResult>).result;
    expect(receipt).toMatchObject({ kind: 'MANUAL', paidCents: shown.paidCents, contractFeeCents: shown.contractFeeCents, principalCents: shown.principalCents, replayed: false });
    expect(receipt.account.debtCents).toBe(shown.debtAfterCents);
    // Retried with the same key: answered, not charged again.
    expect(((await pay(loan.id, 300_000, key)).json() as GameActionResult<LoanPaymentResult>).result.replayed).toBe(true);

    const after = await player(playerId);
    expect(before.cashCents - after.cashCents).toBe(300_000n);
    expect(await app.prisma.loanPayment.count({ where: { roundPlayerId: playerId } })).toBe(1);
    const view = await page();
    expect(view.receipts).toHaveLength(1);
    expect(view.receipts[0]).toMatchObject({ kind: 'MANUAL', paidCents: 300_000, offerName: 'Quick Cash', debtAfterCents: shown.debtAfterCents });
    const feed = await app.prisma.playerActivity.findMany({ where: { roundPlayerId: playerId }, select: { type: true, payload: true } });
    expect(feed.map((row) => row.type)).toEqual(expect.arrayContaining(['LOAN_TAKEN', 'LOAN_PAYMENT']));
    // Neither loan entry carries cash a Job could count as earned.
    for (const row of feed.filter((entry) => entry.type.startsWith('LOAN_'))) expect(row.payload).not.toHaveProperty('cashCents');
    expect(await reconcileLoans(app.prisma as never, playerId, classicOgV165C)).toEqual([]);
  });

  it('pays off early for only the fee earned, and never more than the held quote', async () => {
    const playerId = await fixture();
    const loan = await takeQuick();
    await age(loan.id, 6);
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 5_000_000n } });
    const shown = await preview(loan.id, Number.MAX_SAFE_INTEGER);
    expect(shown.paysOff).toBe(true);
    const earned = shown.payoffCents - quick.principalCents;
    expect(earned).toBeGreaterThanOrEqual(37_500);
    expect(earned).toBeLessThan(37_600);
    expect(shown.contractFeeWaivedCents).toBe(quick.contractFeeCents - earned);
    expect(shown.payoffHoldCents).toBeGreaterThan(shown.payoffCents);
    expect(shown.payoffHoldCents).toBeLessThan(shown.payoffCents + 2_000);

    const before = await player(playerId);
    const response = await pay(loan.id, shown.payoffHoldCents);
    const result = (response.json() as GameActionResult<LoanPaymentResult>).result;
    expect(result.loan.status).toBe('PAID_OFF');
    expect(result.paidCents).toBeGreaterThanOrEqual(shown.payoffCents);
    expect(result.paidCents).toBeLessThanOrEqual(shown.payoffHoldCents);
    expect(result.contractFeeWaivedCents).toBeGreaterThan(0);
    const after = await player(playerId);
    expect(before.cashCents - after.cashCents).toBe(BigInt(result.paidCents));
    expect(after.loanDebtCents).toBe(0n);
    // Nothing left to take.
    const again = await pay(loan.id, 100);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('LOAN_PAID_OFF');
    expect(await reconcileLoans(app.prisma as never, playerId, classicOgV165C)).toEqual([]);
  });

  it('collects on schedule with a receipt and a feed entry', async () => {
    const playerId = await fixture();
    const loan = await takeQuick();
    await age(loan.id, rules.installmentIntervalHours);
    const view = await page();
    const receipt = view.receipts.find((row) => row.kind === 'SCHEDULED');
    expect(receipt).toMatchObject({ paidCents: (quick.principalCents + quick.contractFeeCents) / 2, offerName: 'Quick Cash' });
    expect(view.activeLoans[0]?.installments[0]?.status).toBe('PAID');
    expect(view.overdueCents).toBe(0);
    const feed = await app.prisma.playerActivity.findMany({ where: { roundPlayerId: playerId, type: 'LOAN_PAYMENT' } });
    expect(feed).toHaveLength(1);
    expect(feed[0]!.payload).toMatchObject({ kind: 'SCHEDULED', paidCents: receipt!.paidCents });
    expect(await reconcileLoans(app.prisma as never, playerId, classicOgV165C)).toEqual([]);
  });

  it('records a missed installment once, shows what is overdue, and recovers on payment', async () => {
    const playerId = await fixture();
    const loan = await takeQuick();
    // Most of the advance is spent: the installment can only be partly collected.
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 100_000n } });
    await age(loan.id, rules.installmentIntervalHours + 1);
    await page();
    await page();
    const view = await page();
    expect(view.account?.collectionState).toBe('DELINQUENT');
    const installment = (quick.principalCents + quick.contractFeeCents) / 2;
    const overdue = installment - 100_000 + rules.lateFeeCents;
    expect(view.overdueCents).toBe(overdue);
    expect(view.activeLoans[0]).toMatchObject({ status: 'DELINQUENT', overdueCents: overdue });
    const missed = await app.prisma.playerActivity.findMany({ where: { roundPlayerId: playerId, type: 'LOAN_INSTALLMENT_MISSED' } });
    expect(missed).toHaveLength(1);
    expect(missed[0]!.payload).toMatchObject({ sequence: 1, collectedCents: 100_000, shortCents: installment - 100_000, lateFeeCents: rules.lateFeeCents });
    expect(await app.prisma.loanFee.count({ where: { roundPlayerId: playerId } })).toBe(1);
    // It reaches the bell. (Checked on the row: the inbox picks the account's newest round,
    // and every fixture round here starts on the same day.)
    expect(await app.prisma.inAppNotification.count({ where: { roundPlayerId: playerId, activity: { type: 'LOAN_INSTALLMENT_MISSED' } } })).toBe(1);
    expect(await app.prisma.inAppNotification.count({ where: { roundPlayerId: playerId, activity: { type: { in: ['LOAN_TAKEN', 'LOAN_PAYMENT'] } } } })).toBe(0);

    // Paying exactly what is overdue clears it: late fee first, then the missed installment.
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 1_000_000n } });
    const shown = await preview(loan.id, overdue);
    expect(shown).toMatchObject({ paidCents: overdue, lateFeeCents: rules.lateFeeCents, clearsOverdue: true, statusAfter: 'ACTIVE' });
    const result = (await pay(loan.id, overdue)).json() as GameActionResult<LoanPaymentResult>;
    expect(result.result).toMatchObject({ paidCents: overdue, lateFeeCents: rules.lateFeeCents });
    expect(result.result.account.collectionState).toBe('CLEAR');
    const after = await page();
    expect(after.overdueCents).toBe(0);
    expect(after.activeLoans[0]).toMatchObject({ status: 'ACTIVE', overdueCents: 0 });
    expect(await reconcileLoans(app.prisma as never, playerId, classicOgV165C)).toEqual([]);
  });

  it('never takes more than is owed or more cash than there is', async () => {
    const playerId = await fixture();
    const loan = await takeQuick();
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 1_000n } });
    const broke = await pay(loan.id, 50_000);
    expect(broke.statusCode).toBe(400);
    expect(broke.json().error.code).toBe('NOT_ENOUGH_CASH');
    expect(await app.prisma.loanPayment.count({ where: { roundPlayerId: playerId } })).toBe(0);
    expect((await pay(loan.id, 0)).statusCode).toBe(400);
    expect((await pay(loan.id, -5)).statusCode).toBe(400);
    expect((await pay('not-a-loan', 100)).statusCode).toBe(404);

    // Far more than owed, with the cash for it: only the payoff is taken.
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 50_000_000n } });
    const payoff = (await preview(loan.id, Number.MAX_SAFE_INTEGER)).payoffCents;
    const result = (await pay(loan.id, 40_000_000)).json() as GameActionResult<LoanPaymentResult>;
    expect(result.result.paidCents).toBeGreaterThanOrEqual(payoff);
    expect(result.result.paidCents).toBeLessThan(payoff + 100);
    expect((await player(playerId)).cashCents).toBe(50_000_000n - BigInt(result.result.paidCents));
    expect(await reconcileLoans(app.prisma as never, playerId, classicOgV165C)).toEqual([]);
  });
});
