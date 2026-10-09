import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classicOgV16F } from '@streets/rulesets';
import { RandomEncounterService } from '../random-encounter.service.js';
import type { PlayerState } from '../action.service.js';

const runMock = vi.hoisted(() => vi.fn());

vi.mock('../action.service.js', () => ({
  ActionService: { run: runMock },
}));

const { RandomEncounterChoiceService } = await import('../random-encounter-choice.service.js');

const state: PlayerState = {
  cashCents: 1_000n,
  turns: 100,
  payoutPercent: 50,
  whores: 0,
  thugs: 0,
  woundedThugs: 0,
  condoms: 2,
  medicine: 0,
  crack: 0,
  beer: 1,
  pistols: 0,
  shotguns: 0,
  tek9s: 0,
  ak47s: 0,
  lowRiders: 0,
  sedans: 0,
  vans: 0,
  damagedLowRiders: 0,
  damagedSedans: 0,
  damagedVans: 0,
  disabledLowRiders: 0,
  disabledSedans: 0,
  disabledVans: 0,
  shotgunUnlocked: false,
  tek9Unlocked: false,
  ak47Unlocked: false,
  heat: 0,
  awayNetWorthCents: 0n,
  postedNetWorthCents: 0n,
  outpostNetWorthCents: 0n,
  busyThugs: 0,
  postedThugs: 0,
  businessThugs: 0,
  dealerThugs: 0,
  businessWhores: 0,
  cleanShiftStreak: 0,
  rocksSuppliedToPip: 0,
  driveBysDone: 0,
  condomsBought: 0,
  medicineBought: 0,
  beerBought: 0,
  pistolsBought: 0,
  raidsDone: 0,
  hideoutSafeRoomLevel: 0,
  hideoutLookoutsLevel: 0,
  hideoutWorkshopLevel: 0,
  hideoutBackOfficeLevel: 0,
  hideoutGarageLevel: 0,
  hideoutWeaponPriority: 'BALANCED',
  hideoutSafeRoomSpecialization: null,
  hideoutLookoutsSpecialization: null,
  hideoutWorkshopSpecialization: null,
  hideoutBackOfficeSpecialization: null,
  pistolStock: 0,
  shotgunStock: 0,
  tek9Stock: 0,
  ak47Stock: 0,
  lowRiderStock: 0,
  condomStock: 0,
  medicineStock: 0,
  beerStock: 0,
  crackStock: 0,
  thugStock: 0,
};

const ruleset = {
  randomEncounters: {
    enabled: true,
    triggers: {
      SCOUT: {
        enabled: true,
        chance: 1,
        cooldownMinutes: 30,
        perKeyCooldownMinutes: 180,
        minTurns: 1,
        entries: [
          {
            key: 'loss',
            title: 'Loss',
            text: 'A little trouble.',
            tone: 'warn',
            weight: 1,
            cash: { minCents: -1_500, maxCents: -1_500 },
          },
        ],
      },
    },
  },
} as never;

function tx(rows: unknown[] = []): any {
  return {
    randomEncounter: {
      findMany: vi.fn(async () => rows),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'encounter-1', ...data })),
    },
  };
}

function choicePrisma(encounter: unknown): any {
  return {
    randomEncounter: {
      findFirst: vi.fn(async () => encounter),
      update: vi.fn(async ({ data }: { data: unknown }) => data),
    },
  };
}

const districtRuleset = {
  randomEncounters: {
    enabled: true,
    triggers: {
      SCOUT: {
        enabled: true,
        chance: 1,
        perKeyCooldownMinutes: 180,
        minTurns: 1,
        entries: [
          {
            key: 'casino-only',
            title: 'Casino only',
            text: 'This should only happen near the casino.',
            tone: 'good',
            weight: 1,
            districts: ['CASINO'],
            cash: { minCents: 500, maxCents: 500 },
          },
          {
            key: 'anywhere',
            title: 'Anywhere',
            text: 'This can happen on any block.',
            tone: 'good',
            weight: 1,
            cash: { minCents: 100, maxCents: 100 },
          },
        ],
      },
    },
  },
} as never;

describe('RandomEncounterService', () => {
  beforeEach(() => {
    runMock.mockReset();
    runMock.mockImplementation(async (db, roundPlayerId, options) => {
      const outcome = await options.execute({
        tx: db,
        current: state,
        roundPlayerId,
      } as never);
      return {
        success: true,
        action: 'RANDOM_ENCOUNTER_CHOICE',
        before: {} as never,
        after: {} as never,
        changes: [],
        result: outcome.result,
      };
    });
  });

  it('caps cash losses at the cash on hand', async () => {
    const settled = await RandomEncounterService.scout({
      tx: tx(),
      roundPlayerId: 'player-1',
      next: state,
      ruleset,
      district: 'LOW_RENT',
      turns: 5,
      now: new Date('2026-10-09T00:00:00Z'),
      rng: () => 0,
    });

    expect(settled.next.cashCents).toBe(0n);
    expect(settled.encounter?.effects.cashCents).toBe(-1_000);
  });

  it('caps supply losses and applies heat effects', async () => {
    const supplyRuleset = {
      randomEncounters: {
        enabled: true,
        triggers: {
          SCOUT: {
            enabled: true,
            chance: 1,
            minTurns: 1,
            entries: [
              {
                key: 'supplies',
                title: 'Supplies',
                text: 'Some of the street stock vanishes.',
                tone: 'warn',
                weight: 1,
                heat: { min: 2, max: 2 },
                supplies: {
                  condoms: { min: -4, max: -4 },
                  beer: { min: -3, max: -3 },
                },
              },
            ],
          },
        },
      },
    } as never;

    const settled = await RandomEncounterService.scout({
      tx: tx(),
      roundPlayerId: 'player-1',
      next: { ...state, condoms: 2, beer: 1, heat: 0 },
      ruleset: supplyRuleset,
      district: 'LOW_RENT',
      turns: 5,
      now: new Date('2026-10-09T00:00:00Z'),
      rng: () => 0,
    });

    expect(settled.next.condoms).toBe(0);
    expect(settled.next.beer).toBe(0);
    expect(settled.next.heat).toBe(2);
    expect(settled.encounter?.effects).toEqual({ heat: 2, condoms: -2, beer: -1 });
  });

  it('skips rolling while the trigger cooldown is active', async () => {
    const db = tx([{ key: 'recent' }]);
    const settled = await RandomEncounterService.scout({
      tx: db,
      roundPlayerId: 'player-1',
      next: state,
      ruleset,
      district: 'LOW_RENT',
      turns: 5,
      now: new Date('2026-10-09T00:00:00Z'),
      rng: () => 0,
    });

    expect(settled).toEqual({ next: state });
  });

  it('skips rolling when chance misses', async () => {
    const db = tx();
    const settled = await RandomEncounterService.scout({
      tx: db,
      roundPlayerId: 'player-1',
      next: state,
      ruleset: {
        randomEncounters: {
          enabled: true,
          triggers: {
            SCOUT: {
              enabled: true,
              chance: 0.25,
              minTurns: 1,
              entries: [
                {
                  key: 'hit',
                  title: 'Hit',
                  text: 'This should not happen.',
                  tone: 'good',
                  weight: 1,
                  cash: { minCents: 100, maxCents: 100 },
                },
              ],
            },
          },
        },
      } as never,
      district: 'LOW_RENT',
      turns: 5,
      now: new Date('2026-10-09T00:00:00Z'),
      rng: () => 0.9,
    });

    expect(settled).toEqual({ next: state });
    expect(db.randomEncounter.create).not.toHaveBeenCalled();
  });

  it('honors district eligibility before picking an encounter', async () => {
    const settled = await RandomEncounterService.scout({
      tx: tx(),
      roundPlayerId: 'player-1',
      next: state,
      ruleset: districtRuleset,
      district: 'LOW_RENT',
      turns: 5,
      now: new Date('2026-10-09T00:00:00Z'),
      rng: () => 0,
    });

    expect(settled.encounter?.key).toBe('anywhere');
    expect(settled.encounter?.effects.cashCents).toBe(100);
  });

  it('skips a key that is still inside its per-key cooldown', async () => {
    const settled = await RandomEncounterService.scout({
      tx: tx([{ key: 'casino-only' }]),
      roundPlayerId: 'player-1',
      next: state,
      ruleset: districtRuleset,
      district: 'CASINO',
      turns: 5,
      now: new Date('2026-10-09T00:00:00Z'),
      rng: () => 0,
    });

    expect(settled.encounter?.key).toBe('anywhere');
  });

  it('rolls travel encounters from the travel trigger', async () => {
    const travelRuleset = {
      randomEncounters: {
        enabled: true,
        triggers: {
          TRAVEL: {
            enabled: true,
            chance: 1,
            minTurns: 0,
            entries: [
              {
                key: 'road',
                title: 'Road',
                text: 'Something happens on the road.',
                tone: 'bad',
                weight: 1,
                heat: { min: 2, max: 2 },
              },
            ],
          },
        },
      },
    } as never;

    const settled = await RandomEncounterService.travel({
      tx: tx(),
      roundPlayerId: 'player-1',
      next: state,
      ruleset: travelRuleset,
      turns: 0,
      now: new Date('2026-10-09T00:00:00Z'),
      rng: () => 0,
    });

    expect(settled.next.heat).toBe(state.heat + 2);
    expect(settled.encounter?.key).toBe('road');
    expect(settled.encounter?.effects.heat).toBe(2);
  });

  it('migrates latest NPC pressure into named encounter families', () => {
    const triggers = classicOgV16F.randomEncounters.triggers as Record<string, { entries: readonly { key: string; title: string }[] } | undefined>;
    const entries = Object.values(triggers).flatMap((trigger) => [...(trigger?.entries ?? [])]);

    expect(classicOgV16F.npcGangs?.enabled).toBe(false);
    expect(classicOgV16F.npcGangs?.spawn?.enabled).toBe(false);
    expect(entries.map((entry) => entry.key)).toEqual(expect.arrayContaining([
      'scout-red-hand-pressure',
      'scout-quiet-money-lead',
      'scout-back-alley-choice',
      'produce-cookhouse-spare-bag',
      'travel-hot-wire-toll',
    ]));
    expect(entries.map((entry) => entry.title).join(' ')).toContain('Red Hand Crew');
    expect(entries.map((entry) => entry.title).join(' ')).toContain('Hot Wire Gang');
  });

  it('returns only unexpired pending encounters for dashboard recovery', async () => {
    const now = new Date('2026-10-09T00:00:00Z');
    const db = {
      randomEncounter: {
        findMany: vi.fn(async () => [
          {
            id: 'encounter-1',
            key: 'choice',
            title: 'Choice',
            text: 'Pick one.',
            tone: 'neutral',
            status: 'PENDING',
            effects: {},
            choices: [
              { key: 'walk', label: 'Walk', text: 'You walk.', effects: {} },
            ],
          },
        ]),
      },
    } as any;

    const pending = await RandomEncounterService.pendingForPlayer(db, 'player-1', now);

    expect(db.randomEncounter.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        roundPlayerId: 'player-1',
        status: 'PENDING',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      }),
    }));
    expect(pending).toEqual([
      expect.objectContaining({
        id: 'encounter-1',
        status: 'PENDING',
        choices: [{ key: 'walk', label: 'Walk', text: 'You walk.', effects: {} }],
      }),
    ]);
  });

  it('marks expired pending choices and rejects them', async () => {
    const db = choicePrisma({
      id: 'encounter-1',
      roundPlayerId: 'player-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 60_000),
      choices: [{ key: 'walk', label: 'Walk', text: 'You walk.', effects: {} }],
    });

    await expect(RandomEncounterChoiceService.resolve(db, 'player-1', 'encounter-1', {
      choice: 'walk',
      actionId: 'action-1',
    })).rejects.toMatchObject({
      code: 'ENCOUNTER_EXPIRED',
      statusCode: 409,
    });

    expect(db.randomEncounter.update).toHaveBeenCalledWith({
      where: { id: 'encounter-1' },
      data: { status: 'EXPIRED' },
    });
  });

  it('caps choice effects and returns the full effect payload', async () => {
    const db = choicePrisma({
      id: 'encounter-1',
      key: 'choice-key',
      title: 'Choice',
      roundPlayerId: 'player-1',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
      choices: [
        {
          key: 'press',
          label: 'Press',
          text: 'You press the lead.',
          effects: { cashCents: -2_000, heat: 2, condoms: -5, beer: -4 },
        },
      ],
    });

    const result = await RandomEncounterChoiceService.resolve(db, 'player-1', 'encounter-1', {
      choice: 'press',
      actionId: 'action-1',
    });

    expect(result.result.effects).toEqual({ cashCents: -1_000, heat: 2, condoms: -2, beer: -1 });
    expect(result.result.cashCents).toBe(-1_000);
    expect(db.randomEncounter.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'RESOLVED',
        selectedChoice: 'press',
        effects: { cashCents: -1_000, heat: 2, condoms: -2, beer: -1 },
      }),
    }));
  });
});
