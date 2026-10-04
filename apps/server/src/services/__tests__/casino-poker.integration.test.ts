import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV12E } from '@streets/rulesets';
import { seededRng, startingStock } from '@streets/rules-engine';
import { CasinoPokerService } from '../casino-poker.service.js';
import { CasinoService } from '../casino.service.js';
import { ReputationService } from '../reputation.service.js';

describe.runIf(process.env.TURF_INTEGRATION === '1')('1.2.0-E solo Poker with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const extraAccountIds: string[] = [];
  const roundIds: string[] = [];

  async function fixture() {
    const round = await app.prisma.round.create({
      data: {
        name: 'Casino E fixture', slug: 'casino-e-' + randomUUID(),
        rulesetId: classicOgV12E.meta.id, rulesetVersion: classicOgV12E.meta.version,
        status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'new-york-city' } });
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...classicOgV12E.round.startingPlayer, ...startingStock(classicOgV12E),
        cashCents: 3_000_000n, roundId: round.id, accountId, cityId: city.id,
        displayName: 'poker_' + randomUUID().slice(0, 6), publicPimpId: 9850 + roundIds.length,
        reputation: { create: ReputationService.seedFor(classicOgV12E) },
      },
    });
    return player;
  }

  async function openBankroll(playerId: string) {
    await CasinoService.buyChips(app.prisma, playerId, { amountCents: 500_000, actionId: randomUUID() });
    return CasinoService.startSession(app.prisma, playerId, { amountCents: 300_000, actionId: randomUUID() });
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'poker_' + randomUUID().slice(0, 6);
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: name + '@example.invalid', password: randomUUID() } });
    accountId = registered.json().account.id;
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    for (const id of extraAccountIds) await app.prisma.account.delete({ where: { id } });
    await app?.close();
  });

  it('persists a private-card hand, replays actions, blocks cash-out mid-hand, and returns the remaining stack', async () => {
    const player = await fixture();
    const before = await openBankroll(player.id);
    const rng = seededRng(20261004);
    const startId = randomUUID();
    const dealt = await CasinoPokerService.start(app.prisma, player.id, { buyInCents: 10_000, actionId: startId }, rng);
    expect(dealt.hand.status).toBe('ACTIVE');
    expect(dealt.hand.seats.find((seat) => seat.isHuman)?.cards).toHaveLength(2);
    expect(dealt.hand.seats.filter((seat) => !seat.isHuman).every((seat) => seat.cards.length === 0)).toBe(true);
    expect(dealt.hand.amountToCallCents).toBe(100);
    expect(dealt.poker.activeHand?.id).toBe(dealt.hand.id);
    await expect(CasinoService.closeSession(app.prisma, player.id, before.openSession!.id, randomUUID()))
      .rejects.toMatchObject({ code: 'POKER_HAND_ACTIVE' });

    const call = { handId: dealt.hand.id, action: 'CALL' as const, actionId: randomUUID() };
    const afterCall = await CasinoPokerService.action(app.prisma, player.id, call, rng);
    expect(await CasinoPokerService.action(app.prisma, player.id, call, rng)).toEqual(afterCall);
    let hand = afterCall.hand;
    for (let attempt = 0; hand.status === 'ACTIVE' && attempt < 5; attempt += 1) {
      hand = (await CasinoPokerService.action(app.prisma, player.id, {
        handId: hand.id,
        action: hand.amountToCallCents > 0 ? 'CALL' : 'CHECK',
        actionId: randomUUID(),
      }, rng)).hand;
    }
    expect(hand.status).toBe('SETTLED');
    expect((await CasinoPokerService.state(app.prisma, player.id)).activeHand).toBeNull();
    const page = await CasinoService.page(app.prisma, player.id);
    expect(page.openSession?.bankrollCents).toBe(hand.bankrollAfterCents);
    expect(await app.prisma.casinoPokerAction.count({ where: { roundPlayerId: player.id, handId: hand.id } })).toBeGreaterThanOrEqual(2);
  });

  it('plays a persistent multiplayer hand with private cards, turns, and cash-out refunds', async () => {
    const first = await fixture();
    const accountName = 'poker_' + randomUUID().slice(0, 6);
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: accountName, email: accountName + '@example.invalid', password: randomUUID() } });
    const secondAccountId = registered.json().account.id as string;
    extraAccountIds.push(secondAccountId);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'new-york-city' } });
    const second = await app.prisma.roundPlayer.create({ data: {
      ...classicOgV12E.round.startingPlayer, ...startingStock(classicOgV12E), cashCents: 3_000_000n,
      roundId: first.roundId, accountId: secondAccountId, cityId: city.id,
      displayName: 'poker_guest_' + randomUUID().slice(0, 5), publicPimpId: 9950 + roundIds.length,
      reputation: { create: ReputationService.seedFor(classicOgV12E) },
    } });
    await openBankroll(first.id); await openBankroll(second.id);
    const created = await CasinoPokerService.createTable(app.prisma, first.id, { name: 'Test table', visibility: 'PUBLIC', buyInCents: 10_000, maxPlayers: 2, actionId: randomUUID() });
    await CasinoPokerService.joinTable(app.prisma, second.id, created.table.id, { actionId: randomUUID() });
    const started = await CasinoPokerService.startTableHand(app.prisma, first.id, created.table.id, { actionId: randomUUID() }, seededRng(804));
    expect(started.table.hand?.myTurn).toBe(true);
    expect(started.table.hand?.seats.find((seat) => !seat.isYou)?.cards).toHaveLength(0);
    await expect(CasinoPokerService.playTableAction(app.prisma, second.id, created.table.id, { action: 'CHECK', actionId: randomUUID() })).rejects.toMatchObject({ code: 'POKER_ACTION_INVALID' });

    let view = (await CasinoPokerService.playTableAction(app.prisma, first.id, created.table.id, { action: 'CALL', actionId: randomUUID() })).table;
    view = (await CasinoPokerService.playTableAction(app.prisma, second.id, created.table.id, { action: 'CHECK', actionId: randomUUID() })).table;
    for (let attempt = 0; view.hand?.street !== 'SHOWDOWN' && attempt < 12; attempt += 1) {
      const playerId = view.hand?.turnSeatNo === 1 ? first.id : second.id;
      view = (await CasinoPokerService.playTableAction(app.prisma, playerId, created.table.id, { action: (view.hand?.amountToCallCents ?? 0) ? 'CALL' : 'CHECK', actionId: randomUUID() })).table;
    }
    expect(view.hand?.street).toBe('SHOWDOWN');
    expect(view.hand?.seats.find((seat) => !seat.isYou)?.cards).toHaveLength(2);
    expect(view.status).toBe('WAITING');
    await CasinoPokerService.leaveTable(app.prisma, first.id, created.table.id, randomUUID());
    await CasinoPokerService.leaveTable(app.prisma, second.id, created.table.id, randomUUID());
    expect((await CasinoPokerService.state(app.prisma, first.id)).tables.find((table) => table.id === created.table.id)?.status).toBeUndefined();
    expect(await app.prisma.casinoLedgerEntry.count({ where: { roundPlayerId: { in: [first.id, second.id] }, kind: { in: ['POKER_TABLE_BUY_IN', 'POKER_TABLE_REFUND'] } } })).toBe(4);
  });
});
