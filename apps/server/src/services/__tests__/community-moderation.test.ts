import type { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../config/env.js';
import { AdminAuditService } from '../admin-audit.service.js';
import { AdminCommunityService } from '../admin-community.service.js';
import { DiscordModerationService } from '../discord-moderation.service.js';
import { ForumModerationService } from '../forum-moderation.service.js';

const now = new Date('2026-10-10T15:00:00.000Z');
const actor = { id: 'admin1', username: 'admin' };
const saved = { forum: { ...env.forum.moderation }, push: { ...env.discordBot.push }, token: env.discordBot.apiToken, guild: env.discordBot.guildId };

beforeEach(() => {
  Object.assign(env.forum.moderation, { enabled: true, apiKey: 'forum-key', userId: 1 });
  Object.assign(env.discordBot.push, { enabled: true, url: 'http://127.0.0.1:3002/internal/wake' });
  env.discordBot.apiToken = 'b'.repeat(64);
  env.discordBot.guildId = '111111111111111111';
});

afterEach(() => {
  Object.assign(env.forum.moderation, saved.forum);
  Object.assign(env.discordBot.push, saved.push);
  env.discordBot.apiToken = saved.token;
  env.discordBot.guildId = saved.guild;
  vi.restoreAllMocks();
});

function account(overrides: Record<string, unknown> = {}) {
  return {
    username: 'big', discordId: '123456789012345678',
    forumLink: { forumOrigin: env.forum.origin, forumUserId: '42', forumUsername: 'BigOnForum' },
    ...overrides,
  };
}

function fakePrisma(row: ReturnType<typeof account> | null = account()) {
  return {
    account: { findUnique: async () => row },
    supportTicket: {
      findMany: async () => [{ id: 't1', subject: 'Cannot sign in', createdAt: now, closedAt: null, closedByName: null, threadId: '222222222222222222' }],
    },
  } as unknown as PrismaClient;
}

/** A forum that answers like Flarum: GET shows the user, PATCH stores what it is sent (or ignores it). */
function forum(options: { honours?: boolean; patchStatus?: number } = {}) {
  let suspendedUntil: string | null = null;
  const calls: Array<{ method: string; body?: unknown }> = [];
  const fetcher = vi.fn(async (_url: string | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'PATCH') {
      if (options.patchStatus) return new Response('{}', { status: options.patchStatus });
      if (options.honours !== false) suspendedUntil = (JSON.parse(String(init!.body)) as { data: { attributes: { suspendedUntil: string | null } } }).data.attributes.suspendedUntil;
      return Response.json({});
    }
    return Response.json({ data: { attributes: { suspendedUntil } } });
  });
  return { fetcher: fetcher as unknown as typeof fetch, calls };
}

describe('ForumModerationService', () => {
  it('suspends a linked player, confirms it on the forum, and audits it', async () => {
    const audit = vi.spyOn(AdminAuditService, 'record').mockResolvedValue(undefined as never);
    const { fetcher, calls } = forum();
    // Read back against the real clock, so suspend for a week from now.
    await ForumModerationService.suspend(fakePrisma(), actor, 'acct1', '7d', 'Spamming threads', new Date(), fetcher);
    expect(calls.map((call) => call.method)).toEqual(['PATCH', 'GET']);
    expect(calls[0]!.body).toMatchObject({ data: { type: 'users', id: '42', attributes: { suspendReason: 'Spamming threads', suspendMessage: 'Spamming threads' } } });
    expect(audit).toHaveBeenCalledWith(expect.anything(), actor, expect.objectContaining({ action: 'forum.suspend', targetId: 'acct1', reason: 'Spamming threads' }));
  });

  it('says so when the forum ignores the suspension or refuses the key', async () => {
    vi.spyOn(AdminAuditService, 'record').mockResolvedValue(undefined as never);
    await expect(ForumModerationService.suspend(fakePrisma(), actor, 'acct1', '7d', 'Spam', new Date(), forum({ honours: false }).fetcher))
      .rejects.toMatchObject({ code: 'FORUM_SUSPEND_IGNORED' });
    await expect(ForumModerationService.suspend(fakePrisma(), actor, 'acct1', '7d', 'Spam', new Date(), forum({ patchStatus: 403 }).fetcher))
      .rejects.toMatchObject({ code: 'FORUM_FORBIDDEN' });
  });

  it('refuses players without a forum link, and stays off without a key', async () => {
    await expect(ForumModerationService.suspend(fakePrisma(account({ forumLink: null })), actor, 'acct1', '7d', 'Spam', now, forum().fetcher))
      .rejects.toMatchObject({ code: 'FORUM_NOT_LINKED' });
    env.forum.moderation.enabled = false;
    await expect(ForumModerationService.suspend(fakePrisma(), actor, 'acct1', '7d', 'Spam', now, forum().fetcher)).rejects.toMatchObject({ code: 'FORUM_MODERATION_DISABLED' });
    expect(await ForumModerationService.status('42', forum().fetcher)).toEqual({ ok: false, problem: expect.stringMatching(/^Forum moderation is off/) });
  });
});

/** A bot listener that answers member and timeout requests. */
function bot(response: { status: number; body: unknown }) {
  const fetcher = vi.fn(async () => Response.json(response.body, { status: response.status }));
  return fetcher as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('DiscordModerationService', () => {
  const member = { inServer: true, displayName: 'Big', timedOutUntil: '2026-10-11T15:00:00.000Z', canModerate: true, problem: null };

  it('times a linked player out through the bot, naming the admin, and audits it', async () => {
    const audit = vi.spyOn(AdminAuditService, 'record').mockResolvedValue(undefined as never);
    const fetcher = bot({ status: 200, body: { member } });
    await DiscordModerationService.timeout(fakePrisma(), actor, 'acct1', '1d', 'Spam in #general', fetcher);
    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe('http://127.0.0.1:3002/internal/timeout');
    expect(JSON.parse(String(init.body))).toEqual({ discordId: '123456789012345678', minutes: 1440, reason: 'Spam in #general (by admin in StreetsEmpire)' });
    expect(audit).toHaveBeenCalledWith(expect.anything(), actor, expect.objectContaining({ action: 'discord.timeout', after: expect.objectContaining({ timedOutUntil: member.timedOutUntil }) }));
  });

  it('passes the bot\'s refusal back and audits nothing', async () => {
    const audit = vi.spyOn(AdminAuditService, 'record');
    const refused = bot({ status: 409, body: { error: { message: "Their highest role is at or above the bot's." } } });
    await expect(DiscordModerationService.timeout(fakePrisma(), actor, 'acct1', '1d', 'Spam', refused)).rejects.toMatchObject({ message: "Their highest role is at or above the bot's." });
    expect(await DiscordModerationService.member('123456789012345678', bot({ status: 404, body: {} }))).toEqual({ ok: false, problem: expect.stringMatching(/older version/) });
    expect(audit).not.toHaveBeenCalled();
  });
});

describe('AdminCommunityService.load', () => {
  it('puts the forum, Discord and tickets side by side, with problems instead of errors', async () => {
    const fetcher = vi.fn(async (url: string | URL) => (String(url).includes('/internal/member')
      ? Response.json({ member: { inServer: true, displayName: 'Big', timedOutUntil: null, canModerate: false, problem: 'The bot needs the Moderate Members permission in this server.' } })
      : Promise.reject(new Error('forum down')))) as unknown as typeof fetch;
    const community = await AdminCommunityService.load(fakePrisma(), 'acct1', { fetch: fetcher });
    expect(community.forum).toMatchObject({ linked: true, username: 'BigOnForum', moderationEnabled: true, problem: 'Could not reach the forum.', suspendedUntil: null });
    expect(community.discord).toMatchObject({ linked: true, inServer: true, displayName: 'Big', canModerate: false, problem: 'The bot needs the Moderate Members permission in this server.' });
    expect(community.tickets).toEqual([{
      id: 't1', subject: 'Cannot sign in', createdAt: now.toISOString(), closedAt: null, closedByName: null,
      threadUrl: 'https://discord.com/channels/111111111111111111/222222222222222222',
    }]);
  });

  it('says when nothing is linked', async () => {
    const community = await AdminCommunityService.load(fakePrisma(account({ discordId: null, forumLink: null })), 'acct1', { fetch: vi.fn() as unknown as typeof fetch });
    expect(community.forum).toEqual({ linked: false });
    expect(community.discord).toEqual({ linked: false });
  });
});
