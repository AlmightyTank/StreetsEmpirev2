import { describe, expect, it } from 'vitest';
import { classicOgV05C, classicOgV05D, type Ruleset } from '@streets/rulesets';
import { pipBase, rulesetForCity } from '../calculations/cities.js';
import { productEconomy } from '../calculations/product-economy.js';
import { checkMove, heatThere, relocationFeeCents } from '../calculations/relocation.js';

const ruleset: Ruleset = classicOgV05D;
const rules = classicOgV05D.travel.relocation;
const now = new Date('2026-09-19T12:00:00Z');
const hours = (value: number) => new Date(now.getTime() + value * 3_600_000);
const free = {
  from: 'new-york-city', to: 'atlanta', now, netWorthCents: 100_000_000n, cashCents: 50_000_000n, roundEndsAt: hours(24 * 10),
  lastMoveAt: null, movingUntil: null, lockedUntil: null, runOut: false, revengeOpenUntil: null,
};

describe('0.5.0-D moving house', () => {
  it('charges a share of net worth, never under the floor', () => {
    expect(relocationFeeCents(100_000_000n, rules)).toBe(5_000_000n);
    expect(relocationFeeCents(1_000_000n, rules)).toBe(BigInt(rules.feeFloorCents));
    expect(relocationFeeCents(-5n, rules)).toBe(BigInt(rules.feeFloorCents));
  });

  it('lets a free player move, and arrives after the downtime', () => {
    const check = checkMove(ruleset, free);
    expect(check.blockedReason).toBeNull();
    expect(check.arrivesAt).toEqual(new Date(now.getTime() + rules.downtimeMinutes * 60_000));
  });

  it('refuses a move for the reason that matters most', () => {
    expect(checkMove(ruleset, { ...free, to: 'new-york-city' }).code).toBe('ALREADY_HOME');
    expect(checkMove(ruleset, { ...free, to: 'gotham' }).code).toBe('UNKNOWN_CITY');
    expect(checkMove(ruleset, { ...free, movingUntil: hours(1) }).code).toBe('ON_THE_ROAD');
    expect(checkMove(ruleset, { ...free, lockedUntil: hours(1) }).code).toBe('LOCKED_UP');
    expect(checkMove(ruleset, { ...free, roundEndsAt: hours(rules.cutoffHours - 1) }).code).toBe('MOVES_CLOSED');
    expect(checkMove(ruleset, { ...free, runOut: true }).code).toBe('RUN_OUT');
    const fight = checkMove(ruleset, { ...free, revengeOpenUntil: hours(3) });
    expect(fight.code).toBe('IN_A_FIGHT');
    expect(fight.blockedUntil).toEqual(hours(3));
    const cooling = checkMove(ruleset, { ...free, lastMoveAt: hours(-2) });
    expect(cooling.code).toBe('MOVE_COOLDOWN');
    expect(cooling.blockedUntil).toEqual(hours(rules.cooldownHours - 2));
    expect(checkMove(ruleset, { ...free, lastMoveAt: hours(-rules.cooldownHours) }).code).toBeNull();
    expect(checkMove(ruleset, { ...free, cashCents: 1n }).code).toBe('NOT_ENOUGH_CASH');
    expect(checkMove(classicOgV05C, free).code).toBe('MOVES_DISABLED');
  });

  it('shows what Heat means in each city before the move', () => {
    const home = heatThere(ruleset, 50, 'new-york-city')!;
    const beverly = heatThere(ruleset, 50, 'beverly-hills')!;
    const atlanta = heatThere(ruleset, 50, 'atlanta')!;
    expect(home.bustChance).toBe(0);
    expect(beverly.bustChance).toBeGreaterThan(0);
    expect(atlanta.takeMultiplier).toBe(1);
    expect(home.takeMultiplier).toBeLessThan(1);
  });
});

describe('0.5.0-D living in a city', () => {
  it('changes nothing but Heat before 0.5.0-D', () => {
    const detroit = rulesetForCity(classicOgV05C, 'detroit');
    expect(detroit.stores).toBe(classicOgV05C.stores);
    expect(detroit.scouting).toBe(classicOgV05C.scouting);
    expect(detroit.products).toBe(classicOgV05C.products);
  });

  it('prices the stores and Pip\'s home counter by the city, and never what he pays back', () => {
    const detroit = rulesetForCity(ruleset, 'detroit');
    expect(detroit.stores.TOMMY.items.PISTOL!.buyCents).toBe(4250);
    expect(detroit.stores.TOMMY.items.PISTOL!.sellCents).toBe(ruleset.stores.TOMMY.items.PISTOL!.sellCents);
    // Plenty of cheap crack in Detroit.
    expect(pipBase(detroit, 'CRACK')).toMatchObject({ buyCents: 440, sellCents: 300, shelfCap: 1_000 });
    // Beverly Hills does not deal crack or meth.
    const beverly = rulesetForCity(ruleset, 'beverly-hills');
    expect(pipBase(beverly, 'CRACK')!.shelfCap).toBe(0);
    expect(productEconomy(beverly, 'METH')!.pip).toBeNull();
    expect(beverly.scouting.districts.CASINO.payMultiplier).toBeCloseTo(ruleset.scouting.districts.CASINO.payMultiplier * 1.2);
  });

  it('keeps New York as it was, but for its Nightclub', () => {
    const york = rulesetForCity(ruleset, 'new-york-city');
    expect(york.stores.TOMMY).toEqual(ruleset.stores.TOMMY);
    for (const key of Object.keys(ruleset.products ?? {})) expect(pipBase(york, key)).toEqual(pipBase(ruleset, key));
    expect(york.scouting.districts.NIGHTCLUB.payMultiplier).toBeCloseTo(ruleset.scouting.districts.NIGHTCLUB.payMultiplier * 1.1);
  });

  it('keeps every product rule in every city: buying never raises net worth, and cooking to sell never pays', () => {
    for (const city of Object.keys(ruleset.cities ?? {})) {
      const living = rulesetForCity(ruleset, city);
      for (const key of Object.keys(living.products ?? {})) {
        const economy = productEconomy(living, key);
        if (!economy?.pip) continue;
        expect(economy.pip.buyCents, `${city} ${key}`).toBeGreaterThan(economy.pip.sellCents);
        expect(economy.netWorthCents, `${city} ${key}`).toBeLessThanOrEqual(economy.pip.sellCents);
        if (economy.production) expect(economy.production.ingredientCentsPerUnit, `${city} ${key}`).toBeGreaterThanOrEqual(economy.pip.sellCents);
      }
      for (const store of Object.values(living.stores)) {
        for (const item of Object.values(store.items)) {
          if (item?.sellCents != null) expect(item.buyCents, `${city} ${item.name}`).toBeGreaterThan(item.sellCents);
        }
      }
    }
  });
});
