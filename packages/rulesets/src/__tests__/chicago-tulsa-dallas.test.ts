import { describe, expect, it } from 'vitest';
import { classicOgV16F } from '../classic-og-v1.6-f/index.js';
import { classicOgV16G } from '../classic-og-v1.6-g/index.js';
import { rulesets } from '../index.js';

const NEW = ['chicago', 'tulsa', 'dallas'] as const;
const g = classicOgV16G;

describe('1.6.0-G Chicago, Tulsa and Dallas', () => {
  it('adds the three cities to every record keyed by city, after the eight that were there', () => {
    expect(g.meta).toEqual({ id: 'classic-og-v1.6-g', version: '1.6.0-G', name: 'Classic OG - Chicago, Tulsa & Dallas' });
    expect(Object.keys(g.cities)).toEqual([...Object.keys(classicOgV16F.cities), ...NEW]);
    for (const keyed of [
      g.travel.trips.hotelPrice, g.turf.locals.byCity, g.business.signatures, g.casino.venues, g.law.cities, g.supplyNetwork.properties.cities,
    ]) {
      expect(Object.keys(keyed).sort()).toEqual(Object.keys(g.cities).sort());
    }
    expect(rulesets[g.meta.id]).toBe(g);
  });

  it('leaves every existing city, road and system as it was', () => {
    for (const [slug, city] of Object.entries(classicOgV16F.cities)) expect(g.cities[slug as keyof typeof g.cities]).toEqual(city);
    expect(g.travel.roads.slice(0, classicOgV16F.travel.roads.length)).toEqual(classicOgV16F.travel.roads);
    expect(g.supplyNetwork.suppliers.slice(0, classicOgV16F.supplyNetwork.suppliers.length)).toEqual(classicOgV16F.supplyNetwork.suppliers);
    const { meta: _m, cities: _c, travel: _t, turf: _tu, business: _b, casino: _ca, law: _l, supplyNetwork: _s, ...rest } = g;
    const { meta: _m2, cities: _c2, travel: _t2, turf: _tu2, business: _b2, casino: _ca2, law: _l2, supplyNetwork: _s2, ...base } = classicOgV16F;
    expect(rest).toEqual(base);
  });

  it('wires the new cities into the road map, with Tulsa a real junction', () => {
    const roadsOf = (slug: string) => g.travel.roads.filter((road) => road.from === slug || road.to === slug);
    expect(roadsOf('tulsa').length).toBeGreaterThanOrEqual(4);
    expect(roadsOf('chicago').length).toBeGreaterThanOrEqual(3);
    expect(roadsOf('dallas').length).toBeGreaterThanOrEqual(3);
    // Every city reaches every other.
    const slugs = Object.keys(g.cities);
    const seen = new Set(['new-york-city']);
    for (let changed = true; changed;) {
      changed = false;
      for (const road of g.travel.roads) {
        for (const [a, b] of [[road.from, road.to], [road.to, road.from]] as const) {
          if (seen.has(a) && !seen.has(b)) { seen.add(b); changed = true; }
        }
      }
    }
    expect([...seen].sort()).toEqual(slugs.sort());
    for (const road of g.travel.roads) {
      expect(slugs).toContain(road.from);
      expect(slugs).toContain(road.to);
    }
  });

  it('gives each new city a reason to go there, and no city the best of everything', () => {
    const products = Object.keys(g.cities.chicago.products);
    const cities = Object.entries(g.cities);
    const cheapest = (product: string) => Math.min(...cities.map(([, city]) => (city.products as Record<string, { price: number }>)[product]!.price));
    const dearest = (product: string) => Math.max(...cities.map(([, city]) => (city.products as Record<string, { price: number }>)[product]!.price));
    for (const slug of NEW) {
      const lean = g.cities[slug].products as Record<string, { price: number; supply: string }>;
      const reasons = products.filter((product) => lean[product]!.price === cheapest(product) || lean[product]!.price === dearest(product));
      const cheapRent = g.supplyNetwork.properties.cities[slug].warehouse.costCents === Math.min(...Object.values(g.supplyNetwork.properties.cities).map((city) => city.warehouse.costCents));
      const supplier = g.supplyNetwork.suppliers.some((entry) => entry.citySlug === slug);
      expect(reasons.length > 0 || cheapRent || supplier).toBe(true);
    }
    for (const [, city] of cities) {
      const lean = city.products as Record<string, { price: number }>;
      expect(products.every((product) => lean[product]!.price === dearest(product))).toBe(false);
    }
    // Tulsa is the cheapest warehouse; Dallas the biggest; neither is both.
    const homes = Object.entries(g.supplyNetwork.properties.cities);
    const perUnit = ([, city]: (typeof homes)[number]) => city.warehouse.costCents / city.warehouse.capacityUnits;
    const cheapestRoom = homes.reduce((best, row) => (perUnit(row) < perUnit(best) ? row : best))[0];
    const biggest = homes.reduce((best, row) => (row[1].warehouse.capacityUnits > best[1].warehouse.capacityUnits ? row : best))[0];
    expect(cheapestRoom).toBe('tulsa');
    expect(biggest).toBe('dallas');
  });

  it('adds a supplier in Dallas with smaller lots than the depots', () => {
    const crossing = g.supplyNetwork.suppliers.find((entry) => entry.key === 'southern-crossing')!;
    expect(crossing.citySlug).toBe('dallas');
    const depots = classicOgV16F.supplyNetwork.suppliers;
    for (const [product, offer] of Object.entries(crossing.offers)) {
      const others = depots.flatMap((depot) => (depot.offers as Record<string, { unitCostCents: number; stockPerRound: number }>)[product] ?? []);
      // Cheaper where it competes, but never with the most stock: no supplier wins on everything.
      expect(offer.stockPerRound).toBeLessThanOrEqual(Math.max(...others.map((entry) => entry.stockPerRound)));
    }
  });
});
