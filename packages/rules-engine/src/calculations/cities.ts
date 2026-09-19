import type { CityRules, DistrictKey, HeatRules, RoadRules, Ruleset, StoreKey, SupplyLevel } from '@streets/rulesets';
import type { CityModifiers } from './actions.js';
import { CRACK_PRODUCT, productEconomy } from './product-economy.js';

/**
 * 0.5.0-A. Cities and roads: what a city charges, carries and pays, what Heat
 * means there, and how runs get between them. Everything here is pure and reads
 * the ruleset; rounds without `cities` get the 0.4.0 answers.
 */

export const SUPPLY_LEVELS: readonly SupplyLevel[] = ['PLENTIFUL', 'NORMAL', 'LOW', 'OUT'];

export function cityRules(ruleset: Ruleset, slug: string): CityRules | undefined {
  return ruleset.cities?.[slug];
}

/** The scout, income and crack modifiers, 1 everywhere before 0.5.0-A. */
export function cityModifiers(ruleset: Ruleset, slug: string | undefined): CityModifiers {
  const city = slug ? cityRules(ruleset, slug) : undefined;
  return {
    scoutModifier: city?.modifiers.scout ?? 1,
    incomeModifier: city?.modifiers.income ?? 1,
    crackModifier: city?.modifiers.crack ?? 1,
  };
}

/** The round's Heat rules with a city's levels in place. */
export function cityHeatRules(ruleset: Ruleset, slug: string | undefined): HeatRules | undefined {
  const base = ruleset.heat;
  const city = slug ? cityRules(ruleset, slug) : undefined;
  if (!base || !city) return base;
  return {
    ...base,
    drag: { ...base.drag, startsAt: city.heat.dragStartsAt },
    bust: {
      ...base.bust,
      startsAt: city.heat.bustStartsAt,
      productSeizedFraction: Math.min(1, base.bust.productSeizedFraction * city.heat.bustSeverity),
      cashFineFraction: Math.min(1, base.bust.cashFineFraction * city.heat.bustSeverity),
    },
    // 0.5.0-C: arrests start at the city's own level and hit as hard as its busts do.
    ...(base.arrest ? {
      arrest: {
        ...base.arrest,
        startsAt: city.heat.arrestStartsAt,
        productSeizedFraction: Math.min(1, base.arrest.productSeizedFraction * city.heat.bustSeverity),
        cashFineFraction: Math.min(1, base.arrest.cashFineFraction * city.heat.bustSeverity),
      },
    } : {}),
  };
}

/**
 * 0.5.0-D. What changes for someone who lives in a city, beyond its Heat levels:
 * - its district pay;
 * - what the stores charge (never what they pay back);
 * - Pip's home counter at the city's price and usual supply: his shelf is as big and
 *   restocks as fast as his usual supply there, and where he does not deal a product
 *   he has none. What he pays back stays at his base price, so cooking to sell never
 *   pays anywhere, and a product never counts for more than he would pay for it.
 * Null before 0.5.0-D, when everyone lives on the base prices.
 */
function livingRules(ruleset: Ruleset, city: CityRules): Pick<Ruleset, 'scouting' | 'stores' | 'products'> | null {
  const travel = ruleset.travel;
  if (!travel?.relocation) return null;
  const lean = (product: string) => {
    const row = city.products[product];
    if (!row || row.supply === null) return null;
    const level = travel.supplyLevels[row.supply];
    return { price: row.price * level.price, shelf: level.shelf, restock: level.restock };
  };
  const scale = (cents: number, by: number) => Math.max(1, Math.round(cents * by));

  const districts = Object.fromEntries(Object.entries(ruleset.scouting.districts).map(([key, district]) => {
    const pay = city.districtPay?.[key as DistrictKey];
    return [key, pay ? { ...district, payMultiplier: district.payMultiplier * pay } : district];
  })) as unknown as Ruleset['scouting']['districts'];

  const stores = Object.fromEntries(Object.entries(ruleset.stores).map(([storeKey, store]) => {
    const price = city.storePrices?.[storeKey as StoreKey] ?? 1;
    const items = Object.fromEntries(Object.entries(store.items).map(([itemKey, item]) => {
      if (!item) return [itemKey, item];
      let next = price === 1 ? item : { ...item, buyCents: scale(item.buyCents, price) };
      // Pip's crack follows the city like his other products.
      if (storeKey === 'PIP' && itemKey === CRACK_PRODUCT) {
        const crack = lean(CRACK_PRODUCT);
        next = crack
          ? { ...next, buyCents: scale(next.buyCents, crack.price), restock: next.restock ? { ...next.restock, cap: Math.floor(next.restock.cap * crack.shelf), perInterval: Math.floor((next.restock.perInterval ?? 1) * crack.restock) } : next.restock }
          : { ...next, restock: next.restock ? { ...next.restock, cap: 0, perInterval: 0 } : next.restock };
      }
      return [itemKey, next];
    }));
    return [storeKey, { ...store, items }];
  })) as unknown as Ruleset['stores'];

  const products = ruleset.products
    ? Object.fromEntries(Object.entries(ruleset.products).map(([key, product]) => {
        const economy = productEconomy(ruleset, key);
        if (!economy?.pip) return [key, product];
        const here = lean(key);
        const pip = here
          ? {
              ...economy.pip,
              buyCents: Math.max(economy.pip.sellCents + 1, scale(economy.pip.buyCents, here.price)),
              restock: { ...economy.pip.restock, cap: Math.floor(economy.pip.restock.cap * here.shelf), perInterval: Math.max(1, Math.floor(economy.pip.restock.perInterval * here.restock)) },
            }
          : null;
        return [key, { ...product, economy: { ...economy, pip } }];
      })) as unknown as Ruleset['products']
    : ruleset.products;

  return { scouting: { ...ruleset.scouting, districts }, stores, products };
}

/**
 * The ruleset as it applies to someone living in `slug`: the city's Heat levels (from
 * 0.5.0-A), and from 0.5.0-D its district pay, store prices and Pip's home counter.
 * Everything that reads the ruleset (the take, busts, the stores, the dashboard) uses
 * the player's own city without being told about cities.
 */
export function rulesetForCity(ruleset: Ruleset, slug: string | undefined): Ruleset {
  const heat = cityHeatRules(ruleset, slug);
  const city = slug ? cityRules(ruleset, slug) : undefined;
  const living = city ? livingRules(ruleset, city) : null;
  if (heat === ruleset.heat && !living) return ruleset;
  return { ...ruleset, ...(living ?? {}), heat };
}

// --- Pip's counter in every city ---------------------------------------------

export interface PipBase {
  buyCents: number;
  sellCents: number;
  shelfCap: number;
  perInterval: number;
  intervalMinutes: number;
}

/** Pip's base counter for a product: the store's Product item for crack, the product economy for the rest. */
export function pipBase(ruleset: Ruleset, product: string): PipBase | null {
  if (product === CRACK_PRODUCT) {
    const item = ruleset.stores.PIP.items.CRACK;
    if (!item) return null;
    return {
      buyCents: item.buyCents,
      sellCents: item.sellCents ?? 0,
      shelfCap: item.restock?.cap ?? 0,
      perInterval: item.restock?.perInterval ?? 0,
      intervalMinutes: item.restock?.intervalMinutes ?? 0,
    };
  }
  const pip = productEconomy(ruleset, product)?.pip;
  if (!pip) return null;
  return { buyCents: pip.buyCents, sellCents: pip.sellCents, shelfCap: pip.restock.cap, perInterval: pip.restock.perInterval, intervalMinutes: pip.restock.intervalMinutes };
}

export interface CityCounter {
  product: string;
  supply: SupplyLevel;
  buyCents: number;
  sellCents: number;
  shelfCap: number;
  perInterval: number;
  intervalMinutes: number;
}

/**
 * Pip's counter for one product in one city, at a supply level (the city's usual
 * one by default). Null where he does not carry it there or has no base price.
 */
export function cityCounter(ruleset: Ruleset, slug: string, product: string, level?: SupplyLevel): CityCounter | null {
  const city = cityRules(ruleset, slug);
  const row = city?.products[product];
  const base = pipBase(ruleset, product);
  const travel = ruleset.travel;
  if (!city || !row || !base || !travel || row.supply === null) return null;
  const supply = level ?? row.supply;
  const lean = travel.supplyLevels[supply];
  return {
    product,
    supply,
    buyCents: Math.max(1, Math.round(base.buyCents * row.price * lean.price)),
    sellCents: Math.max(0, Math.round(base.sellCents * row.price * lean.price)),
    shelfCap: Math.floor(base.shelfCap * lean.shelf),
    perInterval: Math.floor(base.perInterval * lean.restock),
    intervalMinutes: base.intervalMinutes,
  };
}

/**
 * What a city pays for a product, as a band. "High" is a market paying close to Pip's
 * own price there, the most any city pays without becoming a same-city loop.
 */
export function cityDemandBand(ruleset: Ruleset, slug: string, product: string): 'high' | 'normal' | 'low' {
  const row = cityRules(ruleset, slug)?.products[product];
  if (!row) return 'normal';
  if (row.demand >= row.price * 0.8) return 'high';
  return row.demand <= 0.45 ? 'low' : 'normal';
}

// --- the high market ---------------------------------------------------------

export interface HighMarketQuote {
  baselineCents: number;
  /**
   * What a buyer pays per unit at the baseline: the higher of Pip's price and the
   * demand price, plus the spread. The high market is where you buy in bulk, never
   * a way round Pip's counter at a discount.
   */
  buyCents: number;
  /** What a seller gets per unit at the baseline. */
  sellCents: number;
  /** Units that move the price 1%. */
  depth: number;
}

export function highMarketBaseline(ruleset: Ruleset, slug: string, product: string): HighMarketQuote | null {
  const city = cityRules(ruleset, slug);
  const row = city?.products[product];
  const base = pipBase(ruleset, product);
  const travel = ruleset.travel;
  if (!city || !row || !base || !travel) return null;
  const baselineCents = base.buyCents * row.demand;
  return {
    baselineCents: Math.round(baselineCents),
    buyCents: Math.round(base.buyCents * Math.max(row.price, row.demand) * (1 + travel.highMarketSpread)),
    sellCents: Math.round(baselineCents * (1 - travel.highMarketSpread)),
    depth: city.marketDepth,
  };
}

/**
 * Cents for selling `units` into a city's high market from its baseline: each unit
 * sold moves the price down by 1% per `depth` units, never below a tenth of it.
 * The live market (0.5.0-C) settles recovery on top of this.
 */
export function highMarketSaleCents(ruleset: Ruleset, slug: string, product: string, units: number): number {
  const quote = highMarketBaseline(ruleset, slug, product);
  if (!quote || units <= 0) return 0;
  let total = 0;
  for (let unit = 0; unit < units; unit++) {
    total += Math.round(quote.sellCents * Math.max(0.1, 1 - unit / (quote.depth * 100)));
  }
  return total;
}

// --- roads and routes --------------------------------------------------------

export interface TravelRoute {
  /** Every city in order, the start and the end included. */
  cities: string[];
  roads: RoadRules[];
  driveHours: number;
  gameMinutes: number;
  turns: number;
  /** Cities the run drives through without stopping. */
  passesThrough: string[];
  /** The worst police on the way. */
  police: number;
}

function neighbours(ruleset: Ruleset, slug: string): Array<{ to: string; road: RoadRules }> {
  return (ruleset.travel?.roads ?? []).flatMap((road) =>
    road.from === slug ? [{ to: road.to, road }] : road.to === slug ? [{ to: road.from, road }] : []);
}

function toRoute(ruleset: Ruleset, cities: string[], roads: RoadRules[]): TravelRoute {
  const travel = ruleset.travel!;
  const driveHours = roads.reduce((sum, road) => sum + road.driveHours, 0);
  return {
    cities,
    roads,
    driveHours,
    gameMinutes: Math.round(driveHours * travel.gameMinutesPerDriveHour),
    turns: Math.ceil(driveHours * travel.turnsPerDriveHour),
    passesThrough: cities.slice(1, -1),
    police: roads.reduce((worst, road) => Math.max(worst, road.police), 0),
  };
}

/**
 * Ways from one city to another along the roads: the shortest, then any other
 * that is no more than `alternativeRouteShare` longer, up to `maxRoutes`. The map
 * is eight cities, so every simple path is enumerated.
 */
export function findRoutes(ruleset: Ruleset, from: string, to: string): TravelRoute[] {
  const travel = ruleset.travel;
  if (!travel || from === to) return [];
  const found: TravelRoute[] = [];
  const walk = (at: string, cities: string[], roads: RoadRules[]) => {
    if (at === to) { found.push(toRoute(ruleset, cities, roads)); return; }
    for (const { to: next, road } of neighbours(ruleset, at)) {
      if (!cities.includes(next)) walk(next, [...cities, next], [...roads, road]);
    }
  };
  walk(from, [from], []);
  found.sort((a, b) => a.driveHours - b.driveHours || a.cities.length - b.cities.length);
  const shortest = found[0];
  if (!shortest) return [];
  return found.filter((route) => route.driveHours <= shortest.driveHours * (1 + travel.alternativeRouteShare)).slice(0, travel.maxRoutes);
}

/** Shortest drive from one city to every other, in drive hours. */
export function driveHoursFrom(ruleset: Ruleset, from: string): Record<string, number> {
  return Object.fromEntries(Object.keys(ruleset.cities ?? {}).filter((slug) => slug !== from)
    .map((slug) => [slug, findRoutes(ruleset, from, slug)[0]?.driveHours ?? Number.POSITIVE_INFINITY]));
}

// --- the rules every ruleset with cities keeps --------------------------------

/**
 * What would make a city ruleset wrong, in words. Empty when it is sound:
 * - every road joins two known cities, and every city can be reached;
 * - every city prices every catalog product, and Heat levels climb drag < bust < arrest <= max;
 * - in no city does Pip's counter and the high market make a loop, either way round;
 * - the starting city is Pip's store as it was, with the round's Heat levels, and its
 *   high market never sells for less than Pip does;
 * - street talk names every product a city has plenty of or pays well for, and never
 *   gives a number.
 */
export function cityRulesetProblems(ruleset: Ruleset): string[] {
  const cities = ruleset.cities;
  const travel = ruleset.travel;
  if (!cities || !travel) return [];
  const problems: string[] = [];
  const slugs = Object.keys(cities);
  const catalog = Object.keys(ruleset.products ?? { [CRACK_PRODUCT]: true });

  for (const road of travel.roads) {
    if (!cities[road.from] || !cities[road.to]) problems.push(`Road ${road.name} joins an unknown city (${road.from} - ${road.to}).`);
    if (road.driveHours <= 0) problems.push(`Road ${road.name} has no length.`);
  }
  const start = ruleset.round.startingCitySlug;
  if (!cities[start]) problems.push(`The starting city ${start} has no character.`);
  for (const slug of slugs) {
    if (slug !== start && findRoutes(ruleset, start, slug).length === 0) problems.push(`${cities[slug]!.name} cannot be reached from ${start}.`);
  }

  const leans = SUPPLY_LEVELS.map((level) => travel.supplyLevels[level].price);
  const cheapest = Math.min(...leans);
  const dearest = Math.max(...leans);
  // 0.5.0-C: the live market leans with supply and events, so the loop check runs at every level.
  const marketLean = (level: SupplyLevel) => travel.supplyLevels[level].market ?? 1;
  const events = travel.events ? Object.entries(travel.events.kinds) : [];
  for (const [kind, rules] of events) {
    if (rules.marketMultiplier > 1 && rules.supply !== 'OUT') problems.push(`A ${kind} lifts the high market, so Pip must be out while it lasts.`);
    if (rules.durationMinutes > travel.events!.slotMinutes) problems.push(`A ${kind} must not outlast its slot.`);
  }
  for (const [slug, city] of Object.entries(cities)) {
    const { dragStartsAt, bustStartsAt, arrestStartsAt } = city.heat;
    if (ruleset.heat && !(dragStartsAt < bustStartsAt && bustStartsAt < arrestStartsAt && arrestStartsAt <= ruleset.heat.max)) {
      problems.push(`${city.name}: Heat levels must climb drag < bust < arrest <= ${ruleset.heat.max}.`);
    }
    for (const product of catalog) {
      const row = city.products[product];
      const base = pipBase(ruleset, product);
      if (!row) { problems.push(`${city.name} does not price ${product}.`); continue; }
      if (!base) continue;
      // Pip's cheapest buy here against the high market's sale here.
      const pipBuy = base.buyCents * row.price * cheapest;
      const marketSell = base.buyCents * row.demand * (1 - travel.highMarketSpread);
      if (row.supply !== null && marketSell >= pipBuy) problems.push(`${city.name} ${product}: buying at Pip's and selling on the high market is a loop.`);
      if (row.supply !== null && travel.market) {
        // Pip and the market at the same level, and during every event that leaves Pip dealing.
        // The market's drift never lifts it past Pip's price (see marketView).
        // The market leans by how far supply is from Pip's usual level.
        const usual = row.supply;
        for (const level of SUPPLY_LEVELS.filter((entry) => entry !== 'OUT')) {
          const multipliers = [1, ...events.filter(([, rules]) => rules.supply === level).map(([, rules]) => rules.marketMultiplier)];
          for (const multiplier of multipliers) {
            const sell = base.buyCents * row.demand * (marketLean(level) / marketLean(usual)) * multiplier * (1 - travel.highMarketSpread);
            if (sell >= base.buyCents * row.price * travel.supplyLevels[level].price) {
              problems.push(`${city.name} ${product}: at ${level.toLowerCase()} supply, buying at Pip's and selling on the high market is a loop.`);
            }
          }
        }
      }
      // The high market's buy here against Pip's dearest buyback here.
      const marketBuy = base.buyCents * Math.max(row.price, row.demand) * (1 + travel.highMarketSpread);
      const pipSell = base.sellCents * row.price * dearest;
      if (pipSell >= marketBuy) problems.push(`${city.name} ${product}: buying on the high market and selling to Pip is a loop.`);
    }
    const talk = city.talk.join(' ').toLowerCase();
    if (/\d/.test(talk)) problems.push(`${city.name}: street talk never gives a number.`);
    for (const product of catalog) {
      const row = city.products[product];
      const name = (ruleset.products?.[product]?.name ?? product).toLowerCase();
      const worthSaying = row?.supply === 'PLENTIFUL' || cityDemandBand(ruleset, slug, product) === 'high';
      if (worthSaying && !talk.includes(name)) problems.push(`${city.name}: street talk should mention ${name}.`);
    }
    if (slug === start) {
      for (const product of catalog) {
        const row = city.products[product];
        if (row && (row.price !== 1 || row.supply !== 'NORMAL')) problems.push(`${city.name} is the starting city, so Pip's ${product} must stay at the base price and usual supply.`);
      }
      const heat = cityHeatRules(ruleset, slug);
      if (ruleset.heat && heat && (heat.drag.startsAt !== ruleset.heat.drag.startsAt || heat.bust.startsAt !== ruleset.heat.bust.startsAt || city.heat.bustSeverity !== 1)) {
        problems.push(`${city.name} is the starting city, so its Heat levels must be the round's.`);
      }
      for (const product of catalog) {
        const counter = cityCounter(ruleset, slug, product);
        const quote = highMarketBaseline(ruleset, slug, product);
        if (counter && quote && quote.buyCents < counter.buyCents) problems.push(`${city.name} is the starting city, so its high market must not undercut Pip's ${product}.`);
      }
      const modifiers = cityModifiers(ruleset, slug);
      if (modifiers.scoutModifier !== 1 || modifiers.incomeModifier !== 1 || modifiers.crackModifier !== 1) problems.push(`${city.name} is the starting city, so its modifiers must be 1.`);
    }
  }
  return problems;
}
