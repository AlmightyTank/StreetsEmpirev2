import { describe, expect, it } from 'vitest';
import type { TerritoryPerkDefinition } from '@streets/rulesets';
import {
  applyTerritoryModifier,
  decideTerritoryAccess,
  resolveTerritoryModifiers,
  territoryFeatureEnabled,
  territoryPerkCityControlFromRows,
} from '../territory-perks.service.js';
import { classicOgV23A, classicOgV24A } from '@streets/rulesets';

const makePerk = (key: string, valueBasisPoints: number, category: TerritoryPerkDefinition['stackingCategory'] = 'production'): TerritoryPerkDefinition => ({
  key,
  effectId: 'district.production.output',
  valueBasisPoints,
  scope: 'district',
  stackingCategory: category,
  localizationKey: `territory.perk.${key}`,
  eligibleActions: ['PRODUCE'],
  capBasisPoints: 1200,
});

describe('territory perk engine', () => {
  it('combines deterministic sources and enforces one category cap', () => {
    const receipt = resolveTerritoryModifiers([
      { id: 'z', label: 'Z district', scope: 'district', perk: makePerk('z', 800) },
      { id: 'a', label: 'A city', scope: 'city', perk: makePerk('a', 800) },
    ], 'PRODUCE')[0]!;
    expect(receipt.valueBasisPoints).toBe(1200);
    expect(receipt.sources.map((source) => source.id)).toEqual(['a', 'z']);
    expect(applyTerritoryModifier(101, receipt)).toBe(113);
  });

  it('ignores effects outside their declared action', () => {
    expect(resolveTerritoryModifiers([{ id: 'a', label: 'A', scope: 'district', perk: makePerk('a', 500) }], 'SCOUT')).toEqual([]);
  });

  it('fails closed for legacy rounds and missing territory rules', () => {
    expect(territoryFeatureEnabled({}, {})).toBe(false);
    expect(territoryFeatureEnabled({ territoryPerksEnabled: true, territoryPerksCatalogVersion: 'territory-perks-v1' }, {})).toBe(false);
    expect(territoryFeatureEnabled({ territoryPerksEnabled: true, territoryPerksCatalogVersion: 'territory-perks-v1' }, classicOgV23A)).toBe(false);
    expect(territoryFeatureEnabled({ territoryPerksEnabled: true, territoryPerksCatalogVersion: 'territory-perks-v1' }, classicOgV24A)).toBe(true);
  });

  it('allows holder access without a toll and explains blocked or toll access', () => {
    expect(decideTerritoryAccess({ accessType: 'holderOnly', visitorAllianceId: 'a', holderAllianceId: 'a', holderName: 'A' })).toMatchObject({ allowed: true, tollCents: 0 });
    expect(decideTerritoryAccess({ accessType: 'holderOnly', visitorAllianceId: 'b', holderAllianceId: 'a', holderName: 'A' })).toMatchObject({ allowed: false, reason: 'HOLDER_ONLY', ownerName: 'A' });
    expect(decideTerritoryAccess({ accessType: 'toll', visitorAllianceId: 'b', holderAllianceId: 'a', holderName: 'A', tollAvailable: true, tollCents: 125 })).toMatchObject({ allowed: true, tollCents: 125 });
  });

  it('does not award city control when multiple alliances meet the threshold in a tie', () => {
    const ruleset = { ...classicOgV23A, turf: { ...classicOgV23A.turf!, territory: { ...classicOgV23A.turf!.territory!, cityControlShare: 0.4 } } };
    const rows = [
      { holder: { allianceId: 'a', alliance: { name: 'Alpha', tag: 'A' } } },
      { holder: { allianceId: 'a', alliance: { name: 'Alpha', tag: 'A' } } },
      { holder: { allianceId: 'b', alliance: { name: 'Bravo', tag: 'B' } } },
      { holder: { allianceId: 'b', alliance: { name: 'Bravo', tag: 'B' } } },
      { holder: null },
    ];
    expect(territoryPerkCityControlFromRows(ruleset, rows)).toBeNull();
    expect(territoryPerkCityControlFromRows(ruleset, rows.slice(0, 3))).toMatchObject({ allianceId: 'a', blocksHeld: 2 });
  });
});
