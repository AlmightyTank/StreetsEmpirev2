import { describe, expect, it } from 'vitest';
import { classicOgV08H, type Ruleset, type StoreKey } from '@streets/rulesets';
import { fullShelves } from '../calculations/restock.js';
import { calculateStoreTrade, type StockHolder } from '../calculations/stores.js';
import { calculateProductTrade, productEconomy, productLoops } from '../calculations/product-economy.js';

const releasePlayer = {
  ...classicOgV08H.round.startingPlayer,
  cashCents: 10_000_000n,
  shotgunUnlocked: true,
  tek9Unlocked: true,
  ak47Unlocked: true,
  ...fullShelves(classicOgV08H),
};

const numericValue = (holder: Record<string, unknown>, field: string): number => {
  const value = holder[field];
  return typeof value === 'number' ? value : 0;
};

function bestBonus(ruleset: Ruleset, store: StoreKey) {
  return (ruleset.storeEconomy?.traderPerks?.[store] ?? []).reduce(
    (best, perk) => ({
      buyDiscountPercent: Math.max(best.buyDiscountPercent, perk.buyDiscountPercent ?? 0),
      sellBonusPercent: Math.max(best.sellBonusPercent, perk.sellBonusPercent ?? 0),
    }),
    { buyDiscountPercent: 0, sellBonusPercent: 0 },
  );
}

describe('0.8.0-H store economy release checks', () => {
  it('keeps every shipped product economy free of direct money loops', () => {
    expect(productLoops(classicOgV08H)).toEqual([]);
  });

  it('keeps relationship-adjusted store quotes above their best buyback', () => {
    for (const [storeKey, store] of Object.entries(classicOgV08H.stores) as [StoreKey, typeof classicOgV08H.stores[StoreKey]][]) {
      const bonus = bestBonus(classicOgV08H, storeKey);
      for (const [itemKey, item] of Object.entries(store.items)) {
        if (item.sellCents === null) continue;
        const buyUnitCents = Math.floor(item.buyCents * (100 - bonus.buyDiscountPercent) / 100);
        const sellUnitCents = Math.floor(item.sellCents * (100 + bonus.sellBonusPercent) / 100);
        const buy = calculateStoreTrade(
          releasePlayer,
          { store: storeKey, item: itemKey, direction: 'buy', quantity: 1 },
          classicOgV08H,
          { buyUnitCents, sellUnitCents },
        );
        const sell = calculateStoreTrade(
          { ...releasePlayer, [item.field]: numericValue(releasePlayer, item.field) + 1 },
          { store: storeKey, item: itemKey, direction: 'sell', quantity: 1 },
          classicOgV08H,
          { buyUnitCents, sellUnitCents },
        );

        expect(buy.unitCents).toBeGreaterThan(sell.unitCents);
        expect(buy.totalCents - sell.cashChangeCents).toBeGreaterThan(0n);
      }
    }
  });

  it('keeps pressure and relationship-adjusted Pip product quotes above buyback', () => {
    const maxPressure = classicOgV08H.storeEconomy?.pipProductPressure?.maxPricePressure ?? 0;
    const pipBonus = bestBonus(classicOgV08H, 'PIP');

    for (const [product, definition] of Object.entries(classicOgV08H.products ?? {})) {
      const economy = productEconomy(classicOgV08H, product);
      if (!economy?.pip) continue;

      const discountedBuy = Math.floor(economy.pip.buyCents * (1 - maxPressure) * (100 - pipBonus.buyDiscountPercent) / 100);
      const boostedSell = Math.floor(economy.pip.sellCents * (1 + maxPressure) * (100 + pipBonus.sellBonusPercent) / 100);
      const buy = calculateProductTrade({
        ruleset: classicOgV08H,
        product,
        direction: 'buy',
        quantity: 1,
        owned: 0,
        cashCents: 1_000_000n,
        shelfStock: 1,
        buyUnitCents: discountedBuy,
        sellUnitCents: boostedSell,
      });
      const sell = calculateProductTrade({
        ruleset: classicOgV08H,
        product,
        direction: 'sell',
        quantity: 1,
        owned: 1,
        cashCents: 0n,
        shelfStock: 0,
        buyUnitCents: discountedBuy,
        sellUnitCents: boostedSell,
      });

      expect(definition.name).toBeTruthy();
      expect(buy.unitCents).toBeGreaterThan(sell.unitCents);
      expect(buy.totalCents - sell.cashChangeCents).toBeGreaterThan(0n);
    }
  });

  it('rejects concurrent limited-shelf orders once the first buyer consumes stock', () => {
    const item = classicOgV08H.stores.TOMMY.items.AK47!;
    const firstBuyer = { ...releasePlayer, [item.restock!.stockField]: 1 } as typeof releasePlayer & StockHolder;
    const first = calculateStoreTrade(
      firstBuyer,
      { store: 'TOMMY', item: 'AK47', direction: 'buy', quantity: 1 },
      classicOgV08H,
    );
    expect(first.stockTaken).toBe(1);

    const afterFirst = {
      ...firstBuyer,
      cashCents: firstBuyer.cashCents + first.cashChangeCents,
      ak47s: firstBuyer.ak47s + first.quantityChange,
      [first.stockField!]: firstBuyer[first.stockField!]! - first.stockTaken,
    };
    expect(() => calculateStoreTrade(
      afterFirst,
      { store: 'TOMMY', item: 'AK47', direction: 'buy', quantity: 1 },
      classicOgV08H,
    )).toThrow('has no AK-47 left');
  });
});
