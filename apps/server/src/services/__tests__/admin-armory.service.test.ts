import { describe, expect, it, vi } from 'vitest';
import { AdminArmoryService } from '../admin-armory.service.js';

describe('admin individual armory inspector', () => {
  it('bounds cap-sized inventories and returns the newest item events as an audit trail', async () => {
    const gunRows = Array.from({ length: 2_000 }, (_, index) => ({
      id: `gun-${index}`, model: 'AK47', name: `Gun ${index}`, quantity: 1, condition: 80, status: 'READY',
      mods: [], lookKey: null, origin: { kind: 'PURCHASED' }, stats: {}, history: [{
        at: new Date(index * 1_000).toISOString(), type: 'COMBAT', summary: `Fight ${index}`,
      }], updatedAt: new Date(index * 1_000),
    }));
    const findMany = vi.fn(async ({ take }: { take: number }) => gunRows.slice(0, take));
    const db = {
      roundPlayer: { findUnique: async () => ({ id: 'player-1', roundId: 'round-1', displayName: 'Pimp', publicPimpId: 1001,
        round: { id: 'round-1', name: 'Beta', rulesetId: 'classic-og-v2.5-a', rulesetVersion: '2.5.0-A' } }) },
      playerGun: { findMany }, playerVehicle: { findMany: async () => [] },
      playerArmorySummary: { findUnique: async () => ({ gunCount: 2_000, vehicleCount: 0 }) },
    };
    const result = await AdminArmoryService.player(db as never, 'player-1');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2_000 }));
    expect(result).toMatchObject({ summary: { guns: 2_000, vehicles: 0 }, truncated: true, items: expect.any(Array) });
    expect(result.items).toHaveLength(2_000);
    expect(result.audit).toHaveLength(250);
    expect(result.audit[0]).toMatchObject({ summary: 'Fight 1999', type: 'COMBAT' });
  });

  it('returns a not-found error without querying item tables for an unknown player', async () => {
    const db = { roundPlayer: { findUnique: async () => null }, playerGun: { findMany: vi.fn() }, playerVehicle: { findMany: vi.fn() }, playerArmorySummary: { findUnique: vi.fn() } };
    await expect(AdminArmoryService.player(db as never, 'missing')).rejects.toMatchObject({ code: 'PLAYER_NOT_FOUND' });
    expect(db.playerGun.findMany).not.toHaveBeenCalled();
  });
});
