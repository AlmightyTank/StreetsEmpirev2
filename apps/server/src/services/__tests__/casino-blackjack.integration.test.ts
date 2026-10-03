import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV12C } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { BlackjackService } from '../blackjack.service.js';
import { CasinoService } from '../casino.service.js';
import { ReputationService } from '../reputation.service.js';

describe.runIf(process.env.TURF_INTEGRATION === '1')('1.2.0-C blackjack with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];

  async function fixture(citySlug = 'new-york-city') {
    const round = await app.prisma.round.create({
      data: {
        name: 'Casino C fixture',
        slug: 'casino-c-' + randomUUID(),
        rulesetId: classicOgV12C.meta.id,
        rulesetVersion: classicOgV12C.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: citySlug } });
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...classicOgV12C.round.startingPlayer,
        ...startingStock(classicOgV12C),
        cashCents: 2_000_000n,
        roundId: round.id,
        accountId,
        cityId: city.id,
        displayName: 'blackjack_' + randomUUID().slice(0, 6),
        publicPimpId: 9700 + roundIds.length,
        reputation: { create: ReputationService.seedFor(classicOgV12C) },
      },
    });
    return { round, player, city };
  }

  async function openBankroll(playerId: string, amountCents = 300_000) {
    await CasinoService.buyChips(app.prisma, playerId, { amountCents: 500_000, actionId: randomUUID() });
    return CasinoService.startSession(app.prisma, playerId, { amountCents, actionId: randomUUID() });
  }

  async function rigShoe(playerId: string, tableKey: string, front: string[]) {
    const filler = Array.from({ length: 120 }, (_, index) => ['2S', '3H', '4D', '5C'][index % 4]!);
    await app.prisma.casinoBlackjackShoe.upsert({
      where: { roundPlayerId_tableKey: { roundPlayerId: playerId, tableKey } },
      update: { cards: [...front, ...filler], cursor: 0, shuffleNumber: 7 },
      create: { roundPlayerId: playerId, tableKey, cards: [...front, ...filler], cursor: 0, shuffleNumber: 7 },
    });
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'blackjack_' + randomUUID().slice(0, 6);
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: name, email: name + '@example.invalid', password: randomUUID() },
    });
    accountId = registered.json().account.id;
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('persists the exact active hand and replays a duplicate deal', async () => {
    const { player } = await fixture();
    const beforeDeal = await openBankroll(player.id);
    const table = classicOgV12C.casino.blackjack.tables[0]!;
    await rigShoe(player.id, table.key, ['10S', '6H', '7D', '9C', '5S']);
    const actionId = randomUUID();

    const dealt = await BlackjackService.deal(app.prisma, player.id, {
      tableKey: table.key,
      wagerCents: table.minBetCents,
      actionId,
    });
    expect(dealt.status).toBe('ACTIVE');
    expect(dealt.playerHands[0]!.total).toBe(17);
    expect(dealt.dealerCards[0]!.label).toBe('6♥');
    expect(dealt.dealerCards[1]!.hidden).toBe(true);
    expect(dealt.shuffleNumber).toBe(7);

    const reconnect = await BlackjackService.state(app.prisma, player.id);
    expect(reconnect.activeHand?.id).toBe(dealt.id);
    expect(reconnect.activeHand?.playerHands[0]!.total).toBe(17);

    const replay = await BlackjackService.deal(app.prisma, player.id, {
      tableKey: table.key,
      wagerCents: table.minBetCents,
      actionId,
    });
    expect(replay).toEqual(dealt);
    await expect(BlackjackService.deal(app.prisma, player.id, {
      tableKey: table.key,
      wagerCents: table.minBetCents * 2,
      actionId,
    })).rejects.toMatchObject({ code: 'ACTION_ID_REUSED' });
    expect(await app.prisma.casinoBlackjackHand.count({ where: { roundPlayerId: player.id } })).toBe(1);

    const pageDuringHand = await CasinoService.page(app.prisma, player.id);
    expect(pageDuringHand.totalCasinoValueCents).toBe(beforeDeal.totalCasinoValueCents);
    const persisted = await app.prisma.casinoBlackjackHand.findUniqueOrThrow({ where: { id: dealt.id } });
    expect(persisted.committedWagerCents).toBe(BigInt(table.minBetCents));
  });

  it('stands, plays the dealer from the server shoe, settles and records history', async () => {
    const { player } = await fixture();
    await openBankroll(player.id);
    const table = classicOgV12C.casino.blackjack.tables[0]!;
    await rigShoe(player.id, table.key, ['10S', '6H', '7D', '9C', '5S']);
    const dealt = await BlackjackService.deal(app.prisma, player.id, {
      tableKey: table.key,
      wagerCents: 1_000,
      actionId: randomUUID(),
    });
    const standAction = randomUUID();
    const settled = await BlackjackService.stand(app.prisma, player.id, {
      handId: dealt.id,
      actionId: standAction,
    });

    expect(settled.status).toBe('SETTLED');
    expect(settled.dealerTotal).toBe(20);
    expect(settled.playerHands[0]!.outcome).toBe('LOSE');
    expect(settled.netCents).toBe(-1_000);

    const state = await BlackjackService.state(app.prisma, player.id);
    expect(state.activeHand).toBeNull();
    expect(state.history[0]?.id).toBe(dealt.id);

    const replay = await BlackjackService.stand(app.prisma, player.id, {
      handId: dealt.id,
      actionId: standAction,
    });
    expect(replay).toEqual(settled);
    expect(await app.prisma.casinoBlackjackAction.count({ where: { roundPlayerId: player.id, actionId: standAction } })).toBe(1);
  });

  it('pays natural blackjack 3:2 without drawing the dealer past the opening hand', async () => {
    const { player } = await fixture();
    await openBankroll(player.id);
    const table = classicOgV12C.casino.blackjack.tables[0]!;
    await rigShoe(player.id, table.key, ['AS', '9H', 'KD', '8C', '10S']);

    const hand = await BlackjackService.deal(app.prisma, player.id, {
      tableKey: table.key,
      wagerCents: 1_000,
      actionId: randomUUID(),
    });

    expect(hand.status).toBe('SETTLED');
    expect(hand.playerHands[0]!.outcome).toBe('BLACKJACK');
    expect(hand.totalReturnCents).toBe(2_500);
    expect(hand.netCents).toBe(1_500);
    expect(hand.dealerCards).toHaveLength(2);
  });

  it('supports double down with exactly one final player card', async () => {
    const { player } = await fixture();
    await openBankroll(player.id);
    const table = classicOgV12C.casino.blackjack.tables[0]!;
    await rigShoe(player.id, table.key, ['5S', '9H', '6D', '7C', '10S', '4H']);

    const dealt = await BlackjackService.deal(app.prisma, player.id, {
      tableKey: table.key,
      wagerCents: 1_000,
      actionId: randomUUID(),
    });
    const doubled = await BlackjackService.double(app.prisma, player.id, {
      handId: dealt.id,
      actionId: randomUUID(),
    });

    expect(doubled.status).toBe('SETTLED');
    expect(doubled.playerHands[0]!.cards).toHaveLength(3);
    expect(doubled.playerHands[0]!.wagerCents).toBe(2_000);
    expect(doubled.playerHands[0]!.total).toBe(21);
    expect(doubled.playerHands[0]!.outcome).toBe('WIN');
    expect(doubled.totalReturnCents).toBe(4_000);
  });

  it('supports splitting a matching pair into separately playable hands', async () => {
    const { player } = await fixture();
    await openBankroll(player.id);
    const table = classicOgV12C.casino.blackjack.tables[0]!;
    await rigShoe(player.id, table.key, ['8S', '6H', '8D', '10C', '3S', '2H', '5D']);

    const dealt = await BlackjackService.deal(app.prisma, player.id, {
      tableKey: table.key,
      wagerCents: 1_000,
      actionId: randomUUID(),
    });
    const split = await BlackjackService.split(app.prisma, player.id, {
      handId: dealt.id,
      actionId: randomUUID(),
    });
    expect(split.status).toBe('ACTIVE');
    expect(split.playerHands).toHaveLength(2);
    expect(split.totalWagerCents).toBe(2_000);
    expect(split.playerHands[0]!.cards).toHaveLength(2);
    expect(split.playerHands[1]!.cards).toHaveLength(2);

    const firstStand = await BlackjackService.stand(app.prisma, player.id, {
      handId: dealt.id,
      actionId: randomUUID(),
    });
    expect(firstStand.status).toBe('ACTIVE');
    expect(firstStand.activeHandIndex).toBe(1);

    const final = await BlackjackService.stand(app.prisma, player.id, {
      handId: dealt.id,
      actionId: randomUUID(),
    });
    expect(final.status).toBe('SETTLED');
    expect(final.playerHands.every((hand) => hand.outcome !== null)).toBe(true);
  });

  it('lets an already-dealt hand finish after the boss travels away', async () => {
    const { player } = await fixture('new-york-city');
    await openBankroll(player.id);
    const table = classicOgV12C.casino.blackjack.tables[0]!;
    await rigShoe(player.id, table.key, ['10S', '6H', '7D', '9C', '5S']);

    const dealt = await BlackjackService.deal(app.prisma, player.id, {
      tableKey: table.key,
      wagerCents: table.minBetCents,
      actionId: randomUUID(),
    });
    const detroit = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'detroit' } });
    await app.prisma.roundPlayer.update({ where: { id: player.id }, data: { cityId: detroit.id } });

    const settled = await BlackjackService.stand(app.prisma, player.id, {
      handId: dealt.id,
      actionId: randomUUID(),
    });
    expect(settled.status).toBe('SETTLED');
    expect(settled.playerHands[0]!.outcome).toBe('LOSE');
  });

  it('enforces table venue availability and refuses session close during a live hand', async () => {
    const { player } = await fixture('new-york-city');
    const page = await openBankroll(player.id);
    const highLimit = classicOgV12C.casino.blackjack.tables[2]!;
    await expect(BlackjackService.deal(app.prisma, player.id, {
      tableKey: highLimit.key,
      wagerCents: highLimit.minBetCents,
      actionId: randomUUID(),
    })).rejects.toMatchObject({ code: 'BLACKJACK_TABLE_NOT_HERE' });

    const street = classicOgV12C.casino.blackjack.tables[0]!;
    await rigShoe(player.id, street.key, ['10S', '6H', '7D', '9C', '5S']);
    await BlackjackService.deal(app.prisma, player.id, {
      tableKey: street.key,
      wagerCents: street.minBetCents,
      actionId: randomUUID(),
    });

    await expect(CasinoService.closeSession(
      app.prisma,
      player.id,
      page.openSession!.id,
      randomUUID(),
    )).rejects.toMatchObject({ code: 'BLACKJACK_HAND_ACTIVE' });
  });
});
