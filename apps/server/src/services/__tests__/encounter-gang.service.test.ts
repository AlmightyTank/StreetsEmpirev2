import { describe, expect, it } from 'vitest';
import type { PlayerState } from '../action.service.js';
import { encounterGangMoveFor, encounterGangTargetFits, encounterGangTierAfter } from '../encounter-gang.service.js';

const state = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  cashCents: 50_000n, turns: 20, payoutPercent: 50,
  whores: 10, thugs: 10, woundedThugs: 0,
  condoms: 10, medicine: 10, crack: 20, beer: 10,
  pistols: 10, shotguns: 0, tek9s: 0, ak47s: 0,
  lowRiders: 1, sedans: 0, vans: 0,
  damagedLowRiders: 0, damagedSedans: 0, damagedVans: 0,
  disabledLowRiders: 0, disabledSedans: 0, disabledVans: 0,
  shotgunUnlocked: false, tek9Unlocked: false, ak47Unlocked: false,
  heat: 0, awayNetWorthCents: 0n, postedNetWorthCents: 0n, outpostNetWorthCents: 0n, loanDebtCents: 0n,
  busyThugs: 0, postedThugs: 0, businessThugs: 0, dealerThugs: 0, businessWhores: 0,
  cleanShiftStreak: 0, rocksSuppliedToPip: 0, driveBysDone: 0, condomsBought: 0,
  ...overrides,
} as unknown as PlayerState);

describe('encounter gang behavior', () => {
  it('progresses only through encounter activity', () => {
    expect(encounterGangTierAfter(0)).toBe('SCRUB');
    expect(encounterGangTierAfter(8)).toBe('STREET');
    expect(encounterGangTierAfter(20)).toBe('VETERAN');
    expect(encounterGangTierAfter(40)).toBe('KINGPIN');
  });

  it('uses personality targeting against the triggering player state', () => {
    expect(encounterGangTargetFits('RICHEST', state())).toBe(true);
    expect(encounterGangTargetFits('WEAKEST', state())).toBe(true);
    expect(encounterGangTargetFits('RIDES', state())).toBe(true);
    expect(encounterGangTargetFits('PRODUCT', state())).toBe(true);
    expect(encounterGangTargetFits('DISTRACTED', state({ woundedThugs: 2 }))).toBe(true);
    expect(encounterGangTargetFits('RIDES', state({ lowRiders: 0 }))).toBe(false);
    expect(encounterGangTargetFits('PRODUCT', state({ crack: 0 }))).toBe(false);
  });

  it('puts revenge first and gates turf pushes on low reputation', () => {
    expect(encounterGangMoveFor('SCOUT', 'STEAL_RIDE', true, false)).toBe('REVENGE');
    expect(encounterGangMoveFor('TURF', 'CASH_RAID', false, true)).toBe('TURF_PUSH');
    expect(encounterGangMoveFor('TRAVEL', 'STEAL_RIDE', false, false)).toBe('STEAL_RIDE');
    expect(encounterGangMoveFor('PRODUCE', 'DRUG_HOES', false, false)).toBe('DRUG_HOES');
  });
});
