import { describe, expect, it } from 'vitest';
import { emptyProfitGoals, projectProfitGoals } from '../profit-intelligence.service.js';

describe('profit intelligence financial goals', () => {
  it('returns no warnings when goals are not configured', () => {
    const result = projectProfitGoals({
      settings: emptyProfitGoals().settings,
      liquidityCents: 250_000n,
      productUnits: null,
      routePurchases: [{ route: ['chicago', 'detroit'], buyCents: '50000' }],
    });
    expect(result.warnings).toEqual([]);
    expect(result.observed.liquidityCents).toBe('250000');
  });

  it('warns only when configured thresholds are crossed', () => {
    const result = projectProfitGoals({
      settings: {
        minimumLiquidityCents: '300000',
        minimumProductKey: 'CRACK',
        minimumProductUnits: 100,
        maximumRoutePurchaseCents: '40000',
      },
      liquidityCents: 250_000n,
      productUnits: 75,
      routePurchases: [
        { route: ['chicago', 'detroit'], buyCents: '50000' },
        { route: ['chicago', 'milwaukee'], buyCents: '25000' },
      ],
    });
    expect(result.warnings).toHaveLength(3);
    expect(result.warnings[0]).toContain('below your $3,000.00 minimum');
    expect(result.warnings[1]).toContain('CRACK stock is below your 100-unit minimum');
    expect(result.warnings[2]).toContain('chicago → detroit purchases exceeded');
    expect(result.observed.maximumRoutePurchaseCents).toBe('50000');
  });

  it('does not warn when thresholds are exactly met', () => {
    const result = projectProfitGoals({
      settings: { minimumLiquidityCents: '250000', minimumProductKey: 'CRACK', minimumProductUnits: 75, maximumRoutePurchaseCents: '50000' },
      liquidityCents: 250_000n,
      productUnits: 75,
      routePurchases: [{ route: ['chicago', 'detroit'], buyCents: '50000' }],
    });
    expect(result.warnings).toEqual([]);
  });
});
