import { describe, expect, it } from 'vitest';
import { resolveModifiers } from '../calculations/modifiers.js';

describe('shared modifier resolver', () => {
  it('shares one cap across skills, territory, crew, and item sources', () => {
    const result = resolveModifiers([
      { effectId: 'HUSTLE_INCOME', category: 'ECONOMY', percent: 6, sourceId: 'street-skill:HUSTLE', label: 'Hustle' },
      { effectId: 'DISTRICT_MARKET', category: 'ECONOMY', percent: 3, sourceId: 'territory:market', label: 'Street Market' },
      { effectId: 'SPECIALIST', category: 'ECONOMY', percent: 5, sourceId: 'crew:service', label: 'Specialist' },
      { effectId: 'ITEM_MOD', category: 'ECONOMY', percent: 4, sourceId: 'item:ledger', label: 'Ledger' },
    ], [{ category: 'ECONOMY', maxPercent: 12 }]);

    expect(result.totals.ECONOMY).toBe(12);
    expect(result.modifiers.map((entry) => entry.appliedPercent)).toEqual([6, 3, 3, 0]);
    expect(result.modifiers.at(-1)).toMatchObject({ capped: true, sourceId: 'item:ledger' });
  });

  it('caps reductions by magnitude and keeps named receipt lines', () => {
    const result = resolveModifiers([
      { effectId: 'SKILL', category: 'COST', percent: -20, sourceId: 'street-skill:WHEELS', label: 'Wheels' },
      { effectId: 'TERRITORY', category: 'COST', percent: -10, sourceId: 'territory:transit', label: 'Shortcut Routes' },
    ], [{ category: 'COST', maxPercent: 25 }]);

    expect(result.totals.COST).toBe(-25);
    expect(result.modifiers[1]).toMatchObject({ appliedPercent: -5, capped: true, label: 'Shortcut Routes' });
  });

  it('caps each target on its own, so different costs and heat effects never share a cap', () => {
    const result = resolveModifiers([
      { effectId: 'TOLLS', target: 'TOLLS', category: 'COST', percent: -20, sourceId: 'street-skill:CONNECTIONS', label: 'Tolls' },
      { effectId: 'SUPPLY', target: 'SUPPLY', category: 'COST', percent: -10, sourceId: 'street-skill:CONNECTIONS', label: 'Supply' },
      { effectId: 'HEAT_GAIN', target: 'HEAT_GAIN', category: 'HEAT', percent: -15, sourceId: 'street-skill:FIXER', label: 'Gain' },
      { effectId: 'HEAT_COOLING', target: 'HEAT_COOLING', category: 'HEAT', percent: 15, sourceId: 'street-skill:FIXER', label: 'Cooling' },
      { effectId: 'TOLLS', target: 'TOLLS', category: 'COST', percent: -10, sourceId: 'territory:transit', label: 'Shortcut' },
    ], [{ category: 'COST', maxPercent: 25 }, { category: 'HEAT', maxPercent: 25 }]);

    expect(result.targets).toEqual({ TOLLS: -25, SUPPLY: -10, HEAT_GAIN: -15, HEAT_COOLING: 15 });
    expect(result.modifiers.map((entry) => entry.appliedPercent)).toEqual([-20, -10, -15, 15, -5]);
  });
});
