import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV26F, type QuestDefinitionCatalog } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { QuestPageDto } from '@streets/shared';
import { ActivityService } from '../activity.service.js';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { ReputationService } from '../reputation.service.js';
import { StoreService } from '../store.service.js';

/**
 * Story campaign Slice H: on 2.6.0-F, the story lines a player is shown follow what they chose
 * earlier, resolved by the server, with the default line when there is no such history. Opt in
 * with STORY_INTEGRATION=1.
 */

const ruleset = classicOgV26F;
const catalog = ruleset.questDefinitions as QuestDefinitionCatalog;
const variantsOf = (key: string) => catalog[key]!.story!.variants!;
const CHAPTERS = [
  'ML_M01_NIGHT_RECEIPT', 'ML_M02_SMALL_FAVOR', 'ML_M03_OTHER_DOOR', 'ML_M04_ROLL_CALL', 'ML_M05_MISSING_LINE',
  'ML_M06_PIPS_COUNT', 'ML_M07_NORTH_ROAD', 'ML_M08_TOMMYS_SERIAL', 'ML_M09_TWO_BUYERS', 'ML_M10_FAVOR_ALREADY_PAID',
  'ML_M11_TERMS_OF_QUIET', 'ML_M12_CLERK_ON_THE_STAIRS', 'ML_M13_DATE_CHANGED_IN_INK', 'ML_M14_WOMAN_AT_CLOSING',
  'ML_M15_NAME_IN_THE_MARGIN',
];
const upTo = (key: string) => CHAPTERS.slice(0, CHAPTERS.indexOf(key));

describe.runIf(process.env.STORY_INTEGRATION === '1')('The Missing Line remembers, with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  const accountIds: string[] = [];

  const card = (page: QuestPageDto, key: string) => page.quests.find((quest) => quest.key === key)!;

  async function playerAt(done: readonly string[]): Promise<string> {
    const username = `mle_${randomUUID().slice(0, 8)}`;
    const account = await app.prisma.account.create({ data: {
      username, usernameNormalized: username, email: `${username}@example.invalid`, passwordHash: 'integration-fixture',
    } });
    accountIds.push(account.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } });
    const player = await app.prisma.roundPlayer.create({ data: {
      ...ruleset.round.startingPlayer, ...startingStock(ruleset),
      roundId, accountId: account.id, cityId: city.id, cashCents: 10_000_000n,
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

  function actions(playerId: string) {
    return {
      accept: (key: string) => HandcraftedQuestService.accept(app.prisma, playerId, ruleset, key),
      claim: (key: string, branchKey?: string) => HandcraftedQuestService.claim(app.prisma, playerId, ruleset, key, { actionId: randomUUID(), ...(branchKey ? { branchKey } : {}) }),
      respond: (questKey: string, sceneKey: string, responseKey: string) =>
        HandcraftedQuestService.respondToScene(app.prisma, playerId, ruleset, { questKey, sceneKey, responseKey }),
    };
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({ data: {
      name: 'Missing Line echoes fixture', slug: `missing-line-echoes-${randomUUID()}`,
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

  for (const [index, branchKey] of ['DISPUTE_THE_ENTRY', 'LEAVE_IT_FOR_NOW', 'KEEP_A_COPY'].entries()) {
    it(`speaks to ${branchKey} in Mile Marker Nine`, async () => {
      const playerId = await playerAt(upTo('ML_M15_NAME_IN_THE_MARGIN'));
      const { accept, claim, respond } = actions(playerId);
      await accept('ML_M15_NAME_IN_THE_MARGIN');
      await respond('ML_M15_NAME_IN_THE_MARGIN', 'crew_entry_read', 'count_the_favors');
      await claim('ML_M15_NAME_IN_THE_MARGIN', branchKey);
      const page = await accept('ML_M16_MILE_MARKER_NINE');
      const story = card(page, 'ML_M16_MILE_MARKER_NINE').story!;
      expect(story.inProgress).toBe(variantsOf('ML_M16_MILE_MARKER_NINE')[index]!.inProgress);
      expect(story).not.toHaveProperty('variants');
      // Only the line the variant replaces changes.
      expect(story.intro).toBe(catalog.ML_M16_MILE_MARKER_NINE!.story!.intro);
    }, 120_000);
  }

  it('keeps the default line for a player with no recorded choice', async () => {
    const playerId = await playerAt(CHAPTERS);
    const page = await actions(playerId).accept('ML_M16_MILE_MARKER_NINE');
    expect(card(page, 'ML_M16_MILE_MARKER_NINE').story!.inProgress).toBe(catalog.ML_M16_MILE_MARKER_NINE!.story!.inProgress);
  }, 120_000);

  it('carries answers from earlier scenes into later chapters and into history', async () => {
    const playerId = await playerAt(upTo('ML_M14_WOMAN_AT_CLOSING'));
    const { accept, claim, respond } = actions(playerId);

    await accept('ML_M14_WOMAN_AT_CLOSING');
    await StoreService.trade(app.prisma, playerId, { store: 'TOMMY', item: 'THUG', direction: 'buy', quantity: 1, actionId: randomUUID() });
    await respond('ML_M14_WOMAN_AT_CLOSING', 'second_receipt_returned', 'leave_him_out');
    await claim('ML_M14_WOMAN_AT_CLOSING');

    await accept('ML_M15_NAME_IN_THE_MARGIN');
    await respond('ML_M15_NAME_IN_THE_MARGIN', 'crew_entry_read', 'check_the_date');
    await claim('ML_M15_NAME_IN_THE_MARGIN', 'KEEP_A_COPY');

    await accept('ML_M16_MILE_MARKER_NINE');
    await app.prisma.$transaction((tx) => ActivityService.log(tx, playerId, 'RUN_RETURNED', {
      runId: randomUUID(), cities: ['Detroit'], cashCents: 0, cargoBack: {}, incidents: [],
    }));
    await respond('ML_M16_MILE_MARKER_NINE', 'depot_found', 'watch_the_drivers');
    await claim('ML_M16_MILE_MARKER_NINE');

    let page = await accept('ML_M17_PASSENGER_NINE');
    expect(card(page, 'ML_M17_PASSENGER_NINE').story!.inProgress).toBe(variantsOf('ML_M17_PASSENGER_NINE')[1]!.inProgress);
    await respond('ML_M17_PASSENGER_NINE', 'eli_located', 'talk_to_eli_directly');
    await StoreService.trade(app.prisma, playerId, { store: 'CHARLIE', item: 'LOW_RIDER', direction: 'buy', quantity: 1, actionId: randomUUID() });
    await claim('ML_M17_PASSENGER_NINE');

    page = await HandcraftedQuestService.page(app.prisma, playerId, ruleset);
    expect(card(page, 'ML_M18_WHAT_MAMA_BOUGHT').story!.intro).toBe(variantsOf('ML_M18_WHAT_MAMA_BOUGHT')[1]!.intro);
    await accept('ML_M18_WHAT_MAMA_BOUGHT');
    await respond('ML_M18_WHAT_MAMA_BOUGHT', 'mama_debt_reckoned', 'tell_the_families');
    await claim('ML_M18_WHAT_MAMA_BOUGHT');

    const history = await HandcraftedQuestService.history(app.prisma, playerId, ruleset);
    const mama = history.find((quest) => quest.key === 'ML_M18_WHAT_MAMA_BOUGHT')!;
    expect(mama.story!.completed).toBe(variantsOf('ML_M18_WHAT_MAMA_BOUGHT')[3]!.completed);
    expect(mama.story!.completed).toContain('All of them bring food');
  }, 180_000);
});
