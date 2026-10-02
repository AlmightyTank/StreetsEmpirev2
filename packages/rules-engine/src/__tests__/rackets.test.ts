import { describe, expect, it } from 'vitest';
import { classicOgV11B, classicOgV11C, type Ruleset } from '@streets/rulesets';
import {
  BUSINESS_KEYS,
  businessGate,
  headsUpMinutes,
  launderAllowance,
  mergeRacketEffect,
  racketCargoShare,
  racketCashPerHour,
  racketGetawayShare,
  racketHeadsUpMinutes,
  racketHeatPerHour,
  racketProductStorage,
  racketRaidDefensePercent,
  racketReconDiscount,
  racketRulesetProblems,
  racketRunStopCut,
  racketStorePrice,
  racketStrength,
  racketSwitchOpensAt,
  racketVehicleRecovery,
  racketsFor,
  readRacketEffects,
  roadStopChances,
  runBusinessSimulation,
  runCapacity,
  runLaunderingSimulation,
} from '../index.js';

const ruleset = classicOgV11C as unknown as Ruleset;

/** A copy of the ruleset with one racket's effect replaced. */
function withEffect(key: keyof typeof classicOgV11C.business.rackets.catalog, effect: object): Ruleset {
  const rackets = classicOgV11C.business.rackets;
  return {
    ...classicOgV11C,
    business: {
      ...classicOgV11C.business,
      rackets: { ...rackets, catalog: { ...rackets.catalog, [key]: { ...rackets.catalog[key], effect } } },
    },
  } as unknown as Ruleset;
}

describe('1.1.0-C rackets ruleset', () => {
  it('adds only the racket catalog on top of B', () => {
    const { meta: _meta, business: { rackets: _rackets, ...cRules }, ...cRest } = classicOgV11C;
    const { meta: _was, business: bRules, ...bRest } = classicOgV11B;
    expect(cRules).toEqual(bRules);
    expect(cRest).toEqual(bRest);
    expect(racketRulesetProblems(ruleset)).toEqual([]);
  });

  it('gives every business exactly two rackets', () => {
    for (const business of BUSINESS_KEYS) expect(racketsFor(ruleset, business)).toHaveLength(2);
    expect(racketsFor(classicOgV11B as unknown as Ruleset, 'BAR')).toEqual([]);
  });

  it('refuses rackets that beat the system they hook', () => {
    expect(racketRulesetProblems(withEffect('INFORMATION_NETWORK', { kind: 'HEADS_UP', minutes: 3 }))).toEqual([
      'Information network must stay under half of what Lookouts give.',
    ]);
    expect(racketRulesetProblems(withEffect('LOOSE_LIPS', { kind: 'RECON_DISCOUNT', turns: 2 }))).toEqual([
      'Loose lips must leave paid recon costing at least a turn.',
    ]);
    expect(racketRulesetProblems(withEffect('PRODUCT_STORAGE', { kind: 'PRODUCT_STORAGE', units: 60 }))).toEqual([
      'Product storage must stay under half of what the Safe Room seals.',
    ]);
    expect(racketRulesetProblems(withEffect('PILLOW_TALK', { kind: 'RAID_DEFENSE', percent: 6 }))).toEqual([
      'Pillow talk must stay under half of what Lookouts give.',
    ]);
    expect(racketRulesetProblems(withEffect('BEER_SUPPLY', { kind: 'STORE_PRICE', store: 'CORNER', items: ['BEER'], buyDiscountPercent: 25 }))).toEqual([
      'Beer supply may only shade a store\'s price a little (10% at most).',
    ]);
  });
});

describe('1.1.0-C racket strength and effects', () => {
  it('scales with level and staffing, and is nothing when closed', () => {
    expect(racketStrength(ruleset, { level: 5, staff: 3, requiredStaff: 3 })).toBe(1);
    expect(racketStrength(ruleset, { level: 1, staff: 1, requiredStaff: 1 })).toBe(0.5);
    expect(racketStrength(ruleset, { level: 5, staff: 1, requiredStaff: 2 })).toBe(0.5);
    expect(racketStrength(ruleset, { level: 3, staff: 0, requiredStaff: 2 })).toBe(0);
    expect(racketStrength(ruleset, { level: 0, staff: 0, requiredStaff: 0 })).toBe(0);
  });

  it('reads stored effects defensively and keeps the stronger of two businesses', () => {
    expect(readRacketEffects({ LOOSE_LIPS: 0.5, NOPE: 1, BAR: 'x', FENCING: -1, RUN_MODS: 4 })).toEqual({ LOOSE_LIPS: 0.5, RUN_MODS: 1 });
    expect(readRacketEffects(null)).toEqual({});
    expect(readRacketEffects([1, 2])).toEqual({});
    const merged = mergeRacketEffect(mergeRacketEffect({}, 'FENCING', 0.5), 'FENCING', 0.875);
    expect(mergeRacketEffect(merged, 'FENCING', 0.6)).toEqual({ FENCING: 0.875 });
  });

  it('turns each effect into a small edge', () => {
    const full = {
      INFORMATION_NETWORK: 1, LOOSE_LIPS: 1, PILLOW_TALK: 1, VEHICLE_RECOVERY: 1, RUN_MODS: 1,
      GETAWAY_CARS: 1, PRODUCT_STORAGE: 1, SHIPMENT_CAPACITY: 1,
    } as const;
    expect(racketHeadsUpMinutes(ruleset, full)).toBe(2);
    expect(racketReconDiscount(ruleset, full, 2)).toBe(1);
    // Paid recon always keeps a turn.
    expect(racketReconDiscount(ruleset, full, 1)).toBe(0);
    expect(racketRaidDefensePercent(ruleset, full)).toBe(4);
    expect(racketVehicleRecovery(ruleset, full)).toBe(0.4);
    expect(racketRunStopCut(ruleset, full)).toBe(0.15);
    expect(racketGetawayShare(ruleset, full)).toBe(0.25);
    expect(racketProductStorage(ruleset, full)).toBe(40);
    expect(racketCargoShare(ruleset, full)).toBe(0.1);
    expect(racketProductStorage(ruleset, { PRODUCT_STORAGE: 0.5 })).toBe(20);
    expect(racketHeadsUpMinutes(classicOgV11B as unknown as Ruleset, full)).toBe(0);
  });

  it('shades only the store and items a racket hooks', () => {
    expect(racketStorePrice(ruleset, { BEER_SUPPLY: 1 }, 'CORNER', 'BEER')).toEqual({ buyDiscountPercent: 10, sellBonusPercent: 0 });
    expect(racketStorePrice(ruleset, { BEER_SUPPLY: 0.5 }, 'CORNER', 'BEER')).toEqual({ buyDiscountPercent: 5, sellBonusPercent: 0 });
    expect(racketStorePrice(ruleset, { BEER_SUPPLY: 1 }, 'CORNER', 'CONDOM')).toEqual({ buyDiscountPercent: 0, sellBonusPercent: 0 });
    expect(racketStorePrice(ruleset, { FENCING: 1 }, 'TOMMY', 'AK47')).toEqual({ buyDiscountPercent: 0, sellBonusPercent: 10 });
    expect(racketStorePrice(ruleset, { ECSTASY_DEMAND: 1 }, 'PIP', 'ECSTASY')).toEqual({ buyDiscountPercent: 0, sellBonusPercent: 8 });
    expect(racketStorePrice(ruleset, { STOLEN_LOW_RIDERS: 1 }, 'CHARLIE', 'LOW_RIDER')).toEqual({ buyDiscountPercent: 8, sellBonusPercent: 0 });
  });

  it('pays cash rackets from the front and charges Heat, which Wash & fold cuts for the others', () => {
    expect(racketCashPerHour(ruleset, 'HOUSE_ALWAYS_WINS', 10_000)).toBe(4_500);
    expect(racketCashPerHour(ruleset, 'LOOSE_LIPS', 10_000)).toBe(0);
    expect(racketCashPerHour(ruleset, null, 10_000)).toBe(0);
    expect(racketHeatPerHour(ruleset, 'VIP_ROOM', 1)).toBe(5);
    expect(racketHeatPerHour(ruleset, 'VIP_ROOM', 0.5, 0.4)).toBeCloseTo(1.5);
    expect(racketHeatPerHour(ruleset, 'WASH_AND_FOLD', 1, 0.4)).toBe(0);
    expect(racketHeatPerHour(ruleset, 'VIP_ROOM', 0)).toBe(0);
  });

  it('locks a switch for the cooldown', () => {
    const since = new Date('2026-10-01T00:00:00Z');
    expect(racketSwitchOpensAt(ruleset, since, new Date('2026-10-01T06:00:00Z'))?.toISOString()).toBe('2026-10-01T12:00:00.000Z');
    expect(racketSwitchOpensAt(ruleset, since, new Date('2026-10-01T12:00:00Z'))).toBeNull();
    expect(racketSwitchOpensAt(ruleset, null, since)).toBeNull();
  });
});

describe('1.1.0-C hooks into existing systems', () => {
  it('adds Information network minutes on top of Lookouts', () => {
    expect(headsUpMinutes(ruleset, 2)).toBeCloseTo(1.6);
    expect(headsUpMinutes(ruleset, 2, { INFORMATION_NETWORK: 1 })).toBeCloseTo(3.6);
    expect(headsUpMinutes(ruleset, 2, {})).toBeCloseTo(1.6);
  });

  it('packs a Low-Rider fuller with Shipment capacity', () => {
    expect(runCapacity(ruleset, 2)).toBe(1_500);
    expect(runCapacity(ruleset, 2, 0.1)).toBe(1_650);
  });

  it('cuts every road\'s stop chance with Run mods', () => {
    const input = { route: ['new-york-city', 'detroit'], cargoUnits: 750, escorts: 0, heat: 0 };
    const plain = roadStopChances(ruleset, input)[0]!.chance;
    const modded = roadStopChances(ruleset, { ...input, stopCut: 0.15 })[0]!.chance;
    expect(modded).toBeCloseTo(plain * 0.85);
  });
});

describe('1.1.0-C laundering caps', () => {
  it('never lets a crew wash more than the day or round allows', () => {
    expect(launderAllowance(ruleset, { today: 0, round: 0 })).toBe(48);
    expect(launderAllowance(ruleset, { today: 40, round: 0 })).toBe(8);
    expect(launderAllowance(ruleset, { today: 0, round: 470 })).toBe(10);
    expect(launderAllowance(ruleset, { today: 48, round: 48 })).toBe(0);
    expect(launderAllowance(classicOgV11B as unknown as Ruleset, { today: 0, round: 0 })).toBe(0);
  });

  it('holds a full round of both laundering rackets under the caps', () => {
    const summary = runLaunderingSimulation(ruleset)!;
    expect(summary.uncappedPerDay).toBeGreaterThan(summary.dailyCap);
    expect(summary.maxDay).toBe(summary.dailyCap);
    expect(summary.round).toBe(summary.roundCap);
    expect(summary.daysToRoundCap).toBe(10);
    expect(runLaunderingSimulation(classicOgV11B as unknown as Ruleset)).toBeNull();
  });

  it('passes the business gate with cash rackets on', () => {
    expect(businessGate(ruleset, runBusinessSimulation(ruleset))).toEqual([]);
  });
});
