import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV165C } from '@streets/rulesets';
import { priceLoanOffer, startingStock } from '@streets/rules-engine';
import type { GameActionResult, LoanAcceptResult, LoanSharkPageDto } from '@streets/shared';
import { RoundService } from '../round.service.js';
import { ReputationService } from '../reputation.service.js';
import { LoanSettleService } from '../loan-settle.service.js';
import { reconcileLoans } from '../loan-reconcile.service.js';
import { lockRoundPlayer } from '../../utils/db.js';

const rules = classicOgV165C.loanShark;
const HOUR = 3_600_000;

/**
 * 1.6.5-C release gate, over HTTP: a player can stack loans into a large balance through
 * poor choices, each new loan dearer than the last, but cannot pass the shared ceiling,
 * slip past it with parallel contracts, take a loan at a price they were not shown, or
 * borrow straight into another loan's repayment.
 */
describe.runIf(process.env.LOAN_INTEGRATION === '1')('1.6.5-C repeat borrowing and escalating terms with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  let cookie = '';
  const roundIds: string[] = [];

  async function fixture(cashCents = 100_000_000n): Promise<string> {
    const round = await app.prisma.round.create({
      data: {
        name: 'Loan C fixture',
        slug: `loan-c-${randomUUID()}`,
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
        displayName: `loanc-${round.id.slice(-6)}`,
        publicPimpId: 9000,
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
  const accept = (offerKey: string, quotedFeeCents: number, extra: Record<string, unknown> = {}) => app.inject({
    method: 'POST',
    url: '/api/game/loans/accept',
    headers: { cookie },
    payload: { offerKey, quotedFeeCents, requestKey: randomUUID(), actionId: randomUUID(), ...extra },
  });
  /** Take an offer at whatever the page quotes now. */
  const takeQuoted = async (offerKey: string) => {
    const quoted = (await page()).offers.find((row) => row.key === offerKey)!;
    const response = await accept(offerKey, quoted.contractFeeCents);
    return { quoted, response };
  };

  beforeAll(async () => {
    app = await (await import('../../app.js')).buildApp();
    const name = `loanc_${randomUUID().slice(0, 8)}`;
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

  it('stacks loans into a large balance, each dearer than the last, and never reprices old ones', async () => {
    const playerId = await fixture();
    const taken: Array<{ id: string; fee: number }> = [];
    let lastFee = 0;
    for (;;) {
      const view = await page();
      const offer = view.offers.find((row) => row.key === 'STREET_ADVANCE')!;
      if (!offer.available) {
        expect(offer.unavailableReason).toMatch(/room left|as much as he will let you/);
        break;
      }
      // The fee the page shows is exactly what the engine prices for this debt.
      const priced = priceLoanOffer(rules, rules.offers[1]!, {
        position: { debtCents: BigInt(view.account!.debtCents), ceilingCents: BigInt(rules.debtCeilingCents), feesAssessedCents: 0n, feeCapCents: BigInt(rules.feeCapCents) },
        missedInstallments: 0,
      });
      expect(offer.contractFeeCents).toBe(Number(priced.contractFeeCents));
      expect(offer.contractFeeCents).toBeGreaterThanOrEqual(lastFee);
      expect(offer.contractFeeCents - offer.pricing.baseFeeCents).toBe(offer.pricing.surchargeCents);
      const response = await accept('STREET_ADVANCE', offer.contractFeeCents);
      expect(response.statusCode).toBe(200);
      const loan = (response.json() as GameActionResult<LoanAcceptResult>).result.loan;
      expect(loan.contractFeeCents).toBe(offer.contractFeeCents);
      taken.push({ id: loan.id, fee: loan.contractFeeCents });
      lastFee = offer.contractFeeCents;
    }
    expect(taken.length).toBeGreaterThan(2);
    // Later loans cost more than the first, and the first still costs what it did.
    expect(taken.at(-1)!.fee).toBeGreaterThan(taken[0]!.fee);
    for (const row of taken) {
      expect((await app.prisma.loan.findUniqueOrThrow({ where: { id: row.id } })).contractFeeCents).toBe(BigInt(row.fee));
    }
    const state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.loanDebtCents).toBeGreaterThan(BigInt(rules.debtCeilingCents) / 2n);
    expect(state.loanDebtCents).toBeLessThanOrEqual(BigInt(rules.debtCeilingCents));
    const view = await page();
    expect(view.credit).toMatchObject({ tierLabel: 'In deep', tierSurchargePercent: 15, nextTier: null, maxFeePercent: rules.maxContractFeePercent });
    // Every acceptance recorded how it was priced.
    const accepted = await app.prisma.loanEvent.findMany({ where: { roundPlayerId: playerId, kind: 'ACCEPTED' }, orderBy: { createdAt: 'asc' } });
    expect(accepted.map((row) => (row.metadata as { pricing: { tier: string } }).pricing.tier)[0]).toBe('Clean');
    expect(await reconcileLoans(app.prisma as never, playerId, classicOgV165C)).toEqual([]);
  });

  it('refuses a loan at a price the player was not shown', async () => {
    const playerId = await fixture();
    const before = (await page()).offers.find((row) => row.key === 'HEAVY_BANKROLL')!;
    // Another loan in another tab moves the player up a tier.
    expect((await takeQuoted('HEAVY_BANKROLL')).response.statusCode).toBe(200);
    const debtBefore = (await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).loanDebtCents;
    const stale = await accept('QUICK_CASH', rules.offers[0]!.contractFeeCents);
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('LOAN_QUOTE_CHANGED');
    expect(stale.json().error.message).toContain('Quick Cash now carries a $2,300 fee');
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).loanDebtCents).toBe(debtBefore);
    expect(await app.prisma.loan.count({ where: { roundPlayerId: playerId } })).toBe(1);
    // The fresh quote goes through.
    const fresh = (await page()).offers.find((row) => row.key === 'QUICK_CASH')!;
    expect(fresh.pricing).toMatchObject({ tierLabel: 'Stretched', tierSurchargePercent: 8 });
    expect((await accept('QUICK_CASH', fresh.contractFeeCents)).statusCode).toBe(200);
    expect(before.contractFeeCents).toBe(rules.offers[2]!.contractFeeCents);
  });

  it('charges more after missed installments, and remembers them after they are paid', async () => {
    const playerId = await fixture(0n);
    const { response } = await takeQuoted('QUICK_CASH');
    const loan = (response.json() as GameActionResult<LoanAcceptResult>).result.loan;
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 0n } });
    await app.prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, playerId);
      await LoanSettleService.settle(tx, playerId, classicOgV165C, new Date(new Date(loan.acceptedAt).getTime() + 2 * rules.installmentIntervalHours * HOUR));
    });
    const view = await page();
    expect(view.credit).toMatchObject({ missedInstallments: 2, historySurchargePercent: 6 });
    const quick = view.offers.find((row) => row.key === 'QUICK_CASH')!;
    expect(quick.pricing).toMatchObject({ missedInstallments: 2, historySurchargePercent: 6 });
    expect(quick.contractFeeCents).toBeGreaterThan(rules.offers[0]!.contractFeeCents);

    // Paying it all back clears the debt but not the record.
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 50_000_000n } });
    const { LoanService } = await import('../loan.service.js');
    await LoanService.repay(app.prisma, playerId, { requestKey: randomUUID(), loanId: loan.id, amountCents: 50_000_000n });
    const after = await page();
    expect(after.account?.debtCents).toBe(0);
    expect(after.credit).toMatchObject({ tierLabel: 'Clean', missedInstallments: 2, historySurchargePercent: 6 });
  });

  it('holds the ceiling against parallel contracts at escalating prices', async () => {
    const playerId = await fixture();
    const view = await page();
    const heavy = view.offers.find((row) => row.key === 'HEAVY_BANKROLL')!;
    const quick = view.offers.find((row) => row.key === 'QUICK_CASH')!;
    const results = await Promise.allSettled([
      ...Array.from({ length: 3 }, () => accept('HEAVY_BANKROLL', heavy.contractFeeCents)),
      ...Array.from({ length: 6 }, () => accept('QUICK_CASH', quick.contractFeeCents)),
    ]);
    const codes = results.map((row) => (row.status === 'fulfilled' ? (row.value.statusCode === 200 ? 'OK' : row.value.json().error.code) : 'THREW'));
    expect(codes).toContain('OK');
    for (const code of codes) expect(['OK', 'LOAN_QUOTE_CHANGED', 'LOAN_DEBT_CEILING']).toContain(code);
    const state = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(state.loanDebtCents).toBeLessThanOrEqual(BigInt(rules.debtCeilingCents));
    // Each loan that went through was priced for the debt it was taken on.
    const accepted = await app.prisma.loanEvent.findMany({ where: { roundPlayerId: playerId, kind: 'ACCEPTED' }, orderBy: { debtAfterCents: 'asc' } });
    for (const event of accepted) {
      const before = event.debtAfterCents - event.debtDeltaCents;
      const pricing = (event.metadata as { pricing: { utilizationPercent: number } }).pricing;
      expect(pricing.utilizationPercent).toBe(Number((before * 100n) / BigInt(rules.debtCeilingCents)));
    }
    expect(await reconcileLoans(app.prisma as never, playerId, classicOgV165C)).toEqual([]);
  });

  it('never borrows straight into another loan: proceeds go to cash, and other loans are untouched', async () => {
    const playerId = await fixture(0n);
    const first = (await takeQuoted('QUICK_CASH')).response.json() as GameActionResult<LoanAcceptResult>;
    const before = await app.prisma.loan.findUniqueOrThrow({ where: { id: first.result.loan.id } });
    // There is no field for pointing new proceeds at an existing loan.
    const refinance = await accept('QUICK_CASH', (await page()).offers[0]!.contractFeeCents, { repayLoanId: before.id });
    expect(refinance.statusCode).toBe(400);
    const second = await takeQuoted('QUICK_CASH');
    expect(second.response.statusCode).toBe(200);
    const after = await app.prisma.loan.findUniqueOrThrow({ where: { id: before.id } });
    expect({ ...after, updatedAt: null }).toEqual({ ...before, updatedAt: null });
    expect(await app.prisma.loanPayment.count({ where: { roundPlayerId: playerId } })).toBe(0);
    const ledger = await app.prisma.economyLedgerEntry.findMany({ where: { roundPlayerId: playerId, source: { startsWith: 'LOAN_' } } });
    expect(ledger.every((row) => row.source === 'LOAN_PROCEEDS' && row.amountCents > 0n)).toBe(true);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).cashCents)
      .toBe(BigInt(2 * rules.offers[0]!.principalCents));
  });
});
