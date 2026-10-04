import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV13G } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { AdminLawDto, AdminLawPlayerDto } from '@streets/shared';
import { ReputationService } from '../reputation.service.js';

type Who = { id: string; username: string; cookie: string };
const ruleset = classicOgV13G;

/**
 * 1.3.0-G gate, live: the admin law report and player Case view are staff-only, a Case
 * correction is exact, audited and quiet (no warrant, alert or stage-up activity), and the
 * report's integrity check catches a stored Case that no longer adds up to its receipts.
 * Opt in with ADMIN_INTEGRATION=1; rounds sit in REGISTRATION.
 */
describe.runIf(process.env.ADMIN_INTEGRATION === '1')('1.3.0-G admin law tools with PostgreSQL', () => {
  let app: FastifyInstance;
  let cookieName: string;
  let admin: Who;
  let other: Who;
  let roundId = '';
  let cityId = '';
  let playerId = '';
  let adminPlayerId = '';
  const accountIds: string[] = [];

  async function register(label: string): Promise<Who> {
    const username = `${label}_${randomUUID().slice(0, 8)}`;
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, email: `${username}@example.invalid`, password: randomUUID() } });
    expect(response.statusCode, response.body).toBe(201);
    const accountId = response.json().account.id as string;
    accountIds.push(accountId);
    const session = response.cookies.find((cookie) => cookie.name === cookieName)!;
    return { id: accountId, username, cookie: `${session.name}=${session.value}` };
  }

  const get = (url: string, who: Who = admin) => app.inject({ url, headers: { cookie: who.cookie } });
  const post = (url: string, payload: object, who: Who = admin) => app.inject({ method: 'POST', url, headers: { cookie: who.cookie }, payload });

  function player(who: Who, index: number) {
    return app.prisma.roundPlayer.create({
      data: {
        ...ruleset.round.startingPlayer, ...startingStock(ruleset),
        roundId, accountId: who.id, cityId, displayName: who.username, publicPimpId: 9700 + index,
        reputation: { create: ReputationService.seedFor(ruleset) },
      },
    });
  }

  beforeAll(async () => {
    cookieName = (await import('../../config/env.js')).env.SESSION_COOKIE_NAME;
    app = await (await import('../../app.js')).buildApp();
    admin = await register('lawadm');
    other = await register('lawply');
    await app.prisma.account.update({ where: { id: admin.id }, data: { isAdmin: true } });
    const round = await app.prisma.round.create({
      data: {
        slug: `law-g-${randomUUID()}`, name: `Law G ${randomUUID().slice(0, 6)}`,
        rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, status: 'REGISTRATION',
        startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    roundId = round.id;
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } })).id;
    playerId = (await player(other, 1)).id;
    adminPlayerId = (await player(admin, 2)).id;
  });

  afterAll(async () => {
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    for (const id of accountIds) await app.prisma.account.delete({ where: { id } }).catch(() => undefined);
    await app?.close();
  });

  it('keeps the report and a player’s Case to staff', async () => {
    expect((await get(`/api/admin/rounds/${roundId}/law`, other)).statusCode).toBe(403);
    expect((await get(`/api/admin/players/${playerId}/law`, other)).statusCode).toBe(403);
    expect((await post(`/api/admin/players/${playerId}/law/adjust`, { citySlug: ruleset.round.startingCitySlug, points: 10, reason: 'not staff' }, other)).statusCode).toBe(403);

    const report = await get(`/api/admin/rounds/${roundId}/law`);
    expect(report.statusCode, report.body).toBe(200);
    expect(report.json<AdminLawDto>()).toMatchObject({ enabled: true, rulesetId: ruleset.meta.id, integrity: { mismatches: [] } });
  });

  it('sets a Case exactly, quietly, and audits it', async () => {
    const slug = ruleset.round.startingCitySlug;
    const raised = await post(`/api/admin/players/${playerId}/law/adjust`, { citySlug: slug, points: 70, reason: 'Restore evidence lost to a bug' });
    expect(raised.statusCode, raised.body).toBe(200);
    const page = raised.json<AdminLawPlayerDto>().page!;
    expect(page.cases.find((row) => row.citySlug === slug)).toMatchObject({ case: 70, stage: 'WARRANT' });
    expect(page.receipts[0]).toMatchObject({ source: 'ADMIN', added: 70 });

    // Quiet: no warrant, no stage-up activity, no stage alert queued.
    expect(await app.prisma.playerWarrant.count({ where: { roundPlayerId: playerId } })).toBe(0);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: playerId, type: 'CASE_STAGE_UP' } })).toBe(0);
    expect(await app.prisma.playerCaseReceipt.count({ where: { roundPlayerId: playerId, stageUp: true } })).toBe(0);

    const lowered = await post(`/api/admin/players/${playerId}/law/adjust`, { citySlug: slug, points: 12.5, reason: 'Wrong city on the earlier fix' });
    expect(lowered.json<AdminLawPlayerDto>().page!.cases.find((row) => row.citySlug === slug)).toMatchObject({ case: 12.5, stage: 'QUIET' });

    const audit = await app.prisma.adminAuditLog.findMany({ where: { action: 'law.case-adjust', actorAccountId: admin.id }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((row) => [row.reason, (row.before as { case: number }).case, (row.after as { case: number }).case])).toEqual([
      ['Restore evidence lost to a bug', 0, 70],
      ['Wrong city on the earlier fix', 70, 12.5],
    ]);

    const report = (await get(`/api/admin/rounds/${roundId}/law`)).json<AdminLawDto>();
    expect(report.adjustments7d).toBe(2);
    expect(report.integrity).toMatchObject({ checked: 1, mismatches: [] });
    expect(report.highest[0]).toMatchObject({ playerId, case: 12.5 });
  });

  it('refuses a correction to your own Case, out of range, or to the same value', async () => {
    const slug = ruleset.round.startingCitySlug;
    expect((await post(`/api/admin/players/${adminPlayerId}/law/adjust`, { citySlug: slug, points: 5, reason: 'Fixing myself' })).statusCode).toBe(409);
    expect((await post(`/api/admin/players/${playerId}/law/adjust`, { citySlug: slug, points: ruleset.law.caseMax + 1, reason: 'Too high a value' })).statusCode).toBe(400);
    expect((await post(`/api/admin/players/${playerId}/law/adjust`, { citySlug: slug, points: 12.5, reason: 'Nothing to change' })).statusCode).toBe(409);
  });

  it('flags a stored Case that no longer adds up to its receipts', async () => {
    await app.prisma.playerCase.updateMany({ where: { roundPlayerId: playerId }, data: { caseHundredths: 9_000 } });
    const report = (await get(`/api/admin/rounds/${roundId}/law`)).json<AdminLawDto>();
    expect(report.integrity.mismatches).toEqual([expect.objectContaining({ playerId, stored: 90, receipts: 12.5 })]);
  });
});
