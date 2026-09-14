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
  let citySlug: string;

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
    citySlug = city.slug;
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
    expect(response.json().city).toBeNull();
  });

  it('lists enabled cities and one city top ten', async () => {
    const cities = await app.inject({ url: '/api/internal/discord/cities', headers: auth() });
    expect(cities.statusCode, cities.body).toBe(200);
    expect(cities.json().cities).toContainEqual({ slug: citySlug, name: 'Bot Test City' });

    const ranked = await app.inject({ url: `/api/internal/discord/city-rankings?city=${citySlug}`, headers: auth() });
    expect(ranked.statusCode, ranked.body).toBe(200);
    expect(ranked.json().city).toEqual({ slug: citySlug, name: 'Bot Test City' });
    expect(ranked.json().entries.map((entry: { rank: number; publicPimpId: number }) => [entry.rank, entry.publicPimpId])).toEqual([[1, 7101], [2, 7102]]);

    const unknown = await app.inject({ url: '/api/internal/discord/city-rankings?city=nowhere-at-all', headers: auth() });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe('CITY_NOT_FOUND');
    expect((await app.inject({ url: '/api/internal/discord/city-rankings?city=Bad%20Slug!', headers: auth() })).statusCode).toBe(400);
  });

  it('reports a member link status for their private /link reply', async () => {
    const linked = await app.inject({ url: `/api/internal/discord/member?discordId=${accounts[0]!.discordId}`, headers: auth() });
    expect(linked.statusCode, linked.body).toBe(200);
    expect(linked.json()).toEqual({
      linked: true,
      username: accounts[0]!.username,
      forumUsername: null,
      roundName: 'Bot Test Round',
      player: { displayName: accounts[0]!.username, publicPimpId: 7101, profileUrl: new URL('/game/players/7101', env.frontendOrigin).toString() },
      roles: ['linked', 'player', 'national-1', 'top-10'],
    });

    const outsider = await app.inject({ url: `/api/internal/discord/member?discordId=${accounts[2]!.discordId}`, headers: auth() });
    expect(outsider.json()).toMatchObject({ linked: true, player: null, roles: ['linked'] });

    const stranger = await app.inject({ url: `/api/internal/discord/member?discordId=${snowflake()}`, headers: auth() });
    expect(stranger.json()).toEqual({ linked: false, username: null, forumUsername: null, roundName: null, player: null, roles: [] });
    expect((await app.inject({ url: '/api/internal/discord/member?discordId=abc', headers: auth() })).statusCode).toBe(400);
  });

  it('returns the full achievement list for /badges', async () => {
    const response = await app.inject({ url: `/api/internal/discord/badges?discordId=${accounts[0]!.discordId}`, headers: auth() });
    expect(response.statusCode, response.body).toBe(200);
    const player = response.json().player;
    expect(player).toMatchObject({ roundName: 'Bot Test Round', publicPimpId: 7101, profileUrl: new URL('/game/players/7101', env.frontendOrigin).toString() });
    expect(player.awards.length).toBeGreaterThan(20);
    expect(player.awards.find((award: { key: string }) => award.key === 'national-number-one')).toMatchObject({ unlocked: true });
    expect((await app.inject({ url: `/api/internal/discord/badges?discordId=${snowflake()}`, headers: auth() })).statusCode).toBe(404);
  });

  it('claims each published news post once, and never scheduled ones', async () => {
    const published = await app.prisma.gameNews.create({ data: { title: 'Bot news test', body: 'Hello *world*', roundId, publishedAt: new Date(Date.now() - 1_000) } });
    const scheduled = await app.prisma.gameNews.create({ data: { title: 'Bot future news', body: 'Later', roundId, publishedAt: new Date(Date.now() + 3_600_000) } });
    try {
      const claim = async () => {
        const response = await app.inject({ method: 'POST', url: '/api/internal/discord/news/claim', headers: auth() });
        expect(response.statusCode, response.body).toBe(200);
        return response.json().news as Array<{ title: string; body: string; url: string }>;
      };
      const first = await claim();
      expect(first.find((post) => post.title === 'Bot news test')).toMatchObject({ body: 'Hello *world*', url: new URL('/game/news', env.frontendOrigin).toString() });
      expect(first.some((post) => post.title === 'Bot future news')).toBe(false);
      expect((await claim()).some((post) => post.title === 'Bot news test')).toBe(false);
    } finally {
      await app.prisma.gameNews.deleteMany({ where: { id: { in: [published.id, scheduled.id] } } });
    }
  });

  it('switches turn reminders, and reminds once each time turns fill', async () => {
    const discordId = accounts[1]!.discordId;
    const cap = classicOgV01.turns.cap;
    const setReminder = (id: string, turns: boolean) =>
      app.inject({ method: 'PUT', url: '/api/internal/discord/reminders', headers: auth(), payload: { discordId: id, turns } });
    const claimMine = async () => {
      const response = await app.inject({ method: 'POST', url: '/api/internal/discord/reminders/claim', headers: auth() });
      expect(response.statusCode, response.body).toBe(200);
      return (response.json().reminders as Array<{ discordId: string }>).filter((reminder) => reminder.discordId === discordId);
    };
    const player = await app.prisma.roundPlayer.findFirstOrThrow({ where: { accountId: accounts[1]!.id, roundId } });
    const setTurns = (turns: number) => app.prisma.roundPlayer.update({ where: { id: player.id }, data: { turns, lastTurnCalculationAt: new Date() } });

    await setTurns(0);
    const on = await setReminder(discordId, true);
    expect(on.statusCode, on.body).toBe(200);
    expect(on.json()).toEqual({ turns: true, roundName: 'Bot Test Round', current: { turns: 0, cap } });
    expect(await claimMine()).toEqual([]);

    await setTurns(cap);
    expect(await claimMine()).toEqual([{ discordId, displayName: accounts[1]!.username, roundName: 'Bot Test Round', turns: cap, cap, url: new URL('/game', env.frontendOrigin).toString() }]);
    expect(await claimMine()).toEqual([]);

    // Spending re-arms on the next check; filling again reminds again.
    await setTurns(cap - 10);
    expect(await claimMine()).toEqual([]);
    await setTurns(cap);
    expect(await claimMine()).toHaveLength(1);

    expect((await setReminder(discordId, false)).json()).toMatchObject({ turns: false });
    await setTurns(0);
    await claimMine();
    await setTurns(cap);
    expect(await claimMine()).toEqual([]);

    expect((await setReminder(snowflake(), true)).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: '/api/internal/discord/reminders', headers: auth(), payload: { discordId, turns: 'yes' } })).statusCode).toBe(400);
  });

  // Last: the finished round gives account 1 legacy roles.
  it('lists podiums from finished rounds, and legacy roles follow them', async () => {
    const ended = await app.prisma.round.create({ data: {
      slug: `bot-ended-${randomUUID()}`, name: 'Bot Ended Round', rulesetId: classicOgV01.meta.id, rulesetVersion: classicOgV01.meta.version,
      status: 'ENDED', startsAt: new Date(Date.now() - 172_800_000), endsAt: new Date(Date.now() - 1_000),
    } });
    try {
      await app.prisma.roundPlayer.create({ data: {
        ...classicOgV01.round.startingPlayer, accountId: accounts[1]!.id, roundId: ended.id, cityId, publicPimpId: 7201,
        displayName: 'Old Champ', netWorthCents: 5_000_00n, nationalRank: 1, lastTurnCalculationAt: new Date(),
      } });

      const response = await app.inject({ url: '/api/internal/discord/hall-of-fame', headers: auth() });
      expect(response.statusCode, response.body).toBe(200);
      const round = response.json().rounds.find((entry: { name: string }) => entry.name === 'Bot Ended Round');
      expect(round.podium).toEqual([{ rank: 1, displayName: 'Old Champ', netWorthCents: 500_000, city: 'Bot Test City' }]);

      const roles = await app.inject({ method: 'POST', url: '/api/internal/discord/roles', headers: auth(), payload: { discordIds: [accounts[1]!.discordId] } });
      expect(roles.json().members[accounts[1]!.discordId]).toEqual(['linked', 'player', 'top-10', 'veteran', 'past-winner', 'top-finisher']);
    } finally {
      await app.prisma.round.delete({ where: { id: ended.id } });
    }
  });
});
