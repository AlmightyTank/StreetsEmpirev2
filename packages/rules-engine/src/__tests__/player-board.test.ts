import { describe, expect, it } from 'vitest';
import { classicOgV26I, classicOgV26J, rulesets, type Ruleset } from '@streets/rulesets';
import { calculateNetWorthCents } from '../calculations/net-worth.js';
import { isPlayerBoardPriceLegal, playerBoardBand, playerBoardSellerProceedsCents } from '../calculations/player-board.js';

const empty = {
  cashCents: 0, whores: 0, thugs: 0, lowRiders: 0, medicine: 0, crack: 0,
  condoms: 0, beer: 0, pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0,
};

const rules = classicOgV26J;
const v = rules.economy.netWorth;

/** Keeper goods whose book is already their net worth, keyed by the player column that holds them. */
const goods = [
  ['crack', v.perCrackCents],
  ['pistols', v.perPistolCents],
  ['shotguns', v.perShotgunCents],
  ['tek9s', v.perTek9Cents],
  ['ak47s', v.perAk47Cents],
  ['lowRiders', v.perLowRiderCents],
] as const;

type Column = (typeof goods)[number][0];

/** Settle a fill the way slice E will: buyer pays the sticker, seller keeps the share, units move. */
function fill(column: Column, quantity: number, unitPriceCents: number, buyerCash: number, sellerCash: number) {
  const total = unitPriceCents * quantity;
  const buyerBefore = { ...empty, cashCents: buyerCash };
  const sellerBefore = { ...empty, cashCents: sellerCash, [column]: quantity };
  const buyerAfter = { ...buyerBefore, cashCents: buyerCash - total, [column]: quantity };
  const sellerAfter = { ...sellerBefore, cashCents: sellerCash + playerBoardSellerProceedsCents(total, rules), [column]: 0 };
  const worth = (player: typeof empty) => calculateNetWorthCents(player, rules);
  return {
    buyer: worth(buyerAfter) - worth(buyerBefore),
    seller: worth(sellerAfter) - worth(sellerBefore),
  };
}

describe('The Board A: ruleset', () => {
  it('ships the block switched off on the next ruleset', () => {
    expect(Object.values(rulesets).at(-1)?.meta.id).toBe('classic-og-v2.6-j');
    expect(rules.playerBoard).toEqual({ enabled: false, taxPercent: 8 });
  });

  it('changes nothing else from 2.6.0-I', () => {
    const { meta: _a, playerBoard: _b, ...after } = rules;
    const { meta: _c, ...before } = classicOgV26I;
    expect(after).toEqual(before);
  });

  it('is absent from every round pinned before it', () => {
    for (const ruleset of Object.values(rulesets) as Ruleset[]) {
      if (ruleset.meta.id === rules.meta.id) continue;
      expect(ruleset.playerBoard, ruleset.meta.id).toBeUndefined();
    }
  });
});

describe('The Board A: band', () => {
  it('prices the part books in the roadmap', () => {
    expect([400, 2_500, 8_000, 25_000, 250_000].map((book) => playerBoardBand(book, rules))).toEqual([
      { bookCents: 400, floorCents: 534, capCents: 579 },
      { bookCents: 2_500, floorCents: 3_334, capCents: 3_623 },
      { bookCents: 8_000, floorCents: 10_667, capCents: 11_594 },
      { bookCents: 25_000, floorCents: 33_334, capCents: 36_231 },
      { bookCents: 250_000, floorCents: 333_334, capCents: 362_318 },
    ]);
  });

  it('prices the keeper goods in the roadmap from their live net worth', () => {
    expect(goods.map(([, book]) => playerBoardBand(book, rules))).toEqual([
      { bookCents: 300, floorCents: 400, capCents: 434 },
      { bookCents: 3_500, floorCents: 4_667, capCents: 5_072 },
      { bookCents: 31_500, floorCents: 42_000, capCents: 45_652 },
      { bookCents: 87_500, floorCents: 116_667, capCents: 126_811 },
      { bookCents: 245_000, floorCents: 326_667, capCents: 355_072 },
      { bookCents: 300_000, floorCents: 400_000, capCents: 434_782 },
    ]);
  });

  it('prices the same band whether or not the block is enabled', () => {
    const on = { ...rules, playerBoard: { ...rules.playerBoard, enabled: true } };
    expect(playerBoardBand(300, on)).toEqual(playerBoardBand(300, rules));
  });

  it('has no band without the block, a positive whole book, or any tax width', () => {
    expect(playerBoardBand(300, classicOgV26I)).toBeNull();
    expect(isPlayerBoardPriceLegal(400, 300, classicOgV26I)).toBe(false);
    for (const book of [0, -300, 300.5, Number.NaN]) expect(playerBoardBand(book, rules)).toBeNull();
    // Untaxed, $3 at 75% has floor = cap = $4; $1 has floor $1.34 above cap $1.33.
    const untaxed = { ...rules, playerBoard: { ...rules.playerBoard, taxPercent: 0 } };
    expect(playerBoardBand(300, untaxed)).toEqual({ bookCents: 300, floorCents: 400, capCents: 400 });
    expect(playerBoardBand(100, untaxed)).toBeNull();
  });

  it('accepts whole cents from the floor through the cap and nothing else', () => {
    expect(isPlayerBoardPriceLegal(399, 300, rules)).toBe(false);
    expect(isPlayerBoardPriceLegal(400, 300, rules)).toBe(true);
    expect(isPlayerBoardPriceLegal(434, 300, rules)).toBe(true);
    expect(isPlayerBoardPriceLegal(435, 300, rules)).toBe(false);
    expect(isPlayerBoardPriceLegal(400.5, 300, rules)).toBe(false);
  });

  it('pays the seller 92% rounded down, so the tax never rounds away', () => {
    expect(playerBoardSellerProceedsCents(434, rules)).toBe(399); // 399.28
    expect(playerBoardSellerProceedsCents(10_000, rules)).toBe(9_200);
    expect(playerBoardSellerProceedsCents(0, rules)).toBe(0);
    expect(() => playerBoardSellerProceedsCents(-1, rules)).toThrow();
    expect(() => playerBoardSellerProceedsCents(1, classicOgV26I)).toThrow();
  });
});

describe('The Board A: rank', () => {
  // Odd balances exercise the 75% truncation from every remainder.
  const balances = [0, 1, 2, 3, 99_999, 1_234_567];

  it('leaves both net worths at or under their start for any fill inside the band', () => {
    for (const [column, book] of goods) {
      const band = playerBoardBand(book, rules)!;
      const prices = [band.floorCents, band.floorCents + 1, Math.floor((band.floorCents + band.capCents) / 2), band.capCents - 1, band.capCents];
      for (const price of prices) for (const quantity of [1, 7, 100]) for (const cash of balances) {
        const { buyer, seller } = fill(column, quantity, price, cash + price * quantity, cash);
        expect(buyer, `${column} buyer @${price}×${quantity} cash ${cash}`).toBeLessThanOrEqual(0n);
        expect(seller, `${column} seller @${price}×${quantity} cash ${cash}`).toBeLessThanOrEqual(0n);
      }
    }
  });

  it('raises exactly the buyer one cent under the floor', () => {
    for (const [column, book] of goods) {
      const price = playerBoardBand(book, rules)!.floorCents - 1;
      for (const cash of balances) {
        const { buyer, seller } = fill(column, 100, price, cash + price * 100, cash);
        expect(buyer, column).toBeGreaterThan(0n);
        expect(seller, column).toBeLessThanOrEqual(0n);
      }
    }
  });

  it('raises exactly the seller one cent over the cap', () => {
    for (const [column, book] of goods) {
      const price = playerBoardBand(book, rules)!.capCents + 1;
      for (const cash of balances) {
        const { buyer, seller } = fill(column, 100, price, cash + price * 100, cash);
        expect(buyer, column).toBeLessThanOrEqual(0n);
        expect(seller, column).toBeGreaterThan(0n);
      }
    }
  });

  it('leaves net worth on a ruleset without the block exactly as 2.6.0-I counts it', () => {
    const player = { ...empty, cashCents: 1_234_567, crack: 40, pistols: 3, lowRiders: 1 };
    expect(calculateNetWorthCents(player, rules)).toBe(calculateNetWorthCents(player, classicOgV26I));
  });
});
