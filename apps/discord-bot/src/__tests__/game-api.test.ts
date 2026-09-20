import { describe, expect, it } from 'vitest';
import { createGameApi, GameApiError } from '../game-api.js';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: URL | string, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const token = 't'.repeat(64);

describe('createGameApi', () => {
  it('sends the bot token only to internal endpoints', async () => {
    const internal = fakeFetch(200, { members: {} });
    await createGameApi({ baseUrl: 'http://127.0.0.1:3001', token, fetch: internal.fetchImpl }).roles(['123456789012345678']);
    expect(internal.calls[0]!.url).toBe('http://127.0.0.1:3001/api/internal/discord/roles');
    expect(internal.calls[0]!.init.method).toBe('POST');
    expect((internal.calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Bearer ${token}`);
    expect(internal.calls[0]!.init.body).toBe('{"discordIds":["123456789012345678"]}');

    const publicCall = fakeFetch(200, { news: [] });
    await createGameApi({ baseUrl: 'http://127.0.0.1:3001', token, fetch: publicCall.fetchImpl }).news();
    expect((publicCall.calls[0]!.init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('encodes profile lookups by name', async () => {
    const api = fakeFetch(404, { error: { code: 'PLAYER_NOT_FOUND', message: 'No player by that name.' } });
    await expect(createGameApi({ baseUrl: 'http://game', token, fetch: api.fetchImpl }).profile({ name: 'Big Daddy&x=1' }))
      .rejects.toMatchObject({ status: 404, code: 'PLAYER_NOT_FOUND', message: 'No player by that name.' });
    expect(api.calls[0]!.url).toBe('http://game/api/internal/discord/profile?name=Big+Daddy%26x%3D1');
  });

  it('turns unexpected responses into errors instead of trusting them', async () => {
    const bad = fakeFetch(200, { members: 'nope' });
    await expect(createGameApi({ baseUrl: 'http://game', token, fetch: bad.fetchImpl }).roles(['123456789012345678']))
      .rejects.toMatchObject({ code: 'BAD_RESPONSE' });
    const outage = fakeFetch(503, 'down');
    const error = await createGameApi({ baseUrl: 'http://game', token, fetch: outage.fetchImpl }).rankings().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GameApiError);
    expect(error).toMatchObject({ status: 503, code: 'HTTP_ERROR' });
  });

  it('builds the city, hall of fame and member requests with the bot token', async () => {
    const calls: string[] = [];
    const bodies: Record<string, unknown> = {
      '/api/internal/discord/city-rankings': { round: null, city: { slug: 'new-orleans', name: 'New Orleans' }, entries: [] },
      '/api/internal/discord/hall-of-fame': { rounds: [] },
      '/api/internal/discord/member': { linked: false, username: null, forumUsername: null, roundName: null, player: null, roles: [] },
      '/api/internal/discord/cities': { cities: [{ slug: 'detroit', name: 'Detroit' }] },
    };
    const fetchImpl = (async (url: URL | string, init: RequestInit = {}) => {
      const parsed = new URL(String(url));
      calls.push(`${parsed.pathname}${parsed.search} ${(init.headers as Record<string, string>).authorization ? 'auth' : 'public'}`);
      return new Response(JSON.stringify(bodies[parsed.pathname]), { status: 200 });
    }) as typeof fetch;
    const api = createGameApi({ baseUrl: 'http://game', token, fetch: fetchImpl });

    expect((await api.cityRankings('new-orleans')).city).toEqual({ slug: 'new-orleans', name: 'New Orleans' });
    expect(await api.hallOfFame()).toEqual({ rounds: [] });
    expect((await api.member('123456789012345678')).linked).toBe(false);
    expect(await api.cities()).toEqual([{ slug: 'detroit', name: 'Detroit' }]);
    expect(calls).toEqual([
      '/api/internal/discord/city-rankings?city=new-orleans auth',
      '/api/internal/discord/hall-of-fame auth',
      '/api/internal/discord/member?discordId=123456789012345678 auth',
      '/api/internal/discord/cities auth',
    ]);
  });

  it('builds the badges, news claim and alert requests', async () => {
    const calls: Array<{ path: string; method: string; body: unknown; contentType: string | undefined }> = [];
    const bodies: Record<string, unknown> = {
      '/api/internal/discord/badges': { player: { roundName: 'R', displayName: 'Big', publicPimpId: 1, profileUrl: 'http://game/game/players/1', awards: [] } },
      '/api/internal/discord/news/claim': { news: [] },
      '/api/internal/discord/alerts': { alerts: { attacks: false, round: false, rank: false, turns: true }, roundName: 'R', current: { turns: 5, cap: 144, nationalRank: 7 } },
      '/api/internal/discord/alerts/claim': { turns: [], ranks: [], attacks: [], roundAlerts: [], battles: [], turf: [], territory: [], rounds: [] },
    };
    const fetchImpl = (async (url: URL | string, init: RequestInit = {}) => {
      const parsed = new URL(String(url));
      const headers = init.headers as Record<string, string>;
      calls.push({ path: `${parsed.pathname}${parsed.search}`, method: String(init.method), body: init.body, contentType: headers['content-type'] });
      return new Response(JSON.stringify(bodies[parsed.pathname]), { status: 200 });
    }) as typeof fetch;
    const api = createGameApi({ baseUrl: 'http://game', token, fetch: fetchImpl });

    expect((await api.badges({ name: 'Big Daddy' })).displayName).toBe('Big');
    expect(await api.claimNews()).toEqual([]);
    expect((await api.setAlert('123456789012345678', 'turns', true)).current).toEqual({ turns: 5, cap: 144, nationalRank: 7 });
    expect(await api.claimAlerts()).toEqual({ turns: [], ranks: [], attacks: [], roundAlerts: [], battles: [], turf: [], territory: [], rounds: [] });
    expect(calls).toEqual([
      { path: '/api/internal/discord/badges?name=Big+Daddy', method: 'GET', body: undefined, contentType: undefined },
      // No body, so no JSON content type for Fastify to reject as empty.
      { path: '/api/internal/discord/news/claim', method: 'POST', body: undefined, contentType: undefined },
      { path: '/api/internal/discord/alerts', method: 'PUT', body: '{"discordId":"123456789012345678","type":"turns","enabled":true}', contentType: 'application/json' },
      { path: '/api/internal/discord/alerts/claim', method: 'POST', body: undefined, contentType: undefined },
    ]);
  });
});
