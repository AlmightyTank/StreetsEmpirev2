import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV14B, classicOgV14B2, type QuestDataObject, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { PlayerQuestDto } from '@streets/shared';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { QuestProgressService } from '../quest-progress.service.js';
import { ReputationService } from '../reputation.service.js';
import { selectedDailyContractKeys } from '../daily-contract.service.js';
import { selectedSeasonContractKeys } from '../season-contract.service.js';
import { selectedWeeklyContractKeys } from '../weekly-contract.service.js';

/**
 * 1.4.0-B2 gate, live: a round deals its own daily, weekly and season boards, the city
 * board carries a third city job, and season and city-job contracts progress and pay.
 * Opt in with TURF_INTEGRATION=1. Each test makes dozens of round trips, so it gets
 * the same 60-second budget as the other integration suites: under a full parallel run
 * the 5-second default is not enough.
 */
describe.runIf(process.env.TURF_INTEGRATION === '1')('1.4.0-B2 contract rotation with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  let teammateId = '';
  let joined = 0;
  const roundIds: string[] = [];
  const endsAt = new Date(Date.now() + 20 * 86_400_000);

  async function newRound(ruleset: Ruleset) {
    const round = await app.prisma.round.create({
      data: {
        name: 'Contract rotation fixture', slug: 'contracts-a2-' + randomUUID(),
        rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version,
        status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt,
      },
    });
    roundIds.push(round.id);
    return round;
  }

  async function join(ruleset: Ruleset, roundId: string, account = accountId) {
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } });
    return app.prisma.roundPlayer.create({
      data: {
        ...ruleset.round.startingPlayer, ...startingStock(ruleset),
        roundId, accountId: account, cityId: city.id,
        displayName: 'contracts_' + randomUUID().slice(0, 6), publicPimpId: 9700 + (joined += 1),
        reputation: { create: ReputationService.seedFor(ruleset) },
      },
    });
  }

  const keysOf = (quests: PlayerQuestDto[], type: string) => quests.filter((quest) => quest.type === type).map((quest) => quest.key).sort();

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'contracts_' + randomUUID().slice(0, 6);
    const registered = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { username: name, email: name + '@example.invalid', password: randomUUID() },
    });
    accountId = registered.json().account.id;
    const mate = 'contracts_' + randomUUID().slice(0, 6);
    const teammate = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { username: mate, email: mate + '@example.invalid', password: randomUUID() },
    });
    teammateId = teammate.json().account.id;
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    for (const id of [accountId, teammateId]) if (id) await app.prisma.account.delete({ where: { id } });
    await app?.close();
  });

  it('deals the round its own daily, weekly and season boards, shared by its players', async () => {
    const round = await newRound(classicOgV14B2);
    const page = await HandcraftedQuestService.page(app.prisma, (await join(classicOgV14B2, round.id)).id, classicOgV14B2);
    const now = new Date();

    expect(keysOf(page.quests, 'DAILY')).toEqual(selectedDailyContractKeys(classicOgV14B2, now, undefined, round.id).sort());
    expect(keysOf(page.quests, 'WEEKLY')).toEqual(selectedWeeklyContractKeys(classicOgV14B2, now, undefined, round.id).sort());
    expect(keysOf(page.quests, 'SEASON')).toEqual(selectedSeasonContractKeys(classicOgV14B2, round.id).sort());
    expect(page.seasonContracts).toEqual({ enabled: true, slots: 3, resetAt: endsAt.toISOString() });
    expect(page.cityContracts.slots).toBe(3);
    expect(page.quests.filter((quest) => quest.type === 'CITY_CONTRACT')).toHaveLength(3);

    const teammate = await HandcraftedQuestService.page(app.prisma, (await join(classicOgV14B2, round.id, teammateId)).id, classicOgV14B2);
    for (const type of ['DAILY', 'WEEKLY', 'SEASON']) expect(keysOf(teammate.quests, type)).toEqual(keysOf(page.quests, type));

    // A 1.4.0-B round keeps two city slots and has no season board.
    const old = await HandcraftedQuestService.page(app.prisma, (await join(classicOgV14B, (await newRound(classicOgV14B)).id)).id, classicOgV14B);
    expect(old.seasonContracts).toEqual({ enabled: false, slots: 0, resetAt: null });
    expect(old.cityContracts.slots).toBe(2);
    expect(keysOf(old.quests, 'SEASON')).toEqual([]);
  }, 60_000);

  it('runs season contracts outside the active-job limit and counts progress', async () => {
    const round = await newRound(classicOgV14B2);
    const player = await join(classicOgV14B2, round.id);
    let page = await HandcraftedQuestService.page(app.prisma, player.id, classicOgV14B2);
    const seasons = page.quests.filter((quest) => quest.type === 'SEASON');
    for (const quest of seasons) page = await HandcraftedQuestService.accept(app.prisma, player.id, classicOgV14B2, quest.key);
    expect(page.quests.filter((quest) => quest.type === 'SEASON').every((quest) => quest.status === 'ACTIVE')).toBe(true);
    expect(page.counts.active).toBe(0);

    const target = seasons[0]!;
    const objective = classicOgV14B2.questDefinitions[target.key as keyof typeof classicOgV14B2.questDefinitions].objectives[0]!;
    const params = objective.params as QuestDataObject;
    const field = typeof params.field === 'string' ? params.field : null;
    const payload: QuestDataObject = {
      ...(params.where as QuestDataObject | undefined ?? {}),
      won: true,
      cashCents: 1_000,
      ...(field ? { [field]: objective.kind === 'UNIQUE_VALUES' ? ['detroit'] : 10 } : {}),
    };
    await QuestProgressService.emit(app.prisma, player.id, {
      sourceKey: 'a2-season:' + randomUUID(),
      type: (params.eventTypes as string[])[0]!,
      payload,
    });
    page = await HandcraftedQuestService.page(app.prisma, player.id, classicOgV14B2);
    expect(page.quests.find((quest) => quest.key === target.key)!.objectives[0]!.current).toBeGreaterThan(0);
  }, 60_000);

  it('pays a city job once its trip or wagers land in the posted city', async () => {
    const round = await newRound(classicOgV14B2);
    const player = await join(classicOgV14B2, round.id);
    let page = await HandcraftedQuestService.page(app.prisma, player.id, classicOgV14B2);
    const job = page.quests.find((quest) => quest.key === 'CITY_JOB_C')!;
    expect(job.status).toBe('AVAILABLE');
    page = await HandcraftedQuestService.accept(app.prisma, player.id, classicOgV14B2, job.key);

    const stored = await app.prisma.playerQuest.findFirstOrThrow({
      where: { roundPlayerId: player.id, questDefinition: { key: 'CITY_JOB_C' } },
    });
    const offer = (stored.rewardState as { cityContract: { kind: string; city: string; target: number; bonusCents: number } }).cityContract;
    for (let index = 0; index < offer.target; index += 1) {
      await QuestProgressService.emit(app.prisma, player.id, offer.kind === 'TRIP'
        ? { sourceKey: 'a2-trip:' + randomUUID(), type: 'TRIP_RETURNED', payload: { city: offer.city } }
        : { sourceKey: 'a2-wager:' + randomUUID(), type: 'CASINO_WAGER', payload: { citySlug: offer.city, game: 'ROULETTE' } });
    }
    page = await HandcraftedQuestService.page(app.prisma, player.id, classicOgV14B2);
    expect(page.quests.find((quest) => quest.key === 'CITY_JOB_C')!.status).toBe('READY_TO_TURN_IN');

    const before = (await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } })).cashCents;
    await HandcraftedQuestService.claim(app.prisma, player.id, classicOgV14B2, 'CITY_JOB_C', { actionId: randomUUID() });
    const after = (await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } })).cashCents;
    expect(Number(after - before)).toBe(offer.bonusCents);
  }, 60_000);
});
