import { describe, expect, it } from 'vitest';
import { profitIntelligenceGoalsSchema } from './profit-intelligence.js';

describe('profit intelligence goal settings', () => {
  it('accepts clearing all optional thresholds', () => {
    expect(profitIntelligenceGoalsSchema.safeParse({
      minimumLiquidityCents: null,
      minimumProductKey: null,
      minimumProductUnits: null,
      maximumRoutePurchaseCents: null,
    }).success).toBe(true);
  });

  it('requires product and unit thresholds together', () => {
    expect(profitIntelligenceGoalsSchema.safeParse({
      minimumLiquidityCents: null,
      minimumProductKey: 'CRACK',
      minimumProductUnits: null,
      maximumRoutePurchaseCents: null,
    }).success).toBe(false);
  });

  it('rejects malformed cents and impossible unit counts', () => {
    expect(profitIntelligenceGoalsSchema.safeParse({
      minimumLiquidityCents: '-1',
      minimumProductKey: 'CRACK',
      minimumProductUnits: 2_000_000_001,
      maximumRoutePurchaseCents: null,
    }).success).toBe(false);
  });
});
