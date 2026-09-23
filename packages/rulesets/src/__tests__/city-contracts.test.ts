import { describe, expect, it } from 'vitest';
import { classicOgV07Q } from '../classic-og-v0.7-q/index.js';
import { cityContractTemplates } from '../classic-og-v0.7-r/city-contracts.js';
import { classicOgV07R } from '../classic-og-v0.7-r/index.js';
import { hideoutV2For, hideoutV2Problems } from '../hideout-v2.js';

describe('quest roadmap Phase S dynamic city contracts', () => {
  it('preserves R and adds exactly two reusable city-board slots', () => {
    expect(Object.keys(classicOgV07Q.questDefinitions ?? {})).toHaveLength(54);
    expect(Object.keys(cityContractTemplates)).toHaveLength(2);
    expect(Object.keys(classicOgV07R.questDefinitions ?? {})).toHaveLength(56);

    for (const definition of Object.values(cityContractTemplates)) {
      expect(definition.type).toBe('EVENT');
      expect(definition.category).toBe('CITY_CONTRACT');
      expect(definition.repeatability).toBe('REPEATABLE');
      expect(definition.availability.dynamicCityContract).toBe(true);
      expect(definition.rewards).toEqual([]);
    }
  });

  it('inherits branching, secret, rotating-board, favor, unlock and Hideout behavior unchanged', () => {
    for (const key of Object.keys(classicOgV07Q.questDefinitions ?? {})) {
      expect(classicOgV07R.questDefinitions?.[key]).toEqual(classicOgV07Q.questDefinitions?.[key]);
    }
    expect(classicOgV07R.favors).toEqual(classicOgV07Q.favors);
    expect(classicOgV07R.permanentUnlocks).toEqual(classicOgV07Q.permanentUnlocks);
    expect(hideoutV2For(classicOgV07R)).toEqual(hideoutV2For(classicOgV07Q));
    expect(hideoutV2Problems(classicOgV07R)).toEqual([]);
  });
});
