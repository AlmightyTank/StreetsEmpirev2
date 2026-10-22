import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { StashService, stashDimensions } from '../stash.service.js';

function makePrisma(overrides: Partial<{ condoms: number; medicine: number; beer: number; ammo: number; vehicleParts: number; shotguns: number; stashLayout: unknown }> = {}) {
  const player = { condoms: 3, medicine: 2, beer: 0, ammo: 120, vehicleParts: 0, pistols: 0, shotguns: 1, tek9s: 0, ak47s: 0, lowRiders: 0, sedans: 0, vans: 0, stashLayout: [], ...overrides };
  const tx = {
    roundPlayer: {
      findUnique: vi.fn().mockResolvedValue(player),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
  const prisma = {
    roundPlayer: tx.roundPlayer,
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
  } as unknown as PrismaClient;
  return { prisma, tx };
}

describe('Hideout stash layout', () => {
  it('expands storage capacity by level', () => {
    expect(stashDimensions()).toEqual({ columns: 10, rows: 6 });
    expect(stashDimensions(1)).toEqual({ columns: 12, rows: 7 });
    expect(stashDimensions(3)).toEqual({ columns: 16, rows: 9 });
  });

  it('builds a grid from current supply balances without duplicating product stock', async () => {
    const { prisma } = makePrisma();
    const stash = await StashService.page(prisma, 'player-1');
    expect(stash).toMatchObject({ columns: 10, rows: 6, usedCells: 5, totalCells: 60 });
    expect(stash.items.map(({ key, quantity }) => [key, quantity])).toEqual([
      ['CONDOM', 3], ['MEDICINE', 2], ['AMMO_BOX', 120], ['SHOTGUN', 1],
    ]);
    expect(stash.items.map(({ x, y, width, height }) => [x, y, width, height])).toEqual([[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1], [3, 0, 2, 1]]);
  });

  it('saves player-arranged locations while retaining the live quantities', async () => {
    const { prisma, tx } = makePrisma({ shotguns: 0 });
    const stash = await StashService.saveLayout(prisma, 'player-1', {
      items: [
        { key: 'CONDOM', x: 4, y: 2 },
        { key: 'MEDICINE', x: 7, y: 3 },
        { key: 'AMMO_BOX', x: 1, y: 4 },
      ],
    });
    expect(stash.items.map(({ key, x, y }) => [key, x, y])).toEqual([
      ['CONDOM', 4, 2], ['MEDICINE', 7, 3], ['AMMO_BOX', 1, 4],
    ]);
    expect(tx.roundPlayer.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { stashLayout: [
        { key: 'CONDOM', x: 4, y: 2 },
        { key: 'MEDICINE', x: 7, y: 3 },
        { key: 'AMMO_BOX', x: 1, y: 4 },
      ] },
    }));
  });

  it('rejects overlaps and out-of-grid placement', async () => {
    const { prisma, tx } = makePrisma({ shotguns: 0 });
    await expect(StashService.saveLayout(prisma, 'player-1', {
      items: [
        { key: 'CONDOM', x: 0, y: 0 },
        { key: 'MEDICINE', x: 0, y: 0 },
      ],
    })).rejects.toMatchObject({ code: 'INVALID_STASH_LAYOUT' });
    expect(tx.roundPlayer.update).not.toHaveBeenCalled();

    const withWideItem = makePrisma({ shotguns: 1 });
    await expect(StashService.saveLayout(withWideItem.prisma, 'player-1', {
      items: [{ key: 'SHOTGUN', x: 9, y: 0 }],
    })).rejects.toThrow();
    expect(withWideItem.tx.roundPlayer.update).not.toHaveBeenCalled();
  });
});
