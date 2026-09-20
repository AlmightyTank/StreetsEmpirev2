import { describe, expect, it } from 'vitest';
import { classicOgV05F, classicOgV06A, classicOgV06C, type Ruleset } from '@streets/rulesets';
import {
  canClaim,
  cornerMinimumFor,
  cornerUpkeep,
  localsAfter,
  localsThugs,
  presenceAfter,
  turfBlocks,
  turfHoldBonus,
  turfPushCombatModel,
  turfRulesetProblems,
  turfTax,
} from '../calculations/turf.js';
import { runTurfSimulation, turfGate } from '../simulations/turf.js';

const ruleset: Ruleset = classicOgV06A;
const before: Ruleset = classicOgV05F;

describe('0.6.0-A the turf ruleset', () => {
  it('holds a block for every district in every city, and none before 0.6.0-A', () => {
    expect(turfBlocks(ruleset)).toHaveLength(Object.keys(ruleset.cities ?? {}).length * 5);
    expect(turfBlocks(ruleset)).toHaveLength(40);
    expect(turfBlocks(before)).toEqual([]);
  });

  it('changes nothing else about a 0.5.0-F round', () => {
    const { meta: _meta, turf: _turf, ...rest } = ruleset as Ruleset & { turf: unknown };
    const { meta: _was, ...wasRest } = before;
    expect(rest).toEqual(wasRest);
  });

  it('is internally consistent', () => {
    expect(turfRulesetProblems(ruleset)).toEqual([]);
    expect(turfRulesetProblems(before)).toEqual([]);
  });

  it('catches a ruleset that mints more than the street loses', () => {
    const broken = {
      ...ruleset,
      turf: {
        ...ruleset.turf!,
        districts: {
          ...ruleset.turf!.districts,
          CASINO: { ...ruleset.turf!.districts.CASINO, taxMint: 0.5, taxBurn: 0.1 },
        },
      },
    } as Ruleset;
    expect(turfRulesetProblems(broken).join(' ')).toContain("the holder's share");
  });

  it('catches a cap that hands one crew a whole city', () => {
    const broken = {
      ...ruleset,
      turf: { ...ruleset.turf!, caps: { ...ruleset.turf!.caps, blocksPerCrewHome: 5 } },
    } as Ruleset;
    expect(turfRulesetProblems(broken).join(' ')).toContain('whole city');
  });
});

describe('0.6.0-A the street tax', () => {
  it('burns the worker\'s share and mints the holder\'s, never moving money between players', () => {
    const take = 1_000_000;
    const { burnCents, mintCents } = turfTax(ruleset, 'CASINO', take);
    expect(burnCents).toBe(Math.round(take * ruleset.turf!.districts.CASINO.taxBurn));
    expect(mintCents).toBe(Math.round(take * ruleset.turf!.districts.CASINO.taxMint));
    // The house never pays out more than the street loses.
    expect(mintCents).toBeLessThan(burnCents);
  });

  it('caps what one payer can mint for a holder in a day', () => {
    const cap = ruleset.turf!.caps.dailyTaxCapCentsPerPayer;
    const tax = turfTax(ruleset, 'CASINO', 100_000_000, cap - 500);
    expect(tax.mintCents).toBe(500);
    expect(turfTax(ruleset, 'CASINO', 100_000_000, cap).mintCents).toBe(0);
    // The worker still loses their share: the cap is on the holder, not the block.
    expect(tax.burnCents).toBeGreaterThan(0);
  });

  it('takes nothing on a round without turf', () => {
    expect(turfTax(before, 'CASINO', 1_000_000)).toEqual({ burnCents: 0, mintCents: 0 });
    expect(turfHoldBonus(before, 'CASINO', true)).toBe(1);
  });

  it('pays the hold bonus only to the holder', () => {
    expect(turfHoldBonus(ruleset, 'CASINO', true)).toBe(ruleset.turf!.districts.CASINO.holdBonus);
    expect(turfHoldBonus(ruleset, 'CASINO', false)).toBe(1);
  });
});

describe('0.6.0-A the locals', () => {
  it('holds the hardest corners in Detroit and the softest in Seattle', () => {
    const detroit = localsThugs(ruleset, { citySlug: 'detroit', district: 'CASINO' });
    const seattle = localsThugs(ruleset, { citySlug: 'seattle', district: 'CASINO' });
    expect(detroit).toBeGreaterThan(seattle);
    expect(seattle).toBeGreaterThan(0);
  });

  it('grows back onto a block it lost, never past its full strength', () => {
    const block = { citySlug: 'atlanta', district: 'LOW_RENT' } as const;
    const full = localsThugs(ruleset, block);
    expect(localsAfter(ruleset, block, 0, 4)).toBe(ruleset.turf!.locals.regrowPerHour * 4);
    expect(localsAfter(ruleset, block, full - 1, 1_000)).toBe(full);
  });
});

describe('0.6.0-A presence and the corner', () => {
  it('fades by half over its half-life', () => {
    const half = ruleset.turf!.presence.halfLifeHours;
    expect(presenceAfter(ruleset, 40, half)).toBeCloseTo(20);
    expect(presenceAfter(ruleset, 40, half * 2)).toBeCloseTo(10);
    expect(presenceAfter(ruleset, 40, 0)).toBe(40);
  });

  it('makes a corner as big as the crew that holds it', () => {
    const casino = ruleset.turf!.districts.CASINO;
    // A small crew posts the block's own minimum; a big one posts its share.
    expect(cornerMinimumFor(ruleset, 'CASINO', 10)).toBe(casino.cornerMinimum);
    expect(cornerMinimumFor(ruleset, 'CASINO', 250)).toBe(Math.ceil(250 * casino.cornerShareOfCrew));
    expect(cornerMinimumFor(ruleset, 'CASINO', 250)).toBeGreaterThan(casino.cornerMinimum);
    // The share follows the pay: a Casino corner costs more of the crew than the slums.
    expect(cornerMinimumFor(ruleset, 'CASINO', 250)).toBeGreaterThan(cornerMinimumFor(ruleset, 'WINO_SLUMS', 250));
    expect(cornerMinimumFor(before, 'CASINO', 250)).toBe(0);
  });

  it('catches a rich block that costs a smaller share of the crew than a poor one', () => {
    const broken = {
      ...ruleset,
      turf: {
        ...ruleset.turf!,
        districts: {
          ...ruleset.turf!.districts,
          CASINO: { ...ruleset.turf!.districts.CASINO, cornerShareOfCrew: 0.01 },
        },
      },
    } as Ruleset;
    expect(turfRulesetProblems(broken).join(' ')).toContain('smaller share of the crew');
  });

  it('will not let a crew claim a block it has never worked, or one it cannot man', () => {
    const turns = ruleset.turf!.presence.turnsToClaim;
    const minimum = ruleset.turf!.districts.CASINO.cornerMinimum;
    expect(canClaim(ruleset, 'CASINO', turns, minimum)).toBe(true);
    expect(canClaim(ruleset, 'CASINO', turns - 1, minimum)).toBe(false);
    expect(canClaim(ruleset, 'CASINO', turns, minimum - 1)).toBe(false);
    // A big crew has to post a corner its own size, not the block's floor.
    expect(canClaim(ruleset, 'CASINO', turns, minimum, 250)).toBe(false);
    expect(canClaim(ruleset, 'CASINO', turns, cornerMinimumFor(ruleset, 'CASINO', 250), 250)).toBe(true);
    expect(canClaim(before, 'CASINO', 1_000, 1_000)).toBe(false);
  });

  it('burns beer and product for as long as the corner stands', () => {
    const day = cornerUpkeep(ruleset, 8, 24);
    expect(day.beer).toBeGreaterThan(0);
    expect(day.product).toBeGreaterThan(0);
    expect(cornerUpkeep(ruleset, 8, 48).beer).toBeGreaterThan(day.beer);
    expect(cornerUpkeep(before, 8, 24)).toEqual({ beer: 0, product: 0 });
  });
});

describe('0.6.0-C turf combat', () => {
  it('uses the turf push edge, variance and turn cost without changing the base raid rules', () => {
    const model = turfPushCombatModel(classicOgV06C);
    expect(model).not.toBeNull();
    expect(model!.turnCost).toBe(classicOgV06C.turf.push.turnCost);
    expect(model!.strength.defenseMultiplier).toBe(classicOgV06C.turf.push.fight.defenseMultiplier);
    expect(model!.strength.variance).toBe(classicOgV06C.turf.push.fight.variance);
    expect(classicOgV06C.combat!.strength.defenseMultiplier).not.toBe(model!.strength.defenseMultiplier);
    expect(turfPushCombatModel(before)).toBeNull();
  });
});

describe('0.6.0-C push balance gate', () => {
  it('keeps an equal push live, while a reinforcement call matters without making a corner untouchable', () => {
    const push = runTurfPushSimulation(classicOgV06C)!;
    expect(push.noBackupWinRate).toBeGreaterThanOrEqual(0.30);
    expect(push.noBackupWinRate).toBeLessThanOrEqual(0.47);
    expect(push.reinforcementWinRate).toBeGreaterThanOrEqual(0.14);
    expect(push.reinforcementWinRate).toBeLessThanOrEqual(0.32);
    expect(push.noBackupWinRate - push.reinforcementWinRate).toBeGreaterThanOrEqual(0.08);
  });
});

describe('0.6.0-A the gate', () => {
  it('passes on the shipped ruleset', () => {
    expect(turfGate(ruleset, runTurfSimulation(ruleset))).toEqual([]);
  });

  it('no block pays more than working the street', () => {
    for (const summary of runTurfSimulation(ruleset)) {
      for (const row of summary.blocks) expect(row.streetShare).toBeLessThan(1);
    }
  });

  it('fails a ruleset where holding pays more than the street', () => {
    const greedy = {
      ...ruleset,
      turf: {
        ...ruleset.turf!,
        districts: {
          ...ruleset.turf!.districts,
          CASINO: { ...ruleset.turf!.districts.CASINO, holdBonus: 4 },
        },
      },
    } as Ruleset;
    expect(turfGate(greedy, runTurfSimulation(greedy)).join(' ')).toContain('holding pays more than working');
  });
});
