import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV26A } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { QuestPageDto } from '@streets/shared';
import { ActivityService } from '../activity.service.js';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { ReputationService } from '../reputation.service.js';
import { StoreService } from '../store.service.js';

/**
 * Story campaign Slice D: Act I of The Missing Line played start to finish on the shipped
 * 2.6.0-A ruleset. Opt in with STORY_INTEGRATION=1.
 */
describe.runIf(process.env.STORY_INTEGRATION === '1')('The Missing Line Act I with PostgreSQL', () => {
  const ruleset = classicOgV26A;
  let app: FastifyInstance;
  let roundId = '';
  let accountId = '';
  let playerId = '';

  const card = (page: QuestPageDto, key: string) => page.quests.find((quest) => quest.key === key)!;
  const claim = (key: string) => HandcraftedQuestService.claim(app.prisma, playerId, ruleset, key, { actionId: randomUUID() });
  const respond = (questKey: string, sceneKey: string, responseKey: string) =>
    HandcraftedQuestService.respondToScene(app.prisma, playerId, ruleset, { questKey, sceneKey, responseKey });
  const cash = async () => (await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).cashCents;
  const rep = async (trader: string) => (await app.prisma.playerReputation.findFirst({ where: { roundPlayerId: playerId, trader } }))?.points ?? 0;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({ data: {
      name: 'Missing Line Act I fixture', slug: `missing-line-${randomUUID()}`,
      rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version,
      status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    const username = `ml_${randomUUID().slice(0, 8)}`;
    const account = await app.prisma.account.create({ data: {
      username, usernameNormalized: username, email: `${username}@example.invalid`, passwordHash: 'integration-fixture',
    } });
    accountId = account.id;
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } });
    const player = await app.prisma.roundPlayer.create({ data: {
      ...ruleset.round.startingPlayer, ...startingStock(ruleset),
      roundId, accountId, cityId: city.id,
      displayName: username, publicPimpId: -Math.floor(Math.random() * 2_000_000_000) - 1,
      crack: 100,
      reputation: { create: ReputationService.seedFor(ruleset) },
    } });
    playerId = player.id;
  });

  afterAll(async () => {
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('plays from the night receipt to the missing line, paying each chapter once', async () => {
    let page = await HandcraftedQuestService.page(app.prisma, playerId, ruleset);
    expect(card(page, 'ML_M01_NIGHT_RECEIPT').status).toBe('AVAILABLE');
    expect(card(page, 'ML_M02_SMALL_FAVOR').status).toBe('LOCKED');
    expect(card(page, 'ML_M01_NIGHT_RECEIPT').story).toMatchObject({ speaker: 'Mama King', chapter: 'Act I · A Name in the Rain' });
    expect(card(page, 'ML_M01_NIGHT_RECEIPT').story?.lesson).toBeUndefined();
    const cashBefore = await cash();
    const mamaBefore = await rep('MAMA_KING');

    // 1. The Night Receipt: a scene.
    await HandcraftedQuestService.accept(app.prisma, playerId, ruleset, 'ML_M01_NIGHT_RECEIPT');
    page = await respond('ML_M01_NIGHT_RECEIPT', 'night_receipt_handled', 'examine_line');
    expect(card(page, 'ML_M01_NIGHT_RECEIPT').status).toBe('READY_TO_TURN_IN');
    await claim('ML_M01_NIGHT_RECEIPT');

    // 2. A Small Favor: a scene.
    await HandcraftedQuestService.accept(app.prisma, playerId, ruleset, 'ML_M02_SMALL_FAVOR');
    await respond('ML_M02_SMALL_FAVOR', 'alvarez_statement_taken', 'ask_who_collected');
    await claim('ML_M02_SMALL_FAVOR');

    // 3. The Other Door: a sale to Pip after taking the job.
    page = await HandcraftedQuestService.accept(app.prisma, playerId, ruleset, 'ML_M03_OTHER_DOOR');
    expect(card(page, 'ML_M03_OTHER_DOOR').status).toBe('ACTIVE');
    await StoreService.trade(app.prisma, playerId, { store: 'PIP', item: 'CRACK', direction: 'sell', quantity: 1, actionId: randomUUID() });
    page = await HandcraftedQuestService.page(app.prisma, playerId, ruleset);
    expect(card(page, 'ML_M03_OTHER_DOOR').status).toBe('READY_TO_TURN_IN');
    await claim('ML_M03_OTHER_DOOR');

    // 4. Roll Call: a run comes home (the same feed write bringHome makes).
    await HandcraftedQuestService.accept(app.prisma, playerId, ruleset, 'ML_M04_ROLL_CALL');
    await app.prisma.$transaction((tx) => ActivityService.log(tx, playerId, 'RUN_RETURNED', {
      runId: randomUUID(), cities: ['Detroit'], cashCents: 0, cargoBack: {}, incidents: [],
    }));
    page = await HandcraftedQuestService.page(app.prisma, playerId, ruleset);
    expect(card(page, 'ML_M04_ROLL_CALL').status).toBe('READY_TO_TURN_IN');
    await claim('ML_M04_ROLL_CALL');

    // 5. The Missing Line: Ledger's scene.
    await HandcraftedQuestService.accept(app.prisma, playerId, ruleset, 'ML_M05_MISSING_LINE');
    await respond('ML_M05_MISSING_LINE', 'missing_line_compared', 'keep_the_name');
    await claim('ML_M05_MISSING_LINE');

    // Act I pays $8,000 in all (800,000 cents) on top of whatever the Pip sale earned.
    const sale = await app.prisma.playerActivity.findFirstOrThrow({ where: { roundPlayerId: playerId, type: 'STORE_SELL' } });
    expect(await cash() - cashBefore).toBe(800_000n + BigInt((sale.payload as { totalCents: number }).totalCents));
    expect(await rep('MAMA_KING') - mamaBefore).toBe(11);
    expect(await rep('LEDGER')).toBeGreaterThanOrEqual(5);

    // The history remembers each choice.
    const history = await HandcraftedQuestService.history(app.prisma, playerId, ruleset);
    const choice = (key: string) => history.find((quest) => quest.key === key)?.story?.scenes?.[0]?.response?.key;
    expect([choice('ML_M01_NIGHT_RECEIPT'), choice('ML_M02_SMALL_FAVOR'), choice('ML_M05_MISSING_LINE')])
      .toEqual(['examine_line', 'ask_who_collected', 'keep_the_name']);
    expect(history.filter((quest) => quest.key.startsWith('ML_M')).every((quest) => quest.status === 'COMPLETED')).toBe(true);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: playerId, type: 'QUEST_STORY_SCENE' } })).toBe(3);

    // A claimed chapter cannot be collected twice.
    await expect(claim('ML_M05_MISSING_LINE')).rejects.toMatchObject({ statusCode: 409 });
  }, 120_000);
});
