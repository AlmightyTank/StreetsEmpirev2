import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV26H, classicOgV26I } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { AdminRoundService } from '../admin-round.service.js';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { ReputationService } from '../reputation.service.js';

/**
 * Story campaign Slice J: moving a live round to another ruleset keeps each crew's place in The
 * Missing Line, so no chapter is replayed or paid twice. Opt in with STORY_INTEGRATION=1.
 */
describe.runIf(process.env.STORY_INTEGRATION === '1')('story campaign across a ruleset change with PostgreSQL', () => {
  const from = classicOgV26H;
  const to = classicOgV26I;
  let app: FastifyInstance;
  let roundId = '';
  let accountId = '';
  let playerId = '';
  let username = '';

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({ data: {
      name: 'Story carry fixture', slug: `story-carry-${randomUUID()}`,
      rulesetId: from.meta.id, rulesetVersion: from.meta.version,
      status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundId = round.id;
    username = `mlc_${randomUUID().slice(0, 8)}`;
    const account = await app.prisma.account.create({ data: {
      username, usernameNormalized: username, email: `${username}@example.invalid`, passwordHash: 'integration-fixture',
    } });
    accountId = account.id;
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: from.round.startingCitySlug } });
    const player = await app.prisma.roundPlayer.create({ data: {
      ...from.round.startingPlayer, ...startingStock(from),
      roundId, accountId, cityId: city.id,
      displayName: username, publicPimpId: -Math.floor(Math.random() * 2_000_000_000) - 1,
      reputation: { create: ReputationService.seedFor(from) },
    } });
    playerId = player.id;
  });

  afterAll(async () => {
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('keeps finished chapters, scene answers and choices, and does not pay them again', async () => {
    await HandcraftedQuestService.page(app.prisma, playerId, from);
    const now = new Date();
    const done = ['ML_M01_NIGHT_RECEIPT', 'ML_M02_SMALL_FAVOR', 'ML_M03_OTHER_DOOR', 'ML_M04_ROLL_CALL', 'ML_M05_MISSING_LINE'];
    await app.prisma.playerQuest.updateMany({
      where: { roundPlayerId: playerId, questDefinition: { key: { in: done } } },
      data: { status: 'COMPLETED', acceptedAt: now, completedAt: now, claimedAt: now },
    });
    const first = await app.prisma.playerQuest.findFirstOrThrow({ where: { roundPlayerId: playerId, questDefinition: { key: 'ML_M01_NIGHT_RECEIPT' } } });
    await app.prisma.questSceneResponse.create({ data: { playerQuestId: first.id, sceneKey: 'night_receipt_handled', responseKey: 'return_unopened' } });
    const campaignRows = await app.prisma.playerQuest.count({ where: { roundPlayerId: playerId, questDefinition: { key: { startsWith: 'ML_' } } } });

    const round = await AdminRoundService.changeRuleset(app.prisma, { id: accountId, username }, roundId, {
      rulesetId: to.meta.id, reason: 'Slice J carry check', confirm: true,
    });
    expect(round).toMatchObject({ rulesetId: to.meta.id });

    const page = await HandcraftedQuestService.page(app.prisma, playerId, to);
    const status = (key: string) => page.quests.find((quest) => quest.key === key)?.status;
    const history = await HandcraftedQuestService.history(app.prisma, playerId, to);
    expect(done.map((key) => history.find((quest) => quest.key === key)?.status)).toEqual(done.map(() => 'COMPLETED'));
    expect(status('ML_M06_PIPS_COUNT')).toBe('AVAILABLE');
    expect(history.find((quest) => quest.key === 'ML_M01_NIGHT_RECEIPT')?.story?.scenes?.[0]?.response?.key).toBe('return_unopened');
    await expect(HandcraftedQuestService.claim(app.prisma, playerId, to, 'ML_M01_NIGHT_RECEIPT', { actionId: randomUUID() }))
      .rejects.toMatchObject({ statusCode: 409 });

    // Exactly one row per chapter on the new ruleset; none left behind on the old one.
    const rows = await app.prisma.playerQuest.findMany({
      where: { roundPlayerId: playerId, questDefinition: { key: { startsWith: 'ML_' } } },
      select: { questDefinition: { select: { key: true, rulesetVersion: true } } },
    });
    expect(rows.every((row) => row.questDefinition.rulesetVersion === to.meta.version)).toBe(true);
    expect(new Set(rows.map((row) => row.questDefinition.key)).size).toBe(rows.length);
    expect(rows).toHaveLength(campaignRows);
    const audit = await app.prisma.adminAuditLog.findFirstOrThrow({ where: { targetId: roundId, action: 'round.ruleset.change' } });
    expect(audit.after).toMatchObject({ storyRowsCarried: campaignRows });
  }, 120_000);
});
