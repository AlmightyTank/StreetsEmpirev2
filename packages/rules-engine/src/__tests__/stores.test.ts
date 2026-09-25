import { describe, expect, it } from 'vitest';
import { classicOgV01, type Ruleset } from '@streets/rulesets';
import { fullShelves } from '../calculations/restock.js';
import { calculateStoreTrade, MAX_INVENTORY, maxStoreBuy, type StoreTradeInput } from '../calculations/stores.js';
import { calculateNetWorthCents } from '../calculations/net-worth.js';
import { storeCheckoutSchema, storeSpecialOrderSchema, storeTradeSchema } from '@streets/shared';

const player = { ...classicOgV01.round.startingPlayer, cashCents: 10_000_000n,
  shotgunUnlocked: true, tek9Unlocked: true, ak47Unlocked: true,
  // A real player arrives at Tommy's with the shelves stocked; the limit is
  // exercised on purpose in restock.test.ts.
  ...fullShelves(classicOgV01) };
const order: StoreTradeInput = { store: 'CORNER', item: 'CONDOM', direction: 'buy', quantity: 100 };

describe('store transactions', () => {
  it.each(Object.entries(classicOgV01.stores).flatMap(([store, definition]) =>
    Object.entries(definition.items).map(([item, data]) => ({ store, item, ...data }))))
    ('buys $item from $store at the ruleset price', ({ store, item, field, buyCents }) => {
      const trade = calculateStoreTrade(player, { ...order, store, item, quantity: 2 }, classicOgV01);
      expect(trade.field).toBe(field);
      expect(trade.cashChangeCents).toBe(-BigInt(buyCents * 2));
      expect(trade.quantityChange).toBe(2);
    });

  it.each([
    ['TOMMY', 'PISTOL', 'pistols'], ['TOMMY', 'SHOTGUN', 'shotguns'],
    ['TOMMY', 'TEK9', 'tek9s'], ['TOMMY', 'AK47', 'ak47s'],
    ['CHARLIE', 'LOW_RIDER', 'lowRiders'], ['PIP', 'CRACK', 'crack'],
  ] as const)('sells %s %s at its buyback price', (store, item, field) => {
    const rules: Ruleset = classicOgV01;
    const trade = calculateStoreTrade({ ...player, [field]: 10 }, { store, item, direction: 'sell', quantity: 10 }, rules);
    expect(trade.cashChangeCents).toBe(BigInt(rules.stores[store].items[item]!.sellCents! * 10));
    expect(trade.quantityChange).toBe(-10);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, MAX_INVENTORY + 1])('rejects invalid quantity %s', (quantity) => {
    expect(() => calculateStoreTrade(player, { ...order, quantity }, classicOgV01))
      .toThrow('positive whole quantity');
  });

  it.each([
    [{ store: 'missing' }, 'UNKNOWN_STORE'],
    [{ store: 'constructor' }, 'UNKNOWN_STORE'],
    [{ item: 'PISTOL' }, 'UNKNOWN_ITEM'],
    [{ item: '__proto__' }, 'UNKNOWN_ITEM'],
    [{ item: 'constructor' }, 'UNKNOWN_ITEM'],
    [{ direction: 'sell' }, 'SELL_NOT_ALLOWED'],
  ] as const)('rejects unsupported orders %j', (input, code) => {
    try {
      calculateStoreTrade(player, { ...order, ...input }, classicOgV01);
      expect.unreachable();
    } catch (error) { expect(error).toMatchObject({ code }); }
  });

  it('accepts a player-specific discounted store quote without changing sell prices', () => {
    const buy = calculateStoreTrade(
      player,
      { store: 'TOMMY', item: 'PISTOL', direction: 'buy', quantity: 2 },
      classicOgV01,
      { buyUnitCents: Math.floor(classicOgV01.stores.TOMMY.items.PISTOL!.buyCents * 0.8) },
    );
    expect(buy.unitCents).toBe(Math.floor(classicOgV01.stores.TOMMY.items.PISTOL!.buyCents * 0.8));

    const sell = calculateStoreTrade(
      { ...player, pistols: 10 },
      { store: 'TOMMY', item: 'PISTOL', direction: 'sell', quantity: 2 },
      classicOgV01,
      { buyUnitCents: 1 },
    );
    expect(sell.unitCents).toBe(classicOgV01.stores.TOMMY.items.PISTOL!.sellCents);
  });

  it('floors discounted store buys above buyback to prevent arbitrage', () => {
    const item = classicOgV01.stores.TOMMY.items.PISTOL!;
    const trade = calculateStoreTrade(
      player,
      { store: 'TOMMY', item: 'PISTOL', direction: 'buy', quantity: 1 },
      classicOgV01,
      { buyUnitCents: 1 },
    );
    expect(trade.unitCents).toBe(item.sellCents! + 1);
  });

  it('accepts player-specific store buyback quotes and keeps buys above them', () => {
    const item = classicOgV01.stores.PIP.items.CRACK!;
    const sell = calculateStoreTrade(
      { ...player, crack: 10 },
      { store: 'PIP', item: 'CRACK', direction: 'sell', quantity: 2 },
      classicOgV01,
      { sellUnitCents: item.sellCents! + 25 },
    );
    expect(sell.unitCents).toBe(item.sellCents! + 25);

    const buy = calculateStoreTrade(
      player,
      { store: 'PIP', item: 'CRACK', direction: 'buy', quantity: 1 },
      classicOgV01,
      { buyUnitCents: 1, sellUnitCents: item.sellCents! + 25 },
    );
    expect(buy.unitCents).toBe(item.sellCents! + 26);
  });

  it('rejects an unaffordable order without changing input state', () => {
    const broke = { ...player, cashCents: 99n };
    expect(() => calculateStoreTrade(broke, { ...order, quantity: 1 }, classicOgV01)).toThrow('afford 0');
    expect(broke.cashCents).toBe(99n);
    expect(broke.condoms).toBe(player.condoms);
  });

  it('allows exact cash and rejects selling more than owned', () => {
    expect(calculateStoreTrade({ ...player, cashCents: 100n }, { ...order, quantity: 1 }, classicOgV01).cashChangeCents).toBe(-100n);
    expect(() => calculateStoreTrade(player, { store: 'PIP', item: 'CRACK', direction: 'sell', quantity: player.crack + 1 }, classicOgV01)).toThrow('only own');
  });

  it('prevents inventory overflow and caps Max at the remaining room', () => {
    const full = { ...player, condoms: MAX_INVENTORY };
    expect(maxStoreBuy(full.cashCents, full.condoms, classicOgV01.stores.CORNER.items.CONDOM)).toBe(0);
    expect(() => calculateStoreTrade(full, order, classicOgV01)).toThrow('inventory limit');
  });

  it('uses a variant ruleset and supports store slugs', () => {
    const rules: Ruleset = { ...classicOgV01, stores: { ...classicOgV01.stores,
      CORNER: { ...classicOgV01.stores.CORNER, items: {
        CONDOM: { ...classicOgV01.stores.CORNER.items.CONDOM, buyCents: 137 },
      } },
    } };
    expect(calculateStoreTrade(player, { ...order, store: 'corner' }, rules).totalCents).toBe(13_700n);
    expect(maxStoreBuy(1_000n, 0, rules.stores.CORNER.items.CONDOM!)).toBe(7);
  });

  it('charges only the cash weight when selling crack at Pip’s', () => {
    // Pip pays exactly what a rock is worth, so the only thing a sale costs
    // is turning net worth into cash - which is weighted at 75%.
    const trade = calculateStoreTrade(player, { store: 'PIP', item: 'CRACK', direction: 'sell', quantity: 100 }, classicOgV01);
    const after = { ...player, cashCents: player.cashCents + trade.cashChangeCents, crack: player.crack + trade.quantityChange };

    const lost = calculateNetWorthCents(player) - calculateNetWorthCents(after);
    const rockValue = BigInt(100 * classicOgV01.economy.netWorth.perCrackCents);
    const weight = BigInt(classicOgV01.economy.netWorth.cashWeightPercent);

    expect(lost).toBe(rockValue - (rockValue * weight) / 100n);
  });

  it('requires an action id and rejects malformed HTTP inputs', () => {
    expect(storeTradeSchema.safeParse(order).success).toBe(false);
    expect(storeTradeSchema.safeParse({ ...order, actionId: 'store-test-0001' }).success).toBe(true);
    for (const quantity of ['100', 0, -1, 0.5, Infinity]) {
      expect(storeTradeSchema.safeParse({ ...order, quantity, actionId: 'store-test-0001' }).success).toBe(false);
    }
  });

  it('accepts retry-safe multi-line checkout requests', () => {
    expect(storeCheckoutSchema.safeParse({
      lines: [
        order,
        { store: 'CORNER', item: 'BEER', direction: 'buy', quantity: 25 },
      ],
      actionId: 'store-checkout-0001',
    }).success).toBe(true);
    expect(storeCheckoutSchema.safeParse({ lines: [], actionId: 'store-checkout-0001' }).success).toBe(false);
    expect(storeCheckoutSchema.safeParse({ lines: [order] }).success).toBe(false);
  });

  it('accepts retry-safe special order requests', () => {
    expect(storeSpecialOrderSchema.safeParse({ store: 'TOMMY', item: 'AK47', actionId: 'special-order-0001' }).success).toBe(true);
    expect(storeSpecialOrderSchema.safeParse({ store: 'TOMMY', item: 'AK47' }).success).toBe(false);
  });
});
