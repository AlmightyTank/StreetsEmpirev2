import { afterEach, describe, expect, it, vi } from 'vitest';
import { timeoutProblem } from '../moderation.js';
import { MemberActionError, startPushServer, type DiscordMemberStatus } from '../push-server.js';

describe('timeoutProblem', () => {
  const fine = { botCanModerate: true, isOwner: false, isAdministrator: false, aboveBot: false };

  it('says why the bot cannot time someone out, most fixable first', () => {
    expect(timeoutProblem(fine)).toBeNull();
    expect(timeoutProblem({ ...fine, botCanModerate: false, aboveBot: true })).toMatch(/Moderate Members/);
    expect(timeoutProblem({ ...fine, isOwner: true })).toMatch(/own the Discord server/);
    expect(timeoutProblem({ ...fine, isAdministrator: true })).toMatch(/Administrator/);
    expect(timeoutProblem({ ...fine, aboveBot: true })).toMatch(/Move the bot's role above it/);
  });
});

describe('bot listener: member status and timeouts', () => {
  const token = 't'.repeat(64);
  const member: DiscordMemberStatus = { inServer: true, displayName: 'Big', timedOutUntil: null, canModerate: true, problem: null };
  let stop: (() => Promise<void>) | null = null;

  afterEach(async () => {
    await stop?.();
    stop = null;
    vi.restoreAllMocks();
  });

  async function start(overrides: Partial<Parameters<typeof startPushServer>[0]> = {}): Promise<string> {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const http = await import('node:http');
    // Find a free port, then start the listener there.
    const probe = http.createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const port = (probe.address() as { port: number }).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    stop = await startPushServer({ host: '127.0.0.1', port, token, onWake: async () => undefined, ...overrides });
    return `http://127.0.0.1:${port}`;
  }

  const post = (base: string, path: string, body: unknown, auth = token) => fetch(`${base}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  it('answers member and timeout requests behind the bot token', async () => {
    const onTimeout = vi.fn(async () => ({ ...member, timedOutUntil: '2026-10-11T15:00:00.000Z' }));
    const base = await start({ onMember: async () => member, onTimeout });
    expect(await (await post(base, '/internal/member', { discordId: '123456789012345678' })).json()).toEqual({ member });
    const timed = await post(base, '/internal/timeout', { discordId: '123456789012345678', minutes: 1440, reason: 'Spam' });
    expect(timed.status).toBe(200);
    expect(onTimeout).toHaveBeenCalledWith({ discordId: '123456789012345678', minutes: 1440, reason: 'Spam' });
    expect((await post(base, '/internal/member', { discordId: '123456789012345678' }, 'x'.repeat(64))).status).toBe(401);
  });

  it('refuses bad input, passes refusals back as 409, and keeps the routes off when not given', async () => {
    const base = await start({
      onMember: async () => member,
      onTimeout: async () => { throw new MemberActionError('They are not timed out.'); },
    });
    expect((await post(base, '/internal/timeout', { discordId: 'nope', minutes: 5, reason: 'x' })).status).toBe(400);
    expect((await post(base, '/internal/timeout', { discordId: '123456789012345678', minutes: 60 * 24 * 29, reason: 'x' })).status).toBe(400);
    const refused = await post(base, '/internal/timeout', { discordId: '123456789012345678', minutes: null, reason: 'Lift' });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: { message: 'They are not timed out.' } });

    await stop?.();
    const plain = await start();
    expect((await post(plain, '/internal/member', { discordId: '123456789012345678' })).status).toBe(404);
    expect((await post(plain, '/internal/wake', {})).status).toBe(202);
  });
});
