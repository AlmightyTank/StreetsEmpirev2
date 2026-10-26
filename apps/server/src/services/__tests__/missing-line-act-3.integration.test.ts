import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV26D } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { QuestPageDto } from '@streets/shared';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { ReputationService } from '../reputation.service.js';
import { ScoutService } from '../scout.service.js';
import { StoreService } from '../store.service.js';

/**
 * Story campaign Slice F: Act III of The Missing Line on 2.6.0-D, played with the real scouting,
 * store and checkout actions, and every option of its closing turn-in choice. Opt in with
 * STORY_INTEGRATION=1.
 */

const ruleset = classicOgV26D;
const EARLIER = [
  'ML_M01_NIGHT_RECEIPT', 'ML_M02_SMALL_FAVOR', 'ML_M03_OTHER_DOOR', 'ML_M04_ROLL_CALL', 'ML_M05_MISSING_LINE',
  'ML_M06_PIPS_COUNT', 'ML_M07_NORTH_ROAD', 'ML_M08_TOMMYS_SERIAL', 'ML_M09_TWO_BUYERS', 'ML_M10_FAVOR_ALREADY_PAID',
];
const ACT = ['ML_M11_TERMS_OF_QUIET', 'ML_M12_CLERK_ON_THE_STAIRS', 'ML_M13_DATE_CHANGED_IN_INK', 'ML_M14_WOMAN_AT_CLOSING'];

describe.runIf(process.env.STORY_INTEGRATION === '1')('The Missing Line Act III with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  const accountIds: string[] = [];

  const card = (page: QuestPageDto, key: string) => page.quests.find((quest) => quest.key === key)!;
  const rep = async (playerId: string, trader: string) =>
    (await app.prisma.playerReputation.findFirst({ where: { roundPlayerId: playerId, trader } }))?.points ?? 0;

  /** A fresh player whose earlier chapters are done, as if they had played them. */
  async function playerAt(done: readonly string[]): Promise<string> {
    const username = `ml3_${randomUUID().slice(0, 8)}`;
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
      name: 'Missing Line Act III fixture', slug: `missing-line-3-${randomUUID()}`,
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

  it('plays from Terms of Quiet to Your Name in the Margin with real work before each reveal', async () => {
    const playerId = await playerAt(EARLIER);
    const accept = (key: string) => HandcraftedQuestService.accept(app.prisma, playerId, ruleset, key);
    const claim = (key: string, branchKey?: string) => HandcraftedQuestService.claim(app.prisma, playerId, ruleset, key, { actionId: randomUUID(), ...(branchKey ? { branchKey } : {}) });
    const respond = (questKey: string, sceneKey: string, responseKey: string) =>
      HandcraftedQuestService.respondToScene(app.prisma, playerId, ruleset, { questKey, sceneKey, responseKey });

    let page = await HandcraftedQuestService.page(app.prisma, playerId, ruleset);
    expect(card(page, 'ML_M11_TERMS_OF_QUIET').status).toBe('AVAILABLE');
    for (const key of ACT.slice(1)) expect(card(page, key).status).toBe('LOCKED');

    // 11. Vic: the old drop in Urban Ghetto, then the notice.
    await accept('ML_M11_TERMS_OF_QUIET');
    await expect(respond('ML_M11_TERMS_OF_QUIET', 'notice_examined', 'take_to_ledger')).rejects.toMatchObject({ code: 'SCENE_NOT_AVAILABLE' });
    await ScoutService.scout(app.prisma, playerId, { district: 'URBAN_GHETTO', turns: 1, actionId: randomUUID() });
    page = await respond('ML_M11_TERMS_OF_QUIET', 'notice_examined', 'take_to_ledger');
    expect(card(page, 'ML_M11_TERMS_OF_QUIET').status).toBe('READY_TO_TURN_IN');
    await claim('ML_M11_TERMS_OF_QUIET');

    // 12. Ledger: medicine for Mr. Hales from a Corner basket, then the carbon.
    await accept('ML_M12_CLERK_ON_THE_STAIRS');
    await StoreService.checkout(app.prisma, playerId, { lines: [{ store: 'CORNER', item: 'MEDICINE', direction: 'buy', quantity: 5 }], actionId: randomUUID() });
    await respond('ML_M12_CLERK_ON_THE_STAIRS', 'hales_copy_compared', 'ask_about_the_mark');
    await claim('ML_M12_CLERK_ON_THE_STAIRS');

    // 13. Tommy: two ammo boxes, then the report. Recon stays a bonus.
    await accept('ML_M13_DATE_CHANGED_IN_INK');
    await StoreService.trade(app.prisma, playerId, { store: 'TOMMY', item: 'AMMO_BOX', direction: 'buy', quantity: 2, actionId: randomUUID() });
    page = await respond('ML_M13_DATE_CHANGED_IN_INK', 'raid_report_reviewed', 'ask_who_got_hurt');
    expect(card(page, 'ML_M13_DATE_CHANGED_IN_INK').status).toBe('READY_TO_TURN_IN');
    expect(card(page, 'ML_M13_DATE_CHANGED_IN_INK').objectives.find((objective) => objective.id === 'recon_a_rival')).toMatchObject({ bonus: true, completed: false });
    await claim('ML_M13_DATE_CHANGED_IN_INK');

    // 14. Mama: a thug on Mrs. Alvarez's door, then the second receipt.
    await accept('ML_M14_WOMAN_AT_CLOSING');
    await StoreService.trade(app.prisma, playerId, { store: 'TOMMY', item: 'THUG', direction: 'buy', quantity: 1, actionId: randomUUID() });
    await respond('ML_M14_WOMAN_AT_CLOSING', 'second_receipt_returned', 'include_his_name');
    await claim('ML_M14_WOMAN_AT_CLOSING');

    // 15. Ledger: read the entry, then choose at turn-in.
    page = await accept('ML_M15_NAME_IN_THE_MARGIN');
    expect(card(page, 'ML_M15_NAME_IN_THE_MARGIN').branchChoices.map((choice) => choice.key)).toEqual(['DISPUTE_THE_ENTRY', 'LEAVE_IT_FOR_NOW', 'KEEP_A_COPY']);
    await respond('ML_M15_NAME_IN_THE_MARGIN', 'crew_entry_read', 'check_the_date');
    await expect(claim('ML_M15_NAME_IN_THE_MARGIN')).rejects.toMatchObject({ code: 'QUEST_BRANCH_REQUIRED' });
    await claim('ML_M15_NAME_IN_THE_MARGIN', 'DISPUTE_THE_ENTRY');

    const history = await HandcraftedQuestService.history(app.prisma, playerId, ruleset);
    const margin = history.find((quest) => quest.key === 'ML_M15_NAME_IN_THE_MARGIN');
    expect(margin).toMatchObject({ status: 'COMPLETED', chosenBranch: 'DISPUTE_THE_ENTRY' });
    expect(history.filter((quest) => [...ACT, 'ML_M15_NAME_IN_THE_MARGIN'].includes(quest.key)).every((quest) => quest.status === 'COMPLETED')).toBe(true);
  }, 180_000);

  for (const [branchKey, contactKey] of [['DISPUTE_THE_ENTRY', 'LEDGER'], ['LEAVE_IT_FOR_NOW', 'VIC'], ['KEEP_A_COPY', 'MAMA_KING']] as const) {
    it(`pays the same for ${branchKey} and tilts ${contactKey}`, async () => {
      const playerId = await playerAt([...EARLIER, ...ACT]);
      await HandcraftedQuestService.accept(app.prisma, playerId, ruleset, 'ML_M15_NAME_IN_THE_MARGIN');
      await HandcraftedQuestService.respondToScene(app.prisma, playerId, ruleset, { questKey: 'ML_M15_NAME_IN_THE_MARGIN', sceneKey: 'crew_entry_read', responseKey: 'count_the_favors' });
      const repBefore = { LEDGER: await rep(playerId, 'LEDGER'), VIC: await rep(playerId, 'VIC'), MAMA_KING: await rep(playerId, 'MAMA_KING') };
      // Read from the claim receipt: the balance also moves with the crew's clock-driven income.
      const receipt = await HandcraftedQuestService.claim(app.prisma, playerId, ruleset, 'ML_M15_NAME_IN_THE_MARGIN', { actionId: randomUUID(), branchKey });
      expect(receipt.result.rewards.filter((reward) => reward.kind === 'CASH').map((reward) => reward.amount)).toEqual([600_000]);
      // Ledger pays 5 rep for the chapter itself; the choice adds 2 to one contact.
      expect({
        LEDGER: await rep(playerId, 'LEDGER') - repBefore.LEDGER,
        VIC: await rep(playerId, 'VIC') - repBefore.VIC,
        MAMA_KING: await rep(playerId, 'MAMA_KING') - repBefore.MAMA_KING,
      }).toEqual({ LEDGER: 5 + (contactKey === 'LEDGER' ? 2 : 0), VIC: contactKey === 'VIC' ? 2 : 0, MAMA_KING: contactKey === 'MAMA_KING' ? 2 : 0 });
    }, 120_000);
  }
});
