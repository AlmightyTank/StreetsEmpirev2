import { describe, expect, it } from 'vitest';
import { classicOgV05F, classicOgV06A, type Ruleset } from '@streets/rulesets';
import {
  canClaim,
  cornerUpkeep,
  localsAfter,
  localsThugs,
  presenceAfter,
  turfBlocks,
  turfHoldBonus,
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

  it('will not let a crew claim a block it has never worked, or one it cannot man', () => {
    const turns = ruleset.turf!.presence.turnsToClaim;
    const minimum = ruleset.turf!.districts.CASINO.cornerMinimum;
    expect(canClaim(ruleset, 'CASINO', turns, minimum)).toBe(true);
    expect(canClaim(ruleset, 'CASINO', turns - 1, minimum)).toBe(false);
    expect(canClaim(ruleset, 'CASINO', turns, minimum - 1)).toBe(false);
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
