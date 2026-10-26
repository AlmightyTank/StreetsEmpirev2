import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV26E } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { QuestPageDto } from '@streets/shared';
import { ActivityService } from '../activity.service.js';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { ReputationService } from '../reputation.service.js';
import { ScoutService } from '../scout.service.js';
import { StoreService } from '../store.service.js';

/**
 * Story campaign Slice G: Act IV of The Missing Line on 2.6.0-E, opened from every Act III choice
 * and played with the real run, store and scouting actions. Opt in with STORY_INTEGRATION=1.
 */

const ruleset = classicOgV26E;
const THROUGH_ACT_III = [
  'ML_M01_NIGHT_RECEIPT', 'ML_M02_SMALL_FAVOR', 'ML_M03_OTHER_DOOR', 'ML_M04_ROLL_CALL', 'ML_M05_MISSING_LINE',
  'ML_M06_PIPS_COUNT', 'ML_M07_NORTH_ROAD', 'ML_M08_TOMMYS_SERIAL', 'ML_M09_TWO_BUYERS', 'ML_M10_FAVOR_ALREADY_PAID',
  'ML_M11_TERMS_OF_QUIET', 'ML_M12_CLERK_ON_THE_STAIRS', 'ML_M13_DATE_CHANGED_IN_INK', 'ML_M14_WOMAN_AT_CLOSING',
];

describe.runIf(process.env.STORY_INTEGRATION === '1')('The Missing Line Act IV with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  const accountIds: string[] = [];

  const card = (page: QuestPageDto, key: string) => page.quests.find((quest) => quest.key === key)!;

  async function playerAt(done: readonly string[]): Promise<string> {
    const username = `ml4_${randomUUID().slice(0, 8)}`;
    const account = await app.prisma.account.create({ data: {
      username, usernameNormalized: username, email: `${username}@example.invalid`, passwordHash: 'integration-fixture',
    } });
    accountIds.push(account.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } });
    const player = await app.prisma.roundPlayer.create({ data: {
      ...ruleset.round.startingPlayer, ...startingStock(ruleset),
      roundId, accountId: account.id, cityId: city.id,
      displayName: username, publicPimpId: -Math.floor(Math.random() * 2_000_000_000) - 1,
      reputation: { create: ReputationService.seedFor(ruleset) },
    } });
    await HandcraftedQuestService.page(app.prisma, player.id, ruleset);
    const now = new Date();
    await app.prisma.playerQuest.updateMany({
      where: { roundPlayerId: player.id, questDefinition: { key: { in: [...done] } } },
      data: { status: 'COMPLETED', acceptedAt: now, completedAt: now, claimedAt: now },
    });
    return player.id;
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({ data: {
      name: 'Missing Line Act IV fixture', slug: `missing-line-4-${randomUUID()}`,
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

  for (const branchKey of ['DISPUTE_THE_ENTRY', 'LEAVE_IT_FOR_NOW', 'KEEP_A_COPY']) {
    it(`opens Mile Marker Nine after ${branchKey}`, async () => {
      const playerId = await playerAt(THROUGH_ACT_III);
      await HandcraftedQuestService.accept(app.prisma, playerId, ruleset, 'ML_M15_NAME_IN_THE_MARGIN');
      await HandcraftedQuestService.respondToScene(app.prisma, playerId, ruleset, { questKey: 'ML_M15_NAME_IN_THE_MARGIN', sceneKey: 'crew_entry_read', responseKey: 'check_the_date' });
      expect(card(await HandcraftedQuestService.page(app.prisma, playerId, ruleset), 'ML_M16_MILE_MARKER_NINE').status).toBe('LOCKED');
      await HandcraftedQuestService.claim(app.prisma, playerId, ruleset, 'ML_M15_NAME_IN_THE_MARGIN', { actionId: randomUUID(), branchKey });
      expect(card(await HandcraftedQuestService.page(app.prisma, playerId, ruleset), 'ML_M16_MILE_MARKER_NINE').status).toBe('AVAILABLE');
    }, 120_000);
  }

  it('plays from Mile Marker Nine to The Map in the Margins with real work before each reveal', async () => {
    const playerId = await playerAt([...THROUGH_ACT_III, 'ML_M15_NAME_IN_THE_MARGIN']);
    const accept = (key: string) => HandcraftedQuestService.accept(app.prisma, playerId, ruleset, key);
    const claim = (key: string) => HandcraftedQuestService.claim(app.prisma, playerId, ruleset, key, { actionId: randomUUID() });
    const respond = (questKey: string, sceneKey: string, responseKey: string) =>
      HandcraftedQuestService.respondToScene(app.prisma, playerId, ruleset, { questKey, sceneKey, responseKey });
    const scout = (district: string) => ScoutService.scout(app.prisma, playerId, { district, turns: 1, actionId: randomUUID() });
    // Enough cash for the car; the chapters before it would have paid far more.
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 10_000_000n } });

    // 16. Wheels: a run home, then the depot.
    await accept('ML_M16_MILE_MARKER_NINE');
    await expect(respond('ML_M16_MILE_MARKER_NINE', 'depot_found', 'photograph_the_list')).rejects.toMatchObject({ code: 'SCENE_NOT_AVAILABLE' });
    await app.prisma.$transaction((tx) => ActivityService.log(tx, playerId, 'RUN_RETURNED', {
      runId: randomUUID(), cities: ['Detroit'], cashCents: 0, cargoBack: {}, incidents: [],
    }));
    await respond('ML_M16_MILE_MARKER_NINE', 'depot_found', 'photograph_the_list');
    await claim('ML_M16_MILE_MARKER_NINE');

    // 17. Wheels: reach Eli first, then a clean car from Charlie.
    await accept('ML_M17_PASSENGER_NINE');
    let page = await respond('ML_M17_PASSENGER_NINE', 'eli_located', 'let_wheels_introduce');
    expect(card(page, 'ML_M17_PASSENGER_NINE').status).toBe('ACTIVE');
    await StoreService.trade(app.prisma, playerId, { store: 'CHARLIE', item: 'LOW_RIDER', direction: 'buy', quantity: 1, actionId: randomUUID() });
    expect(card(await HandcraftedQuestService.page(app.prisma, playerId, ruleset), 'ML_M17_PASSENGER_NINE').status).toBe('READY_TO_TURN_IN');
    await claim('ML_M17_PASSENGER_NINE');

    // 18. Mama: her confession.
    await accept('ML_M18_WHAT_MAMA_BOUGHT');
    await respond('ML_M18_WHAT_MAMA_BOUGHT', 'mama_debt_reckoned', 'tell_the_families');
    await claim('ML_M18_WHAT_MAMA_BOUGHT');

    // 19. Pip: twenty units, then the honest scale.
    await accept('ML_M19_HONEST_SCALE');
    await StoreService.trade(app.prisma, playerId, { store: 'PIP', item: 'CRACK', direction: 'sell', quantity: 20, actionId: randomUUID() });
    await respond('ML_M19_HONEST_SCALE', 'honest_scale', 'tell_him_in_person');
    await claim('ML_M19_HONEST_SCALE');

    // 20. Blocks: three different districts; walking one twice does not count twice.
    await accept('ML_M20_MAP_IN_THE_MARGINS');
    await scout('LOW_RENT');
    await scout('LOW_RENT');
    await scout('WINO_SLUMS');
    page = await HandcraftedQuestService.page(app.prisma, playerId, ruleset);
    expect(card(page, 'ML_M20_MAP_IN_THE_MARGINS').objectives.find((objective) => objective.id === 'walk_the_corridor')).toMatchObject({ current: 2, completed: false });
    await expect(respond('ML_M20_MAP_IN_THE_MARGINS', 'corridor_map_matched', 'find_the_gap')).rejects.toMatchObject({ code: 'SCENE_NOT_AVAILABLE' });
    await scout('URBAN_GHETTO');
    page = await respond('ML_M20_MAP_IN_THE_MARGINS', 'corridor_map_matched', 'find_the_gap');
    expect(card(page, 'ML_M20_MAP_IN_THE_MARGINS').status).toBe('READY_TO_TURN_IN');
    await claim('ML_M20_MAP_IN_THE_MARGINS');

    const history = await HandcraftedQuestService.history(app.prisma, playerId, ruleset);
    const act = history.filter((quest) => /^ML_M(1[6-9]|20)_/.test(quest.key));
    expect(act).toHaveLength(5);
    expect(act.every((quest) => quest.status === 'COMPLETED')).toBe(true);
  }, 180_000);
});
