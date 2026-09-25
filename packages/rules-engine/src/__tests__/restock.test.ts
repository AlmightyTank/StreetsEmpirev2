import { describe, expect, it } from 'vitest';
import { classicOgV01 } from '@streets/rulesets';
import type { RestockRule, StockAtField, StockField } from '@streets/rulesets';
import { calculateStoreTrade } from '../calculations/stores.js';
import { fullShelves, restockedItems, settleStock, startingStock } from '../calculations/restock.js';

const rules = classicOgV01;

function ruleFor(field: StockField): RestockRule {
  const found = restockedItems(rules).get(field);
  if (!found) throw new Error(`${field} has no restock rule`);
  return found.rule;
}

function shelf(field: StockField, stock: number, minutesAgo: number, now: Date) {
  const rule = ruleFor(field);
  return {
    [field]: stock,
    [rule.stockAtField]: new Date(now.getTime() - minutesAgo * 60_000),
  };
}

const now = new Date('2026-09-08T12:00:00.000Z');

/** A buyer who is only ever limited by the shelf. */
function buyer(extra: Record<string, unknown> = {}) {
  return {
    ...rules.round.startingPlayer,
    cashCents: 1_000_000_000n,
    shotgunUnlocked: true,
    tek9Unlocked: true,
    ak47Unlocked: true,
    ...fullShelves(rules),
    ...extra,
  };
}

describe('shop restocking', () => {
  it('separates the tiers by the wait, since every crate fills the shelf', () => {
    const pistol = ruleFor('pistolStock').intervalMinutes;
    const shotgun = ruleFor('shotgunStock').intervalMinutes;
    const lowRider = ruleFor('lowRiderStock').intervalMinutes;
    const tek9 = ruleFor('tek9Stock').intervalMinutes;
    const ak47 = ruleFor('ak47Stock').intervalMinutes;

    // A car is more work than sourcing a shotgun, less than a Tek-9.
    expect(pistol).toBeLessThan(shotgun);
    expect(shotgun).toBeLessThan(lowRider);
    expect(lowRider).toBeLessThan(tek9);
    expect(tek9).toBeLessThan(ak47);
  });

  it('gives the heavier gun the lower cap', () => {
    expect(ruleFor('pistolStock').cap).toBeGreaterThan(ruleFor('shotgunStock').cap);
    expect(ruleFor('shotgunStock').cap).toBeGreaterThan(ruleFor('tek9Stock').cap);
    expect(ruleFor('tek9Stock').cap).toBeGreaterThan(ruleFor('ak47Stock').cap);
  });

  it('keeps pistols flowing faster than a crew can be recruited', () => {
    // Thug happiness wants one weapon per thug, so the cheap gun running
    // short would put a ceiling on happiness itself. Its shelf exists to
    // bound the item, not to ration it - the check is that supply outruns
    // the fastest possible hiring, derived from the ruleset rather than
    // assumed.
    const rule = ruleFor('pistolStock');
    const perDay = ((24 * 60) / rule.intervalMinutes) * rule.perInterval!;

    const turnsPerDay = ((24 * 60) / rules.turns.intervalMinutes) * rules.turns.amountPerInterval;
    const fastestDistrict = Math.max(
      ...Object.values(rules.scouting.districts).map((d) => d.thugsPerTurn),
    );
    const recruitedPerDay = turnsPerDay * fastestDistrict;

    expect(perDay).toBeGreaterThan(recruitedPerDay * 10);
  });

  it('gives the pistol by far the deepest shelf and the shortest wait', () => {
    const pistol = ruleFor('pistolStock');
    for (const field of ['shotgunStock', 'tek9Stock', 'ak47Stock'] as const) {
      expect(pistol.cap).toBeGreaterThan(ruleFor(field).cap);
      expect(pistol.intervalMinutes).toBeLessThan(ruleFor(field).intervalMinutes);
    }
  });

  it('limits exactly the intended items, and nothing else', () => {
    expect([...restockedItems(rules).keys()].sort()).toEqual([
      'ak47Stock',
      'beerStock',
      'condomStock',
      'crackStock',
      'lowRiderStock',
      'medicineStock',
      'pistolStock',
      'shotgunStock',
      'tek9Stock',
      'thugStock',
    ]);
  });

  it('still lets hiring beat recruiting, so cash keeps its advantage', () => {
    // Thugs are limited now, but the limit only stops a fortune becoming an
    // army in one click - buying must stay clearly faster than scouting or
    // paying for muscle would be pointless.
    const rule = ruleFor('thugStock');
    const boughtPerDay = ((24 * 60) / rule.intervalMinutes) * rule.perInterval!;

    const turnsPerDay = ((24 * 60) / rules.turns.intervalMinutes) * rules.turns.amountPerInterval;
    const recruitedPerDay =
      turnsPerDay * Math.max(...Object.values(rules.scouting.districts).map((d) => d.thugsPerTurn));

    expect(boughtPerDay).toBeGreaterThan(recruitedPerDay * 2);
  });

  it('lets hiring cover the crack Pip cannot, within a couple of days', () => {
    // Pip's shelf deliberately stops covering a large stable, and thugs are
    // what cook the difference. If muscle came too slowly, the limit at Pip's
    // would become the spiral it is carefully not - so this checks the worst
    // case, a crew sitting at the happiness floor where cooking is slowest.
    const cook = rules.production.crack;
    const burnPerTurn = biggestCrew.whores * rules.scouting.consumption.crackPerWhorePerTurn;
    const thugsNeeded = burnPerTurn / (cook.perThugPerTurn * cook.minHappinessMultiplier);

    const rule = ruleFor('thugStock');
    const boughtPerDay = ((24 * 60) / rule.intervalMinutes) * rule.perInterval!;

    expect(thugsNeeded / boughtPerDay).toBeLessThan(2);
  });

  /**
   * The reference empire these guards are sized against: recruiting flat out
   * in the richest recruiting district for a whole round lands near here, so
   * it is the largest crew the ruleset can actually grow.
   */
  const biggestCrew = { whores: 380, thugs: 200 };

  it('lets Pip run short of what a big crew wants, but never starve it', () => {
    // The only shelf allowed to stop being enough, because crack is the only
    // supply that can also be produced. Two properties, both deliberate.
    const rule = ruleFor('crackStock');
    const turnsPerHour = (60 / rules.turns.intervalMinutes) * rules.turns.amountPerInterval;
    const perHour = (60 / rule.intervalMinutes) * rule.perInterval!;

    // 1. It always outpaces consumption, so rocks never simply run out.
    const burnPerHour =
      turnsPerHour * biggestCrew.whores * rules.scouting.consumption.crackPerWhorePerTurn;
    expect(perHour).toBeGreaterThan(burnPerHour * 2);

    // 2. But it cannot stock the biggest crew's happiness want in one visit -
    //    that is what pushes a large empire onto cooking.
    expect(rule.cap).toBeLessThan(biggestCrew.whores * rules.happiness.whore.crackPerWhore);
  });

  it('keeps cooking cheaper than Pip, so the limit has somewhere to send you', () => {
    expect(rules.production.crack.ingredientCentsPerRock).toBeLessThan(
      rules.stores.PIP.items.CRACK!.buyCents,
    );
  });

  it('delivers upkeep faster than the biggest crew can burn it', () => {
    // This is the guard on the whole corner-store idea. Condoms and beer hold
    // happiness up and medicine is the only cure for an infection, so a
    // player who cannot buy them is in a spiral that cash cannot fix.
    const turnsPerHour = (60 / rules.turns.intervalMinutes) * rules.turns.amountPerInterval;
    const use = rules.scouting.consumption;

    const burnPerHour = {
      condomStock: turnsPerHour * biggestCrew.whores * use.condomsPerWhorePerTurn,
      beerStock: turnsPerHour * biggestCrew.thugs * use.beerPerThugPerTurn,
    };

    for (const [field, perHour] of Object.entries(burnPerHour) as [StockField, number][]) {
      const rule = ruleFor(field);
      const deliveredPerHour = (60 / rule.intervalMinutes) * (rule.perInterval ?? 1);

      expect(deliveredPerHour).toBeGreaterThan(perHour * 2);
    }
  });

  it('holds enough on the shelf to stock the biggest crew in one visit', () => {
    // A shelf smaller than what a full crew wants on hand would cap happiness
    // itself, which is a different and much worse limit than pacing supply.
    expect(ruleFor('condomStock').cap).toBeGreaterThanOrEqual(
      biggestCrew.whores * rules.happiness.whore.condomsPerWhore,
    );
    expect(ruleFor('beerStock').cap).toBeGreaterThanOrEqual(biggestCrew.thugs);
    expect(ruleFor('medicineStock').cap).toBeGreaterThanOrEqual(
      Math.ceil(biggestCrew.whores * rules.health.maxInfectedFractionPerAction),
    );
  });

  it('restocks every shelf in full on its own clock', () => {
    // The cap is the delivery: a crate arrives and the shelf is stocked. One
    // interval takes any shelf in this ruleset from empty to full, which is
    // what puts the tiering entirely in the wait rather than in the trickle.
    for (const [field, { rule }] of restockedItems(rules)) {
      expect(rule.perInterval).toBe(rule.cap);

      const settled = settleStock(shelf(field, 0, rule.intervalMinutes, now), rule, now);
      expect(settled.stock).toBe(rule.cap);
      expect(settled.nextAt).toBeNull();
    }
  });

  it('does not bank an absence into more than one delivery', () => {
    // Away ten hours is the same shelf as away one. Otherwise a player who
    // logs in rarely would out-supply one who plays constantly.
    const rule = ruleFor('condomStock');
    const away = settleStock(shelf('condomStock', 0, rule.intervalMinutes * 10, now), rule, now);

    expect(away.stock).toBe(rule.cap);
  });

  it('restocks nothing until a whole interval has passed', () => {
    const rule = ruleFor('ak47Stock');
    const settled = settleStock(shelf('ak47Stock', 0, rule.intervalMinutes * 0.9, now), rule, now);

    expect(settled.stock).toBe(0);
    expect(settled.gained).toBe(0);
  });

  it('keeps a delayed shipment off the shelf until its delayed arrival', () => {
    const rule = ruleFor('ak47Stock');
    const options = {
      rules: {
        enabled: true,
        seed: 'delay-test',
        delayChancePercent: 100,
        delayMinutes: 60,
        partialChancePercent: 0,
        partialMultiplier: 0.5,
        largeChancePercent: 0,
        largeMultiplier: 2,
      },
      context: 'ak47Stock',
    };
    const state = shelf('ak47Stock', 0, rule.intervalMinutes, now);
    const due = settleStock(state, rule, now, rule.intervalMinutes, options);

    expect(due.stock).toBe(0);
    expect(due.shipment).toMatchObject({ status: 'DELAYED', quantity: rule.perInterval, delayMinutes: 60 });
    expect(due.nextAt).toEqual(new Date(now.getTime() + 60 * 60_000));

    const arrived = settleStock(state, rule, due.nextAt!, rule.intervalMinutes, options);
    expect(arrived.stock).toBe(rule.cap);
    expect(arrived.gained).toBe(rule.cap);
    expect(arrived.nextAt).toBeNull();
  });

  it('can settle a partial shipment without filling the shelf', () => {
    const rule: RestockRule = {
      cap: 10,
      perInterval: 4,
      intervalMinutes: 60,
      stockField: 'condomStock' as StockField,
      stockAtField: 'condomStockAt' as StockAtField,
    };
    const settled = settleStock(
      { condomStock: 0, condomStockAt: new Date(now.getTime() - 60 * 60_000) },
      rule,
      now,
      rule.intervalMinutes,
      {
        rules: {
          enabled: true,
          seed: 'partial-test',
          delayChancePercent: 0,
          delayMinutes: 60,
          partialChancePercent: 100,
          partialMultiplier: 0.5,
          largeChancePercent: 0,
          largeMultiplier: 2,
        },
        context: 'condomStock',
      },
    );

    expect(settled.stock).toBe(2);
    expect(settled.gained).toBe(2);
    expect(settled.shipment).toMatchObject({ status: 'PARTIAL', quantity: 2 });
    expect(settled.nextAt).toEqual(new Date(now.getTime() + 60 * 60_000));
  });

  it('keeps the part-served wait rather than restarting it', () => {
    // The lazy-settlement guarantee: reading the store does not push the
    // delivery back. Half a wait served is still half a wait remaining.
    const rule = ruleFor('ak47Stock');
    const settled = settleStock(
      shelf('ak47Stock', rule.cap - 1, rule.intervalMinutes * 0.5, now),
      rule,
      now,
    );

    expect(settled.gained).toBe(0);
    const dueInMinutes = (settled.nextAt!.getTime() - now.getTime()) / 60_000;
    expect(dueInMinutes).toBeCloseTo(rule.intervalMinutes * 0.5, 5);
  });

  it('does not bank a week away into a week of stock', () => {
    const rule = ruleFor('ak47Stock');
    const settled = settleStock(shelf('ak47Stock', 0, 60 * 24 * 7, now), rule, now);

    expect(settled.stock).toBe(rule.cap);
    expect(settled.nextAt).toBeNull();
  });

  it('starts the wait from when the shelf filled, not from days earlier', () => {
    const rule = ruleFor('ak47Stock');
    // Full for a week. The clock parks, so buying one now means a full wait.
    const settled = settleStock(shelf('ak47Stock', rule.cap, 60 * 24 * 7, now), rule, now);
    expect(settled.stockAt.getTime()).toBe(now.getTime());

    const afterPurchase = settleStock(
      { ak47Stock: rule.cap - 1, [rule.stockAtField]: settled.stockAt },
      rule,
      now,
    );
    const dueInMinutes = (afterPurchase.nextAt!.getTime() - now.getTime()) / 60_000;
    expect(dueInMinutes).toBe(rule.intervalMinutes);
  });

  it.each([
    ['TOMMY', 'AK47', 'ak47Stock'],
    ['CHARLIE', 'LOW_RIDER', 'lowRiderStock'],
  ] as const)('sells %s %s up to the shelf but not one more', (store, item, field) => {
    const cap = ruleFor(field).cap;

    expect(
      calculateStoreTrade(buyer(), { store, item, direction: 'buy', quantity: cap }, rules)
        .quantityChange,
    ).toBe(cap);

    expect(() =>
      calculateStoreTrade(buyer(), { store, item, direction: 'buy', quantity: cap + 1 }, rules),
    ).toThrow(/only has/);
  });

  it('refuses an empty shelf however much cash is on hand', () => {
    expect(() =>
      calculateStoreTrade(
        buyer({ lowRiderStock: 0 }),
        { store: 'CHARLIE', item: 'LOW_RIDER', direction: 'buy', quantity: 1 },
        rules,
      ),
    ).toThrow(/Charlie has no Low-Rider left/);
  });

  it('names the shopkeeper who is out, not always Tommy', () => {
    expect(() =>
      calculateStoreTrade(
        buyer({ ak47Stock: 0 }),
        { store: 'TOMMY', item: 'AK47', direction: 'buy', quantity: 1 },
        rules,
      ),
    ).toThrow(/Tommy has no AK-47 left/);
  });

  it('reports the shelf it took from, so the service can spend it', () => {
    const trade = calculateStoreTrade(
      buyer(),
      { store: 'CHARLIE', item: 'LOW_RIDER', direction: 'buy', quantity: 2 },
      rules,
    );

    expect(trade.stockField).toBe('lowRiderStock');
    expect(trade.stockTaken).toBe(2);
  });

  it.each([
    ['CHARLIE', 'LOW_RIDER', 'lowRiders', 'lowRiderStock'],
    ['PIP', 'CRACK', 'crack', 'crackStock'],
  ] as const)('never charges a %s sale to the shelf', (store, item, owned, field) => {
    // The shelf is what a shop can source for you, not a stock of trades. It
    // matters most at Pip's: a player whose stable has outgrown the counter
    // must still be able to dump rocks for cash.
    const trade = calculateStoreTrade(
      buyer({ [owned]: 900, [field]: 0 }),
      { store, item, direction: 'sell', quantity: 900 },
      rules,
    );

    expect(trade.quantityChange).toBe(-900);
    expect(trade.stockField).toBeNull();
    expect(trade.stockTaken).toBe(0);
  });

  it('cannot be farmed by buying and selling back', () => {
    // Buying a car and reselling it must never be a way to launder a shelf
    // into cash, or the cap would only be an inconvenience.
    const item = rules.stores.CHARLIE.items.LOW_RIDER!;
    expect(item.sellCents!).toBeLessThan(item.buyCents);
  });

  it('seeds a new player with full shelves and a running clock', () => {
    const seed = startingStock(rules, now);

    // Every shelf the ruleset defines, and nothing that has no rule.
    for (const [field, { rule }] of restockedItems(rules)) {
      expect(seed[field]).toBe(rule.cap);
      expect(seed[rule.stockAtField]).toEqual(now);
    }
    expect(Object.keys(seed)).toHaveLength(restockedItems(rules).size * 2);
  });

  it('clamps a shelf that somehow sits above its cap', () => {
    const rule = ruleFor('lowRiderStock');
    const settled = settleStock(shelf('lowRiderStock', 99, 0, now), rule, now);

    expect(settled.stock).toBe(rule.cap);
    expect(settled.changed).toBe(true);
  });
});
