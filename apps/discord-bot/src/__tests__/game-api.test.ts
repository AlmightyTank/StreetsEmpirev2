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
});
