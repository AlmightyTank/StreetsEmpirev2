import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV165E } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { AdminLoanCorrectionResult, AdminLoanPlayerDto, AdminLoansDto } from '@streets/shared';
import { LoanService, countMissedInstallments } from '../loan.service.js';
import { LoanSettleService } from '../loan-settle.service.js';
import { ReputationService } from '../reputation.service.js';
import { reconcileLoans } from '../loan-reconcile.service.js';
import { lockRoundPlayer } from '../../utils/db.js';

const ruleset = classicOgV165E;
const rules = ruleset.loanShark;
const quick = rules.offers[0]!;
const HOUR = 3_600_000;
type Who = { id: string; username: string; cookie: string };

/**
 * 1.6.5-F release gate: admins can see where every balance came from, trace every change,
 * catch duplicated or limit-dodging records, and correct a verified error, audited, without
 * creating cash or hiding history, never on a finished round or their own player.
 */
describe.runIf(process.env.LOAN_INTEGRATION === '1')('1.6.5-F loan admin, ledger and exploit review with PostgreSQL', () => {
  let app: FastifyInstance;
  let cookieName = '';
  let admin: Who;
  let roundId = '';
  let cityId = '';
  const accountIds: string[] = [];
  let pimp = 9500;
  const t0 = new Date();
  const at = (hours: number) => new Date(t0.getTime() + hours * HOUR);

  async function register(label: string): Promise<Who> {
    const username = `${label}_${randomUUID().slice(0, 8)}`;
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, email: `${username}@example.invalid`, password: randomUUID() } });
    const accountId = response.json().account.id as string;
    accountIds.push(accountId);
    const session = response.cookies.find((cookie) => cookie.name === cookieName)!;
    return { id: accountId, username, cookie: `${session.name}=${session.value}` };
  }

  async function borrower(label: string, who?: Who): Promise<{ who: Who; playerId: string }> {
    const account = who ?? await register(label);
    const row = await app.prisma.roundPlayer.create({
      data: {
        ...ruleset.round.startingPlayer, ...startingStock(ruleset), cashCents: 50_000_000n, netWorthCents: 50_000_000n,
        roundId, accountId: account.id, cityId, displayName: account.username, publicPimpId: pimp++,
        reputation: { create: ReputationService.seedFor(ruleset) },
      },
    });
    return { who: account, playerId: row.id };
  }

  /** A Quick Cash loan whose first installment was missed with no cash: delinquent, one late fee. */
  async function missedOnce(playerId: string) {
    const { result } = await LoanService.acceptOffer(app.prisma, playerId, { offerKey: quick.key, quotedFeeCents: quick.contractFeeCents, requestKey: randomUUID() }, t0);
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 0n } });
    await app.prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, playerId);
      await LoanSettleService.settle(tx, playerId, ruleset, at(rules.installmentIntervalHours));
    });
    return result.loan.id;
  }

  const get = <T>(url: string, who: Who = admin) => app.inject({ url, headers: { cookie: who.cookie } }).then((response) => ({ status: response.statusCode, body: response.json() as T }));
  const correct = (playerId: string, payload: object, who: Who = admin) =>
    app.inject({ method: 'POST', url: `/api/admin/players/${playerId}/loans/correct`, headers: { cookie: who.cookie }, payload });
  const report = async () => (await get<AdminLoansDto>(`/api/admin/rounds/${roundId}/loans`)).body;
  const problemsOf = (dto: AdminLoansDto, playerId: string) => dto.problems.find((row) => row.player.id === playerId)?.problems ?? [];

  beforeAll(async () => {
    cookieName = (await import('../../config/env.js')).env.SESSION_COOKIE_NAME;
    app = await (await import('../../app.js')).buildApp();
    admin = await register('loanadm');
    await app.prisma.account.update({ where: { id: admin.id }, data: { isAdmin: true } });
    const round = await app.prisma.round.create({
      data: {
        slug: `loan-f-${randomUUID()}`, name: `Loan F ${randomUUID().slice(0, 6)}`,
        rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, status: 'ACTIVE',
        startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    roundId = round.id;
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } })).id;
  });

  afterAll(async () => {
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    for (const id of accountIds) await app.prisma.account.delete({ where: { id } }).catch(() => undefined);
    await app?.close();
  });

  it('keeps the loan report, a player’s loans and corrections to staff', async () => {
    const { who, playerId } = await borrower('loanply');
    expect((await get(`/api/admin/rounds/${roundId}/loans`, who)).status).toBe(403);
    expect((await get(`/api/admin/players/${playerId}/loans`, who)).status).toBe(403);
    expect((await correct(playerId, { kind: 'WAIVE_LATE_FEE', feeId: 'x', reason: 'not staff' }, who)).statusCode).toBe(403);
  });

  it('reports debt, standings, fees and every borrower reconciled, and traces one player in full', async () => {
    const clean = await borrower('loanok');
    await LoanService.acceptOffer(app.prisma, clean.playerId, { offerKey: quick.key, quotedFeeCents: quick.contractFeeCents, requestKey: randomUUID() }, t0);
    const behind = await borrower('loanlate');
    await missedOnce(behind.playerId);

    const dto = await report();
    expect(dto.enabled).toBe(true);
    expect(dto.limits).toMatchObject({ debtCeilingCents: rules.debtCeilingCents, collections: { garnishPercent: rules.collections.garnishPercent } });
    expect(dto.totals.borrowers).toBeGreaterThanOrEqual(2);
    expect(dto.totals.standings.DELINQUENT).toBeGreaterThanOrEqual(1);
    expect(dto.totals.lateFeesAssessedCents).toBeGreaterThanOrEqual(rules.lateFeeCents);
    expect(problemsOf(dto, clean.playerId)).toEqual([]);
    expect(problemsOf(dto, behind.playerId)).toEqual([]);
    const row = dto.players.find((entry) => entry.player.id === behind.playerId)!;
    expect(row).toMatchObject({ standing: 'DELINQUENT', missedInstallments: 1, delinquentLoans: 1, problems: 0 });
    expect(row.overdueCents).toBeGreaterThan(0);
    expect(dto.journal.some((entry) => entry.player.id === behind.playerId && entry.kind === 'INSTALLMENT_MISSED')).toBe(true);

    const detail = (await get<AdminLoanPlayerDto>(`/api/admin/players/${behind.playerId}/loans`)).body;
    expect(detail).toMatchObject({ frozen: false, problems: [] });
    expect(detail.loans[0]).toMatchObject({ offerName: 'Quick Cash', rulesetId: ruleset.meta.id, status: 'DELINQUENT' });
    expect(detail.fees).toHaveLength(1);
    expect(detail.journal.map((entry) => entry.kind)).toEqual(expect.arrayContaining(['ACCEPTED', 'INSTALLMENT_MISSED', 'FEE_ASSESSED', 'COLLECTION_CHANGED']));
    expect(detail.ledger.some((entry) => entry.source === 'LOAN_PROCEEDS')).toBe(true);
  });

  it('catches duplicated advances, double late fees, debt changed outside the ledger, and a dodged standing', async () => {
    const { playerId } = await borrower('loanbad');
    const loanId = await missedOnce(playerId);
    expect(problemsOf(await report(), playerId)).toEqual([]);

    // A second advance paid out for the same loan.
    await app.prisma.economyLedgerEntry.create({ data: { roundPlayerId: playerId, source: 'LOAN_PROCEEDS', label: 'dup', amountCents: BigInt(quick.principalCents) } });
    // A second late fee for the same miss.
    const installment = await app.prisma.loanInstallment.findFirstOrThrow({ where: { loanId, sequence: 1 } });
    await app.prisma.loanFee.create({ data: { loanId, roundPlayerId: playerId, installmentId: installment.id, kind: 'LATE', requestKey: `forged:${randomUUID()}`, amountCents: 0n, quotedCents: 0n } });
    // Debt shaved outside the ledger, and the delinquency quietly cleared.
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { loanDebtCents: { decrement: 100n }, loanCollectionState: 'CLEAR' } });

    const found = problemsOf(await report(), playerId).join(' | ');
    expect(found).toContain('advances in the ledger');
    expect(found).toContain('ledger proceeds do not match');
    expect(found).toContain('2 late fees for 1 misses');
    expect(found).toContain("is not the loans' outstanding");
    expect(found).toContain('standing CLEAR disagrees');
  });

  it('waives a late fee, audited, without creating cash or erasing the fee', async () => {
    const { playerId } = await borrower('loanwaive');
    await missedOnce(playerId);
    const before = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    const fee = await app.prisma.loanFee.findFirstOrThrow({ where: { roundPlayerId: playerId } });
    const response = await correct(playerId, { kind: 'WAIVE_LATE_FEE', feeId: fee.id, reason: 'Charged during the outage' });
    expect(response.statusCode).toBe(200);
    const result = response.json() as AdminLoanCorrectionResult;
    expect(result).toMatchObject({ kind: 'WAIVE_LATE_FEE', waivedCents: Number(fee.amountCents), problems: [] });
    expect(result.debtBeforeCents - result.debtAfterCents).toBe(Number(fee.amountCents));
    const after = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(after.cashCents).toBe(before.cashCents);
    // Still assessed and on record; the waiver is beside it.
    expect(after.loanFeesAssessedCents).toBe(before.loanFeesAssessedCents);
    expect(await app.prisma.loanFee.findUniqueOrThrow({ where: { id: fee.id } })).toMatchObject({ amountCents: fee.amountCents, waivedCents: fee.amountCents });
    // A waived fee does not excuse the miss: still delinquent.
    expect(after.loanCollectionState).toBe('DELINQUENT');
    expect(await app.prisma.loanEvent.count({ where: { roundPlayerId: playerId, kind: 'CORRECTED' } })).toBe(1);
    const audit = await app.prisma.adminAuditLog.findFirstOrThrow({ where: { action: 'loans.waive-late-fee', targetId: fee.id } });
    expect(audit).toMatchObject({ actorAccountId: admin.id, reason: 'Charged during the outage' });
    // Nothing left to waive.
    const again = await correct(playerId, { kind: 'WAIVE_LATE_FEE', feeId: fee.id, reason: 'again' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('LOAN_CORRECTION_UNCHANGED');
    expect(await reconcileLoans(app.prisma as never, playerId, ruleset)).toEqual([]);
  });

  it('excuses a miss: rescheduled, fee waived, standing restored, history kept, and it can come due again', async () => {
    const { playerId } = await borrower('loanexcuse');
    const loanId = await missedOnce(playerId);
    const missed = await app.prisma.loanInstallment.findFirstOrThrow({ where: { loanId, sequence: 1 } });
    expect(await countMissedInstallments(app.prisma, playerId)).toBe(1);

    const response = await correct(playerId, { kind: 'EXCUSE_MISS', installmentId: missed.id, reason: 'Server was down at the due time' });
    expect(response.statusCode).toBe(200);
    const result = response.json() as AdminLoanCorrectionResult;
    expect(result).toMatchObject({ kind: 'EXCUSE_MISS', waivedCents: rules.lateFeeCents, standing: 'CLEAR', problems: [] });
    const excused = await app.prisma.loanInstallment.findUniqueOrThrow({ where: { id: missed.id } });
    expect(excused).toMatchObject({ status: 'SCHEDULED', missedAt: missed.missedAt, originalDueAt: missed.dueAt });
    expect(excused.dueAt.toISOString()).toBe(result.dueAgainAt);
    expect(await app.prisma.loanEvent.count({ where: { roundPlayerId: playerId, kind: 'INSTALLMENT_MISSED' } })).toBe(1);
    // An excused miss no longer raises the price of new loans.
    expect(await countMissedInstallments(app.prisma, playerId)).toBe(0);
    expect((await app.prisma.loan.findUniqueOrThrow({ where: { id: loanId } })).status).toBe('ACTIVE');

    // Due again, and missed again: a fresh miss and a fresh fee, once.
    const second = new Date(excused.dueAt.getTime() + 60_000);
    for (let pass = 0; pass < 2; pass += 1) {
      await app.prisma.$transaction(async (tx) => {
        await lockRoundPlayer(tx, playerId);
        await LoanSettleService.settle(tx, playerId, ruleset, second);
      });
    }
    expect(await app.prisma.loanFee.count({ where: { installmentId: missed.id } })).toBe(2);
    expect(await app.prisma.loanEvent.count({ where: { roundPlayerId: playerId, kind: 'INSTALLMENT_MISSED' } })).toBe(2);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).loanCollectionState).not.toBe('CLEAR');
    expect(await reconcileLoans(app.prisma as never, playerId, ruleset)).toEqual([]);
  });

  it('refuses unknown targets, the wrong state, an admin’s own player, and finished rounds', async () => {
    const { playerId } = await borrower('loanrefuse');
    await missedOnce(playerId);
    expect((await correct(playerId, { kind: 'WAIVE_LATE_FEE', feeId: 'nope', reason: 'test' })).statusCode).toBe(404);
    const paid = await app.prisma.loanInstallment.findFirstOrThrow({ where: { roundPlayerId: playerId, sequence: 2 } });
    const notMissed = await correct(playerId, { kind: 'EXCUSE_MISS', installmentId: paid.id, reason: 'test' });
    expect(notMissed.json().error.code).toBe('LOAN_NOT_MISSED');
    expect((await correct(playerId, { kind: 'EXCUSE_MISS', installmentId: paid.id, reason: '' })).statusCode).toBe(400);

    const own = await borrower('ownloan', admin);
    await missedOnce(own.playerId);
    const ownFee = await app.prisma.loanFee.findFirstOrThrow({ where: { roundPlayerId: own.playerId } });
    const self = await correct(own.playerId, { kind: 'WAIVE_LATE_FEE', feeId: ownFee.id, reason: 'my own' });
    expect(self.json().error.code).toBe('ADMIN_SELF_ACTION');

    const fee = await app.prisma.loanFee.findFirstOrThrow({ where: { roundPlayerId: playerId } });
    await app.prisma.round.update({ where: { id: roundId }, data: { status: 'ENDED' } });
    try {
      const frozen = await correct(playerId, { kind: 'WAIVE_LATE_FEE', feeId: fee.id, reason: 'too late' });
      expect(frozen.json().error.code).toBe('ROUND_FINISHED');
      expect((await get<AdminLoanPlayerDto>(`/api/admin/players/${playerId}/loans`)).body.frozen).toBe(true);
    } finally {
      await app.prisma.round.update({ where: { id: roundId }, data: { status: 'ACTIVE' } });
    }
    expect((await app.prisma.loanFee.findUniqueOrThrow({ where: { id: fee.id } })).waivedCents).toBe(0n);
  });
});
