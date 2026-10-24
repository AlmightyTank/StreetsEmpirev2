import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import {
  LATEST_RULESET,
  applyQuestProgress,
  type QuestDataValue,
  type QuestObjectiveDefinition,
} from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { ReputationService } from '../reputation.service.js';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { QuestProgressService } from '../quest-progress.service.js';
import { StoreService } from '../store.service.js';

/**
 * Story campaign Slice A: the store evidence The Missing Line relies on, read from the
 * PlayerActivity rows the real store actions write, then run through the real quest matcher and,
 * for baskets, the real quest-progress pipeline.
 * See docs/STORY-QUEST-CAMPAIGN-SLICE-A.md. Opt in with STORY_INTEGRATION=1.
 */
describe.runIf(process.env.STORY_INTEGRATION === '1')('story campaign store evidence with PostgreSQL', () => {
  const ruleset = LATEST_RULESET;
  let app: FastifyInstance;
  let roundId = '';
  let accountId = '';
  let playerId = '';

  const pipSale: QuestObjectiveDefinition = {
    id: 'pip_sale', kind: 'EVENT_COUNT', description: 'Sell to Pip.', target: 1,
    params: { eventTypes: ['STORE_SELL'], where: { storeKey: 'PIP' } },
  };
  const pipTrade: QuestObjectiveDefinition = {
    id: 'pip_trade', kind: 'EVENT_COUNT', description: 'Trade with Pip.', target: 1,
    params: { eventTypes: ['STORE_BUY', 'STORE_SELL'], where: { storeKey: 'PIP' } },
  };
  const tommyBuy: QuestObjectiveDefinition = {
    id: 'tommy_buy', kind: 'EVENT_COUNT', description: 'Buy from Tommy.', target: 1,
    params: { eventTypes: ['STORE_BUY'], where: { storeKey: 'TOMMY' } },
  };

  function matches(objective: QuestObjectiveDefinition, activity: { type: string; payload: Prisma.JsonValue }) {
    return applyQuestProgress([objective], {}, { type: activity.type, payload: activity.payload as QuestDataValue }).completed;
  }

  async function lastActivity() {
    return app.prisma.playerActivity.findFirstOrThrow({
      where: { roundPlayerId: playerId, type: { in: ['STORE_BUY', 'STORE_SELL'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({
      data: {
        name: 'Story campaign evidence fixture', slug: `story-evidence-${randomUUID()}`,
        rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version,
        status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundId = round.id;
    const username = `story_${randomUUID().slice(0, 8)}`;
    const account = await app.prisma.account.create({ data: {
      username, usernameNormalized: username, email: `${username}@example.invalid`, passwordHash: 'integration-fixture',
    } });
    accountId = account.id;
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } });
    const player = await app.prisma.roundPlayer.create({ data: {
      ...ruleset.round.startingPlayer, ...startingStock(ruleset),
      roundId, accountId, cityId: city.id,
      displayName: username, publicPimpId: -Math.floor(Math.random() * 2_000_000_000) - 1,
      cashCents: 50_000_000n, crack: 100,
      reputation: { create: ReputationService.seedFor(ruleset) },
    } });
    playerId = player.id;
  });

  afterAll(async () => {
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('a single sale to Pip records storeKey PIP at the top level and counts for Pip objectives', async () => {
    await StoreService.trade(app.prisma, playerId, { store: 'PIP', item: 'CRACK', direction: 'sell', quantity: 1, actionId: randomUUID() });
    const activity = await lastActivity();
    expect(activity.type).toBe('STORE_SELL');
    expect(activity.payload).toMatchObject({ storeKey: 'PIP', direction: 'sell', quantity: 1 });
    expect(matches(pipSale, activity)).toBe(true);
    expect(matches(pipTrade, activity)).toBe(true);
    expect(matches(tommyBuy, activity)).toBe(false);
  });

  it('a single buy from Tommy records storeKey TOMMY at the top level and counts for Tommy objectives', async () => {
    await StoreService.trade(app.prisma, playerId, { store: 'TOMMY', item: 'THUG', direction: 'buy', quantity: 1, actionId: randomUUID() });
    const activity = await lastActivity();
    expect(activity.type).toBe('STORE_BUY');
    expect(activity.payload).toMatchObject({ storeKey: 'TOMMY', direction: 'buy', quantity: 1 });
    expect(matches(tommyBuy, activity)).toBe(true);
    expect(matches(pipTrade, activity)).toBe(false);
  });

  it('a basket checkout records each line with its storeKey, itemKey and direction', async () => {
    await StoreService.checkout(app.prisma, playerId, {
      lines: [{ store: 'TOMMY', item: 'THUG', direction: 'buy', quantity: 1 }],
      actionId: randomUUID(),
    });
    const activity = await lastActivity();
    expect(activity.type).toBe('STORE_BUY');
    expect(activity.payload).toMatchObject({ lines: [{ storeKey: 'TOMMY', itemKey: 'THUG', direction: 'buy', quantity: 1 }] });
  });

  it('credits each basket line to quests exactly like the same trades made one at a time', async () => {
    await HandcraftedQuestService.page(app.prisma, playerId, ruleset);
    const keys = ['TOMMY_STOCK_THE_CREW', 'BOARD_TOMMY_MUSCLE', 'BOARD_PIP_FIRST_SALE'];
    const definitions = await app.prisma.questDefinition.findMany({
      where: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, key: { in: keys } },
    });
    expect(definitions.map((row) => row.key).sort()).toEqual([...keys].sort());
    for (const definition of definitions) {
      await app.prisma.playerQuest.upsert({
        where: { roundPlayerId_questDefinitionId_attempt: { roundPlayerId: playerId, questDefinitionId: definition.id, attempt: 1 } },
        create: { roundPlayerId: playerId, questDefinitionId: definition.id, status: 'ACTIVE', acceptedAt: new Date() },
        update: { status: 'ACTIVE', acceptedAt: new Date(), objectiveProgress: {}, bonusProgress: {} },
      });
    }

    // A mixed basket: two buys from Tommy and a sale to Pip, checked out as one action.
    await StoreService.checkout(app.prisma, playerId, {
      lines: [
        { store: 'TOMMY', item: 'PISTOL', direction: 'buy', quantity: 2 },
        { store: 'TOMMY', item: 'THUG', direction: 'buy', quantity: 1 },
        { store: 'PIP', item: 'CRACK', direction: 'sell', quantity: 3 },
      ],
      actionId: randomUUID(),
    });

    const progress = async (key: string) => (await app.prisma.playerQuest.findFirstOrThrow({
      where: { roundPlayerId: playerId, questDefinition: { key, rulesetId: ruleset.meta.id } },
      include: { progressReceipts: true },
    }));
    const pistols = await progress('TOMMY_STOCK_THE_CREW');
    expect(pistols.objectiveProgress).toMatchObject({ buy_pistols: { current: 2 } });
    // One receipt per line; only the pistol line credits the pistol count.
    const credited = pistols.progressReceipts.filter((receipt) => (receipt.applied as { required?: Record<string, number> }).required?.buy_pistols);
    expect(pistols.progressReceipts.map((receipt) => receipt.sourceKey.replace(/^activity:[^:]+/, '')).sort()).toEqual([':line:0', ':line:1', ':line:2']);
    expect(credited.map((receipt) => receipt.sourceKey)).toEqual([expect.stringMatching(/:line:0$/)]);
    expect((await progress('BOARD_TOMMY_MUSCLE')).objectiveProgress).toMatchObject({ hire_muscle: { current: 1, completed: true } });
    // The sale counts even though the basket as a whole cost money.
    expect((await progress('BOARD_PIP_FIRST_SALE')).objectiveProgress).toMatchObject({ sell_crack: { current: 3 } });

    // Recording the same basket again credits nothing twice.
    const replay = await QuestProgressService.recordActivity(app.prisma, await lastActivity());
    expect(replay.advanced).toBe(0);
    expect((await progress('TOMMY_STOCK_THE_CREW')).objectiveProgress).toMatchObject({ buy_pistols: { current: 2 } });
  });
});
