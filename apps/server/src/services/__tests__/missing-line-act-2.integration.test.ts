import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV26B } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { QuestPageDto } from '@streets/shared';
import { ActivityService } from '../activity.service.js';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { ReputationService } from '../reputation.service.js';
import { StoreService } from '../store.service.js';

/**
 * Story campaign Slice E: Act II of The Missing Line on the shipped 2.6.0-B ruleset. The three
 * leads are held at once and finished in every possible order; each order must reach Two Buyers,
 * One Load. Opt in with STORY_INTEGRATION=1.
 */

const ruleset = classicOgV26B;
const ACT_ONE = ['ML_M01_NIGHT_RECEIPT', 'ML_M02_SMALL_FAVOR', 'ML_M03_OTHER_DOOR', 'ML_M04_ROLL_CALL', 'ML_M05_MISSING_LINE'];
const LEADS = ['ML_M06_PIPS_COUNT', 'ML_M07_NORTH_ROAD', 'ML_M08_TOMMYS_SERIAL'] as const;
type Lead = typeof LEADS[number];

function orders<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) => orders(items.filter((_, other) => other !== index)).map((rest) => [item, ...rest]));
}

describe.runIf(process.env.STORY_INTEGRATION === '1')('The Missing Line Act II with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  const accountIds: string[] = [];

  const card = (page: QuestPageDto, key: string) => page.quests.find((quest) => quest.key === key)!;
  const page = (playerId: string) => HandcraftedQuestService.page(app.prisma, playerId, ruleset);
  const claim = (playerId: string, key: string) => HandcraftedQuestService.claim(app.prisma, playerId, ruleset, key, { actionId: randomUUID() });

  /** A player who has finished Act I, as if they had played it. */
  async function playerAfterActOne(): Promise<string> {
    const username = `ml2_${randomUUID().slice(0, 8)}`;
    const account = await app.prisma.account.create({ data: {
      username, usernameNormalized: username, email: `${username}@example.invalid`, passwordHash: 'integration-fixture',
    } });
    accountIds.push(account.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } });
    const player = await app.prisma.roundPlayer.create({ data: {
      ...ruleset.round.startingPlayer, ...startingStock(ruleset),
      roundId, accountId: account.id, cityId: city.id,
      displayName: username, publicPimpId: -Math.floor(Math.random() * 2_000_000_000) - 1,
      crack: 100,
      reputation: { create: ReputationService.seedFor(ruleset) },
    } });
    await page(player.id);
    const now = new Date();
    await app.prisma.playerQuest.updateMany({
      where: { roundPlayerId: player.id, questDefinition: { key: { in: ACT_ONE } } },
      data: { status: 'COMPLETED', acceptedAt: now, completedAt: now, claimedAt: now },
    });
    return player.id;
  }

  const evidence: Record<Lead, (playerId: string) => Promise<unknown>> = {
    ML_M06_PIPS_COUNT: (playerId) => StoreService.trade(app.prisma, playerId, { store: 'PIP', item: 'CRACK', direction: 'sell', quantity: 1, actionId: randomUUID() }),
    ML_M07_NORTH_ROAD: (playerId) => app.prisma.$transaction((tx) => ActivityService.log(tx, playerId, 'RUN_RETURNED', {
      runId: randomUUID(), cities: ['Detroit'], cashCents: 0, cargoBack: {}, incidents: [],
    })),
    ML_M08_TOMMYS_SERIAL: (playerId) => StoreService.trade(app.prisma, playerId, { store: 'TOMMY', item: 'THUG', direction: 'buy', quantity: 1, actionId: randomUUID() }),
  };

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({ data: {
      name: 'Missing Line Act II fixture', slug: `missing-line-2-${randomUUID()}`,
      rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version,
      status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
  });

  afterAll(async () => {
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    for (const id of accountIds) await app.prisma.account.delete({ where: { id } });
    await app?.close();
  });

  for (const order of orders(LEADS)) {
    it(`reaches Two Buyers, One Load after ${order.map((key) => key.slice(7)).join(' → ')}`, async () => {
      const playerId = await playerAfterActOne();
      let board = await page(playerId);
      for (const lead of LEADS) expect(card(board, lead).status).toBe('AVAILABLE');
      expect(card(board, 'ML_M09_TWO_BUYERS').status).toBe('LOCKED');

      // All three leads can be held at once, and one lead's work never advances another.
      for (const lead of LEADS) board = await HandcraftedQuestService.accept(app.prisma, playerId, ruleset, lead);
      for (const lead of LEADS) expect(card(board, lead).status).toBe('ACTIVE');

      for (const [index, lead] of order.entries()) {
        await evidence[lead](playerId);
        board = await page(playerId);
        expect(card(board, lead).status).toBe('READY_TO_TURN_IN');
        for (const other of order.slice(index + 1)) expect(card(board, other).status).toBe('ACTIVE');
        await claim(playerId, lead);
        board = await page(playerId);
        const twoBuyers = card(board, 'ML_M09_TWO_BUYERS');
        if (index < order.length - 1) {
          expect(twoBuyers.status).toBe('LOCKED');
          expect(twoBuyers.requires?.map((requirement) => requirement.questKey).sort()).toEqual(order.slice(index + 1).sort());
        } else {
          expect(twoBuyers.status).toBe('AVAILABLE');
        }
      }
    }, 120_000);
  }

  it('plays on through Two Buyers, One Load and Vic’s confession', async () => {
    const playerId = await playerAfterActOne();
    for (const lead of LEADS) {
      await HandcraftedQuestService.accept(app.prisma, playerId, ruleset, lead);
      await evidence[lead](playerId);
      await claim(playerId, lead);
    }
    await HandcraftedQuestService.accept(app.prisma, playerId, ruleset, 'ML_M09_TWO_BUYERS');
    let board = await HandcraftedQuestService.respondToScene(app.prisma, playerId, ruleset, { questKey: 'ML_M09_TWO_BUYERS', sceneKey: 'two_buyers_briefed', responseKey: 'brief_tommy' });
    expect(card(board, 'ML_M09_TWO_BUYERS').status).toBe('READY_TO_TURN_IN');
    await claim(playerId, 'ML_M09_TWO_BUYERS');

    board = await HandcraftedQuestService.accept(app.prisma, playerId, ruleset, 'ML_M10_FAVOR_ALREADY_PAID');
    expect(card(board, 'ML_M10_FAVOR_ALREADY_PAID').story).toMatchObject({ speaker: 'Vic', chapter: 'Act II · Three Ways to Lose a Load' });
    board = await HandcraftedQuestService.respondToScene(app.prisma, playerId, ruleset, { questKey: 'ML_M10_FAVOR_ALREADY_PAID', sceneKey: 'vic_favor_answered', responseKey: 'take_to_ledger' });
    expect(card(board, 'ML_M10_FAVOR_ALREADY_PAID').status).toBe('READY_TO_TURN_IN');
    await claim(playerId, 'ML_M10_FAVOR_ALREADY_PAID');

    const history = await HandcraftedQuestService.history(app.prisma, playerId, ruleset);
    const actTwo = history.filter((quest) => [...LEADS, 'ML_M09_TWO_BUYERS', 'ML_M10_FAVOR_ALREADY_PAID'].includes(quest.key));
    expect(actTwo).toHaveLength(5);
    expect(actTwo.every((quest) => quest.status === 'COMPLETED')).toBe(true);
  }, 120_000);
});
