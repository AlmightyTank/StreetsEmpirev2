import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV165C } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { DueSettleService } from '../due-settle.service.js';
import { LoanService } from '../loan.service.js';
import { PlayerStateService } from '../player-state.service.js';
import { ReputationService } from '../reputation.service.js';
import { reconcileLoans } from '../loan-reconcile.service.js';

const rules = classicOgV165C.loanShark;
const quick = rules.offers[0]!;
const HOUR = 3_600_000;

/**
 * The alerts poller's due sweep: loan installments and property upkeep settle on their due
 * time while the owner is away, from the cash on hand then, and only in live rounds.
 */
describe.runIf(process.env.LOAN_INTEGRATION === '1')('due settle sweep with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];

  async function fixture(cashCents = 5_000_000n): Promise<string> {
    const created = await app.prisma.round.create({
      data: {
        name: 'Due settle fixture',
        slug: `due-${randomUUID()}`,
        rulesetId: classicOgV165C.meta.id,
        rulesetVersion: classicOgV165C.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    roundIds.push(created.id);
    const cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: classicOgV165C.round.startingCitySlug } })).id;
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...classicOgV165C.round.startingPlayer,
        ...startingStock(classicOgV165C),
        cashCents,
        roundId: created.id,
        accountId,
        cityId,
        displayName: `due-${created.id.slice(-6)}`,
        publicPimpId: 9300,
        reputation: { create: ReputationService.seedFor(classicOgV165C) },
      },
    });
    return player.id;
  }

  /** A Quick Cash loan, taken and then aged so its first installment is an hour overdue. */
  async function overdueLoan(playerId: string, cashAfter: bigint) {
    const { result } = await LoanService.acceptOffer(app.prisma, playerId, { offerKey: quick.key, quotedFeeCents: quick.contractFeeCents, requestKey: randomUUID() });
    const shift = (rules.installmentIntervalHours + 1) * HOUR;
    await app.prisma.loan.update({ where: { id: result.loan.id }, data: { acceptedAt: new Date(Date.parse(result.loan.acceptedAt) - shift) } });
    for (const row of await app.prisma.loanInstallment.findMany({ where: { loanId: result.loan.id } })) {
      await app.prisma.loanInstallment.update({ where: { id: row.id }, data: { dueAt: new Date(row.dueAt.getTime() - shift) } });
    }
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: cashAfter } });
    return result.loan.id;
  }

  const roundOf = async (playerId: string) => (await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId }, select: { roundId: true } })).roundId;

  beforeAll(async () => {
    app = await (await import('../../app.js')).buildApp();
    const name = `due_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() },
    });
    accountId = registered.json().account.id;
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('collects an installment on time while its owner is away, once', async () => {
    const playerId = await fixture();
    await overdueLoan(playerId, 5_000_000n);
    expect(await DueSettleService.loanOwners(app.prisma, new Date())).toContain(playerId);
    await DueSettleService.sweep(app.prisma, new Date());
    const payments = await app.prisma.loanPayment.findMany({ where: { roundPlayerId: playerId } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ kind: 'SCHEDULED', amountCents: BigInt((quick.principalCents + quick.contractFeeCents) / 2) });
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).cashCents).toBe(5_000_000n - payments[0]!.amountCents);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: playerId, type: 'LOAN_PAYMENT' } })).toBe(1);
    // Nothing is due any more: the next sweep leaves them alone.
    expect(await DueSettleService.loanOwners(app.prisma, new Date())).not.toContain(playerId);
    await DueSettleService.sweep(app.prisma, new Date());
    expect(await app.prisma.loanPayment.count({ where: { roundPlayerId: playerId } })).toBe(1);
    expect(await reconcileLoans(app.prisma as never, playerId, classicOgV165C)).toEqual([]);
  });

  it('tells the bell about a missed installment without the player doing anything', async () => {
    const playerId = await fixture();
    await overdueLoan(playerId, 0n);
    await DueSettleService.sweep(app.prisma, new Date());
    expect(await app.prisma.loanInstallment.count({ where: { roundPlayerId: playerId, status: 'MISSED' } })).toBe(1);
    expect(await app.prisma.inAppNotification.count({ where: { roundPlayerId: playerId, activity: { type: 'LOAN_INSTALLMENT_MISSED' } } })).toBe(1);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).loanCollectionState).toBe('DELINQUENT');
    await DueSettleService.sweep(app.prisma, new Date());
    expect(await app.prisma.loanFee.count({ where: { roundPlayerId: playerId } })).toBe(1);
  });

  it('does not settle due loans when an online dashboard read hits a paused round', async () => {
    const playerId = await fixture();
    await overdueLoan(playerId, 5_000_000n);
    await app.prisma.round.update({ where: { id: await roundOf(playerId) }, data: { pausedAt: new Date(), pauseReason: 'test' } });

    // /api/game/me calls this same settlement path on every foreground and background poll.
    await PlayerStateService.settle(app.prisma, playerId, { markActive: false, now: new Date() });

    expect(await app.prisma.loanPayment.count({ where: { roundPlayerId: playerId } })).toBe(0);
    expect(await app.prisma.loanFee.count({ where: { roundPlayerId: playerId } })).toBe(0);
    expect(await app.prisma.loanInstallment.count({ where: { roundPlayerId: playerId, status: 'SCHEDULED' } })).toBe(2);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).loanCollectionState).toBe('CLEAR');
  });
  it('leaves paused and finished rounds alone', async () => {
    // Paused or ended after the loan is taken: actions refuse both, and so does the sweep.
    const paused = await fixture();
    await overdueLoan(paused, 5_000_000n);
    await app.prisma.round.update({ where: { id: await roundOf(paused) }, data: { pausedAt: new Date(), pauseReason: 'test' } });
    const ended = await fixture();
    await overdueLoan(ended, 5_000_000n);
    await app.prisma.round.update({ where: { id: await roundOf(ended) }, data: { endsAt: new Date(Date.now() - 60_000) } });
    const owners = await DueSettleService.loanOwners(app.prisma, new Date());
    expect(owners).not.toContain(paused);
    expect(owners).not.toContain(ended);
    await DueSettleService.sweep(app.prisma, new Date());
    expect(await app.prisma.loanPayment.count({ where: { roundPlayerId: { in: [paused, ended] } } })).toBe(0);
  });

  it('charges property upkeep on time when it can be paid, and skips owners who cannot', async () => {
    const period = classicOgV165C.supplyNetwork.properties.upkeepPeriodHours * HOUR;
    const make = async (cashCents: bigint) => {
      const playerId = await fixture(cashCents);
      const warehouse = await app.prisma.supplyWarehouse.create({
        data: {
          roundPlayerId: playerId, citySlug: classicOgV165C.round.startingCitySlug, name: 'Test warehouse', capacityUnits: 1_000,
          kind: 'WAREHOUSE', upkeepCents: 100_000n, purchasedCents: 1_000_000n, paidThrough: new Date(Date.now() - period / 2),
        },
      });
      return { playerId, warehouse };
    };
    const payer = await make(5_000_000n);
    const broke = await make(50_000n);
    const owners = await DueSettleService.upkeepOwners(app.prisma, new Date());
    expect(owners).toContain(payer.playerId);
    expect(owners).not.toContain(broke.playerId);
    await DueSettleService.sweep(app.prisma, new Date());
    const paid = await app.prisma.supplyWarehouse.findUniqueOrThrow({ where: { id: payer.warehouse.id } });
    expect(paid.paidThrough!.getTime()).toBe(payer.warehouse.paidThrough!.getTime() + period);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: payer.playerId } })).cashCents).toBe(4_900_000n);
    expect(await app.prisma.economyLedgerEntry.count({ where: { roundPlayerId: payer.playerId, source: 'SUPPLY_UPKEEP' } })).toBe(1);
    // Paid up: not due again until the next period.
    expect(await DueSettleService.upkeepOwners(app.prisma, new Date())).not.toContain(payer.playerId);
    expect((await app.prisma.supplyWarehouse.findUniqueOrThrow({ where: { id: broke.warehouse.id } })).paidThrough).toEqual(broke.warehouse.paidThrough);
  });

  it('keeps going when one owner fails', async () => {
    const first = await fixture();
    await overdueLoan(first, 5_000_000n);
    const second = await fixture();
    await overdueLoan(second, 5_000_000n);
    const settle = PlayerStateService.settle.bind(PlayerStateService);
    vi.spyOn(PlayerStateService, 'settle').mockImplementation((prisma, id, options) => {
      if (id === first) return Promise.reject(new Error('boom'));
      return settle(prisma, id, options);
    });
    const errors: string[] = [];
    const outcome = await DueSettleService.sweep(app.prisma, new Date(), (id) => errors.push(id));
    expect(errors).toEqual([first]);
    expect(outcome.failed).toBe(1);
    expect(await app.prisma.loanPayment.count({ where: { roundPlayerId: second } })).toBe(1);
    expect(await app.prisma.loanPayment.count({ where: { roundPlayerId: first } })).toBe(0);
  });
});
