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

  async function guest(roundId: string) {
    const accountName = 'poker_' + randomUUID().slice(0, 6);
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: accountName, email: accountName + '@example.invalid', password: randomUUID() } });
    const guestAccountId = registered.json().account.id as string;
    extraAccountIds.push(guestAccountId);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'new-york-city' } });
    return app.prisma.roundPlayer.create({ data: {
      ...classicOgV12E.round.startingPlayer, ...startingStock(classicOgV12E), cashCents: 3_000_000n,
      roundId, accountId: guestAccountId, cityId: city.id,
      displayName: 'poker_guest_' + randomUUID().slice(0, 5), publicPimpId: 9700 + extraAccountIds.length,
      reputation: { create: ReputationService.seedFor(classicOgV12E) },
    } });
  }

  it('rotates the solo blinds through the player instead of letting the player sit out every blind', async () => {
    const player = await fixture();
    await openBankroll(player.id);
    const posted: number[] = [];
    for (let handNo = 0; handNo < 4; handNo += 1) {
      const dealt = await CasinoPokerService.start(app.prisma, player.id, { buyInCents: 10_000, actionId: randomUUID() }, seededRng(500 + handNo));
      const human = dealt.hand.seats.find((seat) => seat.isHuman)!;
      posted.push(human.contributionCents);
      expect(dealt.hand.seats.reduce((sum, seat) => sum + seat.contributionCents, 0)).toBe(150);
      expect(dealt.hand.amountToCallCents).toBe(100 - human.contributionCents);
      await CasinoPokerService.action(app.prisma, player.id, { handId: dealt.hand.id, action: 'FOLD', actionId: randomUUID() }, seededRng(1));
    }
    expect(posted).toEqual([0, 50, 100, 0]);
  });

  it('keeps Poker chips in casino value and net worth while they are in play', async () => {
    const player = await fixture();
    const before = await openBankroll(player.id);
    const worth = async () => (await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } })).netWorthCents;
    const worthBefore = await worth();
    const dealt = await CasinoPokerService.start(app.prisma, player.id, { buyInCents: 10_000, actionId: randomUUID() }, seededRng(77));
    expect(dealt.hand.status).toBe('ACTIVE');
    const page = await CasinoService.page(app.prisma, player.id);
    expect(page.openSession?.bankrollCents).toBe(before.openSession!.bankrollCents - 10_000);
    expect(page.totalCasinoValueCents).toBe(before.totalCasinoValueCents);
    expect(await worth()).toBe(worthBefore);
    await CasinoPokerService.action(app.prisma, player.id, { handId: dealt.hand.id, action: 'FOLD', actionId: randomUUID() }, seededRng(1));

    const other = await guest(player.roundId);
    await openBankroll(other.id);
    const table = await CasinoPokerService.createTable(app.prisma, player.id, { name: 'Worth table', visibility: 'PUBLIC', buyInCents: 20_000, maxPlayers: 2, actionId: randomUUID() });
    await CasinoPokerService.joinTable(app.prisma, other.id, table.table.id, { actionId: randomUUID() });
    const seated = await CasinoService.page(app.prisma, player.id);
    await CasinoPokerService.startTableHand(app.prisma, player.id, table.table.id, { actionId: randomUUID() }, seededRng(9));
    const midHand = await CasinoService.page(app.prisma, player.id);
    expect(midHand.totalCasinoValueCents).toBe(seated.totalCasinoValueCents);
  });

  it('lets a busted seat watch the table and lets the hand skip a player who stops acting', async () => {
    const host = await fixture();
    const [second, busted] = [await guest(host.roundId), await guest(host.roundId)];
    for (const id of [host.id, second.id, busted.id]) await openBankroll(id);
    const created = await CasinoPokerService.createTable(app.prisma, host.id, { name: 'Idle table', visibility: 'PUBLIC', buyInCents: 10_000, maxPlayers: 3, actionId: randomUUID() });
    await CasinoPokerService.joinTable(app.prisma, second.id, created.table.id, { actionId: randomUUID() });
    await CasinoPokerService.joinTable(app.prisma, busted.id, created.table.id, { actionId: randomUUID() });
    await app.prisma.casinoPokerSeat.updateMany({ where: { tableId: created.table.id, roundPlayerId: busted.id }, data: { stackCents: 0n } });

    const started = await CasinoPokerService.startTableHand(app.prisma, host.id, created.table.id, { actionId: randomUUID() }, seededRng(31));
    expect(started.table.hand?.seats).toHaveLength(2);
    const watching = await CasinoPokerService.table(app.prisma, busted.id, created.table.id);
    expect(watching.hand?.myTurn).toBe(false);
    expect(watching.hand?.seats.every((seat) => !seat.isYou && seat.cards.length === 0)).toBe(true);
    expect(watching.hand?.turnExpiresAt).toEqual(expect.any(String));

    const turnSeatNo = started.table.hand!.turnSeatNo!;
    const idle = turnSeatNo === 1 ? host : second;
    const waiting = idle.id === host.id ? second : host;
    await expect(CasinoPokerService.timeoutTableTurn(app.prisma, waiting.id, created.table.id, randomUUID()))
      .rejects.toMatchObject({ code: 'POKER_TURN_NOT_EXPIRED' });
    await expect(CasinoPokerService.timeoutTableTurn(app.prisma, idle.id, created.table.id, randomUUID(), new Date(Date.now() + 120_000)))
      .rejects.toMatchObject({ code: 'POKER_YOUR_TURN' });
    await expect(CasinoPokerService.timeoutTableTurn(app.prisma, busted.id, created.table.id, randomUUID(), new Date(Date.now() + 120_000)))
      .rejects.toMatchObject({ code: 'POKER_NOT_IN_HAND' });

    const skipId = randomUUID();
    const skipped = await CasinoPokerService.timeoutTableTurn(app.prisma, waiting.id, created.table.id, skipId, new Date(Date.now() + 120_000));
    // Heads-up preflop the button owes half a blind, so the idle seat folds and the hand ends.
    expect(skipped.table.hand?.street).toBe('SHOWDOWN');
    expect(skipped.table.hand?.seats.find((seat) => seat.seatNo === turnSeatNo)?.folded).toBe(true);
    expect(skipped.table.status).toBe('WAITING');
    expect(await CasinoPokerService.timeoutTableTurn(app.prisma, waiting.id, created.table.id, skipId, new Date(Date.now() + 120_000))).toEqual(skipped);
    for (const id of [host.id, second.id, busted.id]) await CasinoPokerService.leaveTable(app.prisma, id, created.table.id, randomUUID());
  });
});
