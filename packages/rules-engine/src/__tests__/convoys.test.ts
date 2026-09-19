import { describe, expect, it } from 'vitest';
import { classicOgV05D, classicOgV05E, type Ruleset } from '@streets/rulesets';
import {
  convoyBands,
  headsUpMinutes,
  reconLookaheadMinutes,
  convoyCombatModel,
  convoyLoot,
  homeBackupThugs,
  hoursFromHome,
  reachAt,
  reachSpans,
  reachWindows,
  splitWounds,
} from '../calculations/convoys.js';
import { NO_GUNS, armEscorts, planDriveOn, planLaunch, runNetWorthCents } from '../calculations/runs.js';
import { CONVOY_JOB, RAID_JOB, productSliceEffects } from '../calculations/work-supply.js';
import { convoyGate, runConvoySimulation } from '../simulations/convoys.js';

const ruleset: Ruleset = classicOgV05E;
const NYC = 'new-york-city';
const now = new Date('2026-09-19T12:00:00Z');
const minutes = (value: number) => new Date(now.getTime() + value * 60_000);

describe('0.5.0-E where a run can be hit', () => {
  // New York to Detroit on I-80: ten drive hours, fifty real minutes each way, and two hours in town.
  const stops = planLaunch(ruleset, { home: NYC, to: 'detroit', routeIndex: 0, now }).stops;
  const windows = reachWindows(ruleset, stops);

  it('is near a city only: leaving, in town, coming in, never the open road', () => {
    expect(windows.map((window) => [window.city, window.kind, (window.from.getTime() - now.getTime()) / 60_000, (window.to.getTime() - now.getTime()) / 60_000])).toEqual([
      [NYC, 'leaving', 0, 10],
      ['detroit', 'arriving', 40, 50],
      ['detroit', 'town', 50, 170],
      ['detroit', 'leaving', 170, 180],
      [NYC, 'arriving', 210, 220],
    ]);
    expect(reachAt(windows, minutes(25))).toEqual([]);
    expect(reachAt(windows, minutes(60)).map((window) => window.city)).toEqual(['detroit']);
  });

  it('joins coming in, the town window and leaving into one stretch per city', () => {
    const spans = reachSpans(windows).map((span) => [span.city, (span.from.getTime() - now.getTime()) / 60_000, (span.to.getTime() - now.getTime()) / 60_000, span.kinds]);
    expect(spans).toEqual([
      [NYC, 0, 10, ['leaving']],
      ['detroit', 40, 180, ['arriving', 'town', 'leaving']],
      [NYC, 210, 220, ['arriving']],
    ]);
  });

  it('can be hit by every town it drives through', () => {
    // New York to Miami by way of Atlanta: Atlanta's locals see it go by on the way down,
    // coming in and going out. It comes home straight up I-95.
    const long = planLaunch(ruleset, { home: NYC, to: 'miami-beach', routeIndex: 1, now }).stops;
    const through = reachWindows(ruleset, long).filter((window) => window.city === 'atlanta');
    expect(through.map((window) => window.kind)).toEqual(['passing', 'passing']);
    expect(through[0]!.to.getTime()).toBe(through[1]!.from.getTime());
  });

  it('keeps count of how far it is from home', () => {
    expect(hoursFromHome(ruleset, stops, NYC, minutes(60))).toBe(10);
    expect(hoursFromHome(ruleset, stops, NYC, minutes(215))).toBeCloseTo(1);
    const onward = planDriveOn(ruleset, stops, minutes(60), { home: NYC, to: 'atlanta', routeIndex: 0 }).stops;
    expect(hoursFromHome(ruleset, onward, NYC, minutes(60 + 55 + 60))).toBe(13);
  });
});

describe('0.5.0-E home backup, loot and wounds', () => {
  it('rides out from home in force in the home town, and not at all past the home zone', () => {
    expect(homeBackupThugs(ruleset, NYC, 0, 60)).toBe(30);
    expect(homeBackupThugs(ruleset, NYC, 1, 60)).toBe(15);
    expect(homeBackupThugs(ruleset, NYC, 2, 60)).toBe(0);
    expect(homeBackupThugs(ruleset, NYC, 10, 60)).toBe(0);
    expect(homeBackupThugs(classicOgV05D, NYC, 0, 60)).toBe(0);
  });

  it('takes a rolled share of cash and cargo, no more than the fit attackers carry', () => {
    const rules = ruleset.travel!.convoys!;
    const loot = convoyLoot(ruleset, { runCashCents: 10_000_000n, cargo: { COCAINE: 600, WEED: 400 }, fitAttackers: 5, rng: () => 0.99 });
    expect(loot.cashPercent).toBe(rules.loot.cashPercent.max);
    expect(loot.cashCents).toBe(BigInt(5 * rules.loot.cashPerAttackerCents));
    expect(Object.values(loot.cargo).reduce((sum, units) => sum + units, 0)).toBe(5 * rules.loot.cargoPerAttacker);
    expect(loot.cargo.COCAINE).toBeGreaterThan(loot.cargo.WEED!);
    const small = convoyLoot(ruleset, { runCashCents: 100_000n, cargo: { COCAINE: 10 }, fitAttackers: 50, rng: () => 0 });
    expect(small.cashCents).toBe(100_000n * BigInt(rules.loot.cashPercent.min) / 100n);
    expect(small.cargo.COCAINE).toBe(Math.floor(10 * rules.loot.cargoPercent.min / 100));
  });

  it('spreads wounds across escorts and backup by size, never more than there were', () => {
    const split = splitWounds(7, { escorts: 10, home: 20, owner: 0, 'ally:x': 5 });
    expect(Object.values(split).reduce((sum, units) => sum + units, 0)).toBe(7);
    expect(split.home).toBeGreaterThan(split.escorts!);
    expect(splitWounds(99, { escorts: 3 })).toEqual({ escorts: 3 });
  });

  it('reads a convoy in bands, never exactly', () => {
    expect(convoyBands({ cashCents: 500_000n, cargoUnits: 0, capacity: 1500, escorts: 0 })).toEqual({ cash: 'light', cargo: 'empty', escort: 'none' });
    expect(convoyBands({ cashCents: 50_000_000n, cargoUnits: 1400, capacity: 1500, escorts: 30 })).toEqual({ cash: 'heavy', cargo: 'full', escort: 'heavy' });
  });

  it('fights with the product\'s defense on the road, like on the block', () => {
    const key = Object.keys(ruleset.products!).find((product) => (ruleset.products![product] as { effects?: { combat?: unknown } }).effects?.combat)!;
    const defending = productSliceEffects(ruleset, key, 'fighters', CONVOY_JOB).takeMultiplier;
    const attacking = productSliceEffects(ruleset, key, 'fighters', RAID_JOB).takeMultiplier;
    expect(defending).toBe(productSliceEffects(ruleset, key, 'fighters', 'DEFENSE').takeMultiplier);
    expect(typeof attacking).toBe('number');
  });

  it('plays the raid engine with the road\'s own strength roll', () => {
    const model = convoyCombatModel(ruleset)!;
    expect(model.strength.defenseMultiplier).toBe(ruleset.travel!.convoys!.fight.defenseMultiplier);
    expect(model.strength.variance).toBe(ruleset.travel!.convoys!.fight.variance);
    expect(ruleset.combat!.strength.defenseMultiplier).toBe(1.1);
    expect(convoyCombatModel(classicOgV05D)).toBeNull();
  });
});

describe('0.5.0-E armed escorts and lookouts', () => {
  it('arms escorts one gun each, the best first, as far as the arsenal goes', () => {
    expect(armEscorts(ruleset, 6, { pistols: 20, shotguns: 3, tek9s: 0, ak47s: 1 })).toEqual({ pistols: 2, shotguns: 3, tek9s: 0, ak47s: 1 });
    expect(armEscorts(ruleset, 10, { pistols: 2, shotguns: 0, tek9s: 1, ak47s: 0 })).toEqual({ pistols: 2, shotguns: 0, tek9s: 1, ak47s: 0 });
    expect(armEscorts(ruleset, 0, { pistols: 5, shotguns: 5, tek9s: 5, ak47s: 5 })).toEqual(NO_GUNS);
  });

  it('counts the escorts\' guns in the run\'s net worth, so arming them moves nothing', () => {
    const bare = runNetWorthCents(ruleset, { cashCents: 0n, lowRiders: 1, escortThugs: 2, cargo: {} });
    const armed = runNetWorthCents(ruleset, { cashCents: 0n, lowRiders: 1, escortThugs: 2, cargo: {}, guns: { ...NO_GUNS, pistols: 2 } });
    expect(armed - bare).toBe(BigInt(2 * ruleset.economy.netWorth.perPistolCents));
  });

  it('gives the owner a few minutes of heads-up at most, and a recon a little more reach', () => {
    expect(headsUpMinutes(ruleset, 0)).toBe(0);
    expect(headsUpMinutes(ruleset, 5)).toBeCloseTo(4);
    expect(headsUpMinutes(ruleset, 5)).toBeLessThan(ruleset.travel!.convoys!.warningMinutes);
    expect(reconLookaheadMinutes(ruleset, 0)).toBe(10);
    expect(reconLookaheadMinutes(ruleset, 5)).toBe(30);
  });
});

describe('0.5.0-E gate', () => {
  it('keeps hijack win rates in band with and without backup', () => {
    expect(convoyGate(runConvoySimulation(ruleset))).toEqual([]);
  });
});
