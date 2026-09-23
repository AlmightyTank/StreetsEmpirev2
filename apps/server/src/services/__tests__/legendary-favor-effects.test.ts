import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classicOgV07W } from '@streets/rulesets';
import { ActionService } from '../action.service.js';
import { HeatService } from '../heat.service.js';
import { SingleUseFavorService } from '../single-use-favor.service.js';

afterEach(() => vi.restoreAllMocks());

describe('Phase Y-B Legendary favor gameplay effects', () => {
  it('lets Vic cover one successful Heat bribe and consumes the marker exactly once', async () => {
    const consumed: string[] = [];
    const favor = classicOgV07W.favors!.VIC_CLEAN_SLATE_FAVOR;

    vi.spyOn(SingleUseFavorService, 'matching').mockResolvedValue({
      id: 'armed-vic',
      key: favor.key,
      definition: favor,
      effect: favor.effect!,
    } as never);
    vi.spyOn(SingleUseFavorService, 'consume').mockImplementation(async (_tx, id) => {
      consumed.push(id);
    });

    vi.spyOn(ActionService, 'run').mockImplementation(async (_prisma, _player, options) => {
      const outcome = await options.execute({
        tx: {} as never,
        current: { heat: 60, cashCents: 0n } as never,
        ruleset: classicOgV07W,
        player: { id: 'player-1' } as never,
        now: new Date('2026-09-23T03:30:00Z'),
      } as never);
      return {
        success: true,
        action: options.action,
        before: {} as never,
        after: {} as never,
        changes: [],
        result: outcome.result,
      } as never;
    });

    const result = await HeatService.bribe(
      {} as never,
      'player-1',
      { points: 60, actionId: randomUUID() },
    );

    expect(result.result).toEqual({
      points: 60,
      costCents: 0,
      heatBefore: 60,
      heatAfter: 0,
      favorKey: 'VIC_CLEAN_SLATE_FAVOR',
    });
    expect(consumed).toEqual(['armed-vic']);
  });

  it('does not touch the armed marker when the Heat request is invalid', async () => {
    const match = vi.spyOn(SingleUseFavorService, 'matching');
    const consume = vi.spyOn(SingleUseFavorService, 'consume');

    vi.spyOn(ActionService, 'run').mockImplementation(async (_prisma, _player, options) => {
      return options.execute({
        tx: {} as never,
        current: { heat: 20, cashCents: 0n } as never,
        ruleset: classicOgV07W,
        player: { id: 'player-1' } as never,
        now: new Date('2026-09-23T03:30:00Z'),
      } as never) as never;
    });

    await expect(HeatService.bribe(
      {} as never,
      'player-1',
      { points: 21, actionId: randomUUID() },
    )).rejects.toMatchObject({ code: 'TOO_MANY_POINTS' });

    expect(match).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });
});
