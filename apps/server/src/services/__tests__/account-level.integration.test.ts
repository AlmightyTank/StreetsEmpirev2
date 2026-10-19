import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Round } from '@prisma/client';
import { classicOgV22A, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { ACCOUNT_TRUST_GATES, experienceRequiredForLevel, experienceTitlesBetween } from '@streets/shared';

/**
 * Account level rewards and trust gates on PostgreSQL: Crowns paid once per
 * level milestone outside the round cap, catch-up for milestones passed before,
 * and the level needed to cold-message players or found an alliance.
 * Opt in with ACCOUNT_LEVEL_INTEGRATION=1.
 */
describe.runIf(process.env.ACCOUNT_LEVEL_INTEGRATION === '1')('account levels with PostgreSQL', () => {
  const rules: Ruleset = classicOgV22A;
  const DAY = 86_400_000;
  let app: FastifyInstance;
  let round: Round;
  const accountIds: string[] = [];

  async function makePlayer(experiencePoints = 0, isAdmin = false) {
    const username = `lvl_${randomUUID().slice(0, 8)}`;
    const account = await app.prisma.account.create({ data: {
      username, usernameNormalized: username.toLowerCase(), email: `${username}@example.invalid`,
      passwordHash: 'integration-fixture', experiencePoints, isAdmin,
      // Past the new-account window, so only the level gate is in play.
      createdAt: new Date(Date.now() - 7 * DAY),
    } });
    accountIds.push(account.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    const player = await app.prisma.roundPlayer.create({ data: {
      ...rules.round.startingPlayer, ...startingStock(rules),
      accountId: account.id, roundId: round.id, cityId: city.id,
      publicPimpId: Math.floor(Math.random() * 1_000_000_000) + 1_000_000, displayName: username,
      lastTurnCalculationAt: new Date(),
    } });
    return { accountId: account.id, id: player.id, publicPimpId: player.publicPimpId };
  }

  const experience = async () => (await import('../player-experience.service.js')).PlayerExperienceService;
  const consoleService = async () => (await import('../pimp-console.service.js')).PimpConsoleService;
  const alliances = async () => (await import('../alliance.service.js')).AllianceService;
  const award = async (roundPlayerId: string, amount: number, sourceKey = randomUUID()) => {
    const service = await experience();
    return app.prisma.$transaction((tx) => service.award(tx, { roundPlayerId, sourceKey, source: 'TEST', amount, awardedAt: new Date() }));
  };
  const levelCrowns = (accountId: string) => app.prisma.crownLedgerEntry.findMany({
    where: { accountId, source: 'account-level' }, orderBy: { delta: 'asc' }, select: { delta: true, roundId: true, externalRef: true },
  });
  const message = async (from: string, to: number) => (await consoleService()).send(app.prisma, from, {
    recipientPublicPimpId: to, subject: 'Hey', body: 'Want to team up?', actionId: randomUUID(),
  });

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    round = await app.prisma.round.create({ data: {
      name: 'Account level fixture', slug: `account-level-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + 7 * DAY),
    } });
    const { RoundService } = await import('../round.service.js');
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(async () => round);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(async () => round);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (round) await app.prisma.round.delete({ where: { id: round.id } });
    if (accountIds.length) await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    await app?.close();
  });

  it('pays level Crowns once per milestone, outside the round cap', async () => {
    const player = await makePlayer();
    await award(player.id, experienceRequiredForLevel(10));
    await award(player.id, 10);
    const paid = await levelCrowns(player.accountId);
    expect(paid.map((row) => row.delta)).toEqual([20, 20]);
    expect(paid.every((row) => row.roundId === null)).toBe(true);
    const wallet = await app.prisma.crownWallet.findUniqueOrThrow({ where: { accountId: player.accountId } });
    expect(wallet.balance).toBe(40);
  });

  it('catches up milestones passed before level Crowns existed on the next level-up', async () => {
    const player = await makePlayer(experienceRequiredForLevel(26));
    await award(player.id, experienceRequiredForLevel(27) - experienceRequiredForLevel(26));
    const paid = await levelCrowns(player.accountId);
    expect(paid.map((row) => row.externalRef).sort()).toEqual([5, 10, 15, 20, 25].map((level) => `earn:account-level:${player.accountId}:${level}`).sort());
    expect(paid.reduce((n, row) => n + row.delta, 0)).toBe(4 * 20 + 75);
  });

  it('pays nothing while earning is switched off, then catches up', async () => {
    const player = await makePlayer();
    await app.prisma.dropSettings.upsert({ where: { id: 'global' }, create: { id: 'global', earningEnabled: false }, update: { earningEnabled: false } });
    try {
      await award(player.id, experienceRequiredForLevel(5));
      expect(await levelCrowns(player.accountId)).toEqual([]);
    } finally {
      await app.prisma.dropSettings.update({ where: { id: 'global' }, data: { earningEnabled: true } });
    }
    await award(player.id, experienceRequiredForLevel(6) - experienceRequiredForLevel(5));
    expect((await levelCrowns(player.accountId)).map((row) => row.delta)).toEqual([20]);
  });

  it('holds cold messages below the gate but allows replies, alliance mates and staff', async () => {
    const gateXp = experienceRequiredForLevel(ACCOUNT_TRUST_GATES.coldMessage.level);
    const fresh = await makePlayer(gateXp - 1);
    const stranger = await makePlayer(gateXp);
    const staff = await makePlayer(0, true);

    await expect(message(fresh.accountId, stranger.publicPimpId)).rejects.toMatchObject({ code: 'ACCOUNT_LEVEL_REQUIRED' });
    await expect(message(fresh.accountId, staff.publicPimpId)).resolves.toMatchObject({ replayed: false });

    // Once the stranger writes first, a fresh player can answer.
    const answering = await makePlayer(gateXp - 1);
    await expect(message(stranger.accountId, answering.publicPimpId)).resolves.toMatchObject({ replayed: false });
    await expect(message(answering.accountId, stranger.publicPimpId)).resolves.toMatchObject({ replayed: false });

    // Staff skip the gate.
    const other = await makePlayer(gateXp);
    await expect(message(staff.accountId, other.publicPimpId)).resolves.toMatchObject({ replayed: false });

    // Alliance mates are always reachable.
    const mate = await makePlayer(gateXp - 1);
    const alliance = await app.prisma.alliance.create({ data: {
      roundId: round.id, name: 'Level Crew', nameNormalized: 'level crew', tag: 'LVL', tagNormalized: 'lvl', leaderId: other.id,
    } });
    await app.prisma.roundPlayer.updateMany({ where: { id: { in: [mate.id, other.id] } }, data: { allianceId: alliance.id, allianceJoinedAt: new Date() } });
    const freshMate = await makePlayer(gateXp - 1);
    await app.prisma.roundPlayer.update({ where: { id: freshMate.id }, data: { allianceId: alliance.id, allianceJoinedAt: new Date() } });
    await expect(message(freshMate.accountId, mate.publicPimpId)).resolves.toMatchObject({ replayed: false });
  });

  it('needs the founding level to start an alliance', async () => {
    const gateXp = experienceRequiredForLevel(ACCOUNT_TRUST_GATES.foundAlliance.level);
    const fresh = await makePlayer(gateXp - 1);
    const seasoned = await makePlayer(gateXp);
    const service = await alliances();
    await expect(service.create(app.prisma, fresh.id, { name: 'Too Soon', tag: 'SOON' })).rejects.toMatchObject({ code: 'ACCOUNT_LEVEL_REQUIRED' });
    expect(await app.prisma.alliance.count({ where: { roundId: round.id, tag: 'SOON' } })).toBe(0);
    await expect(service.create(app.prisma, seasoned.id, { name: 'Right On Time', tag: 'TIME' })).resolves.toMatchObject({ alliance: { tag: 'TIME' } });
  });

  it('grants every title up to the new level, catching up older accounts', async () => {
    const player = await makePlayer(experienceRequiredForLevel(26));
    await award(player.id, experienceRequiredForLevel(27) - experienceRequiredForLevel(26));
    const keys = (await app.prisma.accountCosmeticUnlock.findMany({ where: { accountId: player.accountId, sourceQuestKey: 'PLAYER_EXPERIENCE_LEVEL' }, select: { key: true } })).map((row) => row.key);
    expect(keys.sort()).toEqual(experienceTitlesBetween(0, 27).map((title) => title.key).sort());
    await award(player.id, experienceRequiredForLevel(28) - experienceRequiredForLevel(27));
    expect(await app.prisma.accountCosmeticUnlock.count({ where: { accountId: player.accountId, sourceQuestKey: 'PLAYER_EXPERIENCE_LEVEL' } })).toBe(experienceTitlesBetween(0, 28).length);
  });

  it('lets a veteran through every gate whatever their level', async () => {
    const veteran = await makePlayer(0);
    const past = await app.prisma.round.create({ data: {
      name: 'Finished season', slug: `account-level-past-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ENDED',
      startsAt: new Date(Date.now() - 60 * DAY), endsAt: new Date(Date.now() - 30 * DAY),
    } });
    try {
      const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
      await app.prisma.roundPlayer.create({ data: {
        ...rules.round.startingPlayer, ...startingStock(rules), accountId: veteran.accountId, roundId: past.id, cityId: city.id,
        publicPimpId: Math.floor(Math.random() * 1_000_000_000) + 1_000_000, displayName: `vet_${randomUUID().slice(0, 6)}`, lastTurnCalculationAt: new Date(),
      } });
      const service = await alliances();
      await expect(service.create(app.prisma, veteran.id, { name: 'Old Guard', tag: 'OLDG' })).resolves.toMatchObject({ alliance: { tag: 'OLDG' } });
    } finally {
      await app.prisma.round.delete({ where: { id: past.id } });
    }
  });

  it('holds casino and sportsbook plays below their level but never the way out', async () => {
    const name = `lvlc_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { ageConfirmed: true, birthDate: '1990-01-01', username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    expect(registered.statusCode, registered.body).toBe(201);
    accountIds.push(registered.json().account.id);
    const cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
    const post = (url: string, payload: object = {}) => app.inject({ method: 'POST', url: `/api/game/casino${url}`, headers: { cookie }, payload });

    expect((await post('/chips/buy', { amountCents: 100, actionId: randomUUID() })).json().error.code).toBe('ACCOUNT_LEVEL_REQUIRED');
    expect((await post('/sportsbook/bets', {})).json().error.code).toBe('ACCOUNT_LEVEL_REQUIRED');
    expect((await post('/chips/redeem', {})).json().error?.code).not.toBe('ACCOUNT_LEVEL_REQUIRED');

    await app.prisma.account.update({ where: { id: registered.json().account.id }, data: { experiencePoints: experienceRequiredForLevel(ACCOUNT_TRUST_GATES.casino.level) } });
    expect((await post('/chips/buy', { amountCents: 100, actionId: randomUUID() })).json().error?.code).not.toBe('ACCOUNT_LEVEL_REQUIRED');
    expect((await post('/sportsbook/bets', {})).json().error.code).toBe('ACCOUNT_LEVEL_REQUIRED');
  });
});
