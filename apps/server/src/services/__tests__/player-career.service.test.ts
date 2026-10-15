import { describe, expect, it, vi } from 'vitest';

vi.mock('../activity.service.js', () => ({
  ActivityService: { log: vi.fn(async () => undefined) },
}));

import { ActivityService } from '../activity.service.js';
import { CAREER_SWITCH_COOLDOWN_MS, PlayerCareerService } from '../player-career.service.js';

describe('2.0 player career identity', () => {
  it('chooses, cools down, then records a later cosmetic switch without touching round resources', async () => {
    let row: any = null;
    const roundPlayer = { cashCents: 500_00n, thugs: 3, turns: 40 };
    const db = {
      playerCareer: {
        findUnique: vi.fn(async () => row),
        upsert: vi.fn(async ({ create, update }: any) => {
          row = { ...(row ? update : create), accountId: 'account-1', updatedAt: new Date() };
          return row;
        }),
      },
      roundPlayer: { update: vi.fn() },
      $transaction: vi.fn(async (callback: (tx: any) => unknown) => callback(db)),
    } as any;
    const selectedAt = new Date('2026-10-20T12:00:00.000Z');

    const first = await PlayerCareerService.choose(db, { accountId: 'account-1', roundPlayerId: 'player-1', key: 'ENFORCER' }, selectedAt);
    expect(first).toMatchObject({ key: 'ENFORCER', title: 'Enforcer', canSwitch: false });
    expect(first.history).toEqual([{ key: 'ENFORCER', selectedAt: selectedAt.toISOString() }]);
    await expect(PlayerCareerService.choose(db, { accountId: 'account-1', roundPlayerId: 'player-1', key: 'FIXER' }, new Date(selectedAt.getTime() + 1_000)))
      .rejects.toMatchObject({ code: 'CAREER_SWITCH_COOLDOWN' });

    const switchedAt = new Date(selectedAt.getTime() + CAREER_SWITCH_COOLDOWN_MS);
    const switched = await PlayerCareerService.choose(db, { accountId: 'account-1', roundPlayerId: 'player-1', key: 'FIXER' }, switchedAt);
    expect(switched.history.map((entry) => entry.key)).toEqual(['ENFORCER', 'FIXER']);
    expect(db.roundPlayer.update).not.toHaveBeenCalled();
    expect(roundPlayer).toEqual({ cashCents: 500_00n, thugs: 3, turns: 40 });
    expect(ActivityService.log).toHaveBeenCalledTimes(2);
  });

  it('treats choosing the current identity as an idempotent read', async () => {
    const selectedAt = new Date('2026-10-20T12:00:00.000Z');
    const row = { accountId: 'account-1', career: 'SMUGGLER', history: [{ key: 'SMUGGLER', selectedAt: selectedAt.toISOString() }], selectedAt, switchAvailableAt: new Date(selectedAt.getTime() + CAREER_SWITCH_COOLDOWN_MS) };
    const db = {
      playerCareer: { findUnique: vi.fn(async () => row), upsert: vi.fn() },
      $transaction: vi.fn(async (callback: (tx: any) => unknown) => callback(db)),
    } as any;

    const result = await PlayerCareerService.choose(db, { accountId: 'account-1', roundPlayerId: 'player-1', key: 'SMUGGLER' }, selectedAt);
    expect(result.key).toBe('SMUGGLER');
    expect(db.playerCareer.upsert).not.toHaveBeenCalled();
  });
});
