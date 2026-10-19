import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV12B } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * Avatar Slice C: closing a round grants the national top-10 laurel, the
 * top-3 diamond studs, and a skyline for each city a crew holds turf in.
 * Opt in with AVATAR_INTEGRATION=1.
 */
describe.runIf(process.env.AVATAR_INTEGRATION === '1')('avatar wearables at round close with PostgreSQL', () => {
  let app: FastifyInstance;
  const accounts: string[] = [];
  const roundIds: string[] = [];

  async function register(): Promise<string> {
    const name = 'avatar_' + randomUUID().slice(0, 6);
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { ageConfirmed: true, username: name, email: name + '@example.invalid', password: randomUUID() },
    });
    const id = registered.json().account.id as string;
    accounts.push(id);
    return id;
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
  });

  afterAll(async () => {
    // A closed round leaves Empire legacy rows behind; they go first.
    await app.prisma.legacyEntry.deleteMany({ where: { sourceRoundId: { in: roundIds } } });
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  it('crowns the top finishers and hands out skylines for held turf', async () => {
    const round = await app.prisma.round.create({
      data: {
        name: 'Avatar close fixture',
        slug: 'avatar-close-' + randomUUID(),
        rulesetId: classicOgV12B.meta.id,
        rulesetVersion: classicOgV12B.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundIds.push(round.id);
    const detroit = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'detroit' } });
    const [rich, poor] = [await register(), await register()];
    const players = [];
    for (const [index, accountId] of [rich, poor].entries()) {
      players.push(await app.prisma.roundPlayer.create({
        data: {
          ...classicOgV12B.round.startingPlayer,
          ...startingStock(classicOgV12B),
          // The first player is far richer, so it finishes first.
          cashCents: index === 0 ? 900_000_000n : 1_000n,
          roundId: round.id,
          accountId,
          cityId: detroit.id,
          displayName: 'avatar_' + randomUUID().slice(0, 6),
          publicPimpId: 9800 + index,
          reputation: { create: ReputationService.seedFor(classicOgV12B) },
        },
      }));
    }
    // A held block always has the holder's thugs posted on it.
    await app.prisma.roundPlayer.update({ where: { id: players[1]!.id }, data: { postedThugs: 4 } });
    await app.prisma.turf.create({
      data: { roundId: round.id, cityId: detroit.id, district: 'CASINO', localsThugs: 0, holderId: players[1]!.id, cornerThugs: 4, heldSince: new Date() },
    });

    const closed = await RoundService.closeRoundAt(app.prisma, round.id, new Date());
    expect(closed.closed).toBe(true);

    const unlocks = await app.prisma.accountCosmeticUnlock.findMany({
      where: { accountId: { in: [rich, poor] }, kind: 'AVATAR_PART' },
      select: { accountId: true, key: true, sourceQuestKey: true },
    });
    const keys = (accountId: string) => unlocks.filter((row) => row.accountId === accountId).map((row) => row.key).sort();
    // Two players, both in the top 10; only the winner is top 3. Only the turf holder gets Detroit.
    expect(keys(rich)).toEqual(['avatar-top-ten-laurel', 'avatar-top-three-diamonds']);
    expect(keys(poor)).toEqual(['avatar-skyline-detroit', 'avatar-top-ten-laurel', 'avatar-top-three-diamonds']);
    expect(new Set(unlocks.map((row) => row.sourceQuestKey))).toEqual(new Set([`ROUND_CLOSE:${round.id}`]));
  });
});
