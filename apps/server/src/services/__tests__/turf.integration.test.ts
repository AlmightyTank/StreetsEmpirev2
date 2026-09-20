import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV06A } from '@streets/rulesets';
import { combatSimulationRng, startingStock } from '@streets/rules-engine';
import { NetWorthService } from '../net-worth.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { ScoutService } from '../scout.service.js';
import { TurfService } from '../turf.service.js';

/**
 * 0.6.0-B gate, first slice: scouting a block leaves presence there, and the map
 * reads the faded value that later claim/post actions will spend.
 */
describe.runIf(process.env.TURF_INTEGRATION === '1')('turf holding with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let playerId = '';
  let accountId = '';
  let cityId = '';
  const rules = classicOgV06A;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();

    const accountName = `turf_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: accountName, email: `${accountName}@example.invalid`, password: randomUUID() },
    });
    accountId = registered.json().account.id;

    const round = await app.prisma.round.create({
      data: {
        name: 'Turf fixture',
        slug: `turf-${randomUUID()}`,
        rulesetId: rules.meta.id,
        rulesetVersion: rules.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundId = round.id;
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;

    const player = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer,
        ...startingStock(rules),
        roundId,
        accountId,
        cityId,
        displayName: accountName,
        publicPimpId: 8100,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    playerId = player.id;

    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.turfPresence.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.playerActivity.deleteMany({ where: { roundPlayerId: playerId } });

    const data = {
      ...rules.round.startingPlayer,
      ...startingStock(rules),
      whores: 50,
      thugs: 30,
      woundedThugs: 0,
      pistols: 30,
      condoms: 5_000,
      beer: 5_000,
      crack: 1_000,
      turns: 144,
      cashCents: 5_000_000n,
      lastTurnCalculationAt: new Date(),
      lastActiveAt: new Date(),
    };
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) },
    });
  });

  it('adds Scout turns to block presence and exposes them on the city turf map', async () => {
    const first = await ScoutService.scout(app.prisma, playerId, { district: 'CASINO', turns: 7, actionId: randomUUID() }, combatSimulationRng(10));
    const second = await ScoutService.scout(app.prisma, playerId, { district: 'CASINO', turns: 5, actionId: randomUUID() }, combatSimulationRng(11));

    expect(first.result.turnsUsed).toBe(7);
    expect(second.result.turnsUsed).toBe(5);

    const row = await app.prisma.turfPresence.findUniqueOrThrow({
      where: { roundPlayerId_cityId_district: { roundPlayerId: playerId, cityId, district: 'CASINO' } },
    });
    expect(row.turns).toBeCloseTo(12, 4);

    const byCity = await TurfService.byCity(app.prisma, playerId, rules, row.at);
    const home = byCity?.get(rules.round.startingCitySlug);
    expect(home?.blocks.find((block) => block.district === 'CASINO')?.presenceTurns).toBeCloseTo(12, 4);
    expect(home?.blocks.find((block) => block.district === 'NIGHTCLUB')?.presenceTurns).toBe(0);
  });
});
