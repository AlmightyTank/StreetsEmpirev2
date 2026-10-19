import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { StaffRole } from '@prisma/client';

type Who = { id: string; username: string; cookie: string };

describe.runIf(process.env.ADMIN_INTEGRATION === '1')('Staff roles with PostgreSQL', () => {
  let app: FastifyInstance;
  let cookieName: string;
  let founder: Who;
  let admin: Who;
  let mod: Who;
  let jrMod: Who;
  let helper: Who;
  let player: Who;
  let realFounderId: string | null = null;
  const accountIds: string[] = [];

  async function register(label: string): Promise<Who> {
    const username = `${label}_${randomUUID().slice(0, 8)}`;
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { ageConfirmed: true, username, email: `${username}@example.invalid`, password: randomUUID() } });
    expect(response.statusCode, response.body).toBe(201);
    const accountId = response.json().account.id as string;
    accountIds.push(accountId);
    const session = response.cookies.find((cookie) => cookie.name === cookieName);
    if (!session) throw new Error('Registering did not set a session cookie.');
    return { id: accountId, username, cookie: `${session.name}=${session.value}` };
  }

  const call = (method: 'GET' | 'POST', url: string, who: Who, payload?: object) =>
    app.inject({ method, url: `/api/admin${url}`, headers: { cookie: who.cookie }, ...(payload ? { payload } : {}) });
  const setRole = (who: Who, target: Who, role: StaffRole | null, reason = 'Staff role test') =>
    call('POST', `/accounts/${target.id}/staff-role`, who, { role, reason });

  beforeAll(async () => {
    cookieName = (await import('../../config/env.js')).env.SESSION_COOKIE_NAME;
    app = await (await import('../../app.js')).buildApp();
    // There is one Founder. Step a real one aside for the test and put them back after.
    realFounderId = (await app.prisma.account.findFirst({ where: { staffRole: 'FOUNDER' }, select: { id: true } }))?.id ?? null;
    if (realFounderId) await app.prisma.account.update({ where: { id: realFounderId }, data: { staffRole: 'ADMIN' } });
    founder = await register('fnd');
    admin = await register('adm');
    mod = await register('mod');
    jrMod = await register('jrm');
    helper = await register('hlp');
    player = await register('ply');
    await app.prisma.account.update({ where: { id: founder.id }, data: { staffRole: 'FOUNDER' } });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.adminAuditLog.deleteMany({ where: { OR: [{ targetId: { in: accountIds } }, { actorAccountId: { in: accountIds } }] } });
    await app.prisma.staffRoleChange.deleteMany({ where: { OR: [{ accountId: { in: accountIds } }, { actorAccountId: { in: accountIds } }] } });
    await app.prisma.accountModerationNote.deleteMany({ where: { accountId: { in: accountIds } } });
    if (accountIds.length) await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    if (realFounderId) await app.prisma.account.update({ where: { id: realFounderId }, data: { staffRole: 'FOUNDER' } });
    await app.close();
  });

  it('keeps isAdmin in step with the role, both ways', async () => {
    const row = await app.prisma.account.findUniqueOrThrow({ where: { id: founder.id } });
    expect(row).toMatchObject({ staffRole: 'FOUNDER', isAdmin: true });
    await expect(app.prisma.account.update({ where: { id: founder.id }, data: { isAdmin: false } })).rejects.toThrow(/Founder keeps admin access/);
    await expect(app.prisma.account.update({ where: { id: player.id }, data: { staffRole: 'FOUNDER' } })).rejects.toThrow();
  });

  it('lets only the Founder make Admins, and Admins make the roles below them', async () => {
    expect((await setRole(founder, admin, 'ADMIN')).statusCode).toBe(200);
    expect((await setRole(admin, mod, 'MOD')).statusCode).toBe(200);
    expect((await setRole(admin, jrMod, 'JR_MOD')).statusCode).toBe(200);
    const made = await setRole(admin, helper, 'HELPER');
    expect(made.statusCode, made.body).toBe(200);
    expect(made.json().account).toMatchObject({ staffRole: 'HELPER', isAdmin: false });

    const adminMakesAdmin = await setRole(admin, player, 'ADMIN');
    expect(adminMakesAdmin.statusCode).toBe(403);
    expect(adminMakesAdmin.json().error.code).toBe('STAFF_RANK');
    expect((await setRole(founder, player, 'FOUNDER')).statusCode).toBe(403);
    expect((await setRole(admin, founder, null)).json().error.code).toBe('STAFF_RANK');
    expect((await setRole(mod, player, 'HELPER')).statusCode).toBe(403);
    expect((await setRole(admin, admin, null)).json().error.code).toBe('ADMIN_SELF_ACTION');

    const history = await app.prisma.staffRoleChange.findMany({ where: { accountId: { in: [admin.id, mod.id, jrMod.id, helper.id] } } });
    expect(history.map((change) => [change.toRole, change.source])).toEqual(expect.arrayContaining([['ADMIN', 'GAME'], ['MOD', 'GAME'], ['JR_MOD', 'GAME'], ['HELPER', 'GAME']]));
    const audit = await app.prisma.adminAuditLog.findFirst({ where: { targetId: mod.id, action: 'account.staff-role' } });
    expect(audit?.after).toMatchObject({ staffRole: 'MOD', fromRole: null, toRole: 'MOD' });
  });

  it('tells the client its role and what it may do', async () => {
    const me = await app.inject({ url: '/api/auth/me', headers: { cookie: jrMod.cookie } });
    expect(me.json().account).toMatchObject({ staffRole: 'JR_MOD', isAdmin: false });
    expect(me.json().account.staffCapabilities).toEqual(expect.arrayContaining(['accounts.mute', 'reports.handle']));
    expect(me.json().account.staffCapabilities).not.toContain('accounts.ban');
  });

  it('opens each admin route only to the roles that may use it', async () => {
    expect((await call('GET', '/rounds', mod)).statusCode).toBe(403);
    expect((await call('GET', '/rounds', admin)).statusCode).toBe(200);
    expect((await call('GET', '/reports?status=open', jrMod)).statusCode).toBe(200);
    expect((await call('GET', '/reports?status=open', helper)).statusCode).toBe(403);
    expect((await call('GET', '/bug-reports?status=open', helper)).statusCode).toBe(200);
    expect((await call('GET', '/accounts', player)).statusCode).toBe(403);

    const staff = await call('GET', '/staff', helper);
    expect(staff.statusCode).toBe(200);
    const mine = staff.json().members.filter((member: { accountId: string }) => accountIds.includes(member.accountId));
    expect(mine.map((member: { staffRole: string }) => member.staffRole)).toEqual(['FOUNDER', 'ADMIN', 'MOD', 'JR_MOD', 'HELPER']);
    expect(staff.json().assignable).toEqual([]);
    expect((await call('GET', '/staff', admin)).json().assignable).toEqual(['MOD', 'JR_MOD', 'HELPER']);
  });

  it('hides private account data below Admin, and notes below JR Mod', async () => {
    await call('POST', `/accounts/${player.id}/notes`, mod, { body: 'Watch this one in chat.' });
    const asHelper = (await call('GET', `/accounts/${player.id}`, helper)).json();
    expect(asHelper).toMatchObject({ privateDataHidden: true, sessions: [], notes: [] });
    expect(asHelper.account.email).toBeNull();
    expect(asHelper.audit.every((entry: { before: unknown; after: unknown }) => entry.before === null && entry.after === null)).toBe(true);

    const asJrMod = (await call('GET', `/accounts/${player.id}`, jrMod)).json();
    expect(asJrMod.notes).toHaveLength(1);
    expect(asJrMod.account.email).toBeNull();

    const asAdmin = (await call('GET', `/accounts/${player.id}`, admin)).json();
    expect(asAdmin.privateDataHidden).toBe(false);
    expect(asAdmin.account.email).toBe(`${player.username}@example.invalid`);
    expect(asAdmin.sessions.length).toBeGreaterThan(0);

    const byEmail = await call('GET', `/accounts?query=${encodeURIComponent(`${player.username}@example.invalid`)}`, mod);
    expect(byEmail.json().accounts).toEqual([]);
  });

  it('caps JR Mod mutes at a day and keeps bans to Mods', async () => {
    const long = await call('POST', `/accounts/${player.id}/comms-mute`, jrMod, { length: '3d', reason: 'Spamming the wire' });
    expect(long.statusCode).toBe(403);
    expect(long.json().error.code).toBe('STAFF_MUTE_TOO_LONG');
    expect((await call('POST', `/accounts/${player.id}/comms-mute`, jrMod, { length: '1d', reason: 'Spamming the wire' })).statusCode).toBe(200);
    expect((await call('POST', `/accounts/${player.id}/ban`, jrMod, { reason: 'Cheating with alts' })).statusCode).toBe(403);
    expect((await call('POST', `/accounts/${player.id}/comms-mute/lift`, jrMod, { reason: 'Appeal accepted' })).statusCode).toBe(200);
  });

  it('never lets staff act on staff at or above their rank', async () => {
    const modMutesAdmin = await call('POST', `/accounts/${admin.id}/comms-mute`, mod, { length: '1h', reason: 'Testing the rank rule' });
    expect(modMutesAdmin.statusCode).toBe(403);
    expect(modMutesAdmin.json().error.code).toBe('STAFF_RANK');
    expect((await call('POST', `/accounts/${mod.id}/notes`, jrMod, { body: 'Notes on a Mod.' })).json().error.code).toBe('STAFF_RANK');
    // Below them, a punishment still needs the role taken away first.
    expect((await call('POST', `/accounts/${jrMod.id}/ban`, mod, { reason: 'Testing the staff rule' })).json().error.code).toBe('ADMIN_BAN');
    expect((await call('POST', `/accounts/${player.id}/ban`, mod, { reason: 'Cheating with alts' })).statusCode).toBe(200);
  });

  it('takes a role away at once, and the old admin route still works for the Founder', async () => {
    expect((await setRole(admin, helper, null)).statusCode).toBe(200);
    expect((await call('GET', '/bug-reports?status=open', helper)).statusCode).toBe(403);

    const legacy = await call('POST', `/accounts/${mod.id}/admin`, founder, { isAdmin: false, reason: 'Old panel button' });
    expect(legacy.statusCode, legacy.body).toBe(200);
    expect(legacy.json().account).toMatchObject({ staffRole: null, isAdmin: false });
  });
});
