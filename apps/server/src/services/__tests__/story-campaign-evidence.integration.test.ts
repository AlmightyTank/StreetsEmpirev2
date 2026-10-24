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
import { StoreService } from '../store.service.js';

/**
 * Story campaign Slice A: the store evidence The Missing Line relies on, read from the
 * PlayerActivity rows the real store actions write, then run through the real quest matcher.
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

  it('a basket checkout keeps storeKey inside lines[], so storeKey filters do not see it (blocker B1)', async () => {
    await StoreService.checkout(app.prisma, playerId, {
      lines: [{ store: 'TOMMY', item: 'THUG', direction: 'buy', quantity: 1 }],
      actionId: randomUUID(),
    });
    const activity = await lastActivity();
    expect(activity.type).toBe('STORE_BUY');
    expect(activity.payload).toMatchObject({ lines: [{ storeKey: 'TOMMY', direction: 'buy', quantity: 1 }] });
    expect(activity.payload).not.toHaveProperty('storeKey');
    // Campaign store objectives must not ship until checkout evidence reaches the matcher.
    expect(matches(tommyBuy, activity)).toBe(false);
  });
});
