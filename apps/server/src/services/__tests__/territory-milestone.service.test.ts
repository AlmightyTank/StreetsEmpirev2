import { describe, expect, it } from 'vitest';
import { classicOgV24A, territoryCatalogForRuleset } from '@streets/rulesets';
import { territoryMilestonesForControl } from '../territory-milestone.service.js';

describe('territory round milestones', () => {
  it('awards each region tier reached and the national award only for every region', () => {
    const catalog = territoryCatalogForRuleset(classicOgV24A)!;
    const onePerRegion = Object.values(catalog.regions).flatMap((region) => region.citySlugs.map((citySlug) => ({ citySlug, allianceId: 'alpha' })));
    const awards = territoryMilestonesForControl(catalog, onePerRegion);
    expect(awards.some((award) => award.awardKey === 'territory-national-kingpin')).toBe(true);
    expect(awards.filter((award) => award.awardKey === 'territory-region-hold')).toHaveLength(Object.values(catalog.regions).reduce((sum, region) => sum + region.tiers.length, 0));
    expect(territoryMilestonesForControl(catalog, onePerRegion.filter((row) => row.citySlug !== catalog.regions[Object.keys(catalog.regions)[0]!]!.citySlugs[0])).some((award) => award.awardKey === 'territory-national-kingpin')).toBe(false);
  });
});
