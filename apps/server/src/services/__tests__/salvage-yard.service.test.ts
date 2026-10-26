import { describe, expect, it } from 'vitest';
import { classicOgV26I, classicOgV26J, classicOgV26JBoard } from '@streets/rulesets';
import { calculateNetWorthCents } from '@streets/rules-engine';
import { COMPONENTS } from '../scavenging.service.js';
import { salvagePrice } from '../salvage-yard.service.js';
import { hideoutBuildMinutes } from '../hideout-build.service.js';

describe('salvage yard', () => {
  it('deals in every hideout component', () => {
    for (const component of COMPONENTS) expect(salvagePrice(component.key)).not.toBeNull();
    expect(salvagePrice('NOT_A_PART')).toBeNull();
  });

  it('sells everyday parts for cash and barters the scarce ones', () => {
    for (const component of COMPONENTS) {
      const price = salvagePrice(component.key)!;
      const everyday = component.rarity === 'COMMON' || component.rarity === 'UNCOMMON';
      expect(price.kind).toBe(everyday ? 'CASH' : 'BARTER');
    }
    expect((salvagePrice('SCRAP_METAL') as { cents: number }).cents).toBeLessThan((salvagePrice('RADIO') as { cents: number }).cents);
  });

  it('never asks for a part in trade for itself, and every barter input can be had', () => {
    for (const component of COMPONENTS) {
      const price = salvagePrice(component.key)!;
      if (price.kind !== 'BARTER') continue;
      expect(price.components[component.key]).toBeUndefined();
      for (const input of Object.keys(price.components)) expect(salvagePrice(input)).not.toBeNull();
    }
  });
});

describe('salvage yard on a Board round', () => {
  const board = classicOgV26JBoard;
  const empty = { cashCents: 0, whores: 0, thugs: 0, lowRiders: 0, medicine: 0, crack: 0, condoms: 0, beer: 0, pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0, ammo: 0 };

  /** Rank before and after one trade of `quantity`, for a player holding exactly what it costs. */
  function rankChange(key: string, quantity: number, spareCash: number) {
    const price = salvagePrice(key, board)!;
    const cost = price.kind === 'CASH' ? price.cents * quantity : price.cashCents * quantity;
    const parts = price.kind === 'BARTER' ? Object.fromEntries(Object.entries(price.components).map(([part, each]) => [part, each * quantity])) : {};
    const goods = price.kind === 'BARTER' ? Object.fromEntries(Object.entries(price.goods).map(([good, each]) => [good, each! * quantity])) : {};
    const before = { ...empty, ...goods, cashCents: cost + spareCash, scavengedComponents: parts };
    const after = { ...empty, cashCents: spareCash, scavengedComponents: { [key]: quantity } };
    return calculateNetWorthCents(after, board) - calculateNetWorthCents(before, board);
  }

  it('never raises rank, for any part, amount or cash on hand', () => {
    for (const { key } of COMPONENTS) {
      for (const quantity of [1, 5, 25]) {
        for (const spare of [0, 1, 2, 3, 99, 12_345]) {
          expect(rankChange(key, quantity, spare), `${key} x${quantity} +${spare}c`).toBeLessThanOrEqual(0n);
        }
      }
    }
  });

  it('tops each barter up with cash, in whole dollars, and leaves cash prices alone', () => {
    const topUps = Object.fromEntries(COMPONENTS.flatMap(({ key }) => {
      const price = salvagePrice(key, board)!;
      return price.kind === 'BARTER' ? [[key, price.cashCents]] : [];
    }));
    for (const cents of Object.values(topUps)) expect(cents % 100).toBe(0);
    expect(topUps).toEqual({
      MOTOR_ASSEMBLY: 7_500,
      REPAIR_SUPPLIES: 5_200,
      SPECIALTY_CONTAINER: 7_700,
      PRECISION_PARTS: 20_300,
      ADVANCED_MEDICAL: 15_100,
      HIGH_CAPACITY_FUEL_CELL: 285_400,
      SPECIALIST_CIRCUITRY: 287_900,
    });
    expect(salvagePrice('SCRAP_METAL', board)).toEqual(salvagePrice('SCRAP_METAL'));
    expect(salvagePrice('RADIO', board)).toEqual(salvagePrice('RADIO'));
  });

  it('charges nothing extra on rounds without the Board', () => {
    for (const ruleset of [undefined, classicOgV26I, classicOgV26J]) {
      for (const { key } of COMPONENTS) {
        const price = salvagePrice(key, ruleset)!;
        if (price.kind === 'BARTER') expect(price.cashCents, key).toBe(0);
      }
    }
  });
});

describe('hideout construction time', () => {
  it('keeps room level 1 instant and makes later levels take longer', () => {
    expect(hideoutBuildMinutes('SAFE_ROOM', 1)).toBe(0);
    expect(hideoutBuildMinutes('SAFE_ROOM', 2)).toBeGreaterThan(0);
    expect(hideoutBuildMinutes('WORKSHOP', 3)).toBeGreaterThan(hideoutBuildMinutes('WORKSHOP', 2));
    expect(hideoutBuildMinutes('STORAGE', 1)).toBeGreaterThan(0);
  });
});
