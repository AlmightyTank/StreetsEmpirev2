import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classicOgV07J } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import { ActionService } from '../action.service.js';
import { FavorContentService } from '../favor-content.service.js';
import { TimedFavorService } from '../timed-favor.service.js';

beforeEach(() => {
  vi.spyOn(FavorContentService, 'isEnabled').mockResolvedValue(true);
  vi.spyOn(FavorContentService, 'disabledKeys').mockResolvedValue(new Set());
});
afterEach(() => vi.restoreAllMocks());

describe('TimedFavorService', () => {
  it('reduces live favor rows into gameplay bonuses', async () => {
    const db = {
      playerActiveFavor: {
        findMany: async () => [
          { favorKey: 'MAMA_ADVICE' },
          { favorKey: 'PIP_CONNECTION' },
          { favorKey: 'FIELD_MEDIC' },
        ],
      },
    } as unknown as Db;

    await expect(TimedFavorService.bonuses(
      db,
      'player-1',
      classicOgV07J,
      new Date('2026-09-22T12:00:00Z'),
    )).resolves.toEqual({
      scoutIncomePercent: 10,
      scoutRecruitmentPercent: 10,
      productionOutputPercent: 0,
      pipBuyDiscountPercent: 10,
      treatmentMedicineEfficiencyPercent: 20,
    });
  });

  it('stops applying an already-active favor while its kill switch is off', async () => {
    vi.mocked(FavorContentService.disabledKeys).mockResolvedValue(new Set(['MAMA_ADVICE']));
    const db = {
      playerActiveFavor: {
        findMany: async () => [{ favorKey: 'MAMA_ADVICE' }, { favorKey: 'PIP_CONNECTION' }],
      },
    } as unknown as Db;

    await expect(TimedFavorService.bonuses(
      db,
      'player-1',
      classicOgV07J,
      new Date('2026-09-22T12:00:00Z'),
    )).resolves.toMatchObject({
      scoutIncomePercent: 0,
      scoutRecruitmentPercent: 0,
      pipBuyDiscountPercent: 10,
    });
  });

  it('maps only unexpired rows returned by the active query', async () => {
    const startedAt = new Date('2026-09-22T11:55:00Z');
    const expiresAt = new Date('2026-09-22T12:05:00Z');
    const db = {
      playerActiveFavor: {
        findMany: async () => [{
          favorKey: 'MAMA_ADVICE',
          category: 'STREET',
          startedAt,
          expiresAt,
        }],
      },
    } as unknown as Db;

    const active = await TimedFavorService.listActive(
      db,
      'player-1',
      classicOgV07J,
      new Date('2026-09-22T12:00:00Z'),
    );
    expect(active).toEqual([{
      key: 'MAMA_ADVICE',
      name: "Mama's Advice",
      description: 'For 10 minutes: +10% Scout income and +10% Scout recruitment.',
      category: 'STREET',
      startedAt: startedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }]);
  });

  it('consumes one favor and writes a server-timed active category row', async () => {
    const updates: unknown[] = [];
    const upserts: unknown[] = [];
    const tx = {
      playerFavor: {
        findUnique: async () => ({ quantity: 2 }),
        update: async (args: unknown) => { updates.push(args); },
      },
      playerActiveFavor: {
        findUnique: async () => null,
        upsert: async (args: unknown) => { upserts.push(args); },
      },
    } as unknown as Db;
    const now = new Date('2026-09-22T12:00:00Z');

    vi.spyOn(ActionService, 'run').mockImplementation(async (_prisma, _player, options) => {
      const outcome = await options.execute({
        tx,
        current: {} as never,
        ruleset: classicOgV07J,
        now,
      } as never);
      return { action: options.action, result: outcome.result, changes: [] } as never;
    });

    const result = await TimedFavorService.activate(
      {} as never,
      'player-1',
      'MAMA_ADVICE',
      { actionId: 'action-1' },
    );

    expect(result.result).toMatchObject({
      favorKey: 'MAMA_ADVICE',
      category: 'STREET',
      quantityRemaining: 1,
      startedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
    });
    expect(updates).toHaveLength(1);
    expect(upserts).toHaveLength(1);
  });

  it('refuses activation while a favor kill switch is off', async () => {
    vi.mocked(FavorContentService.isEnabled).mockResolvedValue(false);
    vi.spyOn(ActionService, 'run').mockImplementation(async (_prisma, _player, options) => {
      const outcome = await options.execute({
        tx: {} as never,
        current: {} as never,
        ruleset: classicOgV07J,
        now: new Date(),
      } as never);
      return { action: options.action, result: outcome.result, changes: [] } as never;
    });

    await expect(TimedFavorService.activate(
      {} as never,
      'player-1',
      'MAMA_ADVICE',
      { actionId: 'disabled-1' },
    )).rejects.toMatchObject({ code: 'FAVOR_DISABLED' });
  });

  it('refuses to overwrite a still-active favor in the same category', async () => {
    const tx = {
      playerFavor: {
        findUnique: async () => ({ quantity: 1 }),
      },
      playerActiveFavor: {
        findUnique: async () => ({
          favorKey: 'MAMA_ADVICE',
          expiresAt: new Date('2026-09-22T12:05:00Z'),
        }),
      },
    } as unknown as Db;
    const now = new Date('2026-09-22T12:00:00Z');

    vi.spyOn(ActionService, 'run').mockImplementation(async (_prisma, _player, options) => {
      const outcome = await options.execute({
        tx,
        current: {} as never,
        ruleset: classicOgV07J,
        now,
      } as never);
      return { action: options.action, result: outcome.result, changes: [] } as never;
    });

    await expect(TimedFavorService.activate(
      {} as never,
      'player-1',
      'STREET_FRENZY',
      { actionId: 'action-2' },
    )).rejects.toMatchObject({ code: 'FAVOR_CATEGORY_ACTIVE' });
  });

  it('leaves single-use favors for Phase L', async () => {
    vi.spyOn(ActionService, 'run').mockImplementation(async (_prisma, _player, options) => {
      const outcome = await options.execute({
        tx: {} as never,
        current: {} as never,
        ruleset: classicOgV07J,
        now: new Date(),
      } as never);
      return { action: options.action, result: outcome.result, changes: [] } as never;
    });

    await expect(TimedFavorService.activate(
      {} as never,
      'player-1',
      'TOMMY_VOUCHER',
      { actionId: 'action-3' },
    )).rejects.toMatchObject({ code: 'FAVOR_NOT_TIMED' });
  });
});
