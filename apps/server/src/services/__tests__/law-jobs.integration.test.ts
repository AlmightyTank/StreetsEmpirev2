import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV13E, classicOgV13F, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { LawService } from '../law.service.js';
import { PlayerStateService } from '../player-state.service.js';
import { ReputationService } from '../reputation.service.js';
import { SeasonStatsService } from '../season-stats.service.js';

const HOUR_MS = 3_600_000;
const ruleset = classicOgV13F;

/**
 * 1.3.0-F gate, live: Ledger's Jobs run on the law system working normally, a Case that cools
 * out of its stage is written down on settle so Jobs hear of it, the finale only counts a
 * Warrant-stage Case closed without a warrant served, and older rulesets write nothing new.
 * Opt in with TURF_INTEGRATION=1.
 */
describe.runIf(process.env.TURF_INTEGRATION === '1')('1.3.0-F law Jobs with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];

  async function fixture(rules: Ruleset = ruleset) {
    const round = await app.prisma.round.create({
      data: {
        name: 'Law F fixture', slug: 'law-f-' + randomUUID(),
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
        displayName: 'ledger_' + randomUUID().slice(0, 6), publicPimpId: 9850 + roundIds.length,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    return { player, city };
  }

  async function quest(playerId: string, key: string) {
    const page = await HandcraftedQuestService.page(app.prisma, playerId, ruleset);
    return page.quests.find((row) => row.key === key)!;
  }

  /** Mark Jobs done without playing them, and set Ledger's standing. */
  async function done(playerId: string, keys: string[], standing: number) {
    await HandcraftedQuestService.page(app.prisma, playerId, ruleset);
    for (const key of keys) {
      const row = await app.prisma.playerQuest.findFirstOrThrow({ where: { roundPlayerId: playerId, questDefinition: { key, rulesetId: ruleset.meta.id } } });
      await app.prisma.playerQuest.update({ where: { id: row.id }, data: { status: 'COMPLETED', completedAt: new Date(), claimedAt: new Date() } });
    }
    await app.prisma.playerReputation.upsert({
      where: { roundPlayerId_trader: { roundPlayerId: playerId, trader: 'LEDGER' } },
      create: { roundPlayerId: playerId, trader: 'LEDGER', points: standing },
      update: { points: standing },
    });
  }

  /** A Case that went quiet `hoursAgo`, long enough to cool to nothing by now. */
  function quietCase(playerId: string, cityId: string, points: number, stage: string, extra: { peakStage?: string; openedAt?: Date } = {}) {
    const quietSince = new Date(Date.now() - 200 * HOUR_MS);
    return app.prisma.playerCase.create({
      data: { roundPlayerId: playerId, cityId, caseHundredths: points * 100, stage, caseAt: quietSince, lastEvidenceAt: quietSince, peakStage: extra.peakStage ?? stage, openedAt: extra.openedAt ?? quietSince },
    });
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'law_f_' + randomUUID().slice(0, 6);
    const registered = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { username: name, email: name + '@example.invalid', password: randomUUID() },
    });
    accountId = registered.json().account.id;
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('offers Ledger and completes Open File from a real Case rise, paying standing and no cash', async () => {
    const { player, city } = await fixture();
    const opening = await HandcraftedQuestService.page(app.prisma, player.id, ruleset);
    expect(opening.contacts.map((contact) => contact.key)).toContain('LEDGER');
    expect(opening.quests.find((row) => row.key === 'LEDGER_OPEN_FILE')?.status).toBe('AVAILABLE');
    expect(opening.quests.find((row) => row.key === 'LEDGER_COOLING_OFF')?.status).toBe('LOCKED');

    await HandcraftedQuestService.accept(app.prisma, player.id, ruleset, 'LEDGER_OPEN_FILE');
    await app.prisma.$transaction((tx) => LawService.record(tx, player.id, ruleset, [{ cityId: city.id, points: 25, source: 'BUST', sourceKey: 'bust:f' }]));
    expect((await quest(player.id, 'LEDGER_OPEN_FILE')).status).toBe('READY_TO_TURN_IN');

    const before = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } });
    await HandcraftedQuestService.claim(app.prisma, player.id, ruleset, 'LEDGER_OPEN_FILE', { actionId: randomUUID() });
    const after = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } });
    expect(after.cashCents).toBe(before.cashCents);
    expect(after.turns).toBe(before.turns);
    const rep = await app.prisma.playerReputation.findUnique({ where: { roundPlayerId_trader: { roundPlayerId: player.id, trader: 'LEDGER' } } });
    expect(rep?.points).toBe(10);
    expect((await quest(player.id, 'LEDGER_COOLING_OFF')).status).toBe('AVAILABLE');

    // The Case remembers when it left Quiet and how far it got.
    const row = await app.prisma.playerCase.findFirstOrThrow({ where: { roundPlayerId: player.id, cityId: city.id } });
    expect(row).toMatchObject({ stage: 'NOTICED', peakStage: 'NOTICED' });
    expect(row.openedAt).not.toBeNull();
  });

  it('writes a Case that cooled to Quiet on settle, so Cooling Off and its bonus complete', async () => {
    const { player, city } = await fixture();
    await done(player.id, ['LEDGER_OPEN_FILE'], 10);
    await HandcraftedQuestService.accept(app.prisma, player.id, ruleset, 'LEDGER_COOLING_OFF');
    await quietCase(player.id, city.id, 25, 'NOTICED');

    await PlayerStateService.settle(app.prisma, player.id);
    const ready = await quest(player.id, 'LEDGER_COOLING_OFF');
    expect(ready.status).toBe('READY_TO_TURN_IN');
    expect(ready.objectives.find((objective) => objective.id === 'quiet' && objective.bonus)).toMatchObject({ completed: true });

    const row = await app.prisma.playerCase.findFirstOrThrow({ where: { roundPlayerId: player.id, cityId: city.id } });
    expect(row).toMatchObject({ caseHundredths: 0, stage: 'QUIET', peakStage: 'QUIET', openedAt: null });
    const receipts = await app.prisma.playerCaseReceipt.findMany({ where: { roundPlayerId: player.id } });
    expect(receipts.map((receipt) => [receipt.source, receipt.deltaHundredths, receipt.stageAfter])).toEqual([['COOLING', -2_500, 'QUIET']]);

    // A second settle has nothing left to write.
    await PlayerStateService.settle(app.prisma, player.id);
    expect(await app.prisma.playerCaseReceipt.count({ where: { roundPlayerId: player.id } })).toBe(1);
  });

  it('closes the finale only on a Warrant-stage Case cooled to Quiet with no warrant served there', async () => {
    const { player, city } = await fixture();
    await done(player.id, ['LEDGER_OPEN_FILE', 'LEDGER_COOLING_OFF', 'LEDGER_FRIENDS_DOWNTOWN', 'LEDGER_RIGHT_TO_COUNSEL', 'LEDGER_BEAT_THE_RAP'], 80);
    await HandcraftedQuestService.accept(app.prisma, player.id, ruleset, 'LEDGER_CASE_CLOSED');

    // Raided: a warrant was served in this city after its Case opened.
    const openedAt = new Date(Date.now() - 300 * HOUR_MS);
    await quietCase(player.id, city.id, 30, 'INVESTIGATION', { peakStage: 'WARRANT', openedAt });
    await app.prisma.playerWarrant.create({
      data: { roundPlayerId: player.id, cityId: city.id, target: 'HIDEOUT', status: 'SERVED', draftedAt: openedAt, servesAt: openedAt, resolvedAt: new Date(openedAt.getTime() + HOUR_MS) },
    });
    await PlayerStateService.settle(app.prisma, player.id);
    expect((await quest(player.id, 'LEDGER_CASE_CLOSED')).status).toBe('ACTIVE');

    // Never reached a warrant: cooling to Quiet is not enough either.
    const detroit = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'detroit' } });
    await quietCase(player.id, detroit.id, 30, 'INVESTIGATION');
    await PlayerStateService.settle(app.prisma, player.id);
    expect((await quest(player.id, 'LEDGER_CASE_CLOSED')).status).toBe('ACTIVE');

    // Beat at the Warrant stage, never served: closed.
    const seattle = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'seattle' } });
    await quietCase(player.id, seattle.id, 30, 'INVESTIGATION', { peakStage: 'WARRANT' });
    await PlayerStateService.settle(app.prisma, player.id);
    expect((await quest(player.id, 'LEDGER_CASE_CLOSED')).status).toBe('READY_TO_TURN_IN');
  });

  it('writes nothing new on settle for a ruleset without Ledger', async () => {
    const { player, city } = await fixture(classicOgV13E);
    await quietCase(player.id, city.id, 25, 'NOTICED');
    await PlayerStateService.settle(app.prisma, player.id);
    const row = await app.prisma.playerCase.findFirstOrThrow({ where: { roundPlayerId: player.id, cityId: city.id } });
    expect(row).toMatchObject({ caseHundredths: 2_500, stage: 'NOTICED' });
    expect(await app.prisma.playerCaseReceipt.count({ where: { roundPlayerId: player.id } })).toBe(0);
  });

  it('reads a season’s law record for the clean-record feats', async () => {
    const { player, city } = await fixture();
    await app.prisma.$transaction((tx) => LawService.record(tx, player.id, ruleset, [{ cityId: city.id, points: 70, source: 'BUST', sourceKey: 'bust:season' }]));
    await app.prisma.playerWarrant.updateMany({ where: { roundPlayerId: player.id }, data: { status: 'SERVED', resolvedAt: new Date() } });
    const loaded = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id }, include: { round: true } });
    const totals = (await SeasonStatsService.totals(app.prisma, [loaded])).get(player.id)!;
    expect(totals).toMatchObject({ lawSeason: 1, lawPeakStage: 3, lawWarrantsServed: 1 });
  });
});
