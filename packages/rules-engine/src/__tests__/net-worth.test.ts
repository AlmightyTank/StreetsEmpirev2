import { describe, expect, it } from 'vitest';
import { classicOgV01, type Ruleset } from '@streets/rulesets';
import { calculateNetWorthCents } from '../calculations/net-worth.js';

const empty = {
  cashCents: 0,
  whores: 0,
  thugs: 0,
  lowRiders: 0,
  medicine: 0,
  crack: 0,
  condoms: 0,
  beer: 0,
  pistols: 0,
  shotguns: 0,
  tek9s: 0,
  ak47s: 0,
};

describe('calculateNetWorthCents', () => {
  /**
   * Section 53's fixture, restated for the cash weight. The inventory is the
   * spec's; the total is not, because §16 counts cash at par and this ruleset
   * counts it at 75%. Everything except the $5,000 is unchanged.
   */
  it('matches the frozen fixture', () => {
    const worth = calculateNetWorthCents({
      ...empty,
      cashCents: 500_000, // $5,000
      whores: 10, //        $20,000
      thugs: 10, //         $7,500
      lowRiders: 1, //      $3,000
      medicine: 20, //      $100
      crack: 100, //        $300
      condoms: 1_000, //    $100
    });

    expect(worth).toBe(3_475_000n); // $34,750.00 - $36,000 less 25% of $5,000
  });

  it('values a brand new player at $6,827', () => {
    const start = classicOgV01.round.startingPlayer;

    const worth = calculateNetWorthCents(start);

    expect(worth).toBe(682_700n);
  });

  it('prices condoms at ten cents, so $1 of condoms is $0.10 of net worth', () => {
    const worth = calculateNetWorthCents({ ...empty, condoms: 5_000 });
    expect(worth).toBe(50_000n); // $500 of net worth for $5,000 spent
  });

  it('counts beer and weapons, so an armed crew is not a poorer one', () => {
    const rules = classicOgV01;
    const worth = calculateNetWorthCents({
      ...empty,
      beer: 100,
      pistols: 10,
      shotguns: 4,
      tek9s: 2,
      ak47s: 1,
    });

    expect(worth).toBe(
      BigInt(100 * rules.economy.netWorth.perBeerCents) +
        BigInt(10 * rules.economy.netWorth.perPistolCents) +
        BigInt(4 * rules.economy.netWorth.perShotgunCents) +
        BigInt(2 * rules.economy.netWorth.perTek9Cents) +
        BigInt(1 * rules.economy.netWorth.perAk47Cents),
    );
    expect(worth).toBeGreaterThan(0n);
  });

  /**
   * Every store item, paired with what one unit adds to net worth. These two
   * numbers together are the whole economy: the gap between them is what a
   * purchase costs you in score, and its sign is what stops the store being
   * a money printer.
   */
  // Typed as the declared interface so a key can be looked up across stores;
  // the literal type narrows items per store and blocks the shared lookup.
  const rules: Ruleset = classicOgV01;

  const priced = [
    ['CORNER', 'CONDOM', 'perCondomCents'],
    ['CORNER', 'MEDICINE', 'perMedicineCents'],
    ['CORNER', 'BEER', 'perBeerCents'],
    ['PIP', 'CRACK', 'perCrackCents'],
    ['TOMMY', 'THUG', 'perThugCents'],
    ['TOMMY', 'PISTOL', 'perPistolCents'],
    ['TOMMY', 'SHOTGUN', 'perShotgunCents'],
    ['TOMMY', 'TEK9', 'perTek9Cents'],
    ['TOMMY', 'AK47', 'perAk47Cents'],
    ['CHARLIE', 'LOW_RIDER', 'perLowRiderCents'],
  ] as const;

  it.each(priced)('never lets a %s %s purchase mint net worth', (store, item, key) => {
    // The anti-exploit that holds the whole formula up. Buying changes net
    // worth by `value - cashWeight x price`, so an item worth more than its
    // weighted price would turn cash into score out of nothing - and the
    // pistol is sold in unlimited quantity, so this is not theoretical.
    const shopItem = rules.stores[store].items[item]!;
    const weightedPrice =
      (shopItem.buyCents * rules.economy.netWorth.cashWeightPercent) / 100;

    expect(rules.economy.netWorth[key]).toBeLessThanOrEqual(weightedPrice);
  });

  it.each(priced)('values %s %s at exactly what it liquidates for', (store, item, key) => {
    // A shop's buy-back price is what the item is worth. Selling therefore
    // costs you only the cash weight, never a second markdown on top.
    const shopItem = rules.stores[store].items[item]!;
    if (shopItem.sellCents === null) return;
    expect(rules.economy.netWorth[key]).toBe(shopItem.sellCents);
  });

  it('makes liquidating an empire cost you, whatever you sell', () => {
    // The point of weighting cash: turning assets into money is a 25% haircut,
    // so sitting on cash is no longer free.
    const held = { ...empty, lowRiders: 10 };
    const sold = {
      ...empty,
      cashCents: 10 * classicOgV01.stores.CHARLIE.items.LOW_RIDER!.sellCents!,
    };

    expect(calculateNetWorthCents(sold)).toBeLessThan(calculateNetWorthCents(held));
  });

  it('excludes nothing any more', () => {
    expect(classicOgV01.economy.netWorthExcluded).toEqual([]);
  });

  it('stays exact at values that would lose cents as a float', () => {
    const worth = calculateNetWorthCents({
      ...empty,
      cashCents: 9_007_199_254_740_993n,
    });
    // Weighted with integer maths, so the result is exact rather than the
    // nearest double - the whole reason money never touches a float here.
    expect(worth).toBe((9_007_199_254_740_993n * 75n) / 100n);
    expect(worth).toBe(6_755_399_441_055_744n);
  });

  it('counts a dollar of cash as seventy-five cents', () => {
    expect(calculateNetWorthCents({ ...empty, cashCents: 1_000_000 })).toBe(750_000n);
  });
});
