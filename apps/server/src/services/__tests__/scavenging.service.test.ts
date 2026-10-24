import { describe, expect, it } from 'vitest';
import {
  cacheOdds,
  cacheQualityForTurns,
  COMPONENTS,
  dealerPriceCents,
  districtSupplyClue,
  eligiblePool,
  makeCache,
  openCache,
  rollRarity,
  scavengeFindCount,
} from '../scavenging.service.js';

describe('hideout scavenging', () => {
  it('maps scouting effort to the intended cache quality', () => {
    expect(cacheQualityForTurns(1)).toBe('STREET_STASH');
    expect(cacheQualityForTurns(3)).toBe('SUPPLY_CACHE');
    expect(cacheQualityForTurns(6)).toBe('SECURED_CACHE');
    expect(cacheQualityForTurns(10)).toBe('BLACK_MARKET_CACHE');
  });

  it('keeps the roadmap odds exact', () => {
    expect(cacheOdds('STREET_STASH')).toEqual({ COMMON: 70, UNCOMMON: 22, RARE: 7, EPIC: 1, LEGENDARY: 0 });
    expect(cacheOdds('SUPPLY_CACHE')).toEqual({ COMMON: 50, UNCOMMON: 30, RARE: 14, EPIC: 5, LEGENDARY: 1 });
    expect(cacheOdds('SECURED_CACHE')).toEqual({ COMMON: 30, UNCOMMON: 35, RARE: 22, EPIC: 10, LEGENDARY: 3 });
    expect(cacheOdds('BLACK_MARKET_CACHE')).toEqual({ COMMON: 15, UNCOMMON: 30, RARE: 30, EPIC: 18, LEGENDARY: 7 });
  });

  it('exposes district clues and themed eligible pools', () => {
    expect(districtSupplyClue('URBAN_GHETTO').theme).toBe('industrial');
    expect(districtSupplyClue('URBAN_GHETTO').common).toContain('Scrap metal');
    expect(eligiblePool('industrial').every((item) => item.themes.includes('industrial'))).toBe(true);
    expect(makeCache('URBAN_GHETTO', 'Urban Ghetto', 10).quality).toBe('BLACK_MARKET_CACHE');
  });

  it('resolves rarity boundaries deterministically and previews a reward', () => {
    const odds = cacheOdds('SUPPLY_CACHE');
    expect(rollRarity(odds, () => 0)).toBe('COMMON');
    expect(rollRarity(odds, () => 0.5)).toBe('UNCOMMON');
    expect(rollRarity(odds, () => 0.8)).toBe('RARE');

    const cache = makeCache('URBAN_GHETTO', 'Urban Ghetto', 10);
    const reward = openCache(cache, () => 0.01);
    expect(reward).toHaveLength(1);
    const firstReward = reward[0]!;
    expect(cache.eligiblePool.some((item) => item.key === firstReward.key)).toBe(true);
    expect(firstReward.quantity).toBeGreaterThan(0);
  });

  it('brings home at least one component per scouting trip', () => {
    expect(scavengeFindCount(0)).toBe(0);
    expect(scavengeFindCount(1)).toBe(1);
    expect(scavengeFindCount(2)).toBe(1);
    expect(scavengeFindCount(3)).toBe(2);
    expect(scavengeFindCount(10)).toBe(5);
  });

  it('prices every component at the salvage dealer, rarer parts costing more', () => {
    for (const component of COMPONENTS) expect(dealerPriceCents(component.key)).toBeGreaterThan(0);
    expect(dealerPriceCents('SCRAP_METAL')!).toBeLessThan(dealerPriceCents('RADIO')!);
    expect(dealerPriceCents('RADIO')!).toBeLessThan(dealerPriceCents('MOTOR_ASSEMBLY')!);
    expect(dealerPriceCents('PRECISION_PARTS')!).toBeLessThan(dealerPriceCents('SPECIALIST_CIRCUITRY')!);
    expect(dealerPriceCents('NOT_A_PART')).toBeNull();
  });
});
