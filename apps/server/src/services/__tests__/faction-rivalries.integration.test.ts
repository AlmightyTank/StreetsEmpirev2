import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV14D, classicOgV14E, type FactionKey, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { FactionService } from '../faction.service.js';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { ReputationService } from '../reputation.service.js';
import { TurfService } from '../turf.service.js';

const ruleset = classicOgV14E;
const IC = ruleset.factionStanding.tiers.innerCircle;

/**
 * 1.4.0-E gate, live: reaching Inner Circle locks the rivals' and says so before it happens; a
 * locked faction stops one point short; capstones wait for Inner Circle; Vic's introductions take
 * their fee and start you at Known, and only while you are a stranger; 1.4.0-D rounds have no
 * lock. Opt in with TURF_INTEGRATION=1.
 */
describe.runIf(process.env.TURF_INTEGRATION === '1')('1.4.0-E rivalries and Inner Circle with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];
  const players: string[] = [];

  async function fixture(rules: Ruleset = ruleset, extra: Record<string, unknown> = {}) {
    const round = await app.prisma.round.create({
      data: {
        name: 'Rivalries E fixture', slug: 'rivalries-e-' + randomUUID(),
        rulesetId: rules.meta.id, rulesetVersion: rules.meta.version,
        status: 'ACTIVE', startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 14 * 86_400_000),
      },
    });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer, ...startingStock(rules), ...extra,
        roundId: round.id, accountId, cityId: city.id,
        displayName: 'rival_' + randomUUID().slice(0, 6), publicPimpId: 9950 + roundIds.length,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    players.push(player.id);
    return player;
  }

  const grant = (playerId: string, factionKey: FactionKey, amount: number, rules: Ruleset = ruleset) =>
    FactionService.grant(app.prisma, playerId, rules, factionKey, amount, 'JOB', `test:${randomUUID()}`);

  async function ready(playerId: string, key: string) {
    await HandcraftedQuestService.page(app.prisma, playerId, ruleset);
    const row = await app.prisma.playerQuest.findFirstOrThrow({ where: { roundPlayerId: playerId, questDefinition: { key } }, orderBy: { attempt: 'desc' } });
    await app.prisma.playerQuest.update({ where: { id: row.id }, data: { status: 'READY_TO_TURN_IN', acceptedAt: new Date(), completedAt: new Date() } });
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'rival_' + randomUUID().slice(0, 6);
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

  it('locks the rival at Inner Circle, logs it, and holds the rival one point short', async () => {
    const player = await fixture();
    const reached = await grant(player.id, 'KINGS', IC);
    expect(reached).toMatchObject({ tier: 'INNER_CIRCLE', tierUp: true, locked: ['OUTFIT'] });
    const tierUp = await app.prisma.playerActivity.findFirstOrThrow({ where: { roundPlayerId: player.id, type: 'FACTION_TIER_UP', payload: { path: ['tier'], equals: 'INNER_CIRCLE' } } });
    expect(tierUp.payload).toMatchObject({ lockedRivals: ['The Outfit'] });

    const capped = await grant(player.id, 'OUTFIT', 400);
    expect(capped).toMatchObject({ after: IC - 1, tier: 'CONNECTED', heldShortBy: 'KINGS' });
    expect(await grant(player.id, 'OUTFIT', 50)).toBeNull();

    const page = await HandcraftedQuestService.page(app.prisma, player.id, ruleset);
    const outfit = page.factions!.find((faction) => faction.key === 'OUTFIT')!;
    const kings = page.factions!.find((faction) => faction.key === 'KINGS')!;
    expect(outfit.innerCircle?.lockedBy).toEqual({ key: 'KINGS', name: 'The Kings' });
    expect(kings.innerCircle).toMatchObject({ lockedBy: null, wouldLock: [] });
    // The capstone is listed and opens at Inner Circle.
    expect(kings.jobs.find((job) => job.key === 'KINGS_CROWN_OF_THE_BLOCK')).toMatchObject({ tierName: 'Inner Circle' });
  });

  it('says on the Job card that collecting it locks the rival, then does exactly that', async () => {
    const player = await fixture();
    await grant(player.id, 'KINGS', IC - 10);
    await ready(player.id, 'KINGS_NEIGHBORHOOD_WATCH');
    const page = await HandcraftedQuestService.page(app.prisma, player.id, ruleset);
    const card = page.quests.find((quest) => quest.key === 'KINGS_NEIGHBORHOOD_WATCH')!;
    expect(card.factionStandings).toEqual([expect.objectContaining({ factionKey: 'KINGS', amount: 15, locks: ['The Outfit'] })]);
    expect(page.factions!.find((faction) => faction.key === 'KINGS')!.innerCircle?.wouldLock).toEqual([{ key: 'OUTFIT', name: 'The Outfit' }]);

    const claimed = await HandcraftedQuestService.claim(app.prisma, player.id, ruleset, 'KINGS_NEIGHBORHOOD_WATCH', { actionId: randomUUID() });
    expect(claimed.result.standingChanges).toEqual([expect.objectContaining({ factionKey: 'KINGS', tierName: 'Inner Circle', locked: ['The Outfit'] })]);
    expect((await grant(player.id, 'OUTFIT', IC))?.after).toBe(IC - 1);
  });

  it('introduces a stranger for Vic\'s fee, starting them at Known with a receipt and a ledger line', async () => {
    const player = await fixture(ruleset, { cashCents: 50_000_000n });
    await ready(player.id, 'VIC_INTRO_OUTFIT');
    const page = await HandcraftedQuestService.page(app.prisma, player.id, ruleset);
    const card = page.quests.find((quest) => quest.key === 'VIC_INTRO_OUTFIT')!;
    expect(card.introduces).toEqual({ factionKey: 'OUTFIT', factionName: 'The Outfit' });
    expect(card.feeCents).toBeGreaterThanOrEqual(2_000_000);
    expect(card.factionStandings).toEqual([expect.objectContaining({ factionKey: 'OUTFIT', amount: ruleset.factionStanding.tiers.known })]);
    expect(page.factions!.find((faction) => faction.key === 'OUTFIT')!.innerCircle?.introduction).toMatchObject({ key: 'VIC_INTRO_OUTFIT', status: 'READY_TO_TURN_IN' });

    const claimed = await HandcraftedQuestService.claim(app.prisma, player.id, ruleset, 'VIC_INTRO_OUTFIT', { actionId: randomUUID() });
    expect(claimed.result.feeCents).toBe(card.feeCents);
    expect(claimed.result.standingChanges).toEqual([expect.objectContaining({ factionKey: 'OUTFIT', amount: 25, tierName: 'Known' })]);
    const after = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } });
    expect(after.cashCents).toBe(50_000_000n - BigInt(card.feeCents!));
    expect(await app.prisma.playerFactionReceipt.findFirst({ where: { roundPlayerId: player.id, factionKey: 'OUTFIT' } })).toMatchObject({ source: 'INTRODUCTION', delta: 25 });
    expect(await app.prisma.economyLedgerEntry.findFirst({ where: { roundPlayerId: player.id, source: 'QUEST_FEE' } })).toMatchObject({ amountCents: -BigInt(card.feeCents!) });
  });

  it('reconciles turf hold hours for the Kings faction arc', async () => {
    const player = await fixture();
    await grant(player.id, 'KINGS', ruleset.factionStanding.tiers.connected);
    await HandcraftedQuestService.page(app.prisma, player.id, ruleset);
    const blockParty = await app.prisma.playerQuest.findFirstOrThrow({ where: { roundPlayerId: player.id, questDefinition: { key: 'KINGS_BLOCK_PARTY' } } });
    await app.prisma.playerQuest.update({ where: { id: blockParty.id }, data: { status: 'COMPLETED', acceptedAt: new Date(), completedAt: new Date(), claimedAt: new Date() } });
    await HandcraftedQuestService.page(app.prisma, player.id, ruleset);
    const hold = await app.prisma.playerQuest.findFirstOrThrow({ where: { roundPlayerId: player.id, questDefinition: { key: 'KINGS_HOLD_THE_LINE' } } });
    const now = new Date();
    const startedAt = new Date(now.getTime() - 100 * 3_600_000);
    await app.prisma.playerQuest.update({ where: { id: hold.id }, data: { status: 'ACTIVE', acceptedAt: startedAt, objectiveProgress: {} } });

    await TurfService.ensureRound(app.prisma, player.roundId, ruleset);
    const block = await app.prisma.turf.findFirstOrThrow({ where: { roundId: player.roundId, cityId: player.cityId } });
    await app.prisma.turfHoldSegment.create({
      data: {
        roundId: player.roundId, turfId: block.id, holderId: player.id,
        holderPublicPimpId: player.publicPimpId, holderName: player.displayName,
        startedAt, endedAt: null,
      },
    });

    const page = await HandcraftedQuestService.page(app.prisma, player.id, ruleset);
    const card = page.quests.find((quest) => quest.key === 'KINGS_HOLD_THE_LINE')!;
    expect(card.status).toBe('READY_TO_TURN_IN');
    expect(card.objectives.find((objective) => objective.id === 'hold')).toMatchObject({ current: 96, completed: true });
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: player.id, type: 'QUEST_READY', payload: { path: ['questKey'], equals: 'KINGS_HOLD_THE_LINE' } } })).toBe(1);
  });

  it('refuses an introduction the player cannot pay for, and waives it once they are already Known', async () => {
    const broke = await fixture(ruleset, { cashCents: 0n });
    await ready(broke.id, 'VIC_INTRO_CARTEL_LINE');
    await expect(HandcraftedQuestService.claim(app.prisma, broke.id, ruleset, 'VIC_INTRO_CARTEL_LINE', { actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'QUEST_FEE' });
    expect(await app.prisma.playerFactionStanding.count({ where: { roundPlayerId: broke.id } })).toBe(0);

    const known = await fixture(ruleset, { cashCents: 50_000_000n });
    await ready(known.id, 'VIC_INTRO_CARTEL_LINE');
    await grant(known.id, 'CARTEL_LINE', 40);
    const claimed = await HandcraftedQuestService.claim(app.prisma, known.id, ruleset, 'VIC_INTRO_CARTEL_LINE', { actionId: randomUUID() });
    expect(claimed.result.feeCents).toBeUndefined();
    expect(claimed.result.standingChanges).toEqual([]);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: known.id } })).cashCents).toBe(50_000_000n);
  });

  it('has no lock, no introductions and no capstones on a 1.4.0-D round', async () => {
    const player = await fixture(classicOgV14D);
    await grant(player.id, 'KINGS', IC, classicOgV14D);
    expect((await grant(player.id, 'OUTFIT', 400, classicOgV14D))?.after).toBe(400);
    const page = await HandcraftedQuestService.page(app.prisma, player.id, classicOgV14D);
    expect(page.factions!.every((faction) => faction.innerCircle === undefined)).toBe(true);
    expect(page.quests.some((quest) => quest.key.startsWith('VIC_INTRO_') || quest.key === 'KINGS_CROWN_OF_THE_BLOCK')).toBe(false);
  });
});
