import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Round } from '@prisma/client';
import { classicOgV16H, classicOgV165A, classicOgV165B, type LoanOfferRules, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { GameActionResult, LoanAcceptResult, LoanSharkPageDto } from '@streets/shared';
import { RoundService } from '../round.service.js';
import { ReputationService } from '../reputation.service.js';
import { reconcileLoans } from '../loan-reconcile.service.js';

const rules = classicOgV165B.loanShark;
const offer = (key: string): LoanOfferRules => rules.offers.find((row) => row.key === key)!;

/**
 * 1.6.5-B release gate, over HTTP: a player compares offers and sees the full obligation
 * before accepting; the accepted loan, cash, debt and ledger reconcile after retries and
 * reloads; and the server, not the request, decides the terms.
 */
describe.runIf(process.env.LOAN_INTEGRATION === '1')('1.6.5-B loan offers and acceptance with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  let cookie = '';
  const roundIds: string[] = [];

  async function fixture(ruleset: Ruleset = classicOgV165B, cashCents = 100_000_000n): Promise<{ round: Round; playerId: string }> {
    const round = await app.prisma.round.create({
      data: {
        name: 'Loan B fixture',
        slug: `loan-b-${randomUUID()}`,
        rulesetId: ruleset.meta.id,
        rulesetVersion: ruleset.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    roundIds.push(round.id);
    vi.spyOn(RoundService, 'requireCurrent').mockResolvedValue(round);
    const cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } })).id;
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...ruleset.round.startingPlayer,
        ...startingStock(ruleset),
        cashCents,
        roundId: round.id,
        accountId,
        cityId,
        displayName: `loanb-${round.id.slice(-6)}`,
        publicPimpId: 8900,
        reputation: { create: ReputationService.seedFor(ruleset) },
      },
    });
    return { round, playerId: player.id };
  }

  const page = async () => {
    const response = await app.inject({ method: 'GET', url: '/api/game/loans', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    return response.json() as LoanSharkPageDto;
  };
  // B has no pricing, so the quoted fee is always the listed one.
  const accept = (payload: Record<string, unknown>) => app.inject({
    method: 'POST',
    url: '/api/game/loans/accept',
    headers: { cookie },
    payload: { quotedFeeCents: rules.offers.find((row) => row.key === payload.offerKey)?.contractFeeCents ?? 0, ...payload },
  });
  const player = (id: string) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    app = await (await import('../../app.js')).buildApp();
    const name = `loanb_${randomUUID().slice(0, 8)}`;
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

  it('quotes every offer in full before anything is accepted', async () => {
    await fixture();
    const view = await page();
    expect(view.enabled).toBe(true);
    expect(view.account).toMatchObject({ debtCents: 0, debtCeilingCents: rules.debtCeilingCents, availableCents: rules.debtCeilingCents, collectionState: 'CLEAR' });
    expect(view.offers.map((row) => row.key)).toEqual(rules.offers.map((row) => row.key));
    for (const row of view.offers) {
      const terms = offer(row.key);
      expect(row).toMatchObject({
        principalCents: terms.principalCents,
        contractFeeCents: terms.contractFeeCents,
        obligationCents: terms.principalCents + terms.contractFeeCents,
        installmentCount: terms.installmentCount,
        installmentIntervalHours: rules.installmentIntervalHours,
        lateFeeCents: rules.lateFeeCents,
        lateFeeCapCents: rules.lateFeeCapPerLoanCents,
        debtAfterCents: terms.principalCents + terms.contractFeeCents,
        availableAfterCents: rules.debtCeilingCents - terms.principalCents - terms.contractFeeCents,
        available: true,
        unavailableReason: null,
      });
      expect(row.installments.reduce((sum, item) => sum + item.amountCents, 0)).toBe(row.obligationCents);
      expect(row.installments.map((item) => item.dueAfterHours)).toEqual(row.installments.map((item) => item.sequence * rules.installmentIntervalHours));
    }
    expect(view.activeLoans).toEqual([]);
    expect(view.history).toEqual([]);
  });

  it('pays out once across retries and reloads, and the books reconcile', async () => {
    const { playerId } = await fixture();
    const before = await player(playerId);
    const requestKey = randomUUID();
    const first = await accept({ offerKey: 'QUICK_CASH', requestKey, actionId: randomUUID() });
    expect(first.statusCode).toBe(200);
    const body = first.json() as GameActionResult<LoanAcceptResult>;
    expect(body.result).toMatchObject({ creditedCents: offer('QUICK_CASH').principalCents, replayed: false, loan: { offerKey: 'QUICK_CASH', obligationCents: 1_150_000 } });

    // A double submit with a fresh action id, and a reload's retry with the same one.
    const again = await accept({ offerKey: 'QUICK_CASH', requestKey, actionId: randomUUID() });
    expect((again.json() as GameActionResult<LoanAcceptResult>).result).toMatchObject({ replayed: true, creditedCents: 0, loan: { id: body.result.loan.id } });
    // The same request key cannot be spent on a different offer.
    const swapped = await accept({ offerKey: 'STREET_ADVANCE', requestKey, actionId: randomUUID() });
    expect(swapped.statusCode).toBe(409);
    expect(swapped.json().error.code).toBe('LOAN_REQUEST_KEY_REUSED');

    const after = await player(playerId);
    expect(after.cashCents - before.cashCents).toBe(BigInt(offer('QUICK_CASH').principalCents));
    expect(after.loanDebtCents).toBe(1_150_000n);
    expect(await app.prisma.loan.count({ where: { roundPlayerId: playerId } })).toBe(1);
    expect(await app.prisma.economyLedgerEntry.count({ where: { roundPlayerId: playerId, source: 'LOAN_PROCEEDS' } })).toBe(1);
    expect(await reconcileLoans(app.prisma as never, playerId, classicOgV165B)).toEqual([]);

    const view = await page();
    expect(view.account).toMatchObject({ debtCents: 1_150_000, availableCents: rules.debtCeilingCents - 1_150_000 });
    expect(view.activeLoans).toHaveLength(1);
    expect(view.activeLoans[0]).toMatchObject({ offerName: 'Quick Cash', outstandingCents: 1_150_000, nextDueCents: 575_000, nextDueAt: body.result.loan.installments[0]!.dueAt });
    expect(view.history.map((row) => row.kind)).toEqual(['ACCEPTED']);
    expect(view.history[0]).toMatchObject({ debtDeltaCents: 1_150_000, debtAfterCents: 1_150_000, label: 'Borrowed $10,000 · Quick Cash' });
    expect(view.offers.find((row) => row.key === 'QUICK_CASH')).toMatchObject({ debtAfterCents: 2_300_000 });
  });

  it('takes its terms from the ruleset, never the request', async () => {
    await fixture();
    const forged = await accept({ offerKey: 'QUICK_CASH', requestKey: randomUUID(), actionId: randomUUID(), principalCents: 100_000_000 });
    expect(forged.statusCode).toBe(400);
    const unknown = await accept({ offerKey: 'FRIENDS_AND_FAMILY', requestKey: randomUUID(), actionId: randomUUID() });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe('LOAN_OFFER_NOT_FOUND');
  });

  it('explains and refuses offers the player is not eligible for', async () => {
    const { playerId } = await fixture(classicOgV165B, 0n);
    const view = await page();
    expect(view.offers.find((row) => row.key === 'QUICK_CASH')?.available).toBe(true);
    const heavy = view.offers.find((row) => row.key === 'HEAVY_BANKROLL')!;
    expect(heavy).toMatchObject({ available: false, minNetWorthCents: offer('HEAVY_BANKROLL').minNetWorthCents });
    expect(heavy.unavailableReason).toMatch(/worth \$50,000 or more/);
    const refused = await accept({ offerKey: 'HEAVY_BANKROLL', requestKey: randomUUID(), actionId: randomUUID() });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toMatchObject({ code: 'LOAN_NOT_ELIGIBLE', message: heavy.unavailableReason });
    expect((await player(playerId)).loanDebtCents).toBe(0n);
  });

  it('refuses cleanly at the ceiling and says how much room is left', async () => {
    const { playerId } = await fixture();
    const heavy = offer('HEAVY_BANKROLL');
    const obligation = heavy.principalCents + heavy.contractFeeCents;
    const fits = Math.floor(rules.debtCeilingCents / obligation);
    for (let index = 0; index < fits; index += 1) {
      expect((await accept({ offerKey: 'HEAVY_BANKROLL', requestKey: randomUUID(), actionId: randomUUID() })).statusCode).toBe(200);
    }
    const view = await page();
    const room = rules.debtCeilingCents - fits * obligation;
    expect(view.account?.availableCents).toBe(room);
    const row = view.offers.find((entry) => entry.key === 'HEAVY_BANKROLL')!;
    expect(row.available).toBe(false);
    expect(row.unavailableReason).toContain('room left');
    const refused = await accept({ offerKey: 'HEAVY_BANKROLL', requestKey: randomUUID(), actionId: randomUUID() });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('LOAN_DEBT_CEILING');
    expect((await player(playerId)).loanDebtCents).toBe(BigInt(fits * obligation));
    expect(await reconcileLoans(app.prisma as never, playerId, classicOgV165B)).toEqual([]);
  });

  it('collects due installments when the player only opens the page', async () => {
    const { playerId } = await fixture();
    const accepted = (await accept({ offerKey: 'QUICK_CASH', requestKey: randomUUID(), actionId: randomUUID() })).json() as GameActionResult<LoanAcceptResult>;
    await app.prisma.loanInstallment.updateMany({ where: { loanId: accepted.result.loan.id, sequence: 1 }, data: { dueAt: new Date(Date.now() - 60_000) } });
    const view = await page();
    expect(await app.prisma.loanPayment.count({ where: { roundPlayerId: playerId, kind: 'SCHEDULED' } })).toBe(1);
    expect(view.history[0]?.label).toBe('Installment collected · Quick Cash');
    expect(view.activeLoans[0]?.installments[0]?.status).toBe('PAID');
    expect(view.account?.debtCents).toBe(Number((await player(playerId)).loanDebtCents));
    expect(await reconcileLoans(app.prisma as never, playerId, classicOgV165B)).toEqual([]);
  });

  it('offers nothing on 1.6.5-A and has no loan shark before 1.6.5', async () => {
    await fixture(classicOgV165A);
    expect((await page()).offers).toEqual([]);
    const none = await accept({ offerKey: 'QUICK_CASH', requestKey: randomUUID(), actionId: randomUUID() });
    expect(none.json().error.code).toBe('LOAN_OFFER_NOT_FOUND');

    await fixture(classicOgV16H);
    expect(await page()).toMatchObject({ enabled: false, account: null, offers: [] });
    const closed = await accept({ offerKey: 'QUICK_CASH', requestKey: randomUUID(), actionId: randomUUID() });
    expect(closed.json().error.code).toBe('LOAN_SHARK_CLOSED');
  });
});
