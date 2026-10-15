import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classicOgV16F } from '@streets/rulesets';
import { RandomEncounterService, triggerChance } from '../random-encounter.service.js';
import type { PlayerState } from '../action.service.js';

const runMock = vi.hoisted(() => vi.fn());
const activityLogMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../action.service.js', () => ({
  ActionService: { run: runMock },
}));

vi.mock('../activity.service.js', () => ({
  ActivityService: { log: activityLogMock },
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
  loanDebtCents: 0n,
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

const firstClassRuleset = {
  meta: { id: 'test-event-ruleset', version: '1.0' , eventSystem: { randomEncounters: 'FIRST_CLASS' } },
  randomEncounters: {
    enabled: true,
    triggers: {
      SCOUT: {
        enabled: true,
        chance: 1,
        cooldownMinutes: 30,
        perKeyCooldownMinutes: 60,
        minTurns: 1,
        entries: [{
          key: 'first-class-choice',
          title: 'Street choice',
          text: 'A small choice arrives with the crew.',
          tone: 'neutral',
          weight: 1,
          choices: [
            { key: 'pay', label: 'Pay $5', text: 'Pay the fee and keep it quiet.', cash: { minCents: -500, maxCents: -500 } },
            { key: 'pass', label: 'Pass', text: 'Keep moving.' },
          ],
        }],
      },
    },
  },
} as any;

function tx(rows: unknown[] = []): any {
  return {
    randomEncounter: {
      findMany: vi.fn(async () => rows),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'encounter-1', ...data })),
    },
  };
}

function firstClassTx(receiptCount = 1): any {
  return {
    roundPlayer: { findUnique: vi.fn(async () => ({ roundId: 'round-1' })) },
    randomEncounter: { create: vi.fn() },
    gameEventOccurrence: {
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async () => ({ id: 'occurrence-1' })),
    },
    gameEventDefinition: {
      upsert: vi.fn(async () => ({ id: 'definition-1' })),
    },
    gameEventParticipation: {
      upsert: vi.fn(async () => ({ id: 'participation-1' })),
    },
    gameEventProgressReceipt: { createMany: vi.fn(async () => ({ count: receiptCount })) },
    gameEventRewardClaim: { createMany: vi.fn(async () => ({ count: 1 })) },
    gameEventHistory: { createMany: vi.fn(async () => ({ count: 2 })) },
  };
}

function choicePrisma(encounter: any, pausedAt: Date | null = null): any {
  return {
    roundPlayer: {
      findUnique: vi.fn(async () => ({ round: { pausedAt } })),
    },
    randomEncounter: {
      findFirst: vi.fn(async () => encounter),
      update: vi.fn(async ({ data }: { data: unknown }) => data),
      updateMany: vi.fn(async ({ where, data }: { where: any; data: any }) => {
        const expired = encounter?.id === where.id
          && encounter?.roundPlayerId === where.roundPlayerId
          && encounter?.status === 'PENDING'
          && encounter?.expiresAt instanceof Date
          && encounter.expiresAt <= where.expiresAt.lte;
        if (expired) Object.assign(encounter, data);
        return { count: expired ? 1 : 0 };
      }),
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
    activityLogMock.mockClear();
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

  it('writes a pending action encounter to first-class event records with a choice receipt', async () => {
    const db = firstClassTx();
    const settled = await RandomEncounterService.scout({
      tx: db,
      roundPlayerId: 'player-1',
      next: state,
      ruleset: firstClassRuleset,
      district: 'LOW_RENT',
      turns: 2,
      now: new Date('2026-10-09T00:00:00Z'),
      rng: () => 0,
    });

    expect(settled.next).toEqual(state);
    expect(settled.encounter).toMatchObject({ id: 'event_participation-1', key: 'first-class-choice', status: 'PENDING' });
    expect(db.randomEncounter.create).not.toHaveBeenCalled();
    expect(db.gameEventDefinition.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ type: 'RANDOM_ENCOUNTER', key: 'SCOUT:first-class-choice', sourceKind: 'RANDOM_ENCOUNTER_ENTRY' }),
    }));
    expect(db.gameEventProgressReceipt.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ sourceKey: 'encounter:player-1:SCOUT:1791504000000', objectiveKey: 'TRIGGERED' })],
      skipDuplicates: true,
    }));
  });

  it('settles immediate first-class encounter effects with a reward claim receipt', async () => {
    const db = firstClassTx();
    const cashRuleset = {
      ...firstClassRuleset,
      randomEncounters: { ...firstClassRuleset.randomEncounters, triggers: {
        SCOUT: { ...firstClassRuleset.randomEncounters.triggers.SCOUT, entries: [{
          key: 'quick-score', title: 'Quick score', text: 'A customer pays early.', tone: 'good', weight: 1,
          cash: { minCents: 500, maxCents: 500 },
        }] },
      } },
    } as never;
    const settled = await RandomEncounterService.scout({
      tx: db,
      roundPlayerId: 'player-1',
      next: state,
      ruleset: cashRuleset,
      district: 'LOW_RENT',
      turns: 2,
      now: new Date('2026-10-09T00:00:00Z'),
      rng: () => 0,
    });

    expect(settled.next.cashCents).toBe(state.cashCents + 500n);
    expect(settled.encounter).toMatchObject({ key: 'quick-score', status: 'RESOLVED', effects: { cashCents: 500 } });
    expect(db.gameEventRewardClaim.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ rewardKey: 'settlement', reward: { cashCents: 500 } })],
      skipDuplicates: true,
    }));
  });

  it('does not apply an encounter when the unique first-class trigger receipt already exists', async () => {
    const db = firstClassTx(0);
    const settled = await RandomEncounterService.scout({
      tx: db,
      roundPlayerId: 'player-1',
      next: state,
      ruleset: { ...firstClassRuleset, randomEncounters: { ...firstClassRuleset.randomEncounters, triggers: {
        SCOUT: { ...firstClassRuleset.randomEncounters.triggers.SCOUT, entries: [{ key: 'cash', title: 'Cash', text: 'A small score.', tone: 'good', weight: 1, cash: { minCents: 500, maxCents: 500 } }] },
      } } } as never,
      district: 'LOW_RENT',
      turns: 2,
      now: new Date('2026-10-09T00:00:00Z'),
      rng: () => 0,
    });

    expect(settled).toEqual({ next: state });
    expect(db.gameEventRewardClaim.createMany).not.toHaveBeenCalled();
  });

  it('enforces the first-class trigger cooldown from event occurrences', async () => {
    const db = firstClassTx();
    db.gameEventOccurrence.findMany.mockResolvedValue([{ definition: { key: 'SCOUT:first-class-choice' } }]);
    const settled = await RandomEncounterService.scout({
      tx: db,
      roundPlayerId: 'player-1',
      next: state,
      ruleset: firstClassRuleset,
      district: 'LOW_RENT',
      turns: 2,
      now: new Date('2026-10-09T00:00:00Z'),
      rng: () => 0,
    });

    expect(settled).toEqual({ next: state });
    expect(db.gameEventOccurrence.findMany).toHaveBeenCalledTimes(1);
    expect(db.gameEventDefinition.upsert).not.toHaveBeenCalled();
  });

  it('settles a selected first-class choice once and records its outcome', async () => {
    const participation = {
      id: 'participation-1',
      progress: { effects: {} },
      state: { choices: [{ key: 'pay', label: 'Pay $5', text: 'Pay the fee and keep it quiet.', effects: { cashCents: -500 } }] },
      occurrence: { id: 'occurrence-1', endsAt: new Date(Date.now() + 60_000), config: { entryKey: 'first-class-choice' }, definition: { key: 'SCOUT:first-class-choice', title: 'Street choice' } },
    };
    const db = {
      roundPlayer: { findUnique: vi.fn(async () => ({ round: { pausedAt: null } })) },
      gameEventParticipation: {
        findFirst: vi.fn(async () => participation),
        update: vi.fn(async () => undefined),
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      gameEventOccurrence: { update: vi.fn(async () => undefined), updateMany: vi.fn(async () => ({ count: 0 })) },
      gameEventProgressReceipt: { createMany: vi.fn(async () => ({ count: 1 })) },
      gameEventRewardClaim: { createMany: vi.fn(async () => ({ count: 1 })) },
      gameEventHistory: { createMany: vi.fn(async () => ({ count: 2 })) },
    } as any;
    runMock.mockImplementationOnce(async (_prisma, _roundPlayerId, options) => {
      const outcome = await options.execute({ tx: db, current: state, now: new Date(), round: { pausedAt: null } });
      return { success: true, action: 'RANDOM_ENCOUNTER_CHOICE', before: {} as never, after: {} as never, changes: [], result: outcome.result };
    });

    const result = await RandomEncounterChoiceService.resolve(db, 'player-1', 'event_participation-1', { choice: 'pay', actionId: 'choice-1' });

    expect(result.result?.effects.cashCents).toBe(-500);
    expect(db.gameEventParticipation.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CLAIMED', progress: { effects: { cashCents: -500 } } }) }));
    expect(db.gameEventRewardClaim.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ rewardKey: 'pay', idempotencyKey: 'encounter:participation-1:choice:pay' })] }));
    expect(db.gameEventHistory.createMany).toHaveBeenCalled();
    expect(activityLogMock).toHaveBeenCalledWith(db, 'player-1', 'RANDOM_ENCOUNTER_CHOICE', expect.objectContaining({ choice: 'pay' }));
  });

  it('expires first-class choices without a penalty after the 24-hour window', async () => {
    const expiredAt = new Date(Date.now() - 60_000);
    const db = {
      roundPlayer: { findUnique: vi.fn(async () => ({ round: { pausedAt: null } })) },
      gameEventParticipation: {
        findFirst: vi.fn(async () => ({ id: 'participation-1', occurrence: { id: 'occurrence-1', endsAt: expiredAt } })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      gameEventOccurrence: { updateMany: vi.fn(async () => ({ count: 1 })) },
      gameEventHistory: { createMany: vi.fn(async () => ({ count: 1 })) },
    } as any;

    await expect(RandomEncounterChoiceService.resolve(db, 'player-1', 'event_participation-1', { choice: 'pay', actionId: 'choice-expired' }))
      .rejects.toMatchObject({ code: 'ENCOUNTER_EXPIRED' });
    expect(runMock).not.toHaveBeenCalled();
    expect(db.gameEventParticipation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'EXPIRED', expiredAt: expect.any(Date) } }));
    expect(db.gameEventHistory.createMany).toHaveBeenCalled();
  });

  it('recovers first-class pending choices and ignores the retired legacy table for the new ruleset', async () => {
    const db = {
      roundPlayer: { findUnique: vi.fn(async () => ({ round: { pausedAt: null } })) },
      randomEncounter: { findMany: vi.fn(async () => []) },
      gameEventParticipation: { findMany: vi.fn(async () => [{
        id: 'participation-1',
        progress: { effects: {} },
        state: { choices: [{ key: 'pay', label: 'Pay', text: 'Pay a small fee.', effects: { cashCents: -100 } }] },
        occurrence: { config: { entryKey: 'first-class-choice', title: 'Street choice', text: 'A small choice.', tone: 'neutral' }, definition: { key: 'SCOUT:first-class-choice' } },
      }]) },
    } as any;

    const pending = await RandomEncounterService.pendingForPlayer(db, 'player-1', new Date('2026-10-09T00:00:00Z'), firstClassRuleset);

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ id: 'event_participation-1', key: 'first-class-choice', status: 'PENDING', choices: [{ key: 'pay' }] });
    expect(db.randomEncounter.findMany).not.toHaveBeenCalled();
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

  it('rolls a per-turn trigger once for every turn spent', () => {
    const perTurn = { chance: 0.01, chanceBasis: 'TURN' as const };
    expect(triggerChance(perTurn, 1)).toBeCloseTo(0.01);
    expect(triggerChance(perTurn, 144)).toBeCloseTo(1 - 0.99 ** 144);
    // A zero-turn action still gets one roll.
    expect(triggerChance(perTurn, 0)).toBeCloseTo(0.01);
    // Without a basis the chance covers the whole action, however long it is.
    expect(triggerChance({ chance: 0.01 }, 144)).toBe(0.01);
    expect(triggerChance({ chance: 1.5, chanceBasis: 'TURN' }, 3)).toBe(1);
  });

  it('lands a per-turn encounter on a long action that one roll would miss', async () => {
    const ruleset = (chanceBasis?: 'TURN') => ({
      randomEncounters: {
        enabled: true,
        triggers: {
          SCOUT: {
            enabled: true,
            chance: 0.01,
            ...(chanceBasis ? { chanceBasis } : {}),
            minTurns: 1,
            entries: [{ key: 'hit', title: 'Hit', text: 'A long night pays off.', tone: 'good', weight: 1, cash: { minCents: 100, maxCents: 100 } }],
          },
        },
      },
    }) as never;
    const scout = (rules: never) => RandomEncounterService.scout({
      tx: tx(),
      roundPlayerId: 'player-1',
      next: state,
      ruleset: rules,
      district: 'LOW_RENT',
      turns: 144,
      now: new Date('2026-10-09T00:00:00Z'),
      // 0.5 misses a single 1% roll but not 144 of them (about 76%).
      rng: () => 0.5,
    });

    expect((await scout(ruleset())).encounter).toBeUndefined();
    expect((await scout(ruleset('TURN'))).encounter?.key).toBe('hit');
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

  it('rolls Store encounters through the shared action-trigger path', async () => {
    const actionRuleset = {
      randomEncounters: {
        enabled: true,
        triggers: {
          STORE: {
            enabled: true,
            chance: 1,
            minTurns: 0,
            entries: [{
              key: 'store-rebate',
              title: 'Rebate',
              text: 'A shopkeeper sends a small rebate.',
              tone: 'good',
              weight: 1,
              cash: { minCents: 500, maxCents: 500 },
            }],
          },
        },
      },
    } as never;
    const db = tx();
    const settled = await RandomEncounterService.action({
      tx: db,
      roundPlayerId: 'player-1',
      next: state,
      ruleset: actionRuleset,
      turns: 0,
      now: new Date('2026-10-09T00:00:00Z'),
      rng: () => 0,
    }, 'STORE');

    expect(settled.next.cashCents).toBe(state.cashCents + 500n);
    expect(settled.encounter?.key).toBe('store-rebate');
    expect(db.randomEncounter.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ trigger: 'STORE', key: 'store-rebate', status: 'RESOLVED' }),
    }));
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

    expect((classicOgV16F as { npcGangs?: unknown }).npcGangs).toBeUndefined();
    expect(classicOgV16F.randomEncounters?.enabled).toBe(true);
    expect(entries.map((entry) => entry.key)).toEqual(expect.arrayContaining([
      'scout-red-hand-pressure',
      'scout-quiet-money-lead',
      'scout-back-alley-choice',
      'produce-cookhouse-spare-bag',
      'travel-hot-wire-toll',
      'store-regulars-rebate',
      'turf-neighbor-contribution',
      'combat-late-payer',
    ]));
    expect(entries.map((entry) => entry.title).join(' ')).toContain('Red Hand Crew');
    expect(entries.map((entry) => entry.title).join(' ')).toContain('Hot Wire Gang');
  });

  it('returns only unexpired pending encounters for dashboard recovery', async () => {
    const now = new Date('2026-10-09T00:00:00Z');
    const db = {
      roundPlayer: {
        findUnique: vi.fn(async () => ({ round: { pausedAt: null } })),
      },
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

  it('keeps pending choices available while the round is paused', async () => {
    const now = new Date('2026-10-10T00:00:00Z');
    const pausedAt = new Date('2026-10-09T00:00:00Z');
    const db = {
      roundPlayer: {
        findUnique: vi.fn(async () => ({ round: { pausedAt } })),
      },
      randomEncounter: {
        findMany: vi.fn(async () => [{
          id: 'encounter-1',
          key: 'choice',
          title: 'Choice',
          text: 'Pick one.',
          tone: 'neutral',
          status: 'PENDING',
          effects: {},
          choices: [{ key: 'walk', label: 'Walk', text: 'You walk.', effects: {} }],
          expiresAt: new Date('2026-10-09T12:00:00Z'),
        }]),
      },
    } as any;

    const pending = await RandomEncounterService.pendingForPlayer(db, 'player-1', now);

    expect(pending).toHaveLength(1);
    expect(db.randomEncounter.findMany).toHaveBeenCalledWith({
      where: { roundPlayerId: 'player-1', status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
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

    expect(db.randomEncounter.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'encounter-1',
        status: 'PENDING',
      }),
      data: { status: 'EXPIRED' },
    }));
    expect(runMock).not.toHaveBeenCalled();
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
