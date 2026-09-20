import { afterEach, describe, expect, it, vi } from 'vitest';
import { classicOgV06F } from '@streets/rulesets';
import { TurfCrackdownService } from '../turf-crackdown.service.js';
import { PlayerStateService } from '../player-state.service.js';
import { TurfService } from '../turf.service.js';

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
    let turfReads = 0;
    const tx: any = {
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
    vi.spyOn(PlayerStateService, 'settleInTransaction').mockResolvedValue({} as any);

    const result = await TurfCrackdownService.settleInTransaction(tx, {
      id: 'round-1',
      status: 'ACTIVE',
      startsAt: new Date('2026-09-01T00:00:00.000Z'),
      endsAt: new Date('2026-09-29T00:00:00.000Z'),
    } as any, classicOgV06F, sweepAt);

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
    })]);
  });

});
