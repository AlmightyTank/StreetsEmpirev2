import { describe, expect, it } from 'vitest';
import type { PrismaClient, Round } from '@prisma/client';
import { RoundRollCallService } from '../round-roll-call.service.js';

const START = new Date('2026-10-01T18:00:00Z');
const DAY = 86_400_000;
const round = { id: 'r1', startsAt: START, endsAt: new Date(START.getTime() + 28 * DAY), status: 'ACTIVE' } as Round;

function database(stamps: number, claimedTiers: number[]) {
  return {
    roundLoginCheckIn: { count: async () => stamps },
    roundLoginRewardClaim: {
      count: async ({ where }: { where: { tier: { lte: number } } }) => claimedTiers.filter((tier) => tier <= where.tier.lte).length,
    },
  } as unknown as PrismaClient;
}

describe('round roll call nav summary', () => {
  it('counts reached rewards that are not yet collected', async () => {
    const summary = await RoundRollCallService.summary(database(5, [1, 2]), round, 'p1', new Date(START.getTime() + 5 * DAY));
    expect(summary).toEqual({ claimable: 3 });
  });

  it('shows nothing to claim once the round has ended', async () => {
    const summary = await RoundRollCallService.summary(database(5, []), round, 'p1', round.endsAt);
    expect(summary).toEqual({ claimable: 0 });
  });

  it('is null on rounds too short for a track', async () => {
    const short = { ...round, endsAt: new Date(START.getTime() + 7 * DAY) } as Round;
    expect(await RoundRollCallService.summary(database(0, []), short, 'p1', START)).toBeNull();
  });
});
