import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV01 } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { AdmissionService } from '../admission.service.js';
import { RoundService } from '../round.service.js';

describe.runIf(process.env.ADMISSION_INTEGRATION === '1')('admission across rounds with PostgreSQL', () => {
  let app: FastifyInstance;
  let firstRoundId = '';
  let secondRoundId = '';
  let accountId = '';
  let playerId = '';
  let cookie = '';

  beforeAll(async () => {
    app = await (await import('../../app.js')).buildApp();
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: classicOgV01.round.startingCitySlug } });
    const roundData = (name: string) => ({
      name, slug: `${name.toLowerCase().replaceAll(' ', '-')}-${randomUUID()}`,
      rulesetId: classicOgV01.meta.id, rulesetVersion: classicOgV01.meta.version, status: 'ACTIVE' as const,
      startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 86_400_000),
    });
    const firstRound = await app.prisma.round.create({ data: roundData('Admission first round') });
    const secondRound = await app.prisma.round.create({ data: roundData('Admission second round') });
    firstRoundId = firstRound.id;
    secondRoundId = secondRound.id;
    vi.spyOn(RoundService, 'requireCurrent').mockResolvedValue(secondRound);
    vi.spyOn(RoundService, 'getCurrent').mockResolvedValue(secondRound);

    const registered = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { username: `admission_${randomUUID().slice(0, 8)}`, email: `${randomUUID()}@example.invalid`, password: randomUUID(), ageConfirmed: true },
    });
    expect(registered.statusCode, registered.body).toBe(201);
    accountId = registered.json().account.id as string;
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
    const player = await app.prisma.roundPlayer.create({ data: {
      ...classicOgV01.round.startingPlayer, ...startingStock(classicOgV01),
      roundId: secondRoundId, accountId, cityId: city.id, displayName: 'Admission player',
      publicPimpId: Math.floor(Math.random() * 1_000_000_000) + 1_000_000,
      lastTurnCalculationAt: new Date(),
    } });
    playerId = player.id;

    await AdmissionService.configure(app.prisma, firstRoundId, { enabled: true, capacity: 1 });
    // This lazy lookup must create a second row rather than collide with id 1.
    await AdmissionService.status(app.prisma, accountId, secondRoundId);
    await AdmissionService.configure(app.prisma, secondRoundId, { enabled: true, capacity: 1 });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (playerId) await app.prisma.roundPlayer.delete({ where: { id: playerId } }).catch(() => undefined);
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } }).catch(() => undefined);
    if (firstRoundId) await app.prisma.round.delete({ where: { id: firstRoundId } }).catch(() => undefined);
    if (secondRoundId) await app.prisma.round.delete({ where: { id: secondRoundId } }).catch(() => undefined);
    await app?.close();
  });

  it('keeps both round settings and admits a game request in the second round', async () => {
    const joined = await app.inject({ method: 'POST', url: '/api/admission/join', headers: { cookie } });
    expect(joined.statusCode, joined.body).toBe(200);
    expect(joined.json().state).toBe('admitted');
    expect(await app.prisma.admissionSettings.count({ where: { roundId: { in: [firstRoundId, secondRoundId] } } })).toBe(2);

    const game = await app.inject({
      method: 'POST', url: '/api/game/casino/chips/buy', headers: { cookie },
      payload: { amountCents: 1, actionId: randomUUID() },
    });
    expect(game.statusCode).not.toBe(409);
  });
});
