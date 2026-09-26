import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV08H } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { NotificationService } from '../notification.service.js';
import { PimpConsoleService } from '../pimp-console.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * 0.9.0-H. Moderation, abuse prevention and the messaging QA list against PostgreSQL:
 * concurrency and retries, blocks, player mutes, conversation delete, new-account
 * limits, recipient throttling, links, automated flags, communication mutes on
 * messages and the wire, the purpose-driven reports queue, notes, large inboxes
 * and account deletion.
 */
describe.runIf(process.env.MODERATION_INTEGRATION === '1')('0.9.0-H moderation and release QA with PostgreSQL', () => {
  const rules = classicOgV08H;
  let app: FastifyInstance;
  let roundId = '';
  const accounts: string[] = [];
  type Player = { id: string; accountId: string; cookie: string; name: string; pimp: number };
  const p: Record<string, Player> = {};
  let clock = Date.now();
  /** Each send is 6 seconds after the last, past the B1 five-second floor. */
  const tick = () => new Date((clock += 6_000));

  async function register(key: string, pimp: number, age: 'new' | 'old' = 'old') {
    const username = `md${key}_${randomUUID().slice(0, 6)}`;
    const response = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { username, email: `${username}@example.invalid`, password: randomUUID() },
    });
    expect(response.statusCode, response.body).toBeLessThan(300);
    const accountId = response.json().account.id as string;
    accounts.push(accountId);
    if (age === 'old') await app.prisma.account.update({ where: { id: accountId }, data: { createdAt: new Date(Date.now() - 30 * 86_400_000) } });
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer, ...startingStock(rules), roundId, accountId, displayName: username, publicPimpId: pimp,
        cityId: (await app.prisma.city.findUniqueOrThrow({ where: { slug: 'new-york-city' } })).id,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    p[key] = { id: player.id, accountId, name: username, pimp, cookie: response.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ') };
    return p[key]!;
  }

  const send = (from: Player, to: Player, body = `hello ${randomUUID()}`, actionId = randomUUID(), at = tick()) =>
    PimpConsoleService.send(app.prisma, from.accountId, { recipientPublicPimpId: to.pimp, subject: 'Street talk', body, actionId }, at);

  const errorCode = async (promise: Promise<unknown>) => {
    try {
      await promise;
      return null;
    } catch (error) {
      return (error as { code?: string }).code ?? 'THROWN';
    }
  };

  const admin = (method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url: `/api/admin${url}`, headers: { cookie: p.admin!.cookie }, ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({
      data: {
        name: 'MD Live Season', slug: `md-${randomUUID()}`, rulesetId: rules.meta.id, rulesetVersion: rules.meta.version,
        status: 'ACTIVE', startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 20 * 86_400_000),
      },
    });
    roundId = round.id;
    await register('admin', 9601);
    await app.prisma.account.update({ where: { id: p.admin!.accountId }, data: { isAdmin: true } });
    await register('alice', 9602);
    await register('bob', 9603);
    await register('carol', 9604);
    await register('dave', 9605);
    await register('newbie', 9606, 'new');
    for (let index = 0; index < 12; index += 1) await register(`x${index}`, 9610 + index);

    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } }).catch(() => undefined);
    for (const id of accounts) await app.prisma.account.delete({ where: { id } }).catch(() => undefined);
    await app?.close();
  });

  it('writes one message for concurrent retries, and serialises concurrent sends', async () => {
    const actionId = randomUUID();
    const at = tick();
    const results = await Promise.all(Array.from({ length: 6 }, () => send(p.alice!, p.bob!, 'retry storm', actionId, at).catch((error: unknown) => error)));
    expect(await app.prisma.directMessage.count({ where: { senderId: p.alice!.id, actionId } })).toBe(1);
    expect(results.filter((result) => !(result instanceof Error) && (result as { replayed: boolean }).replayed)).toHaveLength(5);

    // Different sends at the same instant: the account lock lets exactly one through the floor.
    const burst = tick();
    const codes = await Promise.all(Array.from({ length: 4 }, (_, index) => errorCode(send(p.alice!, p.bob!, `burst ${index}`, randomUUID(), burst))));
    expect(codes.filter((code) => code === null)).toHaveLength(1);
    expect(codes.filter((code) => code === 'MESSAGE_TOO_FAST')).toHaveLength(3);
  });

  it('keeps blocks both ways and never reveals them', async () => {
    await PimpConsoleService.block(app.prisma, p.carol!.accountId, p.dave!.pimp);
    expect(await errorCode(send(p.dave!, p.carol!))).toBe('PLAYER_NOT_FOUND');
    expect(await errorCode(send(p.carol!, p.dave!))).toBe('PLAYER_NOT_FOUND');
    await PimpConsoleService.unblock(app.prisma, p.carol!.accountId, p.dave!.pimp);
    expect(await errorCode(send(p.dave!, p.carol!))).toBeNull();
  });

  it('delivers a muted sender\'s mail quietly into Archived, with no unread count or alert', async () => {
    await PimpConsoleService.mute(app.prisma, p.carol!.accountId, p.bob!.pimp);
    const before = await PimpConsoleService.summary(app.prisma, p.carol!.accountId);
    const sent = await send(p.bob!, p.carol!, 'you will not hear this');
    expect(sent.replayed).toBe(false);
    const row = await app.prisma.directMessage.findUniqueOrThrow({ where: { id: sent.message.id } });
    expect(row.recipientArchivedAt).not.toBeNull();
    const after = await PimpConsoleService.summary(app.prisma, p.carol!.accountId);
    expect(after.unread).toBe(before.unread);
    await app.prisma.notificationSettings.upsert({ where: { accountId: p.carol!.accountId }, create: { accountId: p.carol!.accountId, messagesEnabled: true, pushEnabled: true }, update: {} });
    await app.prisma.pushSubscription.create({ data: { accountId: p.carol!.accountId, endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`, p256dh: 'p', auth: 'a' } });
    await NotificationService.collect(app.prisma, new Date(), { discord: false, push: true });
    expect(await app.prisma.notificationOutbox.count({ where: { dedupeKey: { startsWith: `message:${sent.message.id}:` } } })).toBe(0);
    const lists = await PimpConsoleService.blocks(app.prisma, p.carol!.accountId);
    expect(lists.muted.map((row) => row.publicPimpId)).toEqual([p.bob!.pimp]);
    await PimpConsoleService.unmute(app.prisma, p.carol!.accountId, p.bob!.pimp);
  });

  it('deletes a conversation on one side only', async () => {
    await send(p.dave!, p.alice!, 'keep me for alice');
    const hidden = await PimpConsoleService.hideConversation(app.prisma, p.dave!.accountId, p.alice!.pimp);
    expect(hidden.hidden).toBeGreaterThan(0);
    const daveSent = await PimpConsoleService.page(app.prisma, p.dave!.accountId, 'sent');
    expect(daveSent.messages.some((message) => message.counterpart.publicPimpId === p.alice!.pimp)).toBe(false);
    const aliceInbox = await PimpConsoleService.page(app.prisma, p.alice!.accountId, 'inbox');
    expect(aliceInbox.messages.some((message) => message.body === 'keep me for alice')).toBe(true);
  });

  it('limits new accounts, throttles cold outreach and filters links', async () => {
    const n = p.newbie!;
    expect(await errorCode(send(n, p.alice!, 'check out https://spam.example.xyz/deal'))).toBe('MESSAGE_LINKS_NEW_ACCOUNT');
    expect(await errorCode(send(n, p.x0!))).toBeNull();
    expect(await errorCode(send(n, p.x1!))).toBeNull();
    expect(await errorCode(send(n, p.x2!))).toBeNull();
    expect(await errorCode(send(n, p.x3!))).toBe('MESSAGE_RECIPIENT_LIMIT');
    // Someone who wrote first is a conversation, never throttled.
    await send(p.x4!, n, 'welcome');
    expect(await errorCode(send(n, p.x4!, 'thanks'))).toBeNull();
    // New accounts also get a tighter burst window.
    expect(await errorCode(send(n, p.x0!))).toBeNull();
    expect(await errorCode(send(n, p.x0!))).toBe('MESSAGE_NEW_ACCOUNT_LIMIT');

    // An established account (one that has written to nobody yet) may cold-message ten players in an hour, not eleven.
    const codes: Array<string | null> = [];
    for (let index = 0; index < 11; index += 1) codes.push(await errorCode(send(p.x11!, p[`x${index}`]!)));
    expect(codes.slice(0, 10).every((code) => code === null)).toBe(true);
    expect(codes[10]).toBe('MESSAGE_RECIPIENT_LIMIT');
  });

  it('flags links and copy-paste blasts from established accounts into the queue', async () => {
    const linked = await send(p.alice!, p.carol!, 'best prices at cheapgold.ru now');
    const blast = 'Join my crew, best rates in town';
    await send(p.bob!, p.x5!, blast);
    await send(p.bob!, p.x6!, blast);
    const third = await send(p.bob!, p.x7!, blast);
    const flags = await app.prisma.playerMessageReport.findMany({ where: { source: 'AUTO', messageId: { in: [linked.message.id, third.message.id] } } });
    expect(flags).toHaveLength(2);
    expect(flags.map((flag) => flag.reason)).toEqual(expect.arrayContaining([
      'Contains a link: cheapgold.ru',
      'Same message sent to 3 players within an hour',
    ]));
    // The game's own address is not a link worth flagging.
    const own = await send(p.alice!, p.bob!, `see ${new URL('/game/turf', 'http://localhost:5173').toString()}`);
    expect(await app.prisma.playerMessageReport.count({ where: { messageId: own.message.id } })).toBe(0);
  });

  it('mutes communication by admin action: messages, wire and a visible notice, all audited', async () => {
    const muted = await admin('POST', `/accounts/${p.dave!.accountId}/comms-mute`, { length: '1d', reason: 'Spamming the new players' });
    expect(muted.statusCode, muted.body).toBe(200);
    expect(muted.json().comms).toMatchObject({ permanent: false, reason: 'Spamming the new players' });

    expect(await errorCode(send(p.dave!, p.carol!))).toBe('COMMS_MUTED');
    const console = await PimpConsoleService.page(app.prisma, p.dave!.accountId, 'inbox');
    expect(console.restriction).toMatchObject({ permanent: false });

    const alliance = await app.prisma.alliance.create({
      data: { roundId, name: 'MD Crew', nameNormalized: `md ${randomUUID()}`, tag: 'MD', tagNormalized: `md${randomUUID().slice(0, 4)}`, leaderId: p.dave!.id },
    });
    await app.prisma.roundPlayer.update({ where: { id: p.dave!.id }, data: { allianceId: alliance.id, allianceJoinedAt: new Date() } });
    const wire = await app.inject({ method: 'POST', url: '/api/game/alliance/wire', headers: { cookie: p.dave!.cookie }, payload: { body: 'buy my stuff', kind: 'MESSAGE', pinned: false } });
    expect(wire.statusCode, wire.body).toBe(403);
    expect(wire.json().error.code).toBe('COMMS_MUTED');

    const permanent = await admin('POST', `/accounts/${p.dave!.accountId}/comms-mute`, { length: 'permanent', reason: 'Repeat offender' });
    expect(permanent.json().comms).toMatchObject({ permanent: true, until: null });
    const lifted = await admin('POST', `/accounts/${p.dave!.accountId}/comms-mute/lift`, { reason: 'Appeal accepted' });
    expect(lifted.json().comms).toBeNull();
    expect(await errorCode(send(p.dave!, p.carol!))).toBeNull();

    const audit = await app.prisma.adminAuditLog.findMany({ where: { targetId: p.dave!.accountId, action: { startsWith: 'account.comms' } } });
    expect(audit.map((entry) => entry.action).sort()).toEqual(['account.comms-mute', 'account.comms-mute', 'account.comms-unmute']);
  });

  it('runs a purpose-driven reports queue: no text until opened, opens audited, resolution kept', async () => {
    // Build a thread of nine messages, then report the seventh.
    const ids: string[] = [];
    for (let index = 0; index < 9; index += 1) {
      const [from, to] = index % 2 ? [p.carol!, p.x8!] : [p.x8!, p.carol!];
      ids.push((await send(from, to, `thread line ${index}`)).message.id);
    }
    await PimpConsoleService.report(app.prisma, p.carol!.accountId, ids[6]!, { reason: 'Threats' });

    const nonAdmin = await app.inject({ method: 'GET', url: '/api/admin/reports', headers: { cookie: p.carol!.cookie } });
    expect(nonAdmin.statusCode).toBe(403);

    const queue = await admin('GET', '/reports?status=open');
    expect(queue.statusCode, queue.body).toBe(200);
    const entry = queue.json().reports.find((row: { messageId: string }) => row.messageId === ids[6]);
    expect(entry).toMatchObject({ source: 'PLAYER', reason: 'Threats', reporterUsername: p.carol!.name });
    expect(queue.body).not.toContain('thread line');

    const opened = await admin('POST', `/reports/${entry.id}/open`);
    expect(opened.statusCode, opened.body).toBe(200);
    const detail = opened.json();
    expect(detail.thread.map((message: { body: string }) => message.body)).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8].map((index) => `thread line ${index}`),
    );
    expect(detail.omitted).toEqual({ before: 1, after: 0 });
    expect(await app.prisma.adminAuditLog.count({ where: { action: 'report.view', targetId: entry.id } })).toBe(1);

    // Evidence survives the recipient deleting the conversation.
    await PimpConsoleService.hideConversation(app.prisma, p.carol!.accountId, p.x8!.pimp);
    expect((await admin('POST', `/reports/${entry.id}/open`)).json().thread).toHaveLength(8);

    const resolved = await admin('POST', `/reports/${entry.id}/resolve`, { resolution: 'ACTIONED', note: 'Muted the sender for a day' });
    expect(resolved.statusCode, resolved.body).toBe(200);
    expect((await admin('POST', `/reports/${entry.id}/resolve`, { resolution: 'DISMISSED', note: 'Second try' })).statusCode).toBe(409);
    const history = (await admin('GET', '/reports?status=resolved')).json();
    expect(history.reports.find((row: { id: string }) => row.id === entry.id)).toMatchObject({
      resolution: 'ACTIONED', resolutionNote: 'Muted the sender for a day', resolvedByUsername: p.admin!.name,
    });
  });

  it('keeps private moderation notes on accounts', async () => {
    const noted = await admin('POST', `/accounts/${p.bob!.accountId}/notes`, { body: 'Warned in Discord about blasts.' });
    expect(noted.statusCode, noted.body).toBe(200);
    expect(noted.json().notes[0]).toMatchObject({ body: 'Warned in Discord about blasts.', authorUsername: p.admin!.name });
    expect(noted.json().reportsAgainst.total).toBeGreaterThanOrEqual(1);
    expect(await app.prisma.adminAuditLog.count({ where: { action: 'account.add-note', targetId: p.bob!.accountId } })).toBe(1);
  });

  it('pages a large inbox and survives the sender being deleted', async () => {
    const start = Date.now() - 3_600_000;
    await app.prisma.directMessage.createMany({
      data: Array.from({ length: 125 }, (_, index) => ({
        roundId, senderId: p.x9!.id, recipientId: p.x10!.id, actionId: randomUUID(),
        subject: `bulk ${index}`, body: 'bulk', createdAt: new Date(start + index * 1_000),
      })),
    });
    const began = performance.now();
    const first = await PimpConsoleService.page(app.prisma, p.x10!.accountId, 'inbox', 1);
    const last = await PimpConsoleService.page(app.prisma, p.x10!.accountId, 'inbox', 99);
    expect(performance.now() - began).toBeLessThan(2_000);
    expect(first).toMatchObject({ total: 125, totalPages: 5, pageSize: 30 });
    expect(first.messages[0]!.subject).toBe('bulk 124');
    expect(last).toMatchObject({ page: 5 });
    expect(last.messages).toHaveLength(5);
    expect(first.counts.unread).toBe(125);

    const deleted = await admin('POST', `/accounts/${p.x9!.accountId}/delete`, { reason: 'Account deletion QA', confirmation: p.x9!.name });
    expect(deleted.statusCode, deleted.body).toBe(200);
    const after = await PimpConsoleService.page(app.prisma, p.x10!.accountId, 'inbox', 1);
    expect(after.total).toBe(125);
  });
});
