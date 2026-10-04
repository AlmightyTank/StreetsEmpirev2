import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV14A, classicOgV14B, type QuestDefinition, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { FactionService } from '../faction.service.js';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { ReputationService } from '../reputation.service.js';

const ruleset = classicOgV14B;
const jobs = Object.values(ruleset.questDefinitions) as QuestDefinition[];
const repTo = (job: QuestDefinition, contact: string) => job.rewards
  .filter((reward) => reward.kind === 'CONTACT_REP' && reward.key === contact)
  .reduce((sum, reward) => sum + (reward.amount ?? 0), 0);
/** A one-time Job from Mama King (The Kings) that pays her reputation. */
const kingsJob = jobs.find((job) => job.contactKey === 'MAMA_KING' && job.repeatability === 'ONCE' && repTo(job, 'MAMA_KING') > 0)!;

/**
 * 1.4.0-B gate, live: a contact's one-time Job pays their faction standing with a receipt, a
 * retried claim pays nothing more, a tier rise logs once, and independent contacts, the
 * rotating boards and 1.4.0-A rounds pay none. Opt in with TURF_INTEGRATION=1.
 */
describe.runIf(process.env.TURF_INTEGRATION === '1')('1.4.0-B faction standing with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];
  const players: string[] = [];

  async function fixture(rules: Ruleset = ruleset) {
    const round = await app.prisma.round.create({
      data: {
        name: 'Factions B fixture', slug: 'factions-b-' + randomUUID(),
        rulesetId: rules.meta.id, rulesetVersion: rules.meta.version,
        status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer, ...startingStock(rules),
        roundId: round.id, accountId, cityId: city.id,
        displayName: 'standing_' + randomUUID().slice(0, 6), publicPimpId: 9950 + roundIds.length,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    players.push(player.id);
    await HandcraftedQuestService.page(app.prisma, player.id, rules);
    return player;
  }

  /** Mark a Job ready to collect without playing it. */
  async function ready(playerId: string, key: string, rules: Ruleset = ruleset) {
    const row = await app.prisma.playerQuest.findFirstOrThrow({ where: { roundPlayerId: playerId, questDefinition: { key, rulesetId: rules.meta.id } } });
    await app.prisma.playerQuest.update({ where: { id: row.id }, data: { status: 'READY_TO_TURN_IN' } });
  }

  const claim = (playerId: string, key: string, actionId = randomUUID(), rules: Ruleset = ruleset) =>
    HandcraftedQuestService.claim(app.prisma, playerId, rules, key, { actionId });

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'standing_' + randomUUID().slice(0, 6);
    const registered = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { username: name, email: name + '@example.invalid', password: randomUUID() },
    });
    accountId = registered.json().account.id;
  });

  // Whatever a test did, the receipts add up to the stored standing.
  afterEach(async () => {
    for (const roundPlayerId of players) {
      const rows = await app.prisma.playerFactionStanding.findMany({ where: { roundPlayerId } });
      const sums = await app.prisma.playerFactionReceipt.groupBy({ by: ['factionKey'], where: { roundPlayerId }, _sum: { delta: true } });
      expect(rows.map((row) => [row.factionKey, row.points]).sort()).toEqual(sums.map((row) => [row.factionKey, row._sum.delta]).sort());
    }
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('pays a Kings Job its contact reputation again as Kings standing, once, with a receipt', async () => {
    expect(kingsJob).toBeDefined();
    const player = await fixture();
    const amount = repTo(kingsJob, 'MAMA_KING');

    const before = await HandcraftedQuestService.page(app.prisma, player.id, ruleset);
    expect(before.quests.find((row) => row.key === kingsJob.key)?.factionStanding).toEqual({
      factionKey: 'KINGS', factionName: 'The Kings', amount, label: `+${amount} The Kings standing`,
    });
    expect(before.factions?.find((faction) => faction.key === 'KINGS')?.standing).toMatchObject({ points: 0, tier: 'UNKNOWN', next: { tier: 'KNOWN', startsAt: 25 } });

    await ready(player.id, kingsJob.key);
    const actionId = randomUUID();
    const claimed = await claim(player.id, kingsJob.key, actionId);
    expect(claimed.result.standingChanges).toEqual([
      expect.objectContaining({ factionKey: 'KINGS', factionName: 'The Kings', amount, label: `+${amount} The Kings standing` }),
    ]);
    // A retried claim replays the same result and pays nothing more.
    await claim(player.id, kingsJob.key, actionId);

    const receipts = await app.prisma.playerFactionReceipt.findMany({ where: { roundPlayerId: player.id } });
    expect(receipts.map((row) => [row.factionKey, row.source, row.delta])).toEqual([['KINGS', 'JOB', amount]]);
    const after = await HandcraftedQuestService.page(app.prisma, player.id, ruleset);
    expect(after.factions?.find((faction) => faction.key === 'KINGS')?.standing?.points).toBe(amount);
    expect(after.factions?.find((faction) => faction.key === 'OUTFIT')?.standing?.points).toBe(0);
  });

  it('logs a tier rise once, and nothing for a claim that stays in the tier', async () => {
    const player = await fixture();
    const amount = repTo(kingsJob, 'MAMA_KING');
    // Just short of Known, as a receipt-backed grant so the books still add up.
    await app.prisma.$transaction((tx) => FactionService.grant(tx, player.id, ruleset, 'KINGS', ruleset.factionStanding.tiers.known - 1, 'JOB', 'test:seed'));
    await ready(player.id, kingsJob.key);
    const claimed = await claim(player.id, kingsJob.key);
    expect(claimed.result.standingChanges[0]).toMatchObject({ tierName: 'Known', tierUp: true });

    const rises = await app.prisma.playerActivity.findMany({ where: { roundPlayerId: player.id, type: 'FACTION_TIER_UP' } });
    expect(rises.map((row) => row.payload)).toEqual([expect.objectContaining({ factionKey: 'KINGS', tier: 'KNOWN', tierName: 'Known', points: ruleset.factionStanding.tiers.known - 1 + amount })]);
    expect(await app.prisma.inAppNotification.count({ where: { activityId: rises[0]!.id } })).toBe(1);
  });

  it('pays no standing for an independent contact, a rotating board or a 1.4.0-A round', async () => {
    const player = await fixture();
    await ready(player.id, 'LEDGER_OPEN_FILE');
    const ledger = await claim(player.id, 'LEDGER_OPEN_FILE');
    expect(ledger.result.standingChanges).toEqual([]);

    const daily = (await HandcraftedQuestService.page(app.prisma, player.id, ruleset)).quests.find((row) => row.type === 'DAILY' && row.contactKey);
    if (daily) {
      expect(daily.factionStanding).toBeNull();
      await ready(player.id, daily.key);
      expect((await claim(player.id, daily.key)).result.standingChanges).toEqual([]);
    }
    expect(await app.prisma.playerFactionReceipt.count({ where: { roundPlayerId: player.id } })).toBe(0);

    const older = await fixture(classicOgV14A);
    await ready(older.id, kingsJob.key, classicOgV14A);
    expect((await claim(older.id, kingsJob.key, randomUUID(), classicOgV14A)).result.standingChanges).toEqual([]);
    expect((await HandcraftedQuestService.page(app.prisma, older.id, classicOgV14A)).factions?.every((faction) => faction.standing === null)).toBe(true);
    expect(await app.prisma.playerFactionStanding.count({ where: { roundPlayerId: older.id } })).toBe(0);
  });
});
