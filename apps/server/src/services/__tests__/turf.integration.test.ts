import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV06B } from '@streets/rulesets';
import { combatSimulationRng, startingStock } from '@streets/rules-engine';
import { NetWorthService } from '../net-worth.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { ScoutService } from '../scout.service.js';
import { TurfActionService } from '../turf-action.service.js';
import { TurfService } from '../turf.service.js';

describe.runIf(process.env.TURF_INTEGRATION === '1')('0.6.0-B turf holding with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let playerId = '';
  let accountId = '';
  let cookie = '';
  let cityId = '';
  const rules = classicOgV06B;

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
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');

    const round = await app.prisma.round.create({
      data: {
        name: 'Turf B fixture',
        slug: `turf-b-${randomUUID()}`,
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
    await app.prisma.turfTaxLedger.deleteMany({ where: { roundId } });
    await app.prisma.turf.deleteMany({ where: { roundId } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.playerActivity.deleteMany({ where: { roundPlayerId: playerId } });

    const data = {
      ...rules.round.startingPlayer,
      ...startingStock(rules),
      whores: 50,
      thugs: 80,
      woundedThugs: 0,
      busyThugs: 0,
      postedThugs: 0,
      postedNetWorthCents: 0n,
      pistols: 0,
      shotguns: 0,
      tek9s: 0,
      ak47s: 80,
      condoms: 5_000,
      beer: 5_000,
      crack: 5_000,
      turns: 144,
      cashCents: 5_000_000n,
      lastTurnCalculationAt: new Date(),
      lastActiveAt: new Date(),
    };
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) },
    });
    await TurfService.ensureRound(app.prisma, roundId, rules);
  });

  it('adds Scout turns to B presence and exposes the faded value on the map', async () => {
    const first = await ScoutService.scout(app.prisma, playerId, { district: 'CASINO', turns: 7, actionId: randomUUID() }, combatSimulationRng(10));
    const second = await ScoutService.scout(app.prisma, playerId, { district: 'CASINO', turns: 5, actionId: randomUUID() }, combatSimulationRng(11));
    expect(first.result.turnsUsed).toBe(7);
    expect(second.result.turnsUsed).toBe(5);

    const row = await app.prisma.turfPresence.findUniqueOrThrow({
      where: { roundPlayerId_cityId_district: { roundPlayerId: playerId, cityId, district: 'CASINO' } },
    });
    expect(row.turns).toBeCloseTo(12 * rules.turf.presence.perScoutTurn, 4);

    const byCity = await TurfService.byCity(app.prisma, playerId, rules, row.at);
    const home = byCity?.get(rules.round.startingCitySlug);
    expect(home?.blocks.find((block) => block.district === 'CASINO')?.presenceTurns).toBeCloseTo(row.turns, 4);
    expect(home?.holdingEnabled).toBe(true);
  });

  it('accepts a claim through the same HTTP route used by City Blocks', async () => {
    await app.prisma.turfPresence.create({
      data: { roundPlayerId: playerId, cityId, district: 'WINO_SLUMS', turns: 100, at: new Date() },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/game/turf/claim',
      headers: { cookie },
      payload: { district: 'WINO_SLUMS', thugs: 40, actionId: randomUUID() },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().result).toMatchObject({
      district: 'WINO_SLUMS',
      squad: 40,
      won: true,
      cornerThugs: 40,
    });
    expect((await app.prisma.turf.findUniqueOrThrow({
      where: { roundId_cityId_district: { roundId, cityId, district: 'WINO_SLUMS' } },
    })).holderId).toBe(playerId);
  });

  it('moves thugs and real guns onto a claimed corner without changing net worth, then returns them on pull', async () => {
    await app.prisma.turfPresence.create({
      data: { roundPlayerId: playerId, cityId, district: 'CASINO', turns: 100, at: new Date() },
    });

    const claim = await TurfActionService.claim(
      app.prisma,
      playerId,
      { district: 'CASINO', thugs: 40, actionId: randomUUID() },
      () => 0.999,
    );
    expect(claim.result.won).toBe(true);
    expect(claim.after.resources.postedThugs).toBe(40);
    expect(claim.after.resources.ak47s).toBe(40);
    expect(claim.after.netWorthCents).toBe(claim.before.netWorthCents);

    const held = await app.prisma.turf.findUniqueOrThrow({
      where: { roundId_cityId_district: { roundId, cityId, district: 'CASINO' } },
    });
    expect(held.holderId).toBe(playerId);
    expect(held.cornerThugs).toBe(40);
    expect(held.cornerAk47s).toBe(40);

    const afterClaim = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(afterClaim.postedNetWorthCents).toBeGreaterThan(0n);

    const pull = await TurfActionService.pull(app.prisma, playerId, { district: 'CASINO', thugs: 40, actionId: randomUUID() });
    expect(pull.result.released).toBe(true);
    expect(pull.after.resources.postedThugs).toBe(0);
    expect(pull.after.resources.ak47s).toBe(80);
    expect(pull.after.netWorthCents).toBe(pull.before.netWorthCents);

    const home = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    expect(home.postedNetWorthCents).toBe(0n);
  });
});
