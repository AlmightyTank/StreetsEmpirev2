import { describe, expect, it } from 'vitest';
import { classicOgV05B, classicOgV05C, type Ruleset } from '@streets/rulesets';
import { SUPPLY_LEVELS, cityCounter, cityHeatRules, cityRulesetProblems } from '../calculations/cities.js';
import {
  eventAt,
  fillMarket,
  liveCounter,
  marketView,
  quoteMoved,
  settleLiveShelf,
  settlePush,
  streetWire,
  supplyAt,
} from '../calculations/markets.js';
import { arrestChance, resolveArrest, resolveRoadStop, resolveRunTrouble, roadStopChance, saleHeat } from '../calculations/road-risk.js';
import { seededRng } from '../rng.js';
import { pumpProblems, runTravelRiskSimulation, travelRiskGate } from '../simulations/travel-risk.js';

const ruleset = classicOgV05C;
const market = ruleset.travel.market;
const start = new Date('2026-09-18T00:00:00Z');
const hours = (value: number) => new Date(start.getTime() + value * 3_600_000);
const products = Object.keys(ruleset.products);
const cities = Object.keys(ruleset.cities);
const cityMap: NonNullable<Ruleset['cities']> = ruleset.cities;
const oldCityMap: NonNullable<Ruleset['cities']> = classicOgV05B.cities;

/** Pip's supply for a product in a city every hour for a week. */
function week(seed: string, city: string, product: string) {
  return Array.from({ length: 24 * 7 }, (_, hour) => supplyAt(ruleset, seed, city, product, hours(hour)));
}

describe('0.5.0-C the supply schedule', () => {
  it('is the same every time it is read, and differs between rounds', () => {
    expect(week('round-a', 'las-vegas', 'ECSTASY')).toEqual(week('round-a', 'las-vegas', 'ECSTASY'));
    expect(week('round-a', 'las-vegas', 'ECSTASY')).not.toEqual(week('round-b', 'las-vegas', 'ECSTASY'));
  });

  it('barely moves in New York and moves most in Las Vegas', () => {
    const offUsual = (city: string) => products.reduce((sum, product) => {
      const usual = cityMap[city]!.products[product]!.supply;
      return sum + week('round-a', city, product).filter((level) => level !== usual).length;
    }, 0);
    expect(offUsual('new-york-city')).toBeLessThan(offUsual('las-vegas') / 4);
    expect(offUsual('las-vegas')).toBeGreaterThan(0);
  });

  it('never falls below a city\'s floor except in a drought, and never deals what Pip does not carry', () => {
    for (const city of cities) {
      const rules = cityMap[city]!;
      const floor = SUPPLY_LEVELS.indexOf(rules.supplyFloor);
      for (const product of products) {
        week('round-c', city, product).forEach((level, hour) => {
          if (rules.products[product]!.supply === null) { expect(level).toBeNull(); return; }
          const drought = eventAt(ruleset, 'round-c', city, product, hours(hour))?.kind === 'DROUGHT';
          if (!drought) expect(SUPPLY_LEVELS.indexOf(level!)).toBeLessThanOrEqual(Math.max(floor, SUPPLY_LEVELS.indexOf(rules.products[product]!.supply!)));
        });
      }
    }
  });

  it('leaves every city at its usual supply without swings or events (0.5.0-B)', () => {
    for (const city of cities) for (const product of products) {
      expect(supplyAt(classicOgV05B, 'round-a', city, product, hours(5))).toBe(oldCityMap[city]!.products[product]!.supply);
    }
  });

  it('lands gluts and droughts that set Pip\'s supply and move the market, and puts them on the wire as they start', () => {
    let found = 0;
    for (let sample = 0; sample < 40 && found < 2; sample++) {
      const seed = `events-${sample}`;
      const wire = streetWire(ruleset, seed, start, hours(24 * 3)).filter((item) => item.kind !== 'SUPPLY');
      for (const item of wire) {
        const during = new Date(item.at.getTime() + 60_000);
        const level = supplyAt(ruleset, seed, item.city, item.product, during);
        const kind = ruleset.travel.events.kinds[item.kind as 'GLUT' | 'DROUGHT'];
        if (cityMap[item.city]!.products[item.product]!.supply !== null) expect(level).toBe(kind.supply);
        const live = marketView(ruleset, seed, item.city, item.product, 0, during)!;
        const calm = marketView(ruleset, seed, item.city, item.product, 0, new Date(item.endsAt!.getTime() + 60_000))!;
        expect(live.event?.kind).toBe(item.kind);
        expect(calm.event).toBeNull();
        found++;
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('never puts anything on the wire from after now', () => {
    const now = hours(30);
    for (const item of streetWire(ruleset, 'round-a', start, now)) expect(item.at.getTime()).toBeLessThanOrEqual(now.getTime());
  });
});

describe('0.5.0-C Pip\'s shelves through supply changes', () => {
  const city = 'las-vegas';
  const product = 'ECSTASY';

  it('is a full shelf at today\'s size before it is touched', () => {
    const at = hours(3);
    const settled = settleLiveShelf(null, ruleset, 'round-a', city, product, at);
    expect(settled.stock).toBe(liveCounter(ruleset, 'round-a', city, product, at)?.shelfCap ?? 0);
  });

  it('settles the same however often it is read', () => {
    const shelf = { stock: 3, stockAt: hours(1) };
    const once = settleLiveShelf(shelf, ruleset, 'round-a', city, product, hours(30));
    const halfway = settleLiveShelf(shelf, ruleset, 'round-a', city, product, hours(12));
    const twice = settleLiveShelf({ stock: halfway.stock, stockAt: halfway.stockAt }, ruleset, 'round-a', city, product, hours(30));
    expect(twice.stock).toBe(once.stock);
  });

  it('is empty while Pip is out', () => {
    for (let sample = 0; sample < 50; sample++) {
      const seed = `out-${sample}`;
      const hour = week(seed, city, product).findIndex((level) => level === 'OUT');
      if (hour < 0) continue;
      const settled = settleLiveShelf({ stock: 50, stockAt: hours(Math.max(0, hour - 1)) }, ruleset, seed, city, product, hours(hour));
      expect(settled.stock).toBe(0);
      return;
    }
    throw new Error('Las Vegas never ran out of ecstasy in 50 weeks.');
  });
});

describe('0.5.0-C the high market', () => {
  const at = hours(2);

  it('wears a push off by half every half-life', () => {
    expect(settlePush({ push: 0.4, pushAt: at }, market, new Date(at.getTime() + market.recoveryHalfLifeMinutes * 60_000))).toBeCloseTo(0.2);
    expect(settlePush(null, market, at)).toBe(0);
  });

  it('prices every unit after its own move, so buying and selling the same units back always loses', () => {
    const rng = seededRng(7);
    for (let trial = 0; trial < 200; trial++) {
      const city = cities[Math.floor(rng() * cities.length)]!;
      const product = products[Math.floor(rng() * products.length)]!;
      const push = rng() * 1.2 - 0.6;
      const units = 1 + Math.floor(rng() * 20_000);
      const view = marketView(ruleset, `trial-${trial}`, city, product, push, at)!;
      const bought = fillMarket(view, market, 'buy', units);
      const soldBack = fillMarket({ ...view, push: bought.pushAfter }, market, 'sell', units);
      expect(soldBack.totalCents).toBeLessThan(bought.totalCents);
      const sold = fillMarket(view, market, 'sell', units);
      const boughtBack = fillMarket({ ...view, push: sold.pushAfter }, market, 'buy', units);
      expect(boughtBack.totalCents).toBeGreaterThan(sold.totalCents);
      // However it is split.
      const half = Math.floor(units / 2);
      const first = fillMarket(view, market, 'sell', half);
      const second = fillMarket({ ...view, push: first.pushAfter }, market, 'sell', units - half);
      expect(first.totalCents + second.totalCents).toBe(sold.totalCents);
    }
  });

  it('cannot be pumped and cashed out in any city', () => {
    expect(pumpProblems(ruleset)).toEqual([]);
  });

  it('never sells for less than Pip\'s usual price at home', () => {
    const view = marketView(ruleset, 'round-a', 'new-york-city', 'COCAINE', 0, at)!;
    expect(view.buyCents).toBeGreaterThanOrEqual(cityCounter(ruleset, 'new-york-city', 'COCAINE')!.buyCents);
  });

  it('refuses a trade that moved against the trader past the tolerance, and only then', () => {
    expect(quoteMoved(market, 'sell', 1000, 990)).toBe(false);
    expect(quoteMoved(market, 'sell', 1000, 970)).toBe(true);
    expect(quoteMoved(market, 'sell', 1000, 1100)).toBe(false);
    expect(quoteMoved(market, 'buy', 1000, 1010)).toBe(false);
    expect(quoteMoved(market, 'buy', 1000, 1030)).toBe(true);
  });

  it('keeps the ruleset free of same-city loops at every supply level and event', () => {
    expect(cityRulesetProblems(ruleset)).toEqual([]);
  });
});

describe('0.5.0-C Heat, arrests and stops', () => {
  it('draws Heat from selling by the city\'s pressure, and more for a sale split in two', () => {
    expect(saleHeat(ruleset, 'miami-beach', 25_000_000)).toBeGreaterThan(saleHeat(ruleset, 'atlanta', 25_000_000));
    expect(saleHeat(ruleset, 'miami-beach', 12_500_000) * 2).toBeGreaterThanOrEqual(saleHeat(ruleset, 'miami-beach', 25_000_000));
    expect(saleHeat(classicOgV05B, 'miami-beach', 25_000_000)).toBe(0);
  });

  it('starts arrests at each city\'s own level', () => {
    const beverly = { ...ruleset, heat: cityHeatRules(ruleset, 'beverly-hills') };
    const atlanta = { ...ruleset, heat: cityHeatRules(ruleset, 'atlanta') };
    expect(arrestChance(70, beverly)).toBeGreaterThan(0);
    expect(arrestChance(70, atlanta)).toBe(0);
    expect(arrestChance(100, { ...classicOgV05B, heat: cityHeatRules(classicOgV05B, 'atlanta') })).toBe(0);
  });

  it('arrests at home with a bigger seizure than a bust and time locked up', () => {
    const home = { ...ruleset, heat: cityHeatRules(ruleset, 'new-york-city') };
    const arrest = resolveArrest({ heat: 100, cashCents: 1_000_000n, products: { CRACK: 100 }, ruleset: home, rng: () => 0 });
    expect(arrest.arrested).toBe(true);
    expect(arrest.seized.CRACK).toBeGreaterThan(Math.floor(100 * home.heat!.bust.productSeizedFraction));
    expect(arrest.downtimeMinutes).toBe(ruleset.heat.arrest.downtimeMinutes);
    expect(arrest.heatAfter).toBe(100 - ruleset.heat.arrest.heatDrop);
    // Below the level it never rolls, so older rolls line up.
    let rolls = 0;
    resolveArrest({ heat: 50, cashCents: 0n, products: {}, ruleset: home, rng: () => { rolls++; return 0; } });
    expect(rolls).toBe(0);
  });

  it('takes the whole trunk on an arrest on a run, and a share on a bust', () => {
    const town = { ...ruleset, heat: cityHeatRules(ruleset, 'miami-beach') };
    const arrest = resolveRunTrouble({ heat: 100, cashCents: 1_000_000n, cargo: { COCAINE: 300, WEED: 0 }, ruleset: town, bustChance: 0.3, rng: () => 0 });
    expect(arrest.kind).toBe('ARREST');
    expect(arrest.seized).toEqual({ COCAINE: 300 });
    expect(arrest.fineCents).toBe(BigInt(Math.floor(1_000_000 * ruleset.heat.arrest.runCashSeizedFraction)));
    const rolls = [0.99, 0];
    const bust = resolveRunTrouble({ heat: 100, cashCents: 1_000_000n, cargo: { COCAINE: 300 }, ruleset: town, bustChance: 0.3, rng: () => rolls.shift()! });
    expect(bust.kind).toBe('BUST');
    expect(bust.seized.COCAINE).toBeLessThan(300);
  });

  it('stops heavy loads on heavy roads more, and fewer with escorts', () => {
    const base = { route: ['new-york-city', 'miami-beach'], cargoUnits: 0, escorts: 0, heat: 0 };
    const empty = roadStopChance(ruleset, base);
    const loaded = roadStopChance(ruleset, { ...base, cargoUnits: 3000 });
    const escorted = roadStopChance(ruleset, { ...base, cargoUnits: 3000, escorts: 10 });
    const quiet = roadStopChance(ruleset, { ...base, route: ['new-york-city', 'detroit'], cargoUnits: 3000 });
    expect(loaded).toBeGreaterThan(empty);
    expect(escorted).toBeLessThan(loaded);
    expect(quiet).toBeLessThan(loaded);
    expect(roadStopChance(classicOgV05B, { ...base, cargoUnits: 3000 })).toBe(0);
  });

  it('rolls the same stop for the same seed', () => {
    const input = { route: ['new-york-city', 'miami-beach'], cargo: { COCAINE: 3000 }, cashCents: 500_000n, escorts: 0, heat: 90 };
    const once = resolveRoadStop(ruleset, { ...input, rng: seededRng(42) });
    const again = resolveRoadStop(ruleset, { ...input, rng: seededRng(42) });
    expect(again).toEqual(once);
    const stopped = Array.from({ length: 200 }, (_, seed) => resolveRoadStop(ruleset, { ...input, rng: seededRng(seed) })).find((stop) => stop.stopped)!;
    expect(stopped.road?.name).toBe('I-95');
    expect(stopped.seized.COCAINE).toBe(Math.floor(3000 * ruleset.travel.stops.productSeizedFraction));
  });
});

describe('0.5.0-C gate', () => {
  it('keeps the range wide and the expected value near the plan, and no run beats the street', () => {
    expect(travelRiskGate(ruleset, runTravelRiskSimulation(ruleset)).problems).toEqual([]);
  }, 60_000);
});
