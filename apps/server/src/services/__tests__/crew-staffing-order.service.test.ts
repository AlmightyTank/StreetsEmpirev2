import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerState } from '../action.service.js';
import { CrewRosterService } from '../crew-roster.service.js';
import { CrewStaffingOrderService } from '../crew-staffing-order.service.js';

vi.mock('@streets/rules-engine', () => ({
  dealerRules: (ruleset: { dealerRules?: unknown }) => ruleset.dealerRules ?? null,
  headsUpMinutes: () => 8,
}));

vi.mock('../crew-roster.service.js', () => ({
  CrewRosterService: { sync: vi.fn().mockResolvedValue({ migrated: false }) },
}));

vi.mock('../turf.service.js', () => ({
  TurfService: { holdingEnabled: () => true },
  addCornerGuns: (a: { pistols: number; shotguns: number; tek9s: number; ak47s: number }, b: { pistols: number; shotguns: number; tek9s: number; ak47s: number }) => ({
    pistols: a.pistols + b.pistols,
    shotguns: a.shotguns + b.shotguns,
    tek9s: a.tek9s + b.tek9s,
    ak47s: a.ak47s + b.ak47s,
  }),
  allocateCornerGuns: (source: { pistols: number }, count: number) => source.pistols >= count ? { pistols: count, shotguns: 0, tek9s: 0, ak47s: 0 } : null,
  cornerGunWorthCents: (ruleset: unknown, guns: { pistols: number }) => BigInt(guns.pistols * 100),
  gunsFromTurf: (row: { pistols?: number; shotguns?: number; tek9s?: number; ak47s?: number }) => ({
    pistols: row.pistols ?? 0,
    shotguns: row.shotguns ?? 0,
    tek9s: row.tek9s ?? 0,
    ak47s: row.ak47s ?? 0,
  }),
  turfGunData: (guns: { pistols: number; shotguns: number; tek9s: number; ak47s: number }) => guns,
}));

const now = new Date('2026-10-11T12:00:00Z');

function state(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    cashCents: 0n,
    turns: 100,
    payoutPercent: 0,
    whores: 0,
    thugs: 10,
    woundedThugs: 0,
    condoms: 0,
    medicine: 0,
    crack: 0,
    beer: 0,
    pistols: 10,
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
    businessWhores: 0,
    dealerThugs: 0,
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
    ...overrides,
  };
}

function order(kind: string, targetRef = 'target-1', headcount = 3, settings: Record<string, unknown> = {}) {
  return {
    id: `order-${kind}`,
    kind,
    targetRef,
    citySlug: null,
    districtKey: null,
    headcount,
    settings,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

function tx(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    crewJobPost: { findMany: vi.fn().mockResolvedValue([]), ...((overrides.crewJobPost as object) ?? {}) },
    dealerCrew: { findFirst: vi.fn(), update: vi.fn(), ...((overrides.dealerCrew as object) ?? {}) },
    dealerStaff: { count: vi.fn().mockResolvedValue(0), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), ...((overrides.dealerStaff as object) ?? {}) },
    crewMember: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn(), update: vi.fn(), ...((overrides.crewMember as object) ?? {}) },
    crewMemberEvent: { createMany: vi.fn(), ...((overrides.crewMemberEvent as object) ?? {}) },
    turf: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), ...((overrides.turf as object) ?? {}) },
    turfPush: { findFirst: vi.fn(), ...((overrides.turfPush as object) ?? {}) },
  };
}

const player = { id: 'player-1', roundId: 'round-1', cityId: 'city-1', hideoutLookoutsLevel: 0, racketEffects: null };
const ruleset = {
  crewRoster: { enabled: true },
  supplyNetwork: { enabled: true },
  dealerRules: { maxDealersPerCrew: 5, unitsPerDealer: 20 },
  turf: { corner: { postTurnCost: 4 }, wars: null },
};

describe('1.8.6-I staffing-order hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fills runner orders from available home thugs without spending turns', async () => {
    const db = tx({
      crewJobPost: { findMany: vi.fn().mockResolvedValue([order('RUNNER', 'crew-1', 3)]) },
      dealerCrew: { findFirst: vi.fn().mockResolvedValue({ id: 'crew-1', status: 'ACTIVE' }) },
      crewMember: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([{ id: 'm-1' }, { id: 'm-2' }]),
        updateMany: vi.fn(),
      },
    });

    const result = await CrewStaffingOrderService.apply(db as never, {
      roundPlayerId: 'player-1', ruleset: ruleset as never, now, state: state({ thugs: 5 }), player,
    });

    expect(result.next).toMatchObject({ turns: 100, busyThugs: 2 });
    expect(result.fills).toEqual([expect.objectContaining({ kind: 'RUNNER', assigned: 2, turnsUsed: 0 })]);
    expect(CrewRosterService.sync).toHaveBeenCalledOnce();
    expect(db.crewMember.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assignmentKind: 'RUNNER', assignmentRef: 'crew-1' }),
    }));
  });

  it('does not overfill or duplicate runner orders when a target is listed twice or reapplied', async () => {
    let available = Array.from({ length: 5 }, (_, index) => ({ id: `m-${index + 1}`, dealerStaffId: null }));
    let assigned = 0;
    const db = tx({
      crewJobPost: {
        findMany: vi.fn().mockResolvedValue([
          order('RUNNER', 'crew-1', 3),
          { ...order('RUNNER', 'crew-1', 3), id: 'duplicate-runner-order' },
        ]),
      },
      dealerCrew: { findFirst: vi.fn().mockResolvedValue({ id: 'crew-1', status: 'ACTIVE' }) },
      crewMember: {
        count: vi.fn().mockImplementation(async () => assigned),
        findMany: vi.fn().mockImplementation(async (args: { where: { status: string }; take?: number }) => (
          args.where.status === 'AVAILABLE' ? available.slice(0, args.take) : []
        )),
        updateMany: vi.fn().mockImplementation(async (args: { where: { id: { in: string[] } } }) => {
          const selected = new Set(args.where.id.in);
          const moved = available.filter((member) => selected.has(member.id));
          available = available.filter((member) => !selected.has(member.id));
          assigned += moved.length;
          return { count: moved.length };
        }),
      },
    });
    const input = {
      roundPlayerId: 'player-1', ruleset: ruleset as never, now, state: state({ thugs: 5 }), player,
    };

    const first = await CrewStaffingOrderService.apply(db as never, input);
    const retry = await CrewStaffingOrderService.apply(db as never, { ...input, state: first.next });

    expect(first.next.busyThugs).toBe(3);
    expect(first.fills.reduce((total, fill) => total + fill.assigned, 0)).toBe(3);
    expect(retry.next.busyThugs).toBe(3);
    expect(retry.fills).toEqual([]);
    expect(assigned).toBe(3);
  });

  it('does not post turf when the normal post cost would cross the keep-turn floor', async () => {
    const db = tx({
      crewJobPost: { findMany: vi.fn().mockResolvedValue([order('TURF', 'turf-1', 5, { keepTurns: 10 })]) },
    });

    const result = await CrewStaffingOrderService.apply(db as never, {
      roundPlayerId: 'player-1', ruleset: ruleset as never, now, state: state({ turns: 13, thugs: 5 }), player,
    });

    expect(result.next.turns).toBe(13);
    expect(result.fills).toEqual([]);
    expect(db.turf.findFirst).not.toHaveBeenCalled();
  });

  it('charges the normal turf-post turn cost once for a multi-thug staffing fill', async () => {
    const block = { id: 'turf-1', holderId: 'player-1', cornerThugs: 0, pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 };
    const db = tx({
      crewJobPost: { findMany: vi.fn().mockResolvedValue([order('TURF', 'turf-1', 2, { keepTurns: 10 })]) },
      turf: {
        findFirst: vi.fn().mockResolvedValue(block),
        findUniqueOrThrow: vi.fn().mockResolvedValue(block),
        update: vi.fn(),
      },
      crewMember: {
        findMany: vi.fn().mockResolvedValue([{ id: 'm-1' }, { id: 'm-2' }]),
        updateMany: vi.fn(),
      },
    });

    const result = await CrewStaffingOrderService.apply(db as never, {
      roundPlayerId: 'player-1', ruleset: ruleset as never, now, state: state({ turns: 14, thugs: 2, pistols: 2 }), player,
    });

    expect(result.next).toMatchObject({ turns: 10, postedThugs: 2, pistols: 0 });
    expect(result.fills).toEqual([expect.objectContaining({ kind: 'TURF', assigned: 2, turnsUsed: 4 })]);
    expect(db.turf.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ cornerThugs: 2 }),
    }));
  });

  it('caps corner lookout orders and converts only regular defenders', async () => {
    const db = tx({
      crewJobPost: { findMany: vi.fn().mockResolvedValue([order('CORNER_LOOKOUT', 'turf-1', 10)]) },
      crewMember: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([{ id: 'm-1' }, { id: 'm-2' }]),
        updateMany: vi.fn(),
      },
    });

    const result = await CrewStaffingOrderService.apply(db as never, {
      roundPlayerId: 'player-1', ruleset: ruleset as never, now, state: state(), player,
    });

    expect(db.crewMember.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
    expect(db.crewMember.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assignmentKind: 'CORNER_LOOKOUT', assignmentRef: 'turf-1' }),
    }));
    expect(result.fills).toEqual([expect.objectContaining({ kind: 'CORNER_LOOKOUT', assigned: 2 })]);
  });

  it('caps stash-guard orders and does not inflate posted-thug counts', async () => {
    const db = tx({
      crewJobPost: { findMany: vi.fn().mockResolvedValue([order('STASH_GUARD', 'turf-1', 10)]) },
      crewMember: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue(Array.from({ length: 5 }, (_, index) => ({ id: `m-${index + 1}` }))),
        updateMany: vi.fn(),
      },
    });

    const result = await CrewStaffingOrderService.apply(db as never, {
      roundPlayerId: 'player-1', ruleset: ruleset as never, now, state: state({ thugs: 10, postedThugs: 5 }), player,
    });

    expect(db.crewMember.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    expect(db.crewMember.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ assignmentKind: 'STASH_GUARD', assignmentRef: 'turf-1' }),
    }));
    expect(result.next.postedThugs).toBe(5);
    expect(result.fills).toEqual([expect.objectContaining({ kind: 'STASH_GUARD', assigned: 5 })]);
  });

  it('does not count stale dealer-career links as successfully filled', async () => {
    const db = tx({
      crewJobPost: { findMany: vi.fn().mockResolvedValue([order('DEALER', 'crew-1', 2)]) },
      dealerCrew: { findFirst: vi.fn().mockResolvedValue({ id: 'crew-1', status: 'ACTIVE' }), update: vi.fn() },
      dealerStaff: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'staff-1', experiencePoints: 0 }),
      },
      crewMember: {
        findMany: vi.fn().mockResolvedValue([{ id: 'stale', dealerStaffId: 'bad-staff' }, { id: 'fresh', dealerStaffId: null }]),
        update: vi.fn(),
      },
      crewMemberEvent: { createMany: vi.fn() },
    });

    const result = await CrewStaffingOrderService.apply(db as never, {
      roundPlayerId: 'player-1', ruleset: ruleset as never, now, state: state({ thugs: 2 }), player,
    });

    expect(db.dealerCrew.update).toHaveBeenCalledWith(expect.objectContaining({ data: { capacityUnits: { increment: 20 } } }));
    expect(db.crewMemberEvent.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ memberId: 'fresh' })] });
    expect(result.next.dealerThugs).toBe(1);
    expect(result.fills).toEqual([expect.objectContaining({ kind: 'DEALER', assigned: 1 })]);
  });
});
