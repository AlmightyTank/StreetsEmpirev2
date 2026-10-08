import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV14B2, classicOgV14C, sponsorCandidates, type QuestDefinition, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { ReputationService } from '../reputation.service.js';

const ruleset = classicOgV14C;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/**
 * 1.4.0-C gate, live: every board contract dealt shows its sponsor and standing before it is
 * accepted, keeps the sponsor it was dealt with, pays it once on collection with a CONTRACT
 * receipt, pays nothing when it expires, and 1.4.0-B2 rounds pay none. Opt in with
 * TURF_INTEGRATION=1.
 */
describe.runIf(process.env.TURF_INTEGRATION === '1')('1.4.0-C sponsored contracts with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];
  const players: string[] = [];

  async function fixture(rules: Ruleset = ruleset) {
    const round = await app.prisma.round.create({
      data: {
        name: 'Sponsors C fixture', slug: 'sponsors-c-' + randomUUID(),
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
        displayName: 'sponsor_' + randomUUID().slice(0, 6), publicPimpId: 9850 + roundIds.length,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    players.push(player.id);
    const page = await HandcraftedQuestService.page(app.prisma, player.id, rules);
    return { player, page };
  }

  async function rowFor(playerId: string, key: string) {
    return app.prisma.playerQuest.findFirstOrThrow({
      where: { roundPlayerId: playerId, questDefinition: { key }, status: { in: ['AVAILABLE', 'ACTIVE', 'READY_TO_TURN_IN'] } },
      orderBy: { attempt: 'desc' },
    });
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'sponsor_' + randomUUID().slice(0, 6);
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

  it('shows each dealt contract’s sponsor and standing before acceptance, from its candidates', async () => {
    const { player, page } = await fixture();
    const contracts = page.quests.filter((quest) => ['DAILY', 'WEEKLY', 'CITY_CONTRACT', 'SEASON'].includes(quest.type));
    expect(contracts.length).toBeGreaterThan(0);
    for (const quest of contracts) {
      const definition = ruleset.questDefinitions[quest.key as keyof typeof ruleset.questDefinitions] as QuestDefinition;
      const row = await rowFor(player.id, quest.key);
      const city = record(record(row.rewardState).cityContract);
      const candidates = sponsorCandidates(ruleset, definition, quest.type === 'CITY_CONTRACT' ? String(city.kind ?? 'SELL') : null);
      if (!candidates.length) {
        expect(quest.factionStandings).toEqual([]);
        continue;
      }
      const amount = ruleset.contractSponsors.standing[quest.type as 'DAILY'];
      expect(quest.factionStandings).toHaveLength(1);
      expect(candidates).toContain(quest.factionStandings[0]!.factionKey);
      expect(quest.factionStandings[0]!.amount).toBe(amount);
      expect(quest.factionKey).toBe(quest.factionStandings[0]!.factionKey);
      // An open choice is recorded when dealt, so it never changes afterwards.
      if (candidates.length > 1) expect(record(row.rewardState).sponsor).toBe(quest.factionKey);
    }
  });

  it('pays the sponsor once on collection with a CONTRACT receipt, and nothing when it expires', async () => {
    const { player, page } = await fixture();
    const sponsored = page.quests.filter((quest) => quest.type === 'DAILY' && quest.factionStandings.length);
    expect(sponsored.length).toBeGreaterThan(0);
    const [first, second] = sponsored;

    const row = await rowFor(player.id, first!.key);
    await app.prisma.playerQuest.update({ where: { id: row.id }, data: { status: 'READY_TO_TURN_IN' } });
    const actionId = randomUUID();
    const claimed = await HandcraftedQuestService.claim(app.prisma, player.id, ruleset, first!.key, { actionId });
    expect(claimed.result.standingChanges).toEqual([
      expect.objectContaining({ factionKey: first!.factionStandings[0]!.factionKey, amount: ruleset.contractSponsors.standing.DAILY }),
    ]);
    await HandcraftedQuestService.claim(app.prisma, player.id, ruleset, first!.key, { actionId });
    const receipts = await app.prisma.playerFactionReceipt.findMany({ where: { roundPlayerId: player.id } });
    expect(receipts.map((receipt) => [receipt.source, receipt.sourceKey])).toEqual([['CONTRACT', `job:${row.id}:${first!.factionStandings[0]!.factionKey}`]]);

    if (second) {
      const expired = await rowFor(player.id, second.key);
      await app.prisma.playerQuest.update({ where: { id: expired.id }, data: { status: 'EXPIRED' } });
      await expect(HandcraftedQuestService.claim(app.prisma, player.id, ruleset, second.key, { actionId: randomUUID() })).rejects.toThrow();
      expect(await app.prisma.playerFactionReceipt.count({ where: { roundPlayerId: player.id } })).toBe(1);
    }
  });

  it('pays a Season contract its sponsor’s Season standing, not a Job’s', async () => {
    const { player, page } = await fixture();
    const season = page.quests.find((quest) => quest.type === 'SEASON' && quest.factionStandings.length);
    if (!season) return;
    const row = await rowFor(player.id, season.key);
    await app.prisma.playerQuest.update({ where: { id: row.id }, data: { status: 'READY_TO_TURN_IN' } });
    const claimed = await HandcraftedQuestService.claim(app.prisma, player.id, ruleset, season.key, { actionId: randomUUID() });
    expect(claimed.result.standingChanges.map((change) => [change.factionKey, change.amount]))
      .toEqual([[season.factionKey, ruleset.contractSponsors.standing.SEASON]]);
  });

  it('pays no standing for board work in a 1.4.0-B2 round', async () => {
    const { player, page } = await fixture(classicOgV14B2);
    const daily = page.quests.find((quest) => quest.type === 'DAILY');
    expect(page.quests.every((quest) => quest.type === 'DAILY' ? quest.factionStandings.length === 0 : true)).toBe(true);
    if (!daily) return;
    const row = await rowFor(player.id, daily.key);
    expect(record(row.rewardState).sponsor).toBeUndefined();
    await app.prisma.playerQuest.update({ where: { id: row.id }, data: { status: 'READY_TO_TURN_IN' } });
    const claimed = await HandcraftedQuestService.claim(app.prisma, player.id, classicOgV14B2, daily.key, { actionId: randomUUID() });
    expect(claimed.result.standingChanges).toEqual([]);
  });
});
