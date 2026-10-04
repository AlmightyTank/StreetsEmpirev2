import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV12F } from '@streets/rulesets';
import { seededRng, startingStock } from '@streets/rules-engine';
import { BlackjackService } from '../blackjack.service.js';
import { CasinoPokerService } from '../casino-poker.service.js';
import { CasinoService } from '../casino.service.js';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { ReputationService } from '../reputation.service.js';
import { RouletteService } from '../roulette.service.js';
import { seasonFeatAwards } from '../season-feats.js';
import { SeasonStatsService } from '../season-stats.service.js';
import { StreetDiceService } from '../street-dice.service.js';

const ruleset = classicOgV12F;

describe.runIf(process.env.TURF_INTEGRATION === '1')('1.2.0-F casino Jobs with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];

  async function fixture() {
    const round = await app.prisma.round.create({
      data: {
        name: 'Casino F fixture', slug: 'casino-f-' + randomUUID(),
        rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version,
        status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'new-york-city' } });
    return app.prisma.roundPlayer.create({
      data: {
        ...ruleset.round.startingPlayer, ...startingStock(ruleset),
        cashCents: 400_000_000n, roundId: round.id, accountId, cityId: city.id,
        displayName: 'ace_' + randomUUID().slice(0, 6), publicPimpId: 9950 + roundIds.length,
        reputation: { create: ReputationService.seedFor(ruleset) },
      },
      include: { round: true },
    });
  }

  async function quest(playerId: string, key: string) {
    const page = await HandcraftedQuestService.page(app.prisma, playerId, ruleset);
    return page.quests.find((row) => row.key === key)!;
  }

  const spinRoulette = (playerId: string, seed: number) => RouletteService.spin(app.prisma, playerId, {
    tableKey: 'STREET_ROULETTE', bets: [{ kind: 'RED', selection: 'RED', amountCents: 1_000 }], actionId: randomUUID(),
  }, seededRng(seed));

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'casino_f_' + randomUUID().slice(0, 6);
    const registered = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { username: name, email: name + '@example.invalid', password: randomUUID() },
    });
    accountId = registered.json().account.id;
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('offers Ace and completes House Rules from real casino play, paying standing and no cash', async () => {
    const player = await fixture();
    const opening = await HandcraftedQuestService.page(app.prisma, player.id, ruleset);
    expect(opening.contacts.map((contact) => contact.key)).toContain('ACE');
    expect(opening.quests.find((row) => row.key === 'ACE_HOUSE_RULES')?.status).toBe('AVAILABLE');
    expect(opening.quests.find((row) => row.key === 'ACE_FLOOR_TOUR')?.status).toBe('LOCKED');

    await HandcraftedQuestService.accept(app.prisma, player.id, ruleset, 'ACE_HOUSE_RULES');
    await CasinoService.buyChips(app.prisma, player.id, { amountCents: 1_000_000, actionId: randomUUID() });
    const page = await CasinoService.startSession(app.prisma, player.id, { amountCents: 800_000, actionId: randomUUID() });
    expect(page.host?.shortName).toBe('Ace');
    for (let seed = 1; seed <= 5; seed++) await spinRoulette(player.id, seed);

    const ready = await quest(player.id, 'ACE_HOUSE_RULES');
    expect(ready.status).toBe('READY_TO_TURN_IN');
    expect(ready.objectives.find((objective) => objective.id === 'wagers')).toMatchObject({ current: 5, completed: true });

    const before = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } });
    await HandcraftedQuestService.claim(app.prisma, player.id, ruleset, 'ACE_HOUSE_RULES', { actionId: randomUUID() });
    const after = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } });
    expect(after.cashCents).toBe(before.cashCents);
    const rep = await app.prisma.playerReputation.findUnique({ where: { roundPlayerId_trader: { roundPlayerId: player.id, trader: 'ACE' } } });
    expect(rep?.points).toBe(10);
    expect((await quest(player.id, 'ACE_FLOOR_TOUR')).status).toBe('AVAILABLE');
  });

  it('tours every game, reports a dealt natural, and records casino season stats', async () => {
    const player = await fixture();
    await HandcraftedQuestService.page(app.prisma, player.id, ruleset);
    const houseRules = await app.prisma.playerQuest.findFirstOrThrow({ where: { roundPlayerId: player.id, questDefinition: { key: 'ACE_HOUSE_RULES', rulesetId: ruleset.meta.id } } });
    await app.prisma.playerQuest.update({ where: { id: houseRules.id }, data: { status: 'COMPLETED', completedAt: new Date(), claimedAt: new Date() } });
    await HandcraftedQuestService.accept(app.prisma, player.id, ruleset, 'ACE_FLOOR_TOUR');
    await HandcraftedQuestService.accept(app.prisma, player.id, ruleset, 'ACE_NATURAL');

    await CasinoService.buyChips(app.prisma, player.id, { amountCents: 3_000_000, actionId: randomUUID() });
    await CasinoService.startSession(app.prisma, player.id, { amountCents: 2_500_000, actionId: randomUUID() });

    await spinRoulette(player.id, 1);
    const machine = ruleset.casino.slots.machines[0]!;
    await CasinoService.spinSlot(app.prisma, player.id, {
      machineKey: machine.key, betPerLineCents: machine.minBetPerLineCents,
      activePaylineKeys: machine.paylines.map((line) => line.key), actionId: randomUUID(),
    }, seededRng(2));
    const dice = await StreetDiceService.start(app.prisma, player.id, { tableKey: 'STREET_DICE', wagerCents: 1_000, actionId: randomUUID() }, seededRng(1));
    let point = dice;
    for (let roll = 0; point.status === 'ACTIVE' && roll < 200; roll++) {
      point = await StreetDiceService.roll(app.prisma, player.id, { roundId: dice.id, actionId: randomUUID() }, seededRng(100 + roll));
    }
    expect(point.status).toBe('SETTLED');

    // Stand on every hand until the persisted shoe deals a natural.
    let natural = false;
    for (let hand = 0; hand < 150 && !natural; hand++) {
      const dealt = await BlackjackService.deal(app.prisma, player.id, { tableKey: 'STREET_BLACKJACK', wagerCents: 1_000, actionId: randomUUID() }, seededRng(31));
      natural = dealt.playerHands[0]?.outcome === 'BLACKJACK';
      if (dealt.status === 'ACTIVE') await BlackjackService.stand(app.prisma, player.id, { handId: dealt.id, actionId: randomUUID() });
    }
    expect(natural).toBe(true);

    const tour = await quest(player.id, 'ACE_FLOOR_TOUR');
    expect(tour.status).toBe('READY_TO_TURN_IN');
    expect(tour.objectives.find((objective) => objective.id === 'every_game')?.current).toBe(4);
    expect((await quest(player.id, 'ACE_NATURAL')).status).toBe('READY_TO_TURN_IN');

    // A poker buy-in counts as playing poker, finishing the five-game bonus.
    const poker = await CasinoPokerService.start(app.prisma, player.id, { buyInCents: 10_000, actionId: randomUUID() }, seededRng(9));
    await CasinoPokerService.action(app.prisma, player.id, { handId: poker.hand.id, action: 'FOLD', actionId: randomUUID() }, seededRng(9));
    const bonus = await quest(player.id, 'ACE_FLOOR_TOUR');
    expect(bonus.objectives.find((objective) => objective.id === 'every_game')).toMatchObject({ current: 5, completed: true });

    const totals = (await SeasonStatsService.totals(app.prisma, [{ ...player, peakCrew: 0 }])).get(player.id)!;
    expect(totals.casinoRatedWagers).toBeGreaterThan(3);
    expect(totals.casinoCitiesPlayed).toBe(1);
    expect(totals.casinoTheoCents).toBeGreaterThan(0);
    expect(totals.casinoBiggestWinCents).toBeGreaterThan(0);
    const awards = seasonFeatAwards({ name: 'Casino F', totals }, []);
    expect(awards.find((award) => award.key === 'first-chip')?.unlocked).toBe(true);
    expect(awards.find((award) => award.key === 'grand-tour')?.unlocked).toBe(false);
  }, 120_000);

  it('pays the floor-walker title as an account cosmetic when the tour is claimed', async () => {
    const player = await fixture();
    await HandcraftedQuestService.page(app.prisma, player.id, ruleset);
    const houseRules = await app.prisma.playerQuest.findFirstOrThrow({ where: { roundPlayerId: player.id, questDefinition: { key: 'ACE_HOUSE_RULES', rulesetId: ruleset.meta.id } } });
    await app.prisma.playerQuest.update({ where: { id: houseRules.id }, data: { status: 'COMPLETED', completedAt: new Date(), claimedAt: new Date() } });
    await HandcraftedQuestService.accept(app.prisma, player.id, ruleset, 'ACE_FLOOR_TOUR');
    await CasinoService.buyChips(app.prisma, player.id, { amountCents: 1_000_000, actionId: randomUUID() });
    await CasinoService.startSession(app.prisma, player.id, { amountCents: 800_000, actionId: randomUUID() });
    await spinRoulette(player.id, 1);
    const machine = ruleset.casino.slots.machines[0]!;
    await CasinoService.spinSlot(app.prisma, player.id, {
      machineKey: machine.key, betPerLineCents: machine.minBetPerLineCents,
      activePaylineKeys: machine.paylines.map((line) => line.key), actionId: randomUUID(),
    }, seededRng(2));
    const dice = await StreetDiceService.start(app.prisma, player.id, { tableKey: 'STREET_DICE', wagerCents: 1_000, actionId: randomUUID() }, seededRng(1));
    let point = dice;
    for (let roll = 0; point.status === 'ACTIVE' && roll < 200; roll++) {
      point = await StreetDiceService.roll(app.prisma, player.id, { roundId: dice.id, actionId: randomUUID() }, seededRng(100 + roll));
    }
    const hand = await BlackjackService.deal(app.prisma, player.id, { tableKey: 'STREET_BLACKJACK', wagerCents: 1_000, actionId: randomUUID() }, seededRng(31));
    if (hand.status === 'ACTIVE') await BlackjackService.stand(app.prisma, player.id, { handId: hand.id, actionId: randomUUID() });

    expect((await quest(player.id, 'ACE_FLOOR_TOUR')).status).toBe('READY_TO_TURN_IN');
    await HandcraftedQuestService.claim(app.prisma, player.id, ruleset, 'ACE_FLOOR_TOUR', { actionId: randomUUID() });
    const cosmetic = await app.prisma.accountCosmeticUnlock.findFirst({ where: { accountId, key: 'ace-floor-walker' } });
    expect(cosmetic).not.toBeNull();
  }, 60_000);
});
