import { describe, expect, it } from 'vitest';
import { classicOgV23A, classicOgV24A } from '../index.js';
import {
  TERRITORY_PERKS_CATALOG,
  territoryCatalogForRuleset,
  validateTerritoryCatalog,
} from '../territory-perks.js';

describe('territory perks catalog', () => {
  it('contains explicit versioned city and region mappings without inferring cities', () => {
    expect(TERRITORY_PERKS_CATALOG.version).toBe('territory-perks-v1');
    expect(TERRITORY_PERKS_CATALOG.regions.midwest?.citySlugs).toEqual(['chicago', 'detroit', 'tulsa']);
    expect(TERRITORY_PERKS_CATALOG.cities['new-york-city']).toBeDefined();
  });

  it('only exposes catalog entries present in a ruleset with alliance territory', () => {
    const catalog = territoryCatalogForRuleset(classicOgV23A);
    expect(catalog).not.toBeNull();
    expect(Object.keys(catalog!.districts).every((key) => Object.hasOwn(classicOgV23A.turf!.districts, key))).toBe(true);
    expect(Object.keys(catalog!.cities).every((slug) => Object.hasOwn(classicOgV23A.cities ?? {}, slug))).toBe(true);
    expect(validateTerritoryCatalog(catalog!, classicOgV23A)).toEqual([]);
  });

  it('fails closed for rounds without alliance territory', () => {
    expect(territoryCatalogForRuleset({})).toBeNull();
    expect(validateTerritoryCatalog(TERRITORY_PERKS_CATALOG, {})).toContain('Ruleset has no alliance territory control.');
  });

  it('pins the opt-in catalog to a new ruleset and adds exclusive content to the existing encounter system', () => {
    expect(classicOgV24A.territoryPerks).toEqual({ enabled: true, catalogVersion: 'territory-perks-v1', dailyYieldCapCentsPerMember: 25_000 });
    const entry = classicOgV24A.randomEncounters?.triggers.SCOUT?.entries.find((row) => row.key === 'territory-chicago-armory-tip');
    expect(entry).toMatchObject({ territory: { scope: 'CITY', key: 'chicago' }, supplies: { beer: { min: 1, max: 2 }, medicine: { min: 1, max: 1 } } });
    expect(entry?.territory?.scope).toBe('CITY');
    expect(classicOgV24A.randomEncounters?.triggers.SCOUT?.entries.map((row) => row.key)).toContain('territory-safehouse-intelligence');
    expect(classicOgV24A.randomEncounters?.triggers.STORE?.entries.map((row) => row.key)).toContain('territory-black-market-stock');
    expect(classicOgV24A.randomEncounters?.triggers.TURF?.entries.map((row) => row.key)).toContain('territory-regional-kingpin-contract');
    expect(classicOgV24A.randomEncounters?.triggers.SCOUT?.entries.map((row) => row.key)).toContain('territory-supply-line-opportunity');
  });
});
