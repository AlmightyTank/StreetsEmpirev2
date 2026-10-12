import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV165C, classicOgV165E, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { LoanService } from '../loan.service.js';
import { LoanSettleService } from '../loan-settle.service.js';
import { LoanSharkService } from '../loan-shark.service.js';
import { DueSettleService } from '../due-settle.service.js';
import { ReputationService } from '../reputation.service.js';
import { reconcileLoans } from '../loan-reconcile.service.js';
import { lockRoundPlayer } from '../../utils/db.js';

const rules = classicOgV165E.loanShark;
const c = rules.collections;
const HOUR = 3_600_000;
const interval = rules.installmentIntervalHours * HOUR;
const offer = (key: string) => rules.offers.find((row) => row.key === key)!;

/**
 * 1.6.5-E release gate: a heavily indebted player faces real restrictions (no new loans,
 * income garnished in collections), can see the way out, and climbs out through repayment
 * and on-time installments, with every garnish bounded and nothing added to the debt.
 */
describe.runIf(process.env.LOAN_INTEGRATION === '1')('1.6.5-E collection pressure and recovery with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];

  async function fixture(ruleset: Ruleset = classicOgV165E): Promise<string> {
    const round = await app.prisma.round.create({
      data: {
        name: 'Loan E fixture', slug: `loan-e-${randomUUID()}`,
        rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, status: 'ACTIVE',
        startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    roundIds.push(round.id);
    const cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } })).id;
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...ruleset.round.startingPlayer, ...startingStock(ruleset), cashCents: 100_000_000n,
        roundId: round.id, accountId, cityId, displayName: `loane-${round.id.slice(-6)}`, publicPimpId: 9400,
        netWorthCents: 100_000_000n,
        reputation: { create: ReputationService.seedFor(ruleset) },
      },
    });
    return player.id;
  }

  const t0 = new Date();
  const at = (hours: number) => new Date(t0.getTime() + hours * HOUR);
  const take = (playerId: string, key: string, now = t0) =>
    LoanService.acceptOffer(app.prisma, playerId, { offerKey: key, quotedFeeCents: offer(key).contractFeeCents, requestKey: randomUUID() }, now);
  const settle = (playerId: string, now: Date, ruleset: Ruleset = classicOgV165E) => app.prisma.$transaction(async (tx) => {
    await lockRoundPlayer(tx, playerId);
    return LoanSettleService.settle(tx, playerId, ruleset, now);
  });
  const player = (id: string) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id } });
  const setCash = (id: string, cashCents: bigint) => app.prisma.roundPlayer.update({ where: { id }, data: { cashCents } });
  /** Income the crew earned, as the economy ledger records it, and the cash that came with it. */
  const earn = async (id: string, source: string, cents: bigint, when: Date) => {
    await app.prisma.economyLedgerEntry.create({ data: { roundPlayerId: id, source, label: 'test income', amountCents: cents, createdAt: when } });
    await app.prisma.roundPlayer.update({ where: { id }, data: { cashCents: { increment: cents } } });
  };
  const owedOverdue = async (id: string, now: Date) => {
    const page = await LoanSharkService.page(app.prisma, classicOgV165E, await player(id), now);
    return page;
  };

  beforeAll(async () => {
    app = await (await import('../../app.js')).buildApp();
    const name = `loane_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accountId = registered.json().account.id;
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('pauses new loans once a player is behind, and explains why', async () => {
    const id = await fixture();
    await take(id, 'QUICK_CASH');
    await setCash(id, 0n);
    await settle(id, at(rules.installmentIntervalHours));
    expect((await player(id)).loanCollectionState).toBe('DELINQUENT');
    await setCash(id, 100_000_000n);
    await expect(take(id, 'QUICK_CASH', at(rules.installmentIntervalHours))).rejects.toMatchObject({ code: 'LOAN_PAUSED' });
    const page = await owedOverdue(id, at(rules.installmentIntervalHours));
    expect(page.offers.every((row) => !row.available && row.unavailableReason?.includes('behind'))).toBe(true);
    expect(page.collections).toMatchObject({ missedInstallments: 1, missedInstallmentsThreshold: c.missedInstallmentsThreshold, garnishPercent: c.garnishPercent });
  });

  it('puts a player in collections, garnishes a capped share of new income once, and never adds debt', async () => {
    const id = await fixture();
    await take(id, 'HEAVY_BANKROLL');
    await setCash(id, 0n);
    // Income before collections is the player's own.
    await earn(id, 'DEALER_SALES', 1_000_000n, at(1));
    await settle(id, at(2 * rules.installmentIntervalHours));
    let state = await player(id);
    expect(state.loanCollectionState).toBe('COLLECTIONS');
    expect(state.loanCollectionsSince).toEqual(at(2 * rules.installmentIntervalHours));
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: id, type: 'LOAN_COLLECTIONS' } })).toBe(1);
    expect(await app.prisma.inAppNotification.count({ where: { roundPlayerId: id, activity: { type: 'LOAN_COLLECTIONS' } } })).toBe(1);
    expect(await app.prisma.loanPayment.count({ where: { roundPlayerId: id, kind: 'COLLECTION' } })).toBe(0);
    const debtInCollections = state.loanDebtCents;

    // Dealer sales come in, and so does borrowed-looking money that is not income.
    const when = at(2 * rules.installmentIntervalHours + 1);
    await earn(id, 'DEALER_SALES', 4_000_000n, when);
    await earn(id, 'ADMIN', 9_000_000n, when);
    const cashBefore = (await player(id)).cashCents;
    await settle(id, at(2 * rules.installmentIntervalHours + 2));
    state = await player(id);
    const garnish = 4_000_000n * BigInt(c.garnishPercent) / 100n;
    expect(cashBefore - state.cashCents).toBe(garnish);
    expect(debtInCollections - state.loanDebtCents).toBe(garnish);
    const payments = await app.prisma.loanPayment.findMany({ where: { roundPlayerId: id, kind: 'COLLECTION' } });
    expect(payments.reduce((sum, row) => sum + row.amountCents, 0n)).toBe(garnish);
    expect((await app.prisma.economyLedgerEntry.findMany({ where: { roundPlayerId: id, source: 'LOAN_COLLECTION' } })).reduce((sum, row) => sum + row.amountCents, 0n)).toBe(-garnish);
    // Considered once: settling again takes nothing more.
    await settle(id, at(2 * rules.installmentIntervalHours + 3));
    expect(await app.prisma.loanPayment.count({ where: { roundPlayerId: id, kind: 'COLLECTION' } })).toBe(payments.length);

    // A huge windfall: only the day's cap is taken, and the rest of the income is never revisited.
    await earn(id, 'BUSINESS_INCOME', 50_000_000n, at(2 * rules.installmentIntervalHours + 4));
    await settle(id, at(2 * rules.installmentIntervalHours + 5));
    const day = await app.prisma.loanPayment.aggregate({ where: { roundPlayerId: id, kind: 'COLLECTION' }, _sum: { amountCents: true } });
    expect(day._sum.amountCents).toBe(BigInt(c.garnishCapPerDayCents));
    await settle(id, at(2 * rules.installmentIntervalHours + 30));
    expect((await app.prisma.loanPayment.aggregate({ where: { roundPlayerId: id, kind: 'COLLECTION' }, _sum: { amountCents: true } }))._sum.amountCents).toBe(BigInt(c.garnishCapPerDayCents));
    // Collections never grew the debt: only late fees did, each capped.
    state = await player(id);
    expect(state.loanFeesAssessedCents).toBeLessThanOrEqual(BigInt(rules.feeCapCents));
    expect(state.loanDebtCents).toBeLessThanOrEqual(BigInt(rules.debtCeilingCents));
    expect(await reconcileLoans(app.prisma as never, id, classicOgV165E)).toEqual([]);
  });

  it('never garnishes more than is overdue, and lets the player out the moment it is cleared', async () => {
    const id = await fixture();
    await take(id, 'QUICK_CASH');
    await setCash(id, 0n);
    await settle(id, at(2 * rules.installmentIntervalHours));
    expect((await player(id)).loanCollectionState).toBe('COLLECTIONS');
    const overdue = (await owedOverdue(id, at(2 * rules.installmentIntervalHours))).overdueCents;
    // Plenty of income: 25% of it is more than everything overdue.
    await earn(id, 'SCOUT', BigInt(overdue) * 10n, at(2 * rules.installmentIntervalHours + 1));
    await settle(id, at(2 * rules.installmentIntervalHours + 2));
    const state = await player(id);
    const taken = await app.prisma.loanPayment.aggregate({ where: { roundPlayerId: id, kind: 'COLLECTION' }, _sum: { amountCents: true } });
    expect(taken._sum.amountCents).toBe(BigInt(overdue));
    // Everything was overdue on Quick Cash, so it is paid off and the player is clear.
    expect(state.loanDebtCents).toBe(0n);
    expect(state.loanCollectionState).toBe('CLEAR');
    expect(state.loanCollectionsSince).toBeNull();
    expect(await reconcileLoans(app.prisma as never, id, classicOgV165E)).toEqual([]);
  });

  it('recovers through on-time installments, and a new miss starts over', async () => {
    const id = await fixture();
    const { result } = await take(id, 'HEAVY_BANKROLL');
    await setCash(id, 0n);
    await settle(id, at(2 * rules.installmentIntervalHours));
    expect((await player(id)).loanCollectionState).toBe('COLLECTIONS');

    // Pay everything overdue: out of collections, into recovery.
    await setCash(id, 100_000_000n);
    const overdue = (await owedOverdue(id, at(2 * rules.installmentIntervalHours))).overdueCents;
    await LoanService.repay(app.prisma, id, { requestKey: randomUUID(), loanId: result.loan.id, amountCents: BigInt(overdue) }, at(2 * rules.installmentIntervalHours));
    let state = await player(id);
    expect(state).toMatchObject({ loanCollectionState: 'RECOVERING', loanRecoveryNeeded: c.recoveryOnTimeInstallments, loanCollectionsSince: null });
    await expect(take(id, 'QUICK_CASH', at(2 * rules.installmentIntervalHours))).rejects.toMatchObject({ code: 'LOAN_PAUSED' });

    // The third installment is collected on time: one to go.
    await settle(id, at(3 * rules.installmentIntervalHours));
    state = await player(id);
    expect(state).toMatchObject({ loanCollectionState: 'RECOVERING', loanRecoveryNeeded: c.recoveryOnTimeInstallments - 1 });
    const page = await owedOverdue(id, at(3 * rules.installmentIntervalHours));
    expect(page.offers[0]!.unavailableReason).toContain('Pay 1 more installment on time');

    // The last one too: paid off and clear, and borrowing is back.
    await settle(id, at(4 * rules.installmentIntervalHours));
    expect(await player(id)).toMatchObject({ loanCollectionState: 'CLEAR', loanRecoveryNeeded: 0, loanDebtCents: 0n });
    // Borrowing is back, at a price that still remembers the two missed installments.
    const quote = (await owedOverdue(id, at(4 * rules.installmentIntervalHours))).offers.find((row) => row.key === 'QUICK_CASH')!;
    expect(quote).toMatchObject({ available: true, pricing: { missedInstallments: 2 } });
    const again = await LoanService.acceptOffer(app.prisma, id, { offerKey: 'QUICK_CASH', quotedFeeCents: quote.contractFeeCents, requestKey: randomUUID() }, at(4 * rules.installmentIntervalHours));
    expect(again.result.replayed).toBe(false);
    const feed = await app.prisma.playerActivity.findMany({ where: { roundPlayerId: id, type: 'LOAN_COLLECTIONS' }, orderBy: { createdAt: 'asc' } });
    expect(feed.map((row) => (row.payload as { to: string }).to)).toEqual(['COLLECTIONS', 'RECOVERING', 'CLEAR']);

    // Missing during recovery starts it over.
    const second = await fixture();
    await take(second, 'HEAVY_BANKROLL');
    await setCash(second, 0n);
    await settle(second, at(rules.installmentIntervalHours));
    await setCash(second, 100_000_000n);
    const loan = await app.prisma.loan.findFirstOrThrow({ where: { roundPlayerId: second } });
    await LoanService.repay(app.prisma, second, { requestKey: randomUUID(), loanId: loan.id, amountCents: BigInt((await owedOverdue(second, at(rules.installmentIntervalHours))).overdueCents) }, at(rules.installmentIntervalHours));
    expect((await player(second)).loanCollectionState).toBe('RECOVERING');
    await setCash(second, 0n);
    await settle(second, at(2 * rules.installmentIntervalHours));
    expect(await player(second)).toMatchObject({ loanCollectionState: 'DELINQUENT', loanRecoveryNeeded: 0 });
  });

  it('garnishes on the poller while the player is away', async () => {
    const id = await fixture();
    await take(id, 'HEAVY_BANKROLL', new Date(Date.now() - 2 * interval - HOUR));
    await setCash(id, 0n);
    await DueSettleService.sweep(app.prisma, new Date());
    expect((await player(id)).loanCollectionState).toBe('COLLECTIONS');
    await earn(id, 'DEALER_SALES', 2_000_000n, new Date());
    expect(await DueSettleService.collectionsOwners(app.prisma, new Date())).toContain(id);
    await DueSettleService.sweep(app.prisma, new Date());
    expect(await app.prisma.loanPayment.count({ where: { roundPlayerId: id, kind: 'COLLECTION' } })).toBe(1);
    expect(await DueSettleService.collectionsOwners(app.prisma, new Date())).not.toContain(id);
  });

  it('leaves 1.6.5-C rounds with plain delinquency: no pause, no collections', async () => {
    const id = await fixture(classicOgV165C);
    await LoanService.acceptOffer(app.prisma, id, { offerKey: 'HEAVY_BANKROLL', quotedFeeCents: offer('HEAVY_BANKROLL').contractFeeCents, requestKey: randomUUID() }, t0);
    await setCash(id, 0n);
    await settle(id, at(3 * rules.installmentIntervalHours), classicOgV165C);
    expect((await player(id)).loanCollectionState).toBe('DELINQUENT');
    await earn(id, 'DEALER_SALES', 4_000_000n, at(3 * rules.installmentIntervalHours + 1));
    await settle(id, at(3 * rules.installmentIntervalHours + 2), classicOgV165C);
    expect(await app.prisma.loanPayment.count({ where: { roundPlayerId: id, kind: 'COLLECTION' } })).toBe(0);
  });
});
