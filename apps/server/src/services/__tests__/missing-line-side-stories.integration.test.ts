import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV26H, type QuestDefinitionCatalog } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { QuestPageDto } from '@streets/shared';
import { ActivityService } from '../activity.service.js';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { ProductionService } from '../production.service.js';
import { ReputationService } from '../reputation.service.js';
import { ScoutService } from '../scout.service.js';
import { StoreService } from '../store.service.js';

/**
 * Story campaign Slices K–O: every Missing Line side story on 2.6.0-H, played with the real
 * scouting, store, checkout, production and run actions, and the finale lines that remember them.
 * Opt in with STORY_INTEGRATION=1.
 */

const ruleset = classicOgV26H;
const catalog = ruleset.questDefinitions as QuestDefinitionCatalog;
const MAIN = Object.keys(catalog).filter((key) => key.startsWith('ML_M'));

describe.runIf(process.env.STORY_INTEGRATION === '1')('The Missing Line side stories with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let accountId = '';
  let playerId = '';

  const card = (page: QuestPageDto, key: string) => page.quests.find((quest) => quest.key === key)!;
  const board = () => HandcraftedQuestService.page(app.prisma, playerId, ruleset);
  const accept = (key: string) => HandcraftedQuestService.accept(app.prisma, playerId, ruleset, key);
  const claim = (key: string) => HandcraftedQuestService.claim(app.prisma, playerId, ruleset, key, { actionId: randomUUID() });
  const respond = (questKey: string, responseKey: string) => {
    const sceneKey = catalog[questKey]!.story!.scenes![0]!.key;
    return HandcraftedQuestService.respondToScene(app.prisma, playerId, ruleset, { questKey, sceneKey, responseKey });
  };
  const firstResponse = (questKey: string) => catalog[questKey]!.story!.scenes![0]!.responses[0]!.key;
  const scout = (district: string) => ScoutService.scout(app.prisma, playerId, { district, turns: 1, actionId: randomUUID() });
  const buy = (store: string, item: string, quantity: number) => StoreService.trade(app.prisma, playerId, { store, item, direction: 'buy', quantity, actionId: randomUUID() });
  const runHome = () => app.prisma.$transaction((tx) => ActivityService.log(tx, playerId, 'RUN_RETURNED', {
    runId: randomUUID(), cities: ['Detroit'], cashCents: 0, cargoBack: {}, incidents: [],
  }));

  /** Accept a side quest, do its work, play its scene, and collect. */
  async function play(key: string, work: () => Promise<unknown> = async () => undefined) {
    await accept(key);
    if (catalog[key]!.story!.scenes![0]!.after) {
      await expect(respond(key, firstResponse(key))).rejects.toMatchObject({ code: 'SCENE_NOT_AVAILABLE' });
    }
    await work();
    const page = await respond(key, firstResponse(key));
    expect(card(page, key).status, key).toBe('READY_TO_TURN_IN');
    await claim(key);
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({ data: {
      name: 'Missing Line side stories fixture', slug: `missing-line-side-${randomUUID()}`,
      rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version,
      status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    const username = `mls_${randomUUID().slice(0, 8)}`;
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

  it('opens nothing before its main chapter, then plays all fifteen and lets the finale remember them', async () => {
    let page = await board();
    for (const key of Object.keys(catalog).filter((entry) => entry.startsWith('ML_S'))) expect(card(page, key).status, key).toBe('LOCKED');

    // The main story is finished, as if played.
    const now = new Date();
    await app.prisma.playerQuest.updateMany({
      where: { roundPlayerId: playerId, questDefinition: { key: { in: MAIN } } },
      data: { status: 'COMPLETED', acceptedAt: now, completedAt: now, claimedAt: now },
    });
    page = await board();
    for (const key of ['ML_S01_KEY_UNDER_MAT', 'ML_S03_WARM_ROOM', 'ML_S04_WEIGHT_ON_THE_SCALE', 'ML_S07_OTHER_SERIAL', 'ML_S10_MILE_MARKER_ZERO', 'ML_S11_PASSENGER_WINDOW', 'ML_S13_COPY_FOR_LEDGER', 'ML_S14_HOLDING_COMPANY']) {
      expect(card(page, key).status, key).toBe('AVAILABLE');
    }
    for (const key of ['ML_S02_RENT_ENVELOPE', 'ML_S05_BOX_WITH_NO_LABEL', 'ML_S15_PLAIN_ENGLISH']) expect(card(page, key).status, key).toBe('LOCKED');

    // Mrs. Alvarez's shop.
    await play('ML_S01_KEY_UNDER_MAT', () => scout('LOW_RENT'));
    await play('ML_S02_RENT_ENVELOPE');
    await play('ML_S03_WARM_ROOM', () => StoreService.checkout(app.prisma, playerId, { lines: [{ store: 'CORNER', item: 'MEDICINE', direction: 'buy', quantity: 5 }], actionId: randomUUID() }));

    // Pip's honest count; the supply lane stays a bonus.
    await play('ML_S04_WEIGHT_ON_THE_SCALE', () => buy('PIP', 'CRACK', 10));
    await play('ML_S05_BOX_WITH_NO_LABEL', () => ProductionService.produceCrack(app.prisma, playerId, { turns: 1, productType: 'CRACK', actionId: randomUUID() }));
    await play('ML_S06_LAST_HONEST_COUNT', () => StoreService.trade(app.prisma, playerId, { store: 'PIP', item: 'CRACK', direction: 'sell', quantity: 15, actionId: randomUUID() }));

    // The apprentice.
    await play('ML_S07_OTHER_SERIAL', () => buy('TOMMY', 'PISTOL', 3));
    await play('ML_S08_LAST_SHIFT');
    await play('ML_S09_RACK_KEPT_OPEN', () => buy('TOMMY', 'AMMO_BOX', 1));

    // Wheels' drivers.
    await play('ML_S10_MILE_MARKER_ZERO', runHome);
    await play('ML_S11_PASSENGER_WINDOW');
    await play('ML_S12_EVERY_ROAD_HOME', runHome);

    // The signed pages: S15 waits for both threads.
    await play('ML_S13_COPY_FOR_LEDGER');
    expect(card(await board(), 'ML_S15_PLAIN_ENGLISH').status).toBe('LOCKED');
    await play('ML_S14_HOLDING_COMPANY', async () => { await scout('WINO_SLUMS'); await scout('URBAN_GHETTO'); });
    expect(card(await board(), 'ML_S15_PLAIN_ENGLISH').status).toBe('AVAILABLE');
    await play('ML_S15_PLAIN_ENGLISH');

    // Every side story is done, and the finale chapters now speak to all of them at once.
    const history = await HandcraftedQuestService.history(app.prisma, playerId, ruleset);
    const sides = history.filter((quest) => quest.key.startsWith('ML_S'));
    expect(sides).toHaveLength(15);
    expect(sides.every((quest) => quest.status === 'COMPLETED')).toBe(true);
    const story = (key: string) => history.find((quest) => quest.key === key)!.story!;
    expect(story('ML_M22_NO_ONE_OWES_ALONE').inProgress).toContain('Pip’s supplier came too');
    expect(story('ML_M24_EVERYBODY_AT_THE_TABLE').ready).toContain('apprentice');
    expect(story('ML_M24_EVERYBODY_AT_THE_TABLE').completed).toContain('driver who took Wheels’ offer');
    expect(story('ML_M25_MISSING_LINE').intro).toContain('the rival’s statement');
    expect(story('ML_M25_MISSING_LINE').inProgress).toContain('families from Delancey');
  }, 300_000);
});
