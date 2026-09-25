import { describe, expect, it } from 'vitest';
import { classicOgV08D, classicOgV08F, classicOgV08G, classicOgV08H } from '@streets/rulesets';
import { boostedSellCents, priceContext, relationshipPriceAdjustments, relationshipState, specialOrderQuote, stockContext } from '../store.service.js';

describe('store market context', () => {
  it('labels current prices against their normal baseline', () => {
    expect(priceContext(80, 100)).toMatchObject({ label: 'Cheap', deltaPercent: -20, trend: 'Stable' });
    expect(priceContext(94, 100)).toMatchObject({ label: 'Below Normal', deltaPercent: -6 });
    expect(priceContext(100, 100)).toMatchObject({ label: 'Normal', deltaPercent: 0 });
    expect(priceContext(110, 100)).toMatchObject({ label: 'Above Normal', deltaPercent: 10 });
    expect(priceContext(120, 100)).toMatchObject({ label: 'Expensive', deltaPercent: 20 });
  });

  it('summarizes shelf depth without exposing hidden mechanics', () => {
    expect(stockContext(null, null)).toMatchObject({ label: 'Always Available', percent: null });
    expect(stockContext(0, 100)).toMatchObject({ label: 'Sold Out', percent: 0 });
    expect(stockContext(10, 100)).toMatchObject({ label: 'Scarce', percent: 10 });
    expect(stockContext(33, 100)).toMatchObject({ label: 'Low', percent: 33 });
    expect(stockContext(50, 100)).toMatchObject({ label: 'Normal', percent: 50 });
    expect(stockContext(80, 100)).toMatchObject({ label: 'Plentiful', percent: 80 });
  });

  it('surfaces the best reached trader relationship perk and the next milestone', () => {
    expect(relationshipPriceAdjustments(24, classicOgV08D, 'PIP')).toEqual({ buyDiscountPercent: 0, sellBonusPercent: 0 });
    expect(relationshipPriceAdjustments(25, classicOgV08D, 'PIP')).toEqual({ buyDiscountPercent: 0, sellBonusPercent: 3 });
    expect(relationshipPriceAdjustments(60, classicOgV08D, 'PIP')).toEqual({ buyDiscountPercent: 2, sellBonusPercent: 5 });

    expect(relationshipState(30, classicOgV08D, 'PIP')).toMatchObject({
      current: { label: 'Better buyback', sellBonusPercent: 3 },
      next: { label: 'Counter regular', at: 50, pointsRemaining: 20 },
    });
  });

  it('caps relationship buybacks below the buy quote', () => {
    expect(boostedSellCents(98, 100, 10)).toBe(99);
    expect(boostedSellCents(null, 100, 10)).toBeNull();
  });

  it('quotes standing-adjusted special orders only when they beat the shelf clock', () => {
    const now = new Date('2026-09-24T12:00:00.000Z');
    const settled = {
      stock: 0,
      stockAt: now,
      gained: 0,
      cap: 2,
      intervalMinutes: 240,
      perInterval: 1,
      nextAt: new Date(now.getTime() + 240 * 60_000),
      changed: false,
    };

    expect(specialOrderQuote({ ruleset: classicOgV08D, points: 50, itemBuyCents: 10_000, settled, now })).toBeNull();
    expect(specialOrderQuote({ ruleset: classicOgV08F, points: 0, itemBuyCents: 10_000, settled, now }))
      .toMatchObject({ feeCents: 3_500, markupPercent: 35, waitMinutes: 120, quantity: 1 });
    expect(specialOrderQuote({ ruleset: classicOgV08F, points: 50, itemBuyCents: 10_000, settled, now }))
      .toMatchObject({ feeCents: 2_700, markupPercent: 27 });
    expect(specialOrderQuote({ ruleset: classicOgV08G, points: 0, itemBuyCents: 10_000, settled, now, turfBlocksHeld: 3 }))
      .toMatchObject({ feeCents: 3_290, baseFeeCents: 3_500, markupPercent: 35 });
    expect(specialOrderQuote({ ruleset: classicOgV08H, points: 50, itemBuyCents: 10_000, settled, now, turfBlocksHeld: 99 }))
      .toMatchObject({ feeCents: 2_944, baseFeeCents: 3_200, markupPercent: 32, waitMinutes: 130 });
  });
});
