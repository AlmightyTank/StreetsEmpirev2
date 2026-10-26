import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV26C } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { QuestPageDto } from '@streets/shared';
import { ActivityService } from '../activity.service.js';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { ProductionService } from '../production.service.js';
import { ReputationService } from '../reputation.service.js';
import { ScoutService } from '../scout.service.js';
import { StoreService } from '../store.service.js';

/**
 * Story campaign R3: Acts I and II of The Missing Line on 2.6.0-C, played with the real scouting,
 * store, checkout and production actions. Each reveal stays closed until its work is done.
 * Opt in with STORY_INTEGRATION=1.
 */
describe.runIf(process.env.STORY_INTEGRATION === '1')('The Missing Line depth pass with PostgreSQL', () => {
  const ruleset = classicOgV26C;
  let app: FastifyInstance;
  let roundId = '';
  let accountId = '';
  let playerId = '';

  const card = (page: QuestPageDto, key: string) => page.quests.find((quest) => quest.key === key)!;
  const board = () => HandcraftedQuestService.page(app.prisma, playerId, ruleset);
  const accept = (key: string) => HandcraftedQuestService.accept(app.prisma, playerId, ruleset, key);
  const claim = (key: string) => HandcraftedQuestService.claim(app.prisma, playerId, ruleset, key, { actionId: randomUUID() });
  const respond = (questKey: string, sceneKey: string, responseKey: string) =>
    HandcraftedQuestService.respondToScene(app.prisma, playerId, ruleset, { questKey, sceneKey, responseKey });
  const sellToPip = (quantity: number) => StoreService.trade(app.prisma, playerId, { store: 'PIP', item: 'CRACK', direction: 'sell', quantity, actionId: randomUUID() });
  const runHome = () => app.prisma.$transaction((tx) => ActivityService.log(tx, playerId, 'RUN_RETURNED', {
    runId: randomUUID(), cities: ['Detroit'], cashCents: 0, cargoBack: {}, incidents: [],
  }));

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({ data: {
      name: 'Missing Line depth fixture', slug: `missing-line-depth-${randomUUID()}`,
      rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version,
      status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    const username = `mld_${randomUUID().slice(0, 8)}`;
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

  it('plays Acts I and II with real work before each reveal', async () => {
    await board();

    // M01: the receipt scene comes first; the job is ready only once the receipt is walked back.
    await accept('ML_M01_NIGHT_RECEIPT');
    let page = await respond('ML_M01_NIGHT_RECEIPT', 'night_receipt_handled', 'return_unopened');
    expect(card(page, 'ML_M01_NIGHT_RECEIPT').status).toBe('ACTIVE');
    await ScoutService.scout(app.prisma, playerId, { district: 'WINO_SLUMS', turns: 1, actionId: randomUUID() });
    expect(card(await board(), 'ML_M01_NIGHT_RECEIPT').status).toBe('ACTIVE');
    await ScoutService.scout(app.prisma, playerId, { district: 'LOW_RENT', turns: 1, actionId: randomUUID() });
    expect(card(await board(), 'ML_M01_NIGHT_RECEIPT').status).toBe('READY_TO_TURN_IN');
    await claim('ML_M01_NIGHT_RECEIPT');

    // M02: Mrs. Alvarez talks once her shelf is stocked, through the Corner basket.
    page = await accept('ML_M02_SMALL_FAVOR');
    expect(card(page, 'ML_M02_SMALL_FAVOR').story?.scenes?.[0]?.available).toBe(false);
    await expect(respond('ML_M02_SMALL_FAVOR', 'alvarez_statement_taken', 'show_receipt')).rejects.toMatchObject({ code: 'SCENE_NOT_AVAILABLE' });
    await StoreService.checkout(app.prisma, playerId, { lines: [{ store: 'CORNER', item: 'BEER', direction: 'buy', quantity: 10 }], actionId: randomUUID() });
    expect(card(await board(), 'ML_M02_SMALL_FAVOR').story?.scenes?.[0]?.available).toBe(true);
    await respond('ML_M02_SMALL_FAVOR', 'alvarez_statement_taken', 'show_receipt');
    await claim('ML_M02_SMALL_FAVOR');

    // M03: ten units to Pip, across two sales, then the slips.
    await accept('ML_M03_OTHER_DOOR');
    await sellToPip(4);
    expect(card(await board(), 'ML_M03_OTHER_DOOR').objectives.find((objective) => objective.id === 'pip_sale')).toMatchObject({ current: 4, completed: false });
    await sellToPip(6);
    page = await respond('ML_M03_OTHER_DOOR', 'route_slip', 'keep_a_copy');
    expect(card(page, 'ML_M03_OTHER_DOOR').status).toBe('READY_TO_TURN_IN');
    await claim('ML_M03_OTHER_DOOR');

    // M04: a run home, then Eli's mark.
    await accept('ML_M04_ROLL_CALL');
    await expect(respond('ML_M04_ROLL_CALL', 'eli_mark', 'ask_wheels')).rejects.toMatchObject({ code: 'SCENE_NOT_AVAILABLE' });
    await runHome();
    await respond('ML_M04_ROLL_CALL', 'eli_mark', 'ask_wheels');
    await claim('ML_M04_ROLL_CALL');

    // M05 is unchanged.
    await accept('ML_M05_MISSING_LINE');
    await respond('ML_M05_MISSING_LINE', 'missing_line_compared', 'share_the_name');
    await claim('ML_M05_MISSING_LINE');

    // M06: a fresh batch and ten units to Pip, then the count sheet.
    await accept('ML_M06_PIPS_COUNT');
    await sellToPip(10);
    await expect(respond('ML_M06_PIPS_COUNT', 'count_sheet', 'point_to_signature')).rejects.toMatchObject({ code: 'SCENE_NOT_AVAILABLE' });
    await ProductionService.produceCrack(app.prisma, playerId, { turns: 1, productType: 'CRACK', actionId: randomUUID() });
    await respond('ML_M06_PIPS_COUNT', 'count_sheet', 'point_to_signature');
    await claim('ML_M06_PIPS_COUNT');

    // M07: a run home, then the split.
    await accept('ML_M07_NORTH_ROAD');
    await runHome();
    await respond('ML_M07_NORTH_ROAD', 'route_split', 'ask_about_caller');
    await claim('ML_M07_NORTH_ROAD');

    // M08: five pistols from Tommy, then the tally book.
    await accept('ML_M08_TOMMYS_SERIAL');
    await StoreService.trade(app.prisma, playerId, { store: 'TOMMY', item: 'PISTOL', direction: 'buy', quantity: 5, actionId: randomUUID() });
    await respond('ML_M08_TOMMYS_SERIAL', 'tally_book', 'check_the_crate');
    await claim('ML_M08_TOMMYS_SERIAL');

    // The leads open Two Buyers, One Load, and Act II closes as before.
    page = await accept('ML_M09_TWO_BUYERS');
    await respond('ML_M09_TWO_BUYERS', 'two_buyers_briefed', 'brief_pip');
    await claim('ML_M09_TWO_BUYERS');
    await accept('ML_M10_FAVOR_ALREADY_PAID');
    await respond('ML_M10_FAVOR_ALREADY_PAID', 'vic_favor_answered', 'protect_the_name');
    await claim('ML_M10_FAVOR_ALREADY_PAID');

    const history = await HandcraftedQuestService.history(app.prisma, playerId, ruleset);
    const campaign = history.filter((quest) => quest.key.startsWith('ML_M'));
    expect(campaign).toHaveLength(10);
    expect(campaign.every((quest) => quest.status === 'COMPLETED')).toBe(true);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: playerId, type: 'QUEST_STORY_SCENE' } })).toBe(10);
  }, 180_000);
});
