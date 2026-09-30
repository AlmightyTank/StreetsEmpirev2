import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Round } from '@prisma/client';
import { classicOgV08H, rulesets, STREET_PASS_S1, STREET_PASS_S1_COSMETICS, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';

/**
 * Street Pass step 2, live: Cred from turns and Jobs, the daily turn cap,
 * claiming (once, even when two claims race), late joiners and round close.
 * No shipped ruleset has a pass yet, so a test ruleset is registered for the
 * run. Opt in with STREET_PASS_INTEGRATION=1.
 */
describe.runIf(process.env.STREET_PASS_INTEGRATION === '1')('Street Pass with PostgreSQL', () => {
  const rules: Ruleset = {
    ...classicOgV08H,
    meta: { ...classicOgV08H.meta, id: 'street-pass-test', version: 'test' },
    cosmetics: { ...classicOgV08H.cosmetics, ...STREET_PASS_S1_COSMETICS },
    streetPass: STREET_PASS_S1,
  };
  const registry = rulesets as Record<string, Ruleset>;
  const DAY = 86_400_000;

  let app: FastifyInstance;
  let cookie = '';
  let playerId = '';
  let current: Round;
  const roundIds: string[] = [];
  const accountIds: string[] = [];

  async function makeRound(startsAt: Date): Promise<Round> {
    const round = await app.prisma.round.create({ data: {
      name: 'Street Pass fixture', slug: `street-pass-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt, endsAt: new Date(Date.now() + 7 * DAY),
    } });
    roundIds.push(round.id);
    return round;
  }

  async function makePlayer(round: Round, joinedAt = new Date()): Promise<{ id: string; accountId: string; cookie: string }> {
    const name = `sp_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    expect(registered.statusCode, registered.body).toBe(201);
    const account = registered.json().account.id as string;
    accountIds.push(account);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    const player = await app.prisma.roundPlayer.create({ data: {
      ...rules.round.startingPlayer, ...startingStock(rules),
      accountId: account, roundId: round.id, cityId: city.id,
      publicPimpId: -Math.floor(Math.random() * 2_000_000_000) - 1, displayName: name,
      whores: 10, thugs: 10, condoms: 1_000, beer: 500, crack: 500, pistols: 10,
      lastTurnCalculationAt: new Date(), createdAt: joinedAt,
    } });
    return { id: player.id, accountId: account, cookie: registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ') };
  }

  const service = async () => (await import('../street-pass.service.js')).StreetPassService;
  const cred = async () => (await import('../street-pass-cred.service.js')).StreetPassCredService;
  const setCred = (id: string, value: number) => app.prisma.streetPassProgress.upsert({
    where: { roundPlayerId: id },
    create: { roundPlayerId: id, passKey: STREET_PASS_S1.key, cred: value },
    update: { cred: value },
  });
  const cash = async (id: string) => (await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id } })).cashCents;

  beforeAll(async () => {
    registry[rules.meta.id] = rules;
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    current = await makeRound(new Date(Date.now() - 60 * 60_000));
    const player = await makePlayer(current);
    playerId = player.id;
    cookie = player.cookie;
    const { RoundService } = await import('../round.service.js');
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(async () => current);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountIds.length) await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    await app.prisma.questDefinition.deleteMany({ where: { rulesetId: rules.meta.id } }).catch(() => undefined);
    delete registry[rules.meta.id];
    await app?.close();
  });

  const post = (url: string, payload: Record<string, unknown> = {}) => app.inject({ method: 'POST', url, headers: { cookie }, payload });

  it('earns Cred from turns spent on a Scout and from turning in a job', async () => {
    expect((await post('/api/game/quests/FIRST_NIGHT_OUT/accept', { actionId: randomUUID() })).statusCode).toBe(200);
    const scout = await post('/api/game/scout', { district: 'WINO_SLUMS', turns: 12, actionId: randomUUID() });
    expect(scout.statusCode, scout.body).toBe(200);

    let view = (await (await service()).view(app.prisma, playerId, rules))!;
    expect(view.cred).toBe(12);
    expect(view.turnCredToday).toBe(12);

    const claim = await post('/api/game/quests/FIRST_NIGHT_OUT/claim', { actionId: randomUUID() });
    expect(claim.statusCode, claim.body).toBe(200);
    view = (await (await service()).view(app.prisma, playerId, rules))!;
    expect(view.cred).toBe(12 + STREET_PASS_S1.sources.oneTimeJob);
    expect(view.tier).toBe(0);
    expect(view.nextTierCred).toBe(600);
  });

  it('caps turn Cred at 400 a day and starts again the next day', async () => {
    const credit = await cred();
    const other = await makePlayer(current);
    const now = new Date();
    const spend = (turns: number, at: Date) => app.prisma.$transaction((tx) => credit.creditTurns(tx, other.id, rules, turns, at));
    expect(await spend(300, now)).toBe(300);
    expect(await spend(300, now)).toBe(100);
    expect(await spend(50, now)).toBe(0);
    expect(await spend(50, new Date(now.getTime() + DAY))).toBe(50);
    const view = (await (await service()).view(app.prisma, other.id, rules, new Date(now.getTime() + DAY)))!;
    expect(view.cred).toBe(450);
    expect(view.turnCredToday).toBe(50);
  });

  it('refuses a tier the player has not reached', async () => {
    await setCred(playerId, 599);
    await expect((await service()).claim(app.prisma, playerId, { tier: 1, actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'STREET_PASS_TIER_LOCKED' });
    await expect((await service()).claim(app.prisma, playerId, { tier: 31, actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'STREET_PASS_TIER_UNKNOWN' });
  });

  it('pays a tier once: a replayed request answers the same, a second claim is refused', async () => {
    const pass = await service();
    await setCred(playerId, 600);
    const before = await cash(playerId);
    const actionId = randomUUID();
    const first = await pass.claim(app.prisma, playerId, { tier: 1, actionId });
    expect(first.result).toMatchObject({ passKey: 'street-pass-s1', tier: 1 });
    expect(first.result.rewards.map((reward) => reward.label)).toEqual(['$10,000.00']);
    expect(await cash(playerId) - before).toBe(1_000_000n);

    const replay = await pass.claim(app.prisma, playerId, { tier: 1, actionId });
    expect(replay).toEqual(first);
    await expect(pass.claim(app.prisma, playerId, { tier: 1, actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'STREET_PASS_ALREADY_CLAIMED' });
    expect(await cash(playerId) - before).toBe(1_000_000n);

    const view = (await pass.view(app.prisma, playerId, rules))!;
    expect(view.tiers[0]).toMatchObject({ tier: 1, reached: true, claimed: true });
    expect(view.claimable).toEqual([]);
    const activity = await app.prisma.playerActivity.findFirst({ where: { roundPlayerId: playerId, type: 'STREET_PASS_CLAIMED' } });
    expect(activity?.payload).toMatchObject({ tier: 1, rewards: ['$10,000.00'] });
  });

  it('pays once when two claims for the same tier race', async () => {
    const pass = await service();
    await setCred(playerId, 8_000);
    const before = await cash(playerId);
    const results = await Promise.allSettled([
      pass.claim(app.prisma, playerId, { tier: 8, actionId: randomUUID() }),
      pass.claim(app.prisma, playerId, { tier: 8, actionId: randomUUID() }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'STREET_PASS_ALREADY_CLAIMED' } });
    expect(await cash(playerId) - before).toBe(2_500_000n);
    expect(await app.prisma.streetPassClaim.count({ where: { roundPlayerId: playerId, tier: 8 } })).toBe(1);
  });

  it('gives a player who joined two weeks in +30% Cred', async () => {
    const lateRound = await makeRound(new Date(Date.now() - 16 * DAY));
    const late = await makePlayer(lateRound, new Date(Date.now() - DAY));
    const earned = await app.prisma.$transaction(async (tx) => (await cred()).creditQuest(tx, late.id, rules, 'DAILY'));
    expect(earned).toBe(195);
    const view = (await (await service()).view(app.prisma, late.id, rules))!;
    expect(view).toMatchObject({ cred: 195, lateJoinBonusPercent: 30 });
  });

  it('at round close grants unclaimed season cosmetics only, then refuses every claim', async () => {
    const closing = await makeRound(new Date(Date.now() - 60 * 60_000));
    const finisher = await makePlayer(closing);
    await setCred(finisher.id, 27_000);
    await (await service()).claim(app.prisma, finisher.id, { tier: 2, actionId: randomUUID() });
    const before = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: finisher.id } });

    const { RoundService } = await import('../round.service.js');
    const closed = await RoundService.closeRoundAt(app.prisma, closing.id, new Date());
    expect(closed.closed).toBe(true);

    const claims = await app.prisma.streetPassClaim.findMany({ where: { roundPlayerId: finisher.id }, orderBy: { tier: 'asc' } });
    expect(claims.map((claim) => [claim.tier, claim.automatic])).toEqual([[2, false], [30, true]]);
    const cosmetics = await app.prisma.accountCosmeticUnlock.findMany({ where: { accountId: finisher.accountId }, orderBy: { key: 'asc' } });
    expect(cosmetics.map((row) => row.key)).toEqual(['street-pass-s1-badge', 'street-pass-s1-frame']);
    // Gameplay rewards on the other 27 reached tiers expired with the round.
    const after = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: finisher.id } });
    expect(after.cashCents).toBe(before.cashCents);

    await expect((await service()).claim(app.prisma, finisher.id, { tier: 1, actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'ROUND_ENDED' });
  });

  it('does nothing on a round without a pass', async () => {
    const plain = { ...rules, streetPass: undefined };
    expect(await (await service()).view(app.prisma, playerId, plain)).toBeNull();
    expect(await app.prisma.$transaction(async (tx) => (await cred()).creditTurns(tx, playerId, plain, 50, new Date()))).toBe(0);
  });

});
