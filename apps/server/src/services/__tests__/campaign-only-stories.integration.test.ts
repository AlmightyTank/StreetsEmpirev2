import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV26I } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { ReputationService } from '../reputation.service.js';
import { StoreService } from '../store.service.js';

/**
 * 2.6.0-I: a new round's job board holds the campaign as its only story, and a campaign chapter
 * grants the permanent unlock a retired job used to. Opt in with STORY_INTEGRATION=1.
 */
describe.runIf(process.env.STORY_INTEGRATION === '1')('The Missing Line as the only story, with PostgreSQL', () => {
  const ruleset = classicOgV26I;
  let app: FastifyInstance;
  let roundId = '';
  let accountId = '';
  let playerId = '';

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({ data: {
      name: 'Campaign-only fixture', slug: `campaign-only-${randomUUID()}`,
      rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version,
      status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    const username = `mlo_${randomUUID().slice(0, 8)}`;
    const account = await app.prisma.account.create({ data: {
      username, usernameNormalized: username, email: `${username}@example.invalid`, passwordHash: 'integration-fixture',
    } });
    accountId = account.id;
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } });
    const player = await app.prisma.roundPlayer.create({ data: {
      ...ruleset.round.startingPlayer, ...startingStock(ruleset),
      roundId, accountId, cityId: city.id,
      displayName: username, publicPimpId: -Math.floor(Math.random() * 2_000_000_000) - 1,
      reputation: { create: ReputationService.seedFor(ruleset) },
    } });
    playerId = player.id;
  });

  afterAll(async () => {
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('shows only campaign story jobs, and pays a retired job’s unlock from a campaign chapter', async () => {
    const page = await HandcraftedQuestService.page(app.prisma, playerId, ruleset);
    const stories = page.quests.filter((quest) => ['STORY', 'SIDE', 'CONTRACT'].includes(quest.type));
    expect(stories.length).toBeGreaterThan(0);
    expect(stories.every((quest) => quest.key.startsWith('ML_'))).toBe(true);
    expect(stories.find((quest) => quest.status === 'AVAILABLE')?.key).toBe('ML_M01_NIGHT_RECEIPT');

    const now = new Date();
    await app.prisma.playerQuest.updateMany({
      where: { roundPlayerId: playerId, questDefinition: { key: { in: ['ML_M01_NIGHT_RECEIPT', 'ML_M02_SMALL_FAVOR'] } } },
      data: { status: 'COMPLETED', acceptedAt: now, completedAt: now, claimedAt: now },
    });
    await HandcraftedQuestService.accept(app.prisma, playerId, ruleset, 'ML_M03_OTHER_DOOR');
    await StoreService.trade(app.prisma, playerId, { store: 'PIP', item: 'CRACK', direction: 'sell', quantity: 10, actionId: randomUUID() });
    await HandcraftedQuestService.respondToScene(app.prisma, playerId, ruleset, { questKey: 'ML_M03_OTHER_DOOR', sceneKey: 'route_slip', responseKey: 'keep_a_copy' });
    expect(await app.prisma.playerUnlock.count({ where: { roundPlayerId: playerId, key: 'PRODUCT_WEED_RECIPE' } })).toBe(0);
    await HandcraftedQuestService.claim(app.prisma, playerId, ruleset, 'ML_M03_OTHER_DOOR', { actionId: randomUUID() });
    const unlock = await app.prisma.playerUnlock.findFirst({ where: { roundPlayerId: playerId, key: 'PRODUCT_WEED_RECIPE' } });
    expect(unlock).toMatchObject({ sourceQuestKey: 'ML_M03_OTHER_DOOR' });
  }, 120_000);
});
