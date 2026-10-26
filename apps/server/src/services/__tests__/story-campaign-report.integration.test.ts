import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV26I } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { AdminQuestService } from '../admin-quest.service.js';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { ReputationService } from '../reputation.service.js';
import { ScoutService } from '../scout.service.js';

/**
 * Story campaign Slice J: the admin campaign report counts chapters, scene answers and turn-in
 * choices for one round only. Opt in with STORY_INTEGRATION=1.
 */
describe.runIf(process.env.STORY_INTEGRATION === '1')('story campaign report with PostgreSQL', () => {
  const ruleset = classicOgV26I;
  let app: FastifyInstance;
  let roundId = '';
  const accountIds: string[] = [];

  async function player(): Promise<string> {
    const username = `mlr_${randomUUID().slice(0, 8)}`;
    const account = await app.prisma.account.create({ data: {
      username, usernameNormalized: username, email: `${username}@example.invalid`, passwordHash: 'integration-fixture',
    } });
    accountIds.push(account.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } });
    const row = await app.prisma.roundPlayer.create({ data: {
      ...ruleset.round.startingPlayer, ...startingStock(ruleset),
      roundId, accountId: account.id, cityId: city.id,
      displayName: username, publicPimpId: -Math.floor(Math.random() * 2_000_000_000) - 1,
      reputation: { create: ReputationService.seedFor(ruleset) },
    } });
    await HandcraftedQuestService.page(app.prisma, row.id, ruleset);
    return row.id;
  }

  async function playFirstChapter(playerId: string, responseKey: string) {
    await HandcraftedQuestService.accept(app.prisma, playerId, ruleset, 'ML_M01_NIGHT_RECEIPT');
    await HandcraftedQuestService.respondToScene(app.prisma, playerId, ruleset, { questKey: 'ML_M01_NIGHT_RECEIPT', sceneKey: 'night_receipt_handled', responseKey });
    // The walk back to Low Rent the chapter asks for, by way of Wino Slums.
    for (const district of ['WINO_SLUMS', 'LOW_RENT'] as const) {
      await ScoutService.scout(app.prisma, playerId, { district, turns: 1, actionId: randomUUID() });
    }
    await HandcraftedQuestService.claim(app.prisma, playerId, ruleset, 'ML_M01_NIGHT_RECEIPT', { actionId: randomUUID() });
    // Stored status moves when the crew next opens the board, as it does in play.
    await HandcraftedQuestService.page(app.prisma, playerId, ruleset);
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({ data: {
      name: 'Story campaign report fixture', slug: `story-report-${randomUUID()}`,
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

  it('reports completion, drop-off, scene answers and endings for the round', async () => {
    const [first, second, third] = [await player(), await player(), await player()];
    await playFirstChapter(first, 'return_unopened');
    await playFirstChapter(second, 'return_unopened');
    await HandcraftedQuestService.accept(app.prisma, third, ruleset, 'ML_M01_NIGHT_RECEIPT');
    // An ending, written as the claim writes it.
    await app.prisma.playerQuest.updateMany({
      where: { roundPlayerId: first, questDefinition: { key: 'ML_M25_MISSING_LINE' } },
      data: { status: 'COMPLETED', chosenBranch: 'BURN_BOOK', completedAt: new Date(), claimedAt: new Date() },
    });

    const report = await AdminQuestService.storyCampaign(app.prisma, roundId);
    expect(report.players).toBe(3);
    expect(report.chapters).toHaveLength(40);
    expect(report.chapters[0]).toMatchObject({ key: 'ML_M01_NIGHT_RECEIPT', arc: 'MAIN', completed: 2, active: 1 });
    expect(report.chapters[1]).toMatchObject({ key: 'ML_M02_SMALL_FAVOR', available: 2, completed: 0 });
    expect(report.chapters.at(-1)).toMatchObject({ arc: 'SIDE' });

    const scene = report.scenes.find((row) => row.sceneKey === 'night_receipt_handled')!;
    expect(scene.responses.find((response) => response.key === 'return_unopened')?.count).toBe(2);
    expect(scene.responses.reduce((total, response) => total + response.count, 0)).toBe(2);

    const ending = report.choices.find((choice) => choice.questKey === 'ML_M25_MISSING_LINE')!;
    expect(ending.branches.map((branch) => [branch.key, branch.count])).toEqual([['OPEN_BOOK', 0], ['BURN_BOOK', 1], ['KEEP_BOOK', 0]]);
    expect(report.choices.map((choice) => choice.questKey)).toEqual(expect.arrayContaining(['ML_M15_NAME_IN_THE_MARGIN', 'ML_M23_LAST_APPOINTMENT']));
  }, 120_000);
});
