import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV26G, type QuestDefinitionCatalog } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { QuestPageDto } from '@streets/shared';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { ReputationService } from '../reputation.service.js';
import { ScoutService } from '../scout.service.js';
import { StoreService } from '../store.service.js';

/**
 * Story campaign Slice I: Act V of The Missing Line on 2.6.0-G. Every combination of Mara's
 * answer and the ending completes the campaign, pays the same, and is remembered. Opt in with
 * STORY_INTEGRATION=1.
 */

const ruleset = classicOgV26G;
const catalog = ruleset.questDefinitions as QuestDefinitionCatalog;
const CAMPAIGN = Object.keys(catalog).filter((key) => key.startsWith('ML_M'));
const before = (key: string) => CAMPAIGN.slice(0, CAMPAIGN.indexOf(key));
const ANSWERS = ['MEET_MARA_ACCEPT', 'MEET_MARA_REFUSE', 'MEET_MARA_DEFER'];
const ENDINGS = ['OPEN_BOOK', 'BURN_BOOK', 'KEEP_BOOK'];

describe.runIf(process.env.STORY_INTEGRATION === '1')('The Missing Line Act V with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  const accountIds: string[] = [];
  const earned = new Map<string, bigint>();

  const card = (page: QuestPageDto, key: string) => page.quests.find((quest) => quest.key === key)!;

  async function playerAt(done: readonly string[]): Promise<string> {
    const username = `ml5_${randomUUID().slice(0, 8)}`;
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

  function actions(playerId: string) {
    return {
      accept: (key: string) => HandcraftedQuestService.accept(app.prisma, playerId, ruleset, key),
      claim: (key: string, branchKey?: string) => HandcraftedQuestService.claim(app.prisma, playerId, ruleset, key, { actionId: randomUUID(), ...(branchKey ? { branchKey } : {}) }),
      respond: (questKey: string, sceneKey: string, responseKey: string) =>
        HandcraftedQuestService.respondToScene(app.prisma, playerId, ruleset, { questKey, sceneKey, responseKey }),
      cash: async () => (await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } })).cashCents,
    };
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({ data: {
      name: 'Missing Line Act V fixture', slug: `missing-line-5-${randomUUID()}`,
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

  it('plays The Man Who Signed Twice and No One Owes Alone with real work', async () => {
    const playerId = await playerAt(before('ML_M21_SIGNED_TWICE'));
    const { accept, claim, respond } = actions(playerId);
    let page = await accept('ML_M21_SIGNED_TWICE');
    await expect(respond('ML_M21_SIGNED_TWICE', 'rival_statement_taken', 'give_him_time')).rejects.toMatchObject({ code: 'SCENE_NOT_AVAILABLE' });
    await ScoutService.scout(app.prisma, playerId, { district: 'WINO_SLUMS', turns: 1, actionId: randomUUID() });
    page = await respond('ML_M21_SIGNED_TWICE', 'rival_statement_taken', 'give_him_time');
    expect(card(page, 'ML_M21_SIGNED_TWICE').status).toBe('READY_TO_TURN_IN');
    await claim('ML_M21_SIGNED_TWICE');
    await accept('ML_M22_NO_ONE_OWES_ALONE');
    await respond('ML_M22_NO_ONE_OWES_ALONE', 'accounts_reconciled', 'say_it_out_loud');
    await claim('ML_M22_NO_ONE_OWES_ALONE');
    page = await HandcraftedQuestService.page(app.prisma, playerId, ruleset);
    const appointment = card(page, 'ML_M23_LAST_APPOINTMENT');
    expect(appointment).toMatchObject({ status: 'AVAILABLE', contactKey: 'MARA_VENN', contactName: 'Mara' });
    expect(page.contacts.some((contact) => contact.key === 'MARA_VENN')).toBe(true);
  }, 120_000);

  for (const answer of ANSWERS) {
    for (const ending of ENDINGS) {
      it(`finishes the campaign after ${answer} and ${ending}`, async () => {
        const playerId = await playerAt(before('ML_M23_LAST_APPOINTMENT'));
        const { accept, claim: claimJob, respond, cash } = actions(playerId);
        const start = await cash();
        const claims: ReturnType<typeof claimJob>[] = [];
        const claim = (key: string, branchKey?: string) => {
          const receipt = claimJob(key, branchKey);
          claims.push(receipt.catch(() => ({ result: { rewards: [] } }) as unknown as Awaited<ReturnType<typeof claimJob>>));
          return receipt;
        };

        await accept('ML_M23_LAST_APPOINTMENT');
        await respond('ML_M23_LAST_APPOINTMENT', 'mara_offer_heard', 'ask_about_the_others');
        await expect(claim('ML_M23_LAST_APPOINTMENT')).rejects.toMatchObject({ code: 'QUEST_BRANCH_REQUIRED' });
        await claim('ML_M23_LAST_APPOINTMENT', answer);

        let page = await HandcraftedQuestService.page(app.prisma, playerId, ruleset);
        const table = catalog.ML_M24_EVERYBODY_AT_THE_TABLE!.story!.variants!.find((variant) => variant.when.kind === 'BRANCH_CHOSEN' && variant.when.branchKey === answer)!;
        expect(card(page, 'ML_M24_EVERYBODY_AT_THE_TABLE').story!.intro).toBe(table.intro);
        await accept('ML_M24_EVERYBODY_AT_THE_TABLE');
        await StoreService.checkout(app.prisma, playerId, { lines: [{ store: 'CORNER', item: 'BEER', direction: 'buy', quantity: 10 }], actionId: randomUUID() });
        await respond('ML_M24_EVERYBODY_AT_THE_TABLE', 'table_priority_chosen', 'blocks_first');
        await claim('ML_M24_EVERYBODY_AT_THE_TABLE');

        page = await accept('ML_M25_MISSING_LINE');
        expect(card(page, 'ML_M25_MISSING_LINE').branchChoices.map((choice) => choice.key)).toEqual(ENDINGS);
        await respond('ML_M25_MISSING_LINE', 'the_book_opened', 'find_the_erased_line');
        await claim('ML_M25_MISSING_LINE', ending);

        // Every combination pays the same, read from the claim receipts (the cash balance also
        // moves with the crew's background income, which depends on the clock, not the story).
        const paid = (await Promise.all(claims)).flatMap((receipt) => receipt.result.rewards)
          .filter((reward) => reward.kind === 'CASH').reduce((total, reward) => total + (reward.amount ?? 0), 0);
        earned.set(`${answer}/${ending}`, BigInt(paid));
        expect(await cash()).toBeGreaterThan(start);
        expect(new Set(earned.values()).size).toBe(1);

        const history = await HandcraftedQuestService.history(app.prisma, playerId, ruleset);
        const finale = history.find((quest) => quest.key === 'ML_M25_MISSING_LINE')!;
        const closing = catalog.ML_M25_MISSING_LINE!.story!.variants!.find((variant) => variant.when.kind === 'BRANCH_CHOSEN' && variant.when.branchKey === ending)!;
        expect(finale).toMatchObject({ status: 'COMPLETED', chosenBranch: ending });
        expect(finale.story!.completed).toBe(closing.completed);
        expect(history.find((quest) => quest.key === 'ML_M23_LAST_APPOINTMENT')?.chosenBranch).toBe(answer);

        // The campaign is over: no campaign job is left to take.
        page = await HandcraftedQuestService.page(app.prisma, playerId, ruleset);
        expect(page.quests.filter((quest) => quest.key.startsWith('ML_M') && quest.status !== 'COMPLETED')).toEqual([]);
      }, 120_000);
    }
  }
});
