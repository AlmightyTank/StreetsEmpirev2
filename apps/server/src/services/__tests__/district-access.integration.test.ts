import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV18O, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { DistrictsDto, QuestPageDto } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * Quest Access A, live: a 1.8.0-O round starts with the Nightclub and Casino locked for Scout
 * and Turf, says which story job opens each, and opens the Nightclub the moment Keeping Them
 * Happy is claimed. The Casino stays locked until Payday. Opt in with TURF_INTEGRATION=1.
 */
describe.runIf(process.env.TURF_INTEGRATION === '1')('district access with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let accountId = '';
  let playerId = '';
  let cookie = '';
  const rules: Ruleset = classicOgV18O;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    const round = await app.prisma.round.create({ data: {
      name: 'District access fixture', slug: `district-access-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 10 * 86_400_000),
    } });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);

    const name = `district_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accountId = registered.json().account.id;
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
    // Enough supplies for Keeping Them Happy (50 condoms, 25 beer, 25 crack) and a crew for turf.
    const data = {
      ...rules.round.startingPlayer, ...startingStock(rules),
      whores: 50, thugs: 40, woundedThugs: 0, pistols: 40, beer: 500, condoms: 5_000, crack: 100,
      turns: 144, cashCents: 50_000_000n, heat: 0, cityId: city.id,
    };
    const player = await app.prisma.roundPlayer.create({ data: {
      ...data, netWorthCents: NetWorthService.calculate(data, rules),
      roundId, accountId, displayName: name, publicPimpId: 7900 + Math.floor(Math.random() * 90),
      reputation: { create: ReputationService.seedFor(rules) },
    } });
    playerId = player.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  const post = (url: string, payload: object) => app.inject({ method: 'POST', url: `/api/game${url}`, headers: { cookie }, payload });
  const get = (url: string) => app.inject({ method: 'GET', url: `/api/game${url}`, headers: { cookie } });
  const districts = async () => (await get('/districts')).json<DistrictsDto>().districts;
  const access = async (key: string) => (await districts()).find((row) => row.key === key)!.districtAccess;
  const quest = async (key: string) => (await get('/quests')).json<QuestPageDto>().quests.find((row) => row.key === key)!;
  const scout = (district: string) => post('/scout', { district, turns: 1, actionId: randomUUID() });
  const claimBlock = (district: string) => post('/turf/claim', { district, thugs: 5, actionId: randomUUID() });

  it('locks only the Nightclub and Casino and names the story job for each', async () => {
    expect(await access('NIGHTCLUB')).toMatchObject({ unlocked: false, unlockName: 'Nightclub Access', unlockQuest: { key: 'KEEPING_THEM_HAPPY' } });
    expect(await access('CASINO')).toMatchObject({ unlocked: false, unlockName: 'Casino Access', unlockQuest: { key: 'PAYDAY' } });
    for (const key of ['WINO_SLUMS', 'LOW_RENT', 'URBAN_GHETTO']) expect(await access(key), key).toBeUndefined();
  }, 60_000);

  it('rejects Scout and Turf in a locked district and leaves the open ones alone', async () => {
    for (const district of ['NIGHTCLUB', 'CASINO']) {
      const scouted = await scout(district);
      expect(scouted.statusCode, scouted.body).toBe(409);
      expect(scouted.json().error.code).toBe('DISTRICT_ACCESS_LOCKED');
      const claimed = await claimBlock(district);
      expect(claimed.statusCode, claimed.body).toBe(409);
      expect(claimed.json().error.code).toBe('DISTRICT_ACCESS_LOCKED');
    }
    const open = await scout('LOW_RENT');
    expect(open.statusCode, open.body).toBe(200);
  }, 60_000);

  it('opens the Nightclub when Keeping Them Happy is claimed, and keeps the Casino locked', async () => {
    await quest('KEEPING_THEM_HAPPY');
    await app.prisma.playerQuest.updateMany({
      where: { roundPlayerId: playerId, questDefinition: { key: { in: ['FIRST_NIGHT_OUT', 'FRESH_FACES'] }, rulesetId: rules.meta.id } },
      data: { status: 'COMPLETED', completedAt: new Date(), claimedAt: new Date() },
    });
    expect((await quest('KEEPING_THEM_HAPPY')).status).toBe('AVAILABLE');
    const accepted = await post('/quests/KEEPING_THEM_HAPPY/accept', { actionId: randomUUID() });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect((await quest('KEEPING_THEM_HAPPY')).status).toBe('READY_TO_TURN_IN');
    const claimed = await post('/quests/KEEPING_THEM_HAPPY/claim', { actionId: randomUUID() });
    expect(claimed.statusCode, claimed.body).toBe(200);

    const unlocks = await app.prisma.playerUnlock.findMany({ where: { roundPlayerId: playerId } });
    expect(unlocks.map((row) => [row.key, row.sourceQuestKey])).toEqual([['DISTRICT_NIGHTCLUB_ACCESS', 'KEEPING_THEM_HAPPY']]);
    expect(await access('NIGHTCLUB')).toMatchObject({ unlocked: true });
    const scouted = await scout('NIGHTCLUB');
    expect(scouted.statusCode, scouted.body).toBe(200);

    expect(await access('CASINO')).toMatchObject({ unlocked: false });
    expect((await scout('CASINO')).json().error.code).toBe('DISTRICT_ACCESS_LOCKED');
  }, 120_000);
});
