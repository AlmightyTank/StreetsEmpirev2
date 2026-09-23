import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classicOgV07J, classicOgV07K, classicOgV07W } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import { ActionService } from '../action.service.js';
import { FavorContentService } from '../favor-content.service.js';
import { SingleUseFavorService } from '../single-use-favor.service.js';

beforeEach(() => {
  vi.spyOn(FavorContentService, 'isEnabled').mockResolvedValue(true);
  vi.spyOn(FavorContentService, 'disabledKeys').mockResolvedValue(new Set());
});
afterEach(() => vi.restoreAllMocks());

describe('SingleUseFavorService', () => {
  it('maps armed rows through the pinned ruleset catalog', async () => {
    const armedAt = new Date('2026-09-22T14:00:00Z');
    const db = {
      playerArmedFavor: {
        findMany: async () => [
          { favorKey: 'BURNER_PHONE', category: 'UNDERWORLD', armedAt },
        ],
      },
    } as unknown as Db;

    await expect(SingleUseFavorService.listArmed(db, 'player-1', classicOgV07K))
      .resolves.toEqual([{
        key: 'BURNER_PHONE',
        name: 'Burner Phone',
        description: 'Arm it, then your next successful Recon costs 0 turns.',
        category: 'UNDERWORLD',
        armedAt: armedAt.toISOString(),
      }]);
  });

  it('moves one inventory item into an armed category slot', async () => {
    const inventoryUpdates: unknown[] = [];
    const creates: unknown[] = [];
    const tx = {
      playerFavor: {
        findUnique: async () => ({ quantity: 2 }),
        update: async (args: unknown) => { inventoryUpdates.push(args); },
      },
      playerArmedFavor: {
        findUnique: async () => null,
        create: async (args: unknown) => { creates.push(args); },
      },
    } as unknown as Db;

    vi.spyOn(ActionService, 'run').mockImplementation(async (_prisma, _player, options) => {
      const outcome = await options.execute({
        tx,
        current: {} as never,
        ruleset: classicOgV07K,
        now: new Date('2026-09-22T14:00:00Z'),
      } as never);
      return { action: options.action, result: outcome.result, changes: [] } as never;
    });

    const result = await SingleUseFavorService.arm(
      {} as never,
      'player-1',
      'BURNER_PHONE',
      { actionId: 'arm-1' },
    );

    expect(result.result).toMatchObject({
      favorKey: 'BURNER_PHONE',
      category: 'UNDERWORLD',
      armed: true,
      quantityRemaining: 1,
    });
    expect(inventoryUpdates).toHaveLength(1);
    expect(creates).toHaveLength(1);
  });

  it('refuses to arm a favor while its kill switch is off', async () => {
    vi.mocked(FavorContentService.isEnabled).mockResolvedValue(false);
    vi.spyOn(ActionService, 'run').mockImplementation(async (_prisma, _player, options) => {
      const outcome = await options.execute({
        tx: {} as never,
        current: {} as never,
        ruleset: classicOgV07K,
        now: new Date(),
      } as never);
      return { action: options.action, result: outcome.result, changes: [] } as never;
    });

    await expect(SingleUseFavorService.arm(
      {} as never,
      'player-1',
      'BURNER_PHONE',
      { actionId: 'disabled-arm' },
    )).rejects.toMatchObject({ code: 'FAVOR_DISABLED' });
  });

  it('does not spend inventory when the category is already armed', async () => {
    const inventoryUpdates: unknown[] = [];
    const tx = {
      playerFavor: {
        findUnique: async () => ({ quantity: 1 }),
        update: async (args: unknown) => { inventoryUpdates.push(args); },
      },
      playerArmedFavor: {
        findUnique: async () => ({ favorKey: 'TOMMY_VOUCHER' }),
      },
    } as unknown as Db;

    vi.spyOn(ActionService, 'run').mockImplementation(async (_prisma, _player, options) => {
      const outcome = await options.execute({
        tx,
        current: {} as never,
        ruleset: classicOgV07K,
        now: new Date(),
      } as never);
      return { action: options.action, result: outcome.result, changes: [] } as never;
    });

    await expect(SingleUseFavorService.arm(
      {} as never,
      'player-1',
      'DOCTOR_FAVOR',
      { actionId: 'arm-2' },
    )).rejects.toMatchObject({ code: 'FAVOR_CATEGORY_ARMED' });

    expect(inventoryUpdates).toHaveLength(0);
  });

  it('disarms back into inventory', async () => {
    const deletes: unknown[] = [];
    const tx = {
      playerArmedFavor: {
        findFirst: async () => ({ id: 'armed-1' }),
        delete: async (args: unknown) => { deletes.push(args); },
      },
      playerFavor: {
        update: async () => ({ quantity: 3 }),
      },
    } as unknown as Db;

    vi.spyOn(ActionService, 'run').mockImplementation(async (_prisma, _player, options) => {
      const outcome = await options.execute({
        tx,
        current: {} as never,
        ruleset: classicOgV07K,
        now: new Date(),
      } as never);
      return { action: options.action, result: outcome.result, changes: [] } as never;
    });

    const result = await SingleUseFavorService.disarm(
      {} as never,
      'player-1',
      'TOMMY_VOUCHER',
      { actionId: 'disarm-1' },
    );

    expect(result.result).toMatchObject({
      favorKey: 'TOMMY_VOUCHER',
      armed: false,
      quantityRemaining: 3,
    });
    expect(deletes).toHaveLength(1);
  });

  it('returns only a matching armed effect', async () => {
    const db = {
      playerArmedFavor: {
        findMany: async () => [
          { id: 'voucher', favorKey: 'TOMMY_VOUCHER' },
          { id: 'burner', favorKey: 'BURNER_PHONE' },
        ],
      },
    } as unknown as Db;

    const burner = await SingleUseFavorService.matching(
      db,
      'player-1',
      classicOgV07K,
      'FREE_RECON',
    );
    expect(burner).toMatchObject({
      id: 'burner',
      key: 'BURNER_PHONE',
      effect: { kind: 'FREE_RECON' },
    });

    await expect(SingleUseFavorService.matching(
      db,
      'player-1',
      classicOgV07K,
      'FREE_TREATMENT',
    )).resolves.toBeNull();
  });

  it('matches the Phase Y-B action-shaped Legendary effects', async () => {
    const db = {
      playerArmedFavor: {
        findMany: async () => [
          { id: 'road', favorKey: 'WHEELS_OPEN_ROAD' },
          { id: 'vic', favorKey: 'VIC_CLEAN_SLATE_FAVOR' },
          { id: 'blocks', favorKey: 'BLOCKS_STAND_DOWN' },
        ],
      },
    } as unknown as Db;

    await expect(SingleUseFavorService.matching(
      db,
      'player-1',
      classicOgV07W,
      'CLEAR_FIRST_ROAD_STOP',
    )).resolves.toMatchObject({ id: 'road', key: 'WHEELS_OPEN_ROAD' });

    await expect(SingleUseFavorService.matching(
      db,
      'player-1',
      classicOgV07W,
      'FREE_HEAT_BRIBE',
    )).resolves.toMatchObject({ id: 'vic', key: 'VIC_CLEAN_SLATE_FAVOR' });

    await expect(SingleUseFavorService.matching(
      db,
      'player-1',
      classicOgV07W,
      'LOCAL_TURF_STANDDOWN',
    )).resolves.toMatchObject({ id: 'blocks', key: 'BLOCKS_STAND_DOWN' });
  });

  it('does not consume an armed effect while its kill switch is off', async () => {
    vi.mocked(FavorContentService.disabledKeys).mockResolvedValue(new Set(['BURNER_PHONE']));
    const db = {
      playerArmedFavor: {
        findMany: async () => [{ id: 'burner', favorKey: 'BURNER_PHONE' }],
      },
    } as unknown as Db;

    await expect(SingleUseFavorService.matching(
      db,
      'player-1',
      classicOgV07K,
      'FREE_RECON',
    )).resolves.toBeNull();
  });

  it('keeps the 0.7-J placeholder voucher unarmable', async () => {
    vi.spyOn(ActionService, 'run').mockImplementation(async (_prisma, _player, options) => {
      const outcome = await options.execute({
        tx: {} as never,
        current: {} as never,
        ruleset: classicOgV07J,
        now: new Date(),
      } as never);
      return { action: options.action, result: outcome.result, changes: [] } as never;
    });

    await expect(SingleUseFavorService.arm(
      {} as never,
      'player-1',
      'TOMMY_VOUCHER',
      { actionId: 'arm-old' },
    )).rejects.toMatchObject({ code: 'FAVOR_NOT_SINGLE_USE' });
  });
});
