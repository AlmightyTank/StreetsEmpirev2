import { describe, expect, it } from 'vitest';
import { classicOgV08H, classicOgV11A, type Ruleset } from '@streets/rulesets';
import {
  BUSINESS_KEYS,
  allyCutCents,
  allyCutShare,
  allyThugCap,
  averageOutputShare,
  blockTier,
  blockWarFatigue,
  businessIncomeCentsPerHour,
  businessLevelCostCents,
  businessLots,
  businessLotsInRound,
  businessRulesetProblems,
  businessStaff,
  businessTotalCostCents,
  businessUpkeep,
  dormantHoursToEmpty,
  dormantLevel,
  dormantTier,
  fatigueAfter,
  fatigueOutputShare,
  fatigueRecoveryHours,
  localsBusinessBonus,
  localsThugsWithBusinesses,
  lotsOpen,
  registerCapCents,
  siegeHoursToWin,
  tierAfterTake,
  torchOpen,
  torchResult,
} from '../calculations/business.js';
import { localsThugs } from '../calculations/turf.js';
import { businessGate, runBusinessSimulation, runBusinessWarTimings } from '../simulations/business.js';

const ruleset: Ruleset = classicOgV11A;
const before: Ruleset = classicOgV08H;
const business = classicOgV11A.business;

function broken(patch: Partial<NonNullable<Ruleset['business']>>): Ruleset {
  return { ...ruleset, business: { ...business, ...patch } } as Ruleset;
}

describe('1.1.0-A the business ruleset', () => {
  it('puts three lots on every one of the forty blocks, and none before 1.1.0-A', () => {
    expect(businessLotsInRound(ruleset)).toHaveLength(120);
    expect(businessLotsInRound(before)).toEqual([]);
    expect(businessLots(before, { citySlug: 'detroit', district: 'CASINO' })).toEqual([]);
  });

  it('changes nothing else about a 0.8.0-H round', () => {
    const { meta: _meta, business: _business, ...rest } = ruleset as Ruleset & { business: unknown };
    const { meta: _was, ...wasRest } = before;
    expect(rest).toEqual(wasRest);
  });

  it('is internally consistent', () => {
    expect(businessRulesetProblems(ruleset)).toEqual([]);
    expect(businessRulesetProblems(before)).toEqual([]);
  });

  it('places every business on some lot, with the lots the roadmap lists', () => {
    const placed = new Set(Object.values(business.lots).flat());
    for (const key of BUSINESS_KEYS) expect(placed.has(key)).toBe(true);
    expect(business.lots.CASINO).toEqual(['CASINO_FRONT', 'BAR', 'PAWN_SHOP']);
    expect(business.lots.NIGHTCLUB).toEqual(['NIGHTCLUB', 'STRIP_CLUB', 'BAR']);
    expect(business.lots.URBAN_GHETTO[0]).toBe('CHOP_SHOP');
  });

  it('gives every city one signature business, marked on its lot', () => {
    expect(Object.keys(business.signatures).sort()).toEqual(Object.keys(ruleset.cities ?? {}).sort());
    const vegas = businessLots(ruleset, { citySlug: 'las-vegas', district: 'CASINO' });
    expect(vegas[0]).toEqual({ lot: 1, business: 'CASINO_FRONT', signature: true });
    expect(vegas[1]!.signature).toBe(false);
    const signed = businessIncomeCentsPerHour(ruleset, { citySlug: 'las-vegas', district: 'CASINO', business: 'CASINO_FRONT', level: 1 });
    const plain = businessIncomeCentsPerHour(ruleset, { citySlug: 'detroit', district: 'CASINO', business: 'CASINO_FRONT', level: 1 });
    expect(signed / plain).toBeCloseTo(business.signatures['las-vegas']!.multiplier);
  });

  it('staffs the Strip Club with girls and everything else with thugs', () => {
    for (const key of BUSINESS_KEYS) {
      expect(business.catalog[key].staff).toBe(key === 'STRIP_CLUB' ? 'WHORES' : 'THUGS');
    }
    expect(businessRulesetProblems(broken({
      catalog: { ...business.catalog, BAR: { ...business.catalog.BAR, staff: 'WHORES' } },
    })).join(' ')).toContain('Bar must be staffed by thugs');
  });

  it('catches an ally cut over half, a cap above the declarer, or a second ally', () => {
    expect(businessRulesetProblems(broken({ allies: { ...business.allies, maxCutShare: 0.6 } })).join(' ')).toContain('capped at half');
    expect(businessRulesetProblems(broken({ allies: { ...business.allies, maxShareOfDeclarer: 1.5 } })).join(' ')).toContain('what the declarer committed');
    expect(businessRulesetProblems(broken({ allies: { ...business.allies, maxPerSide: 2 } })).join(' ')).toContain('exactly one ally');
  });

  it('catches a siege a sleeping holder cannot answer, and torching past the Fed sweep', () => {
    expect(businessRulesetProblems(broken({ wars: { ...business.wars, siegeHours: 6 } })).join(' ')).toContain("night's sleep");
    expect(businessRulesetProblems(broken({ torch: { ...business.torch, closedFinalHours: 12 } })).join(' ')).toContain('Fed sweep');
  });

  it('needs turf to sit on', () => {
    const { turf: _turf, ...noTurf } = ruleset as Ruleset & { turf: unknown };
    expect(businessRulesetProblems(noTurf as Ruleset).join(' ')).toContain('no turf');
    expect(businessLots(noTurf as Ruleset, { citySlug: 'detroit', district: 'CASINO' })).toEqual([]);
  });
});

describe('1.1.0-A building and running a business', () => {
  it('earns more with every level, and nothing on an empty lot', () => {
    const at = (level: number) => businessIncomeCentsPerHour(ruleset, { citySlug: 'atlanta', district: 'NIGHTCLUB', business: 'NIGHTCLUB', level });
    expect(at(0)).toBe(0);
    for (let level = 2; level <= business.levels.maxLevel; level++) expect(at(level)).toBeGreaterThan(at(level - 1));
    expect(at(business.levels.maxLevel + 1)).toBe(0);
    expect(businessIncomeCentsPerHour(before, { citySlug: 'atlanta', district: 'NIGHTCLUB', business: 'NIGHTCLUB', level: 1 })).toBe(0);
  });

  it('earns more on a richer block', () => {
    const bar = (district: 'CASINO' | 'NIGHTCLUB') => businessIncomeCentsPerHour(ruleset, { citySlug: 'detroit', district, business: 'BAR', level: 1 });
    expect(bar('CASINO')).toBeGreaterThan(bar('NIGHTCLUB'));
  });

  it('runs an away business at a lower ceiling than one at home', () => {
    const home = businessIncomeCentsPerHour(ruleset, { citySlug: 'detroit', district: 'URBAN_GHETTO', business: 'CHOP_SHOP', level: 3 });
    const away = businessIncomeCentsPerHour(ruleset, { citySlug: 'detroit', district: 'URBAN_GHETTO', business: 'CHOP_SHOP', level: 3, away: true });
    expect(away / home).toBeCloseTo(business.awayOutputShare);
  });

  it('needs more staff and more cash with every level', () => {
    expect(businessStaff(ruleset, 'CASINO_FRONT', 0)).toBe(0);
    expect(businessStaff(ruleset, 'CASINO_FRONT', 1)).toBe(business.catalog.CASINO_FRONT.baseStaff);
    expect(businessStaff(ruleset, 'CASINO_FRONT', 5)).toBeGreaterThan(businessStaff(ruleset, 'CASINO_FRONT', 1));
    expect(businessLevelCostCents(ruleset, 'BAR', 1)).toBe(business.catalog.BAR.buildCostCents);
    expect(businessLevelCostCents(ruleset, 'BAR', 5)).toBeGreaterThan(businessLevelCostCents(ruleset, 'BAR', 4));
    expect(businessTotalCostCents(ruleset, 'BAR', 5)).toBe(
      [1, 2, 3, 4, 5].reduce((sum, level) => sum + businessLevelCostCents(ruleset, 'BAR', level), 0),
    );
  });

  it('charges more to build on a block that is still shaken', () => {
    const calm = businessLevelCostCents(ruleset, 'BAR', 2, 0);
    expect(businessLevelCostCents(ruleset, 'BAR', 2, business.fatigue.upgradeMarkupAbove)).toBe(calm);
    expect(businessLevelCostCents(ruleset, 'BAR', 2, business.fatigue.upgradeMarkupAbove + 1)).toBe(Math.round(calm * (1 + business.levels.fatiguedUpgradeMarkup)));
  });

  it('burns supply for as long as its staff work, and fills a register about a day deep', () => {
    expect(businessUpkeep(ruleset, 4, 24).beer).toBeGreaterThan(0);
    expect(businessUpkeep(ruleset, 0, 24)).toEqual({ beer: 0, product: 0 });
    expect(businessUpkeep(before, 4, 24)).toEqual({ beer: 0, product: 0 });
    expect(registerCapCents(ruleset, 10_000)).toBe(10_000 * business.register.capHours);
  });
});

describe('1.1.0-A block tiers', () => {
  const { establishedHours, strongholdHours, establishedLotOneLevel, strongholdLevels } = business.tiers;

  it('opens lots with uninterrupted holding and business levels', () => {
    expect(blockTier(ruleset, { heldHours: 0, levels: [5, 5, 5] })).toBe('FOOTHOLD');
    expect(blockTier(ruleset, { heldHours: establishedHours, levels: [establishedLotOneLevel - 1] })).toBe('FOOTHOLD');
    expect(blockTier(ruleset, { heldHours: establishedHours, levels: [establishedLotOneLevel] })).toBe('ESTABLISHED');
    expect(blockTier(ruleset, { heldHours: strongholdHours, levels: [establishedLotOneLevel] })).toBe('ESTABLISHED');
    expect(blockTier(ruleset, { heldHours: strongholdHours, levels: [3, strongholdLevels - 3] })).toBe('STRONGHOLD');
    expect(lotsOpen(ruleset, 'FOOTHOLD')).toBe(1);
    expect(lotsOpen(ruleset, 'STRONGHOLD')).toBe(3);
  });

  it('drops one tier on a Take, and starts the new holder at that tier\'s threshold', () => {
    expect(tierAfterTake(ruleset, 'STRONGHOLD')).toEqual({ tier: 'ESTABLISHED', heldHours: establishedHours });
    expect(tierAfterTake(ruleset, 'ESTABLISHED')).toEqual({ tier: 'FOOTHOLD', heldHours: 0 });
    expect(tierAfterTake(ruleset, 'FOOTHOLD')).toEqual({ tier: 'FOOTHOLD', heldHours: 0 });
  });
});

describe('1.1.0-A war fatigue and block wars', () => {
  it('matches the roadmap\'s worked examples', () => {
    const take = blockWarFatigue(ruleset, { fights: 1, siegeHours: 12, outcome: 'TAKE' });
    expect(take).toBe(64);
    expect(fatigueOutputShare(ruleset, take)).toBeCloseTo(0.36);
    expect(fatigueRecoveryHours(ruleset, take)).toBeCloseTo(51.2);
    expect(blockWarFatigue(ruleset, { fights: 1, siegeHours: 6, outcome: 'CONCEDE' })).toBe(37);
    expect(blockWarFatigue(ruleset, { fights: 2, siegeHours: 6, outcome: 'DEFENDED' })).toBe(32);
    expect(blockWarFatigue(ruleset, { fights: 1, siegeHours: 12, outcome: 'SACK' })).toBe(74);
    expect(averageOutputShare(ruleset, take, 36)).toBeCloseTo(0.585, 2);
  });

  it('never lets fatigue past its cap, so a business always makes something', () => {
    expect(blockWarFatigue(ruleset, { startFatigue: 70, fights: 3, siegeHours: 12, outcome: 'SACK' })).toBe(business.fatigue.max);
    expect(fatigueOutputShare(ruleset, 1_000)).toBeCloseTo(1 - business.fatigue.max / 100);
  });

  it('heals slower on a scarred block', () => {
    expect(fatigueAfter(ruleset, 60, 10)).toBeCloseTo(60 - business.fatigue.recoveryPerHour * 10);
    expect(fatigueAfter(ruleset, 60, 10, true)).toBeGreaterThan(fatigueAfter(ruleset, 60, 10));
    expect(fatigueAfter(ruleset, 10, 1_000)).toBe(0);
  });

  it('runs a twelve-hour siege alone and an eight-hour one with an ally at the full cap', () => {
    expect(siegeHoursToWin(ruleset, 0)).toBeCloseTo(12);
    expect(siegeHoursToWin(ruleset, 1)).toBeCloseTo(8);
    // A bigger ally than the cap is still only the cap.
    expect(siegeHoursToWin(ruleset, 3)).toBeCloseTo(8);
    expect(siegeHoursToWin(ruleset, 0, 60)).toBeCloseTo(12 * 0.4);
  });

  it('caps an ally at the declarer\'s squad, and the cut at half in steps of ten percent', () => {
    expect(allyThugCap(ruleset, 20)).toBe(20);
    expect(allyCutShare(ruleset, 0.3)).toBeCloseTo(0.3);
    expect(allyCutShare(ruleset, 0.35)).toBeCloseTo(0.3);
    expect(allyCutShare(ruleset, 0.9)).toBeCloseTo(0.5);
    expect(allyCutShare(ruleset, -1)).toBe(0);
    expect(allyCutCents(ruleset, 100_000, 0.3, true)).toBe(30_000);
    // Nothing for an ally who never fought, or a side that won nothing.
    expect(allyCutCents(ruleset, 100_000, 0.3, false)).toBe(0);
    expect(allyCutCents(ruleset, 0, 0.3, true)).toBe(0);
  });
});

describe('1.1.0-A the locals, torching and sacking', () => {
  const max = business.levels.maxLevel;

  it('lets an abandoned business keep its levels through the grace period, then decay', () => {
    const { graceHours, levelLossEveryHours } = business.locals;
    expect(dormantLevel(ruleset, max, graceHours)).toBe(max);
    expect(dormantLevel(ruleset, max, graceHours + levelLossEveryHours)).toBe(max - 1);
    expect(dormantLevel(ruleset, max, dormantHoursToEmpty(ruleset, max))).toBe(0);
    expect(dormantHoursToEmpty(ruleset, max) / 24).toBeCloseTo(11);
  });

  it('drops a dormant block a tier at once and to a Foothold later', () => {
    expect(dormantTier(ruleset, 'STRONGHOLD', 1)).toBe('ESTABLISHED');
    expect(dormantTier(ruleset, 'STRONGHOLD', business.locals.footholdAfterHours)).toBe('FOOTHOLD');
  });

  it('makes the locals stronger on a built-up block, up to half again', () => {
    const casino = { citySlug: 'detroit', district: 'CASINO' } as const;
    const base = ruleset.turf!.districts.CASINO.localsThugs;
    expect(localsBusinessBonus(ruleset, 'CASINO', 0)).toBe(0);
    expect(localsBusinessBonus(ruleset, 'CASINO', 4)).toBe(4);
    expect(localsBusinessBonus(ruleset, 'CASINO', 100)).toBe(Math.floor(base * business.locals.maxLocalsBonusShare));
    expect(localsThugsWithBusinesses(ruleset, casino, 0)).toBe(localsThugs(ruleset, casino));
    expect(localsThugsWithBusinesses(ruleset, casino, 15)).toBeGreaterThan(localsThugs(ruleset, casino));
  });

  it('pays a small salvage for a torched business, and closes torching for the final hours', () => {
    const torched = torchResult(ruleset, 'CASINO_FRONT', 5);
    expect(torched.level).toBe(5 - business.torch.levelsLost);
    const lost = businessLevelCostCents(ruleset, 'CASINO_FRONT', 5) + businessLevelCostCents(ruleset, 'CASINO_FRONT', 4);
    expect(torched.salvageCents).toBe(Math.floor(lost * business.torch.salvageShare));
    expect(torchResult(ruleset, 'BAR', 1)).toEqual({ level: 0, salvageCents: Math.floor(business.catalog.BAR.buildCostCents * business.torch.salvageShare) });
    expect(torchOpen(ruleset, business.torch.closedFinalHours + 1)).toBe(true);
    expect(torchOpen(ruleset, business.torch.closedFinalHours)).toBe(false);
    expect(torchOpen(before, 1_000)).toBe(false);
  });
});

describe('1.1.0-A the gate', () => {
  it('passes on the shipping ruleset', () => {
    expect(businessGate(ruleset, runBusinessSimulation(ruleset))).toEqual([]);
  });

  it('has nothing to say about a round without businesses', () => {
    expect(runBusinessSimulation(before)).toEqual([]);
    expect(runBusinessWarTimings(before)).toBeNull();
    expect(businessGate(before, [])).toEqual([]);
  });

  it('catches a business that never pays for its staff', () => {
    const starved = broken({
      catalog: { ...business.catalog, CASINO_FRONT: { ...business.catalog.CASINO_FRONT, incomeCentsPerHour: 1_000 } },
    });
    expect(businessGate(starved, runBusinessSimulation(starved)).join(' ')).toContain('Casino Front');
  });

  it('catches businesses that replace the street', () => {
    const rich = broken({ districtIncome: { CASINO: 2, NIGHTCLUB: 2, LOW_RENT: 2, URBAN_GHETTO: 2, WINO_SLUMS: 2 } });
    expect(businessGate(rich, runBusinessSimulation(rich)).join(' ')).toContain('home cap');
  });

  it('catches fatigue that makes flipping a block pay', () => {
    const soft = broken({ fatigue: { ...business.fatigue, onTake: 2, perSiegeHour: 0.1, perFight: 1, onConcede: 1 } });
    expect(businessGate(soft, runBusinessSimulation(soft)).join(' ')).toContain('flipping pays');
  });

  it('finds flipping a block worth well under half of holding it', () => {
    const timings = runBusinessWarTimings(ruleset)!;
    expect(timings.raiderShareOfStable).toBeLessThan(0.5);
    expect(timings.weekAfterTakeShareOfStable).toBeLessThan(1);
    expect(timings.strongholdDays).toBe(4);
  });
});
