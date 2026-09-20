import { describe, expect, it } from 'vitest';
import { classicOgV05A, classicOgV05B, classicOgV06D } from '@streets/rulesets';
import { calculateNetWorthCents } from '../calculations/net-worth.js';
import {
  RunError,
  calculateCityTrade,
  cargoUnits,
  driveMs,
  planDriveOn,
  planHeadHome,
  planLaunch,
  runCapacity,
  runNetWorthCents,
  runPosition,
  settleCityShelf,
} from '../calculations/runs.js';
import { cityCounter } from '../calculations/cities.js';

const ruleset = classicOgV05B;
const NYC = 'new-york-city';
const now = new Date('2026-09-18T12:00:00Z');
const minutes = (value: number) => new Date(now.getTime() + value * 60_000);

describe('0.5.0-B planning a run', () => {
  it('drives out, trades for the window, and comes home, paying for both legs up front', () => {
    const plan = planLaunch(ruleset, { home: NYC, to: 'miami-beach', routeIndex: 0, now });
    expect(plan.route.cities).toEqual([NYC, 'miami-beach']);
    // I-95 both ways: 38 drive hours at half a turn each.
    expect(plan.turns).toBe(19);
    expect(plan.stops).toEqual([
      { city: 'miami-beach', route: [NYC, 'miami-beach'], departAt: now, arriveAt: minutes(95), leaveAt: minutes(215) },
      { city: NYC, route: ['miami-beach', NYC], departAt: minutes(215), arriveAt: minutes(310), leaveAt: null },
    ]);
  });

  it('can take the long way, and pays for it', () => {
    const plan = planLaunch(ruleset, { home: NYC, to: 'miami-beach', routeIndex: 1, now });
    expect(plan.route.passesThrough).toEqual(['atlanta']);
    expect(plan.turns).toBe(21);
  });

  it('refuses a run on rounds without runs, home as a destination, or a route that is not there', () => {
    expect(() => planLaunch(classicOgV05A, { home: NYC, to: 'detroit', routeIndex: 0, now })).toThrow(RunError);
    expect(() => planLaunch(ruleset, { home: NYC, to: NYC, routeIndex: 0, now })).toThrow(/already live/);
    expect(() => planLaunch(ruleset, { home: NYC, to: 'detroit', routeIndex: 5, now })).toThrow(/Pick one/);
    expect(() => planLaunch(ruleset, { home: NYC, to: 'gotham', routeIndex: 0, now })).toThrow(/not on the map/);
  });
});

describe('0.5.0-B where a run is', () => {
  const { stops } = planLaunch(ruleset, { home: NYC, to: 'beverly-hills', routeIndex: 0, now });

  it('knows the road it is on while driving through other towns', () => {
    const early = runPosition(ruleset, stops, minutes(1));
    expect(early).toMatchObject({ phase: 'road', stopIndex: 0, city: 'beverly-hills', from: NYC });
    expect(early.road!.from).toBe(NYC);
    const late = runPosition(ruleset, stops, new Date(stops[0]!.arriveAt.getTime() - 60_000));
    expect(late.road).toMatchObject({ from: 'los-angeles', to: 'beverly-hills' });
    expect(late.progress).toBeGreaterThan(0.99);
  });

  it('is in town for the window, then on the way home, then home', () => {
    expect(runPosition(ruleset, stops, stops[0]!.arriveAt)).toMatchObject({ phase: 'town', city: 'beverly-hills', until: stops[0]!.leaveAt });
    expect(runPosition(ruleset, stops, stops[0]!.leaveAt!)).toMatchObject({ phase: 'road', stopIndex: 1, city: NYC });
    expect(runPosition(ruleset, stops, stops[1]!.arriveAt).phase).toBe('home');
  });

  it('gives the same answer however often it is asked', () => {
    const at = minutes(123);
    expect(runPosition(ruleset, stops, at)).toEqual(runPosition(ruleset, stops, at));
  });
});

describe('0.5.0-B moving on', () => {
  const { stops } = planLaunch(ruleset, { home: NYC, to: 'miami-beach', routeIndex: 0, now });
  const inTown = minutes(100);

  it('drives on to another city, paying only for the extra road', () => {
    const plan = planDriveOn(ruleset, stops, inTown, { home: NYC, to: 'atlanta', routeIndex: 0 });
    expect(plan.stops.map((stop) => stop.city)).toEqual(['miami-beach', 'atlanta', NYC]);
    expect(plan.stops[0]!.leaveAt).toEqual(inTown);
    expect(plan.stops[1]!.departAt).toEqual(inTown);
    expect(plan.stops[1]!.arriveAt).toEqual(new Date(inTown.getTime() + driveMs(ruleset, 10)));
    // Miami-Atlanta 10h and Atlanta-home 13h, less the 19h home already paid: 4h, 2 turns.
    expect(plan.turns).toBe(2);
    expect(runPosition(ruleset, plan.stops, new Date(inTown.getTime() + 1)).city).toBe('atlanta');
  });

  it('never refunds turns when the next city is on the way home', () => {
    const far = planLaunch(ruleset, { home: NYC, to: 'seattle', routeIndex: 0, now });
    const there = far.stops[0]!.arriveAt;
    expect(planDriveOn(ruleset, far.stops, there, { home: NYC, to: 'detroit', routeIndex: 0 }).turns).toBe(0);
  });

  it('heads home early, on the drive already paid', () => {
    const home = planHeadHome(ruleset, stops, inTown);
    expect(home[0]!.leaveAt).toEqual(inTown);
    expect(home[1]).toMatchObject({ departAt: inTown, arriveAt: new Date(inTown.getTime() + driveMs(ruleset, 19)) });
  });

  it('only moves on from town', () => {
    expect(() => planHeadHome(ruleset, stops, minutes(1))).toThrow(/still on the road/);
    expect(() => planDriveOn(ruleset, stops, inTown, { home: NYC, to: 'miami-beach', routeIndex: 0 })).toThrow(/already in/);
    expect(() => planDriveOn(ruleset, stops, inTown, { home: NYC, to: NYC, routeIndex: 0 })).toThrow(/Head home/);
  });
});

describe('0.5.0-B trading at Pip\'s in another city', () => {
  const base = { ruleset, city: 'miami-beach', product: 'COCAINE', held: 0, trunkUnits: 0, capacity: runCapacity(ruleset, 1), shelfStock: 160 };
  const price = cityCounter(ruleset, 'miami-beach', 'COCAINE')!;

  it('buys from the shelf with the run\'s cash, into the trunk', () => {
    const trade = calculateCityTrade({ ...base, direction: 'buy', quantity: 100, runCashCents: 1_000_000n });
    expect(trade).toMatchObject({ unitCents: price.buyCents, quantityChange: 100, stockTaken: 100 });
    expect(trade.cashChangeCents).toBe(-BigInt(price.buyCents * 100));
  });

  it('never spends more than the run carries, or fills more than the trunk holds', () => {
    expect(() => calculateCityTrade({ ...base, direction: 'buy', quantity: 100, runCashCents: 100n })).toThrow(/only carries/);
    expect(() => calculateCityTrade({ ...base, direction: 'buy', quantity: 100, runCashCents: 10_000_000n, trunkUnits: base.capacity - 10 })).toThrow(/room for 10/);
    expect(() => calculateCityTrade({ ...base, direction: 'buy', quantity: 161, runCashCents: 10_000_000n })).toThrow(/only has 160/);
  });

  it('sells only what is in the trunk, at Pip\'s price here', () => {
    expect(() => calculateCityTrade({ ...base, direction: 'sell', quantity: 5, runCashCents: 0n })).toThrow(/no Cocaine in the trunk/);
    const sale = calculateCityTrade({ ...base, direction: 'sell', quantity: 5, held: 5, runCashCents: 0n });
    expect(sale).toMatchObject({ unitCents: price.sellCents, quantityChange: -5, stockTaken: 0 });
  });

  it('refuses what Pip does not carry in that city', () => {
    expect(() => calculateCityTrade({ ...base, city: 'beverly-hills', product: 'CRACK', direction: 'buy', quantity: 1, runCashCents: 1_000n })).toThrow(/does not deal Crack in Beverly Hills/);
  });

  it('starts a shelf full, restocks it on the clock, and empties it when the city is out', () => {
    const fresh = settleCityShelf(null, price, now);
    expect(fresh).toMatchObject({ stock: price.shelfCap, changed: true });
    const later = settleCityShelf({ stock: 0, stockAt: now }, price, new Date(now.getTime() + price.intervalMinutes * 60_000));
    expect(later.stock).toBe(Math.min(price.shelfCap, price.perInterval));
    expect(settleCityShelf(null, cityCounter(ruleset, 'miami-beach', 'COCAINE', 'OUT')!, now).stock).toBe(0);
  });
});

describe('0.6.0-D outpost conservation', () => {
  it('counts beer on a run exactly as beer at home', () => {
    const base = { cashCents: 0n, lowRiders: 0, escortThugs: 0, cargo: {} };
    const away = runNetWorthCents(classicOgV06D, { ...base, beer: 125 });
    const home = calculateNetWorthCents({
      cashCents: 0, whores: 0, thugs: 0, lowRiders: 0, medicine: 0, crack: 0,
      condoms: 0, beer: 125, pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0,
    }, classicOgV06D);
    expect(away).toBe(home);
  });

  it('keeps an outpost box in total net worth after it leaves the run', () => {
    const player = {
      cashCents: 0, whores: 0, thugs: 0, lowRiders: 0, medicine: 0, crack: 0,
      condoms: 0, beer: 0, pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0,
    };
    expect(calculateNetWorthCents({ ...player, outpostNetWorthCents: 54_321n }, classicOgV06D)).toBe(54_321n);
  });
});

describe('0.5.0-B what a run is worth', () => {
  it('counts the wallet, cars, escorts and cargo exactly as it would at home', () => {
    const run = { cashCents: 1_234_567n, lowRiders: 3, escortThugs: 10, cargo: { CRACK: 200, COCAINE: 50 } };
    const atHome = calculateNetWorthCents({ cashCents: run.cashCents, whores: 0, thugs: 10, lowRiders: 3, medicine: 0, crack: 200, condoms: 0, beer: 0, pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0, products: { COCAINE: 50 } }, ruleset);
    expect(runNetWorthCents(ruleset, run)).toBe(atHome);
    expect(cargoUnits(run.cargo)).toBe(250);
    expect(runCapacity(ruleset, 3)).toBe(3 * ruleset.travel.cargoPerLowRider);
  });

  it('adds what is away to the player\'s net worth', () => {
    const player = { cashCents: 0, whores: 0, thugs: 0, lowRiders: 0, medicine: 0, crack: 0, condoms: 0, beer: 0, pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 };
    expect(calculateNetWorthCents({ ...player, awayNetWorthCents: 12_345n }, ruleset)).toBe(12_345n);
  });
});
