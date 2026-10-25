import { describe, expect, it } from 'vitest';
import { classicOgV26I, classicOgV26J, classicOgV26JBoard, rulesets, type Ruleset } from '@streets/rulesets';
import { calculateNetWorthCents } from '../calculations/net-worth.js';
import {
  isPlayerBoardPriceLegal,
  playerBoardBand,
  playerBoardEscrowNetWorthCents,
  playerBoardItemBookCents,
  playerBoardItemKind,
  playerBoardOfferExpiresAt,
  playerBoardPartBookCents,
  playerBoardPostingFeeCents,
  playerBoardProductBookCents,
  playerBoardPartsNetWorthCents,
  playerBoardSellerProceedsCents,
} from '../calculations/player-board.js';

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
    expect(rules.playerBoard.enabled).toBe(false);
    expect(rules.playerBoard.taxPercent).toBe(8);
  });

  it('changes nothing else from 2.6.0-I', () => {
    const { meta: _a, playerBoard: _b, ...after } = rules;
    const { meta: _c, ...before } = classicOgV26I;
    expect(after).toEqual(before);
  });

  it('is absent from every round pinned before it', () => {
    for (const ruleset of Object.values(rulesets) as Ruleset[]) {
      if (ruleset.meta.id === rules.meta.id || ruleset.meta.id === classicOgV26JBoard.meta.id) continue;
      expect(ruleset.playerBoard, ruleset.meta.id).toBeUndefined();
    }
  });
});

describe('The Board E: opt-in ruleset', () => {
  it('is 2.6.0-J with the Board on, and only that', () => {
    const { meta: _a, playerBoard: liveBoard, ...live } = classicOgV26JBoard;
    const { meta: _b, playerBoard: darkBoard, ...dark } = rules;
    expect(live).toEqual(dark);
    expect(liveBoard).toEqual({ ...darkBoard, enabled: true });
    expect(classicOgV26JBoard.meta.id).toBe('classic-og-v2.6-j-board');
  });

  it('is never the default: new rounds still pin the dark 2.6.0-J', () => {
    const ids = Object.keys(rulesets);
    expect(ids.at(-1)).toBe(rules.meta.id);
    expect(ids.indexOf(classicOgV26JBoard.meta.id)).toBe(ids.length - 2);
    expect((Object.values(rulesets).at(-1) as Ruleset).playerBoard?.enabled).toBe(false);
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

describe('The Board B: part books', () => {
  const on = { ...rules, playerBoard: { ...rules.playerBoard, enabled: true } };
  const books = rules.playerBoard.partBookCents;

  it('books all 19 scavenge keys at one price per rarity', () => {
    const byBook = (cents: number) => Object.keys(books).filter((key) => books[key as keyof typeof books] === cents);
    expect(Object.keys(books)).toHaveLength(19);
    expect(byBook(400)).toEqual(['SCRAP_METAL', 'WIRING', 'TOOL_KIT', 'BOTTLES', 'LABELS', 'PACKAGING', 'LUMBER', 'FASTENERS', 'CLOTH']);
    expect(byBook(2_500)).toEqual(['BASIC_MEDICINE', 'FUEL_CAN', 'RADIO']);
    expect(byBook(8_000)).toEqual(['MOTOR_ASSEMBLY', 'REPAIR_SUPPLIES', 'SPECIALTY_CONTAINER']);
    expect(byBook(25_000)).toEqual(['PRECISION_PARTS', 'ADVANCED_MEDICAL']);
    expect(byBook(250_000)).toEqual(['HIGH_CAPACITY_FUEL_CELL', 'SPECIALIST_CIRCUITRY']);
  });

  it('gives every book a legal band, and no book to a key outside the catalog', () => {
    for (const key of Object.keys(books)) expect(playerBoardBand(playerBoardPartBookCents(key, rules)!, rules), key).not.toBeNull();
    for (const key of ['AMMO_BOX', 'PISTOL', 'CRACK', 'toString', '__proto__', 'scrap_metal', '']) {
      expect(playerBoardPartBookCents(key, rules), key).toBeNull();
    }
    expect(playerBoardPartBookCents('SCRAP_METAL', classicOgV26I)).toBeNull();
    const zeroed = { ...rules, playerBoard: { ...rules.playerBoard, partBookCents: { ...books, RADIO: 0 } } };
    expect(playerBoardPartBookCents('RADIO', zeroed)).toBeNull();
  });

  it('moves rank by book times quantity while the Board is on', () => {
    const parts = { SCRAP_METAL: 100, RADIO: 2, SPECIALIST_CIRCUITRY: 1 };
    const held = { ...empty, cashCents: 123_457, scavengedComponents: parts };
    const without = { ...empty, cashCents: 123_457 };
    expect(calculateNetWorthCents(held, on) - calculateNetWorthCents(without, on)).toBe(40_000n + 5_000n + 250_000n);
    expect(playerBoardPartsNetWorthCents({ PRECISION_PARTS: 3 }, on)).toBe(75_000n);
  });

  it('counts nothing with the Board off, which is today\'s rank', () => {
    const held = { ...empty, cashCents: 123_457, crack: 9, scavengedComponents: { SCRAP_METAL: 100, PRECISION_PARTS: 4 } };
    const without = { ...held, scavengedComponents: undefined };
    expect(calculateNetWorthCents(held, rules)).toBe(calculateNetWorthCents(without, rules));
    expect(calculateNetWorthCents(held, rules)).toBe(calculateNetWorthCents(without, classicOgV26I));
    expect(calculateNetWorthCents(held, classicOgV26I)).toBe(calculateNetWorthCents(without, classicOgV26I));
  });

  it('counts escrowed parts like held ones, so posting a stack moves nothing', () => {
    const held = { ...empty, cashCents: 50_001, scavengedComponents: { SCRAP_METAL: 50, RADIO: 1 } };
    const posted = { ...empty, cashCents: 50_001, scavengedComponents: { SCRAP_METAL: 20, RADIO: 1 }, playerBoardEscrow: { SCRAP_METAL: 30 } };
    expect(calculateNetWorthCents(posted, on)).toBe(calculateNetWorthCents(held, on));
    expect(calculateNetWorthCents({ ...posted, scavengedComponents: {} }, on) - calculateNetWorthCents({ ...empty, cashCents: 50_001 }, on)).toBe(12_000n);
    expect(calculateNetWorthCents(posted, rules)).toBe(calculateNetWorthCents({ ...empty, cashCents: 50_001 }, rules));
  });

  it('ignores stored balances that are not whole positive quantities of a booked key', () => {
    expect(playerBoardPartsNetWorthCents({ SCRAP_METAL: -5, WIRING: 1.5, TOOL_KIT: '3', LABELS: 0, MYSTERY: 10, CLOTH: 2 }, on)).toBe(800n);
    for (const junk of [null, undefined, 7, 'SCRAP_METAL', [1, 2], {}]) expect(playerBoardPartsNetWorthCents(junk, on)).toBe(0n);
  });
});

describe('The Board C: listing rules', () => {
  it('ships six offers, 12- or 48-hour listings, and a 1% fee with a $1 floor', () => {
    expect(rules.playerBoard).toMatchObject({ maxOpenOffers: 6, listingHours: [12, 48], postingFeePercent: 1, postingFeeMinCents: 100 });
  });

  it('charges 1% of the stack\'s book, rounded up, never under $1', () => {
    expect(playerBoardPostingFeeCents(0, rules)).toBe(100);
    expect(playerBoardPostingFeeCents(4_000, rules)).toBe(100); // ten commons
    expect(playerBoardPostingFeeCents(12_000, rules)).toBe(120);
    expect(playerBoardPostingFeeCents(12_001, rules)).toBe(121);
    expect(playerBoardPostingFeeCents(250_000, rules)).toBe(2_500);
    expect(() => playerBoardPostingFeeCents(-1, rules)).toThrow();
    expect(() => playerBoardPostingFeeCents(100, classicOgV26I)).toThrow();
  });

  it('pushes expiry back by every pause since posting, including one still running', () => {
    const offer = { expiresAt: new Date('2030-01-01T12:00:00Z'), pausedMinutesAtPost: 30 };
    const now = new Date('2030-01-01T13:00:00Z');
    expect(playerBoardOfferExpiresAt(offer, { pausedAt: null, pausedMinutesTotal: 30 }, now)).toEqual(offer.expiresAt);
    expect(playerBoardOfferExpiresAt(offer, { pausedAt: null, pausedMinutesTotal: 90 }, now)).toEqual(new Date('2030-01-01T13:00:00Z'));
    // A pause open since 11:00 keeps the listing ahead of the clock for as long as it runs.
    expect(playerBoardOfferExpiresAt(offer, { pausedAt: new Date('2030-01-01T11:00:00Z'), pausedMinutesTotal: 30 }, now))
      .toEqual(new Date('2030-01-01T14:00:00Z'));
    // A pause that began after the listing had already run out does not revive it.
    expect(playerBoardOfferExpiresAt(offer, { pausedAt: new Date('2030-01-01T12:30:00Z'), pausedMinutesTotal: 30 }, now).getTime())
      .toBeLessThanOrEqual(now.getTime());
  });
});

describe('The Board F: every drug', () => {
  const catalog = rules.products as unknown as Readonly<Record<string, { economy?: { pip: { sellCents: number } | null; production: { ingredientCentsPerUnit: number } | null } }>>;
  const on = { ...rules, playerBoard: { ...rules.playerBoard, enabled: true } };
  const drugs = { CRACK: 300, WEED: 240, ECSTASY: 900, COCAINE: 1_200, METH: 450, HEROIN: 450 } as const;

  it('lists every drug in the catalog, each at its Pip buyback', () => {
    expect(Object.keys(rules.products ?? {}).sort()).toEqual(Object.keys(drugs).sort());
    for (const [key, book] of Object.entries(drugs)) {
      expect(playerBoardProductBookCents(key, rules), key).toBe(book);
      expect(playerBoardItemKind(key, rules), key).toBe('PRODUCT');
      expect(playerBoardItemBookCents(key, rules), key).toBe(book);
      const pip = key === 'CRACK' ? rules.stores.PIP.items.CRACK.sellCents : catalog[key]!.economy!.pip!.sellCents;
      expect(book, key).toBe(pip);
    }
    expect(playerBoardItemKind('SCRAP_METAL', rules)).toBe('PART');
    expect(playerBoardItemKind('PISTOL', rules)).toBeNull();
  });

  it('fills crack from $4.00 to $4.34 and refuses a cent over the cap', () => {
    expect(playerBoardBand(300, rules)).toEqual({ bookCents: 300, floorCents: 400, capCents: 434 });
    for (const price of [400, 417, 434]) expect(isPlayerBoardPriceLegal(price, 300, rules)).toBe(true);
    expect(isPlayerBoardPriceLegal(435, 300, rules)).toBe(false);
    expect(isPlayerBoardPriceLegal(399, 300, rules)).toBe(false);
  });

  it('never lets cooking to sell beat the ingredients, for any drug', () => {
    for (const [key, book] of Object.entries(drugs)) {
      const ingredients = key === 'CRACK' ? rules.production.crack.ingredientCentsPerRock : catalog[key]!.economy!.production!.ingredientCentsPerUnit;
      const cap = playerBoardBand(book, rules)!.capCents;
      // The best a cook can do is sell at the cap and keep 92% of it.
      expect(Math.floor(cap * 0.92), key).toBeLessThan(ingredients);
      expect(cap, key).toBeLessThan(ingredients);
    }
  });

  it('refuses a drug off the allow-list, or one whose book drifts from the Pip buyback', () => {
    const narrow = { ...rules, playerBoard: { ...rules.playerBoard, listableProducts: ['CRACK'] } };
    expect(playerBoardProductBookCents('WEED', narrow)).toBeNull();
    const drifted = { ...rules, economy: { ...rules.economy, netWorth: { ...rules.economy.netWorth, perCrackCents: 299 } } };
    expect(playerBoardProductBookCents('CRACK', drifted)).toBeNull();
    expect(playerBoardProductBookCents('NOT_A_DRUG', rules)).toBeNull();
  });

  it('values escrowed drugs at book with the Board on, and nothing with it off', () => {
    expect(playerBoardEscrowNetWorthCents({ CRACK: 10, COCAINE: 2, SCRAP_METAL: 5 }, on)).toBe(3_000n + 2_400n + 2_000n);
    expect(playerBoardEscrowNetWorthCents({ CRACK: 10 }, rules)).toBe(0n);
  });

  it('leaves both ranks at or under their start for a drug fill anywhere in the band', () => {
    for (const [key, book] of Object.entries(drugs)) {
      const band = playerBoardBand(book, on)!;
      for (const price of [band.floorCents, band.capCents]) for (const cash of [0, 1, 3, 12_345]) {
        const quantity = 37;
        const total = price * quantity;
        const holding = (n: number) => (key === 'CRACK' ? { crack: n } : { products: { [key]: n } });
        const worth = (p: object) => calculateNetWorthCents({ ...empty, ...p }, on);
        const buyer = worth({ cashCents: cash, ...holding(quantity) }) - worth({ cashCents: cash + total });
        const seller = worth({ cashCents: cash + playerBoardSellerProceedsCents(total, on) }) - worth({ cashCents: cash, playerBoardEscrow: { [key]: quantity } });
        expect(buyer, `${key} buyer @${price}`).toBeLessThanOrEqual(0n);
        expect(seller, `${key} seller @${price}`).toBeLessThanOrEqual(0n);
      }
    }
  });
});
