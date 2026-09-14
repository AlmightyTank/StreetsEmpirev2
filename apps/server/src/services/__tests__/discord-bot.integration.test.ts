import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV01 } from '@streets/rulesets';

const snowflake = () => `1${Array.from({ length: 17 }, () => randomInt(10)).join('')}`;

describe.runIf(process.env.DISCORD_BOT_INTEGRATION === '1')('Discord bot internal API with PostgreSQL', () => {
  let app: FastifyInstance;
  let env: (typeof import('../../config/env.js'))['env'];
  // 0: richest in the round, 1: in the round, 2: linked but not in the round.
  const accounts: { id: string; username: string; discordId: string }[] = [];
  let roundId: string;
  let cityId: string;

  beforeAll(async () => {
    ({ env } = await import('../../config/env.js'));
    if (!env.discordBot.enabled) throw new Error('Set a test DISCORD_BOT_API_TOKEN (64+ characters).');
    app = await (await import('../../app.js')).buildApp();
    for (let i = 0; i < 3; i++) {
      const username = `bot_${randomUUID().slice(0, 8)}`;
      const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, email: `${username}@example.invalid`, password: randomUUID() } });
      expect(response.statusCode, response.body).toBe(201);
      const discordId = snowflake();
      await app.prisma.account.update({ where: { id: response.json().account.id }, data: { discordId, discordUsername: username } });
      accounts.push({ id: response.json().account.id, username, discordId });
    }
    const city = await app.prisma.city.create({ data: { slug: `bot-test-${randomUUID()}`, name: 'Bot Test City', isEnabled: true } });
    cityId = city.id;
    const round = await app.prisma.round.create({ data: {
      slug: `bot-test-${randomUUID()}`, name: 'Bot Test Round', rulesetId: classicOgV01.meta.id, rulesetVersion: classicOgV01.meta.version,
      status: 'ACTIVE', startsAt: new Date(Date.now() - 60000), endsAt: new Date(Date.now() + 86400000),
    } });
    roundId = round.id;
    for (const [i, netWorth] of [[0, 900_000_00n], [1, 100_00n]] as const) {
      await app.prisma.roundPlayer.create({ data: {
        ...classicOgV01.round.startingPlayer, accountId: accounts[i]!.id, roundId, cityId, publicPimpId: 7101 + i,
        displayName: accounts[i]!.username, netWorthCents: netWorth, lastTurnCalculationAt: new Date(),
      } });
    }
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.account.deleteMany({ where: { id: { in: accounts.map((a) => a.id) } } });
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (cityId) await app.prisma.city.delete({ where: { id: cityId } });
    await app.close();
  });

  const auth = () => ({ authorization: `Bearer ${env.discordBot.apiToken}` });

  it('requires the bot token on every route', async () => {
    for (const headers of [{}, { authorization: 'Bearer wrong' }, { authorization: env.discordBot.apiToken }]) {
      expect((await app.inject({ url: '/api/internal/discord/rankings', headers })).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url: '/api/internal/discord/roles', headers, payload: { discordIds: [accounts[0]!.discordId] } })).statusCode).toBe(401);
    }
  });

  it('returns role keys for linked accounts only', async () => {
    const unknown = snowflake();
    const response = await app.inject({ method: 'POST', url: '/api/internal/discord/roles', headers: auth(), payload: { discordIds: [...accounts.map((a) => a.discordId), unknown] } });
    expect(response.statusCode, response.body).toBe(200);
    const members = response.json().members as Record<string, string[]>;
    expect(members[accounts[0]!.discordId]).toEqual(['linked', 'player', 'national-1', 'top-10']);
    expect(members[accounts[1]!.discordId]).toEqual(['linked', 'player', 'top-10']);
    expect(members[accounts[2]!.discordId]).toEqual(['linked']);
    expect(members).not.toHaveProperty(unknown);

    for (const payload of [{ discordIds: [] }, { discordIds: ['not-a-snowflake'] }, { discordIds: [unknown], extra: true }]) {
      expect((await app.inject({ method: 'POST', url: '/api/internal/discord/roles', headers: auth(), payload })).statusCode).toBe(400);
    }
  });

  it('builds public profile cards by Discord member or player name', async () => {
    const byDiscord = await app.inject({ url: `/api/internal/discord/profile?discordId=${accounts[0]!.discordId}`, headers: auth() });
    expect(byDiscord.statusCode, byDiscord.body).toBe(200);
    const card = byDiscord.json().player;
    expect(card).toMatchObject({ roundName: 'Bot Test Round', publicPimpId: 7101, city: 'Bot Test City', netWorthCents: 90_000_000 });
    expect(Object.keys(card).sort()).toEqual(['badges', 'city', 'displayName', 'forumProfileUrl', 'legacy', 'netWorthCents', 'profileUrl', 'publicPimpId', 'rank', 'roundName']);
    expect(card.profileUrl).toBe(new URL('/game/players/7101', env.frontendOrigin).toString());

    const byName = await app.inject({ url: `/api/internal/discord/profile?name=${encodeURIComponent(accounts[1]!.username.toUpperCase())}`, headers: auth() });
    expect(byName.json().player.publicPimpId).toBe(7102);

    const missing = [
      [`discordId=${snowflake()}`, 'DISCORD_NOT_LINKED'],
      [`discordId=${accounts[2]!.discordId}`, 'PLAYER_NOT_IN_ROUND'],
      ['name=nobody_by_this_name', 'PLAYER_NOT_FOUND'],
    ] as const;
    for (const [query, code] of missing) {
      const response = await app.inject({ url: `/api/internal/discord/profile?${query}`, headers: auth() });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe(code);
    }
    expect((await app.inject({ url: '/api/internal/discord/profile', headers: auth() })).statusCode).toBe(400);
  });

  it('lists the current round top ten', async () => {
    const response = await app.inject({ url: '/api/internal/discord/rankings', headers: auth() });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().round.name).toBe('Bot Test Round');
    expect(response.json().entries.map((entry: { rank: number; publicPimpId: number }) => [entry.rank, entry.publicPimpId])).toEqual([[1, 7101], [2, 7102]]);
  });
});
