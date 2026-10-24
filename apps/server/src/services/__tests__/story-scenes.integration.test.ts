import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  LATEST_RULESET,
  defineQuestCatalog,
  rulesets,
  type QuestObjectiveDefinition,
  type QuestStorySceneDefinition,
  type Ruleset,
} from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { QuestPageDto } from '@streets/shared';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { ReputationService } from '../reputation.service.js';
import { StoreService } from '../store.service.js';

/**
 * Story campaign Slice B: scene responses, end to end on PostgreSQL, against a test-only ruleset
 * registered for this suite. Opt in with STORY_INTEGRATION=1.
 */

const sceneObjective = (questKey: string, sceneKey: string): QuestObjectiveDefinition => ({
  id: `${sceneKey}_done`, kind: 'EVENT_COUNT', description: 'Play the scene.', target: 1,
  params: { eventTypes: ['QUEST_STORY_SCENE'], where: { questKey, sceneKey } },
});
const story = (scenes: readonly QuestStorySceneDefinition[]) => ({
  chapter: 'Test chapter', intro: 'Rain on the avenue.', inProgress: 'Still raining.', ready: 'Done.', completed: 'Closed.',
  actionHint: 'Play the scene.', scenes,
});
const base = {
  contactKey: 'MAMA_KING', type: 'STORY', category: 'STREET', difficulty: 'STREET_JOB', prerequisites: [],
  bonusObjectives: [], rewards: [{ kind: 'CASH', amount: 1_000 }], followUpKeys: [],
  repeatability: 'ONCE', expiresAfterMinutes: null, availability: {},
} as const;
const receipt: QuestStorySceneDefinition = {
  key: 'night_receipt', title: 'The receipt', prose: 'One line has been rubbed almost through the paper.',
  responses: [
    { key: 'return_unopened', label: 'Return it unopened', outcome: 'Mama keeps the envelope.' },
    { key: 'read_the_line', label: 'Read the erased line', outcome: 'You can make out four letters.' },
  ],
};
const countSheet: QuestStorySceneDefinition = {
  key: 'count_sheet', title: 'The count sheet', prose: 'Pip lays your receipt beside his count.', after: ['pip_sale'],
  responses: [{ key: 'compare', label: 'Compare them', outcome: 'The numbers do not match.' }],
};

const testRuleset: Ruleset = {
  ...LATEST_RULESET,
  meta: { ...LATEST_RULESET.meta, id: 'story-scenes-test', version: 'test-b' },
  questDefinitions: defineQuestCatalog({
    SCENE_TEST_RECEIPT: {
      ...base, key: 'SCENE_TEST_RECEIPT', title: 'The Night Receipt', description: 'Handle the receipt.',
      objectives: [sceneObjective('SCENE_TEST_RECEIPT', 'night_receipt')], story: story([receipt]),
    },
    SCENE_TEST_COUNT: {
      ...base, key: 'SCENE_TEST_COUNT', title: "Pip's Count", description: 'Sell to Pip, then compare.',
      objectives: [
        { id: 'pip_sale', kind: 'EVENT_COUNT', description: 'Sell to Pip.', target: 1, params: { eventTypes: ['STORE_SELL'], where: { storeKey: 'PIP' } } },
        sceneObjective('SCENE_TEST_COUNT', 'count_sheet'),
      ],
      story: story([countSheet]),
    },
  }),
};

describe.runIf(process.env.STORY_INTEGRATION === '1')('story scenes with PostgreSQL', () => {
  const registry = rulesets as Record<string, Ruleset>;
  let app: FastifyInstance;
  const roundIds: string[] = [];
  const accountIds: string[] = [];

  async function newPlayer(ruleset: Ruleset = testRuleset) {
    const round = await app.prisma.round.create({ data: {
      name: 'Story scenes fixture', slug: `story-scenes-${randomUUID()}`,
      rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version,
      status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundIds.push(round.id);
    const username = `scenes_${randomUUID().slice(0, 8)}`;
    const account = await app.prisma.account.create({ data: {
      username, usernameNormalized: username, email: `${username}@example.invalid`, passwordHash: 'integration-fixture',
    } });
    accountIds.push(account.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } });
    const player = await app.prisma.roundPlayer.create({ data: {
      ...ruleset.round.startingPlayer, ...startingStock(ruleset),
      roundId: round.id, accountId: account.id, cityId: city.id,
      displayName: username, publicPimpId: -Math.floor(Math.random() * 2_000_000_000) - 1,
      cashCents: 50_000_000n, crack: 100,
      reputation: { create: ReputationService.seedFor(ruleset) },
    } });
    return player.id;
  }

  const respond = (playerId: string, questKey: string, sceneKey: string, responseKey: string, ruleset = testRuleset) =>
    HandcraftedQuestService.respondToScene(app.prisma, playerId, ruleset, { questKey, sceneKey, responseKey });
  const card = (page: QuestPageDto, key: string) => page.quests.find((quest) => quest.key === key)!;
  const activities = (playerId: string) => app.prisma.playerActivity.count({ where: { roundPlayerId: playerId, type: 'QUEST_STORY_SCENE' } });

  beforeAll(async () => {
    registry[testRuleset.meta.id] = testRuleset;
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    for (const id of accountIds) await app.prisma.account.delete({ where: { id } });
    delete registry[testRuleset.meta.id];
    await app?.close();
  });

  it('shows the scene, records one response, readies the job and refuses a changed answer', async () => {
    const playerId = await newPlayer();
    let page = await HandcraftedQuestService.page(app.prisma, playerId, testRuleset);
    const available = card(page, 'SCENE_TEST_RECEIPT');
    expect(available.status).toBe('AVAILABLE');
    expect(available.story?.lesson).toBeUndefined();
    expect(available.story?.scenes).toEqual([{
      key: 'night_receipt', title: 'The receipt', prose: receipt.prose,
      responses: [{ key: 'return_unopened', label: 'Return it unopened' }, { key: 'read_the_line', label: 'Read the erased line' }],
      available: false, response: null,
    }]);
    await expect(respond(playerId, 'SCENE_TEST_RECEIPT', 'night_receipt', 'return_unopened')).rejects.toMatchObject({ code: 'QUEST_NOT_ACTIVE' });

    page = await HandcraftedQuestService.accept(app.prisma, playerId, testRuleset, 'SCENE_TEST_RECEIPT');
    expect(card(page, 'SCENE_TEST_RECEIPT').story?.scenes?.[0]?.available).toBe(true);

    page = await respond(playerId, 'SCENE_TEST_RECEIPT', 'night_receipt', 'read_the_line');
    const answered = card(page, 'SCENE_TEST_RECEIPT');
    expect(answered.status).toBe('READY_TO_TURN_IN');
    expect(answered.story?.scenes?.[0]).toMatchObject({
      available: false,
      response: { key: 'read_the_line', label: 'Read the erased line', outcome: 'You can make out four letters.' },
    });
    expect(await activities(playerId)).toBe(1);
    const activity = await app.prisma.playerActivity.findFirstOrThrow({ where: { roundPlayerId: playerId, type: 'QUEST_STORY_SCENE' } });
    expect(activity.payload).toEqual({
      questKey: 'SCENE_TEST_RECEIPT', title: 'The Night Receipt', attempt: 1,
      sceneKey: 'night_receipt', sceneTitle: 'The receipt', responseKey: 'read_the_line',
    });

    // The same answer again is a no-op; a different one is refused.
    await respond(playerId, 'SCENE_TEST_RECEIPT', 'night_receipt', 'read_the_line');
    await expect(respond(playerId, 'SCENE_TEST_RECEIPT', 'night_receipt', 'return_unopened')).rejects.toMatchObject({ code: 'SCENE_ALREADY_ANSWERED' });
    expect(await activities(playerId)).toBe(1);
    expect(await app.prisma.questSceneResponse.count({ where: { playerQuest: { roundPlayerId: playerId } } })).toBe(1);

    // The answer survives the claim and stays readable on the history card.
    await HandcraftedQuestService.claim(app.prisma, playerId, testRuleset, 'SCENE_TEST_RECEIPT', { actionId: randomUUID() });
    const history = await HandcraftedQuestService.history(app.prisma, playerId, testRuleset);
    expect(history.find((quest) => quest.key === 'SCENE_TEST_RECEIPT')?.story?.scenes?.[0]?.response?.key).toBe('read_the_line');
  }, 60_000);

  it('refuses unknown scenes and responses', async () => {
    const playerId = await newPlayer();
    await HandcraftedQuestService.accept(app.prisma, playerId, testRuleset, 'SCENE_TEST_RECEIPT');
    await expect(respond(playerId, 'SCENE_TEST_RECEIPT', 'count_sheet', 'compare')).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
    await expect(respond(playerId, 'SCENE_TEST_RECEIPT', 'night_receipt', 'burn_it')).rejects.toMatchObject({ code: 'SCENE_RESPONSE_INVALID' });
    await expect(respond(playerId, 'NO_SUCH_QUEST', 'night_receipt', 'return_unopened')).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
    expect(await activities(playerId)).toBe(0);
  }, 60_000);

  it('keeps a scene closed until the work it follows is done', async () => {
    const playerId = await newPlayer();
    let page = await HandcraftedQuestService.accept(app.prisma, playerId, testRuleset, 'SCENE_TEST_COUNT');
    expect(card(page, 'SCENE_TEST_COUNT').story?.scenes?.[0]?.available).toBe(false);
    await expect(respond(playerId, 'SCENE_TEST_COUNT', 'count_sheet', 'compare')).rejects.toMatchObject({ code: 'SCENE_NOT_AVAILABLE' });

    await StoreService.trade(app.prisma, playerId, { store: 'PIP', item: 'CRACK', direction: 'sell', quantity: 1, actionId: randomUUID() });
    page = await HandcraftedQuestService.page(app.prisma, playerId, testRuleset);
    expect(card(page, 'SCENE_TEST_COUNT').story?.scenes?.[0]?.available).toBe(true);
    page = await respond(playerId, 'SCENE_TEST_COUNT', 'count_sheet', 'compare');
    expect(card(page, 'SCENE_TEST_COUNT').status).toBe('READY_TO_TURN_IN');
  }, 60_000);

  it('lets a player who abandons the job play its scene again with a different answer', async () => {
    const playerId = await newPlayer();
    await HandcraftedQuestService.accept(app.prisma, playerId, testRuleset, 'SCENE_TEST_RECEIPT');
    await respond(playerId, 'SCENE_TEST_RECEIPT', 'night_receipt', 'return_unopened');
    let page = await HandcraftedQuestService.abandon(app.prisma, playerId, testRuleset, 'SCENE_TEST_RECEIPT');
    expect(card(page, 'SCENE_TEST_RECEIPT').story?.scenes?.[0]).toMatchObject({ available: false, response: null });
    await HandcraftedQuestService.accept(app.prisma, playerId, testRuleset, 'SCENE_TEST_RECEIPT');
    page = await respond(playerId, 'SCENE_TEST_RECEIPT', 'night_receipt', 'read_the_line');
    expect(card(page, 'SCENE_TEST_RECEIPT')).toMatchObject({ status: 'READY_TO_TURN_IN', story: { scenes: [{ response: { key: 'read_the_line' } }] } });
  }, 60_000);

  it('records one response and one event when the same answer arrives concurrently', async () => {
    const playerId = await newPlayer();
    await HandcraftedQuestService.accept(app.prisma, playerId, testRuleset, 'SCENE_TEST_RECEIPT');
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => respond(playerId, 'SCENE_TEST_RECEIPT', 'night_receipt', 'return_unopened')));
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(await activities(playerId)).toBe(1);
    expect(await app.prisma.questSceneResponse.count({ where: { playerQuest: { roundPlayerId: playerId } } })).toBe(1);
    const row = await app.prisma.playerQuest.findFirstOrThrow({ where: { roundPlayerId: playerId, questDefinition: { key: 'SCENE_TEST_RECEIPT' } }, include: { progressReceipts: true } });
    expect(row.progressReceipts.map((receipt) => receipt.sourceKey)).toEqual([`quest-scene:${row.id}:night_receipt`]);
  }, 60_000);

  it('only answers scenes in the ruleset the round is pinned to', async () => {
    const playerId = await newPlayer(LATEST_RULESET);
    await expect(respond(playerId, 'SCENE_TEST_RECEIPT', 'night_receipt', 'return_unopened', LATEST_RULESET)).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' });
    // Even naming the test ruleset, a player in another round has no attempt at the job.
    await expect(respond(playerId, 'SCENE_TEST_RECEIPT', 'night_receipt', 'return_unopened')).rejects.toMatchObject({ code: 'QUEST_NOT_FOUND' });
  }, 60_000);
});
