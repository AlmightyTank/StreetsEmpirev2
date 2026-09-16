import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

type Who = { id: string; username: string; cookie: string };

/** Exporting and purging the audit log. Nothing here touches a round. */
describe.runIf(process.env.ADMIN_INTEGRATION === '1')('Admin audit export and retention with PostgreSQL', () => {
  let app: FastifyInstance;
  let cookieName: string;
  let admin: Who;
  let player: Who;
  const accountIds: string[] = [];
  const auditIds: string[] = [];
  const targetId = `audit-target-${randomUUID()}`;

  async function register(label: string): Promise<Who> {
    const username = `${label}_${randomUUID().slice(0, 8)}`;
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, email: `${username}@example.invalid`, password: randomUUID() } });
    expect(response.statusCode, response.body).toBe(201);
    const accountId = response.json().account.id as string;
    accountIds.push(accountId);
    const session = response.cookies.find((cookie) => cookie.name === cookieName);
    if (!session) throw new Error('Registering did not set a session cookie.');
    return { id: accountId, username, cookie: `${session.name}=${session.value}` };
  }

  const headers = (who?: Who) => (who ? { cookie: who.cookie } : {});
  const get = (url: string, who: Who = admin) => app.inject({ url, headers: headers(who) });
  const post = (url: string, payload: object, who: Who = admin) => app.inject({ method: 'POST', url, headers: headers(who), payload });

  /** An entry as if it had been written `daysAgo` days ago. */
  async function entry(action: string, daysAgo: number, reason = 'Test entry') {
    const row = await app.prisma.adminAuditLog.create({
      data: {
        actorAccountId: admin.id,
        actorUsername: admin.username,
        action,
        targetType: 'audit-test',
        targetId,
        reason,
        before: { note: 'before' },
        after: { note: 'after' },
        createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60_000),
      },
    });
    auditIds.push(row.id);
    return row;
  }

  beforeAll(async () => {
    cookieName = (await import('../../config/env.js')).env.SESSION_COOKIE_NAME;
    app = await (await import('../../app.js')).buildApp();
    admin = await register('aud');
    player = await register('apl');
    await app.prisma.account.update({ where: { id: admin.id }, data: { isAdmin: true } });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.adminAuditLog.deleteMany({ where: { OR: [{ targetId }, { actorAccountId: { in: accountIds } }, { id: { in: auditIds } }] } });
    if (accountIds.length) await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    await app.close();
  });

  it('refuses the export, retention and purge routes to guests and non-admins', async () => {
    const requests = [
      { method: 'GET' as const, url: '/api/admin/audit/export' },
      { method: 'GET' as const, url: '/api/admin/audit/retention' },
      { method: 'POST' as const, url: '/api/admin/audit/purge', payload: { reason: 'Never runs here' } },
    ];
    for (const request of requests) {
      expect((await app.inject({ ...request, headers: headers() })).statusCode, `${request.url} as a guest`).toBe(401);
      expect((await app.inject({ ...request, headers: headers(player) })).statusCode, `${request.url} as a player`).toBe(403);
    }
  });

  it('exports the filtered rows as a downloadable spreadsheet', async () => {
    await entry('audit-test.export', 1, 'Quoted "reason", with a comma');
    await entry('audit-test.other', 1);

    const response = await get(`/api/admin/audit/export?targetId=${encodeURIComponent(targetId)}&action=audit-test.export`);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(String(response.headers['content-disposition'])).toMatch(/attachment; filename="streetsempire-audit-.+\.csv"/);
    expect(response.headers['x-audit-truncated']).toBe('false');

    const lines = response.body.trim().split('\r\n');
    expect(lines[0]).toBe('createdAt,actorUsername,actorAccountId,action,targetType,targetId,reason,before,after');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('audit-test.export');
    // Quotes are doubled and the whole cell is wrapped, so the comma stays inside one column.
    expect(lines[1]).toContain('"Quoted ""reason"", with a comma"');
    expect(lines[1]).toContain('"{""note"":""before""}"');
    expect(response.body.endsWith('\r\n')).toBe(true);
  });

  it('never lets a cell start a spreadsheet formula', async () => {
    await entry('audit-test.formula', 1, '=1+1');
    const response = await get(`/api/admin/audit/export?targetId=${encodeURIComponent(targetId)}&action=audit-test.formula`);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.body).toContain("'=1+1");
  });

  it('reports what is kept and what a purge would remove', async () => {
    const response = await get('/api/admin/audit/retention');
    expect(response.statusCode, response.body).toBe(200);
    const retention = response.json();
    expect(retention.days).toBeGreaterThan(0);
    expect(typeof retention.cutoff).toBe('string');
    expect(retention.total).toBeGreaterThan(0);
    expect(new Date(retention.oldestAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('purges only what is past the window, keeps purge records, and needs a reason', async () => {
    const old = await entry('audit-test.old', 400);
    const recent = await entry('audit-test.recent', 2);
    const oldPurge = await entry('audit.purge', 500, 'An older purge');

    expect((await post('/api/admin/audit/purge', {})).statusCode).toBe(400);

    const before = (await get('/api/admin/audit/retention')).json();
    expect(before.expired).toBeGreaterThan(0);

    const purged = await post('/api/admin/audit/purge', { reason: 'Keeping the table to a year' });
    expect(purged.statusCode, purged.body).toBe(200);
    expect(purged.json().removed).toBeGreaterThanOrEqual(1);
    expect(purged.json().retention.expired).toBe(0);

    expect(await app.prisma.adminAuditLog.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await app.prisma.adminAuditLog.findUnique({ where: { id: recent.id } })).not.toBeNull();
    // The record of an old purge outlives the retention window: a gap is always explained.
    expect(await app.prisma.adminAuditLog.findUnique({ where: { id: oldPurge.id } })).not.toBeNull();

    const written = await app.prisma.adminAuditLog.findFirst({
      where: { action: 'audit.purge', actorAccountId: admin.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(written?.reason).toBe('Keeping the table to a year');
    expect((written?.after as { removed: number }).removed).toBe(purged.json().removed);

    const again = await post('/api/admin/audit/purge', { reason: 'Nothing left to take' });
    expect(again.statusCode, again.body).toBe(409);
    expect(again.json().error.code).toBe('AUDIT_NOTHING_TO_PURGE');
  });
});
