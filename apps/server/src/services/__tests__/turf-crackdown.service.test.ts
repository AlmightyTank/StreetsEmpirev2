import { afterEach, describe, expect, it, vi } from 'vitest';
import { classicOgV06F, classicOgV11F } from '@streets/rulesets';
import { TurfCrackdownService } from '../turf-crackdown.service.js';
import { PlayerStateService } from '../player-state.service.js';
import { TurfService } from '../turf.service.js';
import { ACTIVE_WAR, BlockWarSettleService } from '../block-war-settle.service.js';
import { TurfWarSettlementService } from '../turf-war-settle.service.js';

describe('0.6.0-F Federal turf crackdown', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lands two days before the bell and warns one day before the sweep', () => {
    const startsAt = new Date('2026-09-01T00:00:00.000Z');
    const endsAt = new Date('2026-09-29T00:00:00.000Z');
    const schedule = TurfCrackdownService.schedule({ startsAt, endsAt }, classicOgV06F);

    expect(schedule).not.toBeNull();
    expect(schedule!.sweepAt.toISOString()).toBe('2026-09-27T00:00:00.000Z');
    expect(schedule!.warningAt.toISOString()).toBe('2026-09-26T00:00:00.000Z');
  });

  it('chooses one deterministic city from the pinned city list', () => {
    const first = TurfCrackdownService.targetCitySlug('round-123', classicOgV06F);
    const replay = TurfCrackdownService.targetCitySlug('round-123', classicOgV06F);

    expect(first).toBe(replay);
    expect(Object.keys(classicOgV06F.cities)).toContain(first);
  });

  it('picks up twenty percent with a six-man cap and always leaves one on the corner', () => {
    expect(TurfCrackdownService.pickupCount(1, classicOgV06F)).toBe(0);
    expect(TurfCrackdownService.pickupCount(2, classicOgV06F)).toBe(1);
    expect(TurfCrackdownService.pickupCount(10, classicOgV06F)).toBe(2);
    expect(TurfCrackdownService.pickupCount(30, classicOgV06F)).toBe(6);
    expect(TurfCrackdownService.pickupCount(100, classicOgV06F)).toBe(6);
  });
  it('still adds Heat when the minimum survivor prevents a pickup', async () => {
    const sweepAt = new Date('2026-09-27T00:00:00.000Z');
    const event = {
      id: 'crackdown-1',
      roundId: 'round-1',
      cityId: 'city-atlanta',
      warningAt: new Date('2026-09-26T00:00:00.000Z'),
      sweepAt,
      sweptAt: null,
      holdersAffected: 0,
      thugsPickedUp: 0,
      results: [],
      warningDiscordPostedAt: null,
      sweepDiscordPostedAt: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      city: { slug: 'atlanta', name: 'Atlanta' },
    };
    const turfUpdate = vi.fn();
    const playerUpdate = vi.fn(async ({ data }: any) => data);
    const order: string[] = [];
    let turfReads = 0;
    const tx: any = {
      turfPush: {
        findMany: vi.fn(async () => [{ id: 'push-before-sweep' }]),
      },
      turfCrackdown: {
        findUnique: vi.fn(async () => event),
        update: vi.fn(async ({ data }: any) => ({ ...event, ...data })),
      },
      turf: {
        findMany: vi.fn(async () => {
          turfReads += 1;
          if (turfReads === 1) return [{ holderId: 'player-1' }];
          return [{
            id: 'block-1',
            holderId: 'player-1',
            cornerThugs: 1,
            cornerPistols: 1,
            cornerShotguns: 0,
            cornerTek9s: 0,
            cornerAk47s: 0,
            holder: {
              id: 'player-1',
              publicPimpId: 77,
              displayName: 'One Man Corner',
              city: { slug: 'atlanta' },
            },
          }];
        }),
        update: turfUpdate,
      },
      roundPlayer: {
        findUniqueOrThrow: vi.fn(async () => ({
          heat: 10,
          thugs: 10,
          postedThugs: 1,
          postedNetWorthCents: 0n,
          netWorthCents: 10_000_000n,
        })),
        update: playerUpdate,
      },
    };

    vi.spyOn(TurfService, 'ensureRound').mockResolvedValue();
    vi.spyOn(TurfWarSettlementService, 'land').mockImplementation(async (_tx, pushId, at) => {
      order.push('legacy-push');
      expect(pushId).toBe('push-before-sweep');
      expect(at).toEqual(sweepAt);
      return true;
    });
    vi.spyOn(PlayerStateService, 'settleInTransaction').mockImplementation(async () => {
      order.push('player-settle');
      return {} as any;
    });

    const result = await TurfCrackdownService.settleInTransaction(tx, {
      id: 'round-1',
      status: 'ACTIVE',
      startsAt: new Date('2026-09-01T00:00:00.000Z'),
      endsAt: new Date('2026-09-29T00:00:00.000Z'),
    } as any, classicOgV06F, sweepAt);

    expect(tx.turfPush.findMany).toHaveBeenCalledWith({
      where: {
        roundId: 'round-1',
        status: 'PENDING',
        landsAt: { lte: sweepAt },
        turf: { cityId: 'city-atlanta' },
      },
      select: { id: true },
      orderBy: [{ landsAt: 'asc' }, { id: 'asc' }],
    });
    expect(TurfWarSettlementService.land).toHaveBeenCalledWith(tx, 'push-before-sweep', sweepAt);
    expect(order.indexOf('legacy-push')).toBeLessThan(order.indexOf('player-settle'));
    expect(turfUpdate).not.toHaveBeenCalled();
    expect(playerUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'player-1' },
      data: expect.objectContaining({
        heat: 22,
        thugs: 10,
        postedThugs: 1,
      }),
    }));
    expect(result).toMatchObject({ holdersAffected: 1, thugsPickedUp: 0 });
    expect((result as any).results).toEqual([expect.objectContaining({
      roundPlayerId: 'player-1',
      blocks: 1,
      pickedUp: 0,
      heatAdded: 12,
      racketsHit: 0,
    })]);
  });


  it('1.1.0-F adds Heat only for staffed rackets', async () => {
    const sweepAt = new Date('2026-09-27T00:00:00.000Z');
    const event = {
      id: 'crackdown-f', roundId: 'round-f', cityId: 'city-atlanta',
      warningAt: new Date('2026-09-26T00:00:00.000Z'), sweepAt, sweptAt: null,
      holdersAffected: 0, thugsPickedUp: 0, results: [],
      warningDiscordPostedAt: null, sweepDiscordPostedAt: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'), updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      city: { slug: 'atlanta', name: 'Atlanta' },
    };
    let turfReads = 0;
    const order: string[] = [];
    const businessCount = vi.fn(async () => { order.push('racket-count'); return 2; });
    const playerUpdate = vi.fn(async ({ data }: any) => data);
    const tx: any = {
      turfPush: { findMany: vi.fn(async () => []) },
      blockWar: {
        findMany: vi.fn(async () => { order.push('war-query'); return [{ id: 'war-f' }]; }),
      },
      turfCrackdown: {
        findUnique: vi.fn(async () => event),
        update: vi.fn(async ({ data }: any) => ({ ...event, ...data })),
      },
      turf: {
        findMany: vi.fn(async () => {
          turfReads += 1;
          if (turfReads === 1) return [{ holderId: 'player-f' }];
          return [{
            id: 'block-f', holderId: 'player-f', cornerThugs: 1,
            cornerPistols: 0, cornerShotguns: 0, cornerTek9s: 0, cornerAk47s: 0,
            holder: { id: 'player-f', publicPimpId: 88, displayName: 'Racket Boss', city: { slug: 'atlanta' } },
          }];
        }),
        update: vi.fn(),
      },
      business: { count: businessCount },
      roundPlayer: {
        findUniqueOrThrow: vi.fn(async () => ({
          heat: 10, thugs: 10, postedThugs: 1, postedNetWorthCents: 0n, netWorthCents: 10_000_000n,
        })),
        update: playerUpdate,
      },
    };

    vi.spyOn(TurfService, 'ensureRound').mockResolvedValue();
    vi.spyOn(BlockWarSettleService, 'advance').mockImplementation(async (_tx, warId, at) => {
      order.push('war-advance');
      expect(warId).toBe('war-f');
      expect(at).toEqual(sweepAt);
      return true;
    });
    vi.spyOn(PlayerStateService, 'settleInTransaction').mockImplementation(async () => {
      order.push('player-settle');
      return {} as any;
    });

    const result = await TurfCrackdownService.settleInTransaction(tx, {
      id: 'round-f', status: 'ACTIVE',
      startsAt: new Date('2026-09-01T00:00:00.000Z'), endsAt: new Date('2026-09-29T00:00:00.000Z'),
    } as any, classicOgV11F, sweepAt);

    expect(tx.blockWar.findMany).toHaveBeenCalledWith({
      where: { roundId: 'round-f', status: ACTIVE_WAR, turf: { cityId: 'city-atlanta' } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    expect(BlockWarSettleService.advance).toHaveBeenCalledWith(tx, 'war-f', sweepAt);
    expect(order.indexOf('war-advance')).toBeLessThan(order.indexOf('player-settle'));
    expect(order.indexOf('player-settle')).toBeLessThan(order.indexOf('racket-count'));
    expect(businessCount).toHaveBeenCalledWith({
      where: {
        roundId: 'round-f',
        staffOwnerId: 'player-f',
        level: { gt: 0 },
        staff: { gt: 0 },
        racket: { not: null },
        turf: { cityId: 'city-atlanta', holderId: 'player-f' },
      },
    });
    expect(playerUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ heat: 38, netWorthCents: 10_000_000n }),
    }));
    expect((result as any).results).toEqual([expect.objectContaining({
      racketsHit: 2,
      heatAdded: 28,
    })]);
  });

});
