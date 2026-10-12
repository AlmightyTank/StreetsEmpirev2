/**
 * 1.6.0-I. A week of the supply loop, played four ways from two home cities with a small and a
 * large bankroll. Each strategy orders, collects, stores and sells cocaine through one dealer
 * crew; the simulation keeps its own books and checks they reconcile (every unit ordered is
 * sold, held or lost; every cent is accounted for). The gate: no strategy is the best in every
 * scenario, and none is a loss in every one.
 *
 *   npm run qa:supply-season -- [--ruleset classic-og-v1.6-h] [--output docs/SUPPLY-SEASON-1.6.0-I.md]
 */
import { writeFile } from 'node:fs/promises';
import { rulesets, type Ruleset } from '@streets/rulesets';
import {
  dealerDemand, dealerPace, dealerPressure, dealerRules, dealerStreetPriceCents, findRoutes, laneExpectedLoss, laneOdds,
  laneRules, planSupplyRun, runCapacity, settleDealerSales,
} from '@streets/rules-engine';

const args = process.argv.slice(2);
const flag = (name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const ruleset = rulesets[flag('--ruleset') ?? 'classic-og-v1.6-h'] as Ruleset | undefined;
if (!ruleset?.supplyNetwork?.pickups || !ruleset.supplyNetwork.properties) throw new Error('That ruleset has no full supply loop.');
const dealers = dealerRules(ruleset)!;
const lanes = laneRules(ruleset);
const properties = ruleset.supplyNetwork.properties;
const PRODUCT = 'COCAINE';
const DAYS = 7;
const HOURS = DAYS * 24;
const FLEET = { VAN: 2, SEDAN: 1 } as const;
const DEALERS = 6;
/** Road stops, busts and hits take about this share of a run's load: the travel sims' order of magnitude. */
const ROAD_LOSS = 0.03;
const money = (cents: number) => `${cents < 0 ? '-' : ''}$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
const name = (slug: string) => ruleset.cities?.[slug]?.name ?? slug;

interface Strategy { key: string; label: string; sellCity: string; source: { kind: 'DEPOT'; supplierKey: string } | { kind: 'LANE'; supplierKey: string; route: 'AIR' | 'FREIGHT' | 'OVERLAND' } }

function strategies(home: string): Strategy[] {
  const depots = ruleset!.supplyNetwork!.suppliers!.filter((supplier) => supplier.offers[PRODUCT]);
  const nearest = [...depots].sort((a, b) => hours(home, a.citySlug) - hours(home, b.citySlug))[0]!;
  const cheapest = [...depots].sort((a, b) => a.offers[PRODUCT]!.unitCostCents - b.offers[PRODUCT]!.unitCostCents)[0]!;
  const dearest = Object.keys(ruleset!.cities!).sort((a, b) => (dealerStreetPriceCents(ruleset!, dealers, b, PRODUCT) ?? 0) * dealerDemand(ruleset!, b, PRODUCT) / Math.sqrt(dealerPressure(ruleset!, b))
    - (dealerStreetPriceCents(ruleset!, dealers, a, PRODUCT) ?? 0) * dealerDemand(ruleset!, a, PRODUCT) / Math.sqrt(dealerPressure(ruleset!, a)))[0]!;
  const list: Strategy[] = [
    { key: 'HOME', label: `Home crew, ${nearest.name} pickups`, sellCity: home, source: { kind: 'DEPOT', supplierKey: nearest.key } },
    { key: 'PREMIUM', label: `Crew in ${name(dearest)}, ${nearest.name} pickups`, sellCity: dearest, source: { kind: 'DEPOT', supplierKey: nearest.key } },
    { key: 'HUB', label: `Crew in Tulsa, ${cheapest.name} pickups`, sellCity: 'tulsa', source: { kind: 'DEPOT', supplierKey: cheapest.key } },
  ];
  if (lanes) list.push({ key: 'LANE', label: 'Home crew, Monterrey by freight', sellCity: home, source: { kind: 'LANE', supplierKey: 'monterrey-connection', route: 'FREIGHT' } });
  return list;
}

function hours(from: string, to: string): number {
  return from === to ? 0 : findRoutes(ruleset!, from, to)[0]?.driveHours ?? Infinity;
}

interface Books { affordable: boolean; profitCents: number; sold: number; lost: number; held: number; ordered: number; spentCents: number; incomeCents: number; reconciled: boolean }

function play(home: string, bankrollCents: number, strategy: Strategy): Books {
  const now = new Date('2026-10-01T00:00:00Z');
  let cash = bankrollCents;
  let spent = 0;
  let income = 0;
  const spend = (cents: number) => { cash -= cents; spent += cents; };
  // Property: a foothold and a warehouse away from home; the free stash at home.
  const away = strategy.sellCity !== home;
  if (away) {
    const prices = properties.cities[strategy.sellCity]!;
    if (prices.safehouse.costCents + prices.warehouse.costCents > bankrollCents) return { affordable: false, profitCents: 0, sold: 0, lost: 0, held: 0, ordered: 0, spentCents: 0, incomeCents: 0, reconciled: true };
    spend(prices.safehouse.costCents + prices.warehouse.costCents);
  }
  const capacity = away ? properties.cities[strategy.sellCity]!.warehouse.capacityUnits : ruleset!.supplyNetwork!.pickups!.homeStashUnits;
  const upkeepPerDay = away ? properties.cities[strategy.sellCity]!.safehouse.upkeepCents + properties.cities[strategy.sellCity]!.warehouse.upkeepCents : 0;
  const street = dealerStreetPriceCents(ruleset!, dealers, strategy.sellCity, PRODUCT)!;
  const pace = dealerPace({ rules: dealers, demand: dealerDemand(ruleset!, strategy.sellCity, PRODUCT), district: 'NIGHTCLUB', dealers: Array(DEALERS).fill(0), priceCents: street, streetPriceCents: street, pressure: dealerPressure(ruleset!, strategy.sellCity) });
  const crewCapacity = DEALERS * dealers.unitsPerDealer;

  // Transport: a run's load and round trip, or a lane's.
  let tripHours: number;
  let loadUnits: number;
  let unitCost: number;
  let lossShare: number;
  let feePerLoad = 0;
  let feePerUnit = 0;
  let minOrder: number;
  let maxOrder: number;
  if (strategy.source.kind === 'DEPOT') {
    const supplier = ruleset!.supplyNetwork!.suppliers!.find((entry) => entry.key === strategy.source.supplierKey)!;
    const offer = supplier.offers[PRODUCT]!;
    unitCost = offer.unitCostCents;
    minOrder = offer.minOrderQuantity;
    maxOrder = offer.maxOrderQuantity;
    loadUnits = runCapacity(ruleset!, FLEET);
    lossShare = supplier.citySlug === home && strategy.sellCity === home ? 0 : ROAD_LOSS;
    if (supplier.citySlug === home && strategy.sellCity === home) tripHours = 1;
    else {
      const plan = planSupplyRun(ruleset!, { home, origin: supplier.citySlug, destination: strategy.sellCity, routeIndex: 0, now });
      tripHours = (plan.stops[plan.stops.length - 1]!.arriveAt.getTime() - now.getTime()) / 3_600_000;
    }
  } else {
    const supplier = lanes!.suppliers.find((entry) => entry.key === strategy.source.supplierKey)!;
    const route = lanes!.routes[strategy.source.route];
    const offer = supplier.offers[PRODUCT]!;
    unitCost = offer.unitCostCents;
    minOrder = offer.minOrderQuantity;
    maxOrder = Math.min(offer.maxOrderQuantity, route.capacityUnits);
    loadUnits = maxOrder;
    lossShare = laneExpectedLoss(route, laneOdds(route, dealerPressure(ruleset!, strategy.sellCity)));
    tripHours = route.transitHours;
    feePerLoad = route.baseFeeCents;
    feePerUnit = route.feeCentsPerUnit;
  }

  let ordered = 0;
  let collected = 0;
  let stored = 0;
  let crew = 0;
  let sold = 0;
  let lost = 0;
  let carry = 0;
  let paidFor = 0;
  let inFlight: { arrives: number; units: number } | null = null;
  for (let hour = 0; hour < HOURS; hour++) {
    if (hour % 24 === 0 && upkeepPerDay) spend(upkeepPerDay);
    // Land what arrived.
    if (inFlight && hour >= inFlight.arrives) {
      const arrived = Math.floor(inFlight.units * (1 - lossShare));
      lost += inFlight.units - arrived;
      stored += arrived;
      inFlight = null;
    }
    // Buy and send the next load when nothing is on the way and there is room and cash.
    if (!inFlight) {
      const room = capacity - stored;
      const want = Math.min(loadUnits, room, maxOrder);
      const unpicked = paidFor - collected;
      let units = Math.min(want, unpicked);
      if (units < want && strategy.source.kind === 'DEPOT') {
        const buy = Math.min(maxOrder, Math.max(minOrder, want - unpicked), Math.floor(cash / unitCost));
        if (buy >= minOrder && unpicked < want) { spend(buy * unitCost); paidFor += buy; ordered += buy; units = Math.min(want, paidFor - collected); }
      }
      if (strategy.source.kind === 'LANE') {
        const buy = Math.min(want, Math.floor((cash - feePerLoad) / (unitCost + feePerUnit)));
        units = buy >= minOrder ? buy : 0;
        if (units) { spend(units * unitCost + feePerLoad + feePerUnit * units); paidFor += units; ordered += units; }
      }
      if (units > 0) { collected += units; inFlight = { arrives: hour + Math.max(1, Math.ceil(tripHours)), units }; }
    }
    // Restock the crew from local storage and sell the hour.
    const top = Math.min(stored, crewCapacity - crew);
    stored -= top;
    crew += top;
    const batch = settleDealerSales({ pace, priceCents: street, inventory: crew, hours: 1, carry });
    carry = batch.carry;
    crew -= batch.sold;
    sold += batch.sold;
    income += batch.grossCents - batch.cutCents;
    cash += batch.grossCents - batch.cutCents;
    spend(batch.operatingCents);
  }
  const held = stored + crew + (paidFor - collected) + (inFlight?.units ?? 0);
  const reconciled = ordered === sold + lost + held && cash === bankrollCents - spent + income;
  // Stock still held is worth what it cost: it sells next week.
  return { affordable: true, profitCents: cash + held * unitCost - bankrollCents, sold, lost, held, ordered, spentCents: spent, incomeCents: income, reconciled };
}

const scenarios = [
  { home: 'new-york-city', bankroll: 15_000_000 },
  { home: 'new-york-city', bankroll: 150_000_000 },
  { home: 'los-angeles', bankroll: 15_000_000 },
  { home: 'los-angeles', bankroll: 150_000_000 },
];
const problems: string[] = [];
const winners: string[] = [];
const losers = new Map<string, number>();
const lines = [
  `# Supply season — ${ruleset.meta.version}`,
  '',
  `Generated by \`npm run qa:supply-season -- --ruleset ${ruleset.meta.id}\`. A ${DAYS}-day week of cocaine through one crew of ${DEALERS} new dealers at the street price, collected by a fleet of two Vans and a Sedan (one load at a time, about ${Math.round(ROAD_LOSS * 100)}% lost on the road a load) or by a lane. Each strategy buys only what its storage has room for. Profit is cash at the end of the week, plus stock still held at what it cost, less the bankroll; property bought is spent, not an asset.`,
  '',
];
for (const scenario of scenarios) {
  const results = strategies(scenario.home).map((strategy) => ({ strategy, books: play(scenario.home, scenario.bankroll, strategy) }))
    .sort((a, b) => Number(b.books.affordable) - Number(a.books.affordable) || b.books.profitCents - a.books.profitCents);
  lines.push(`## ${name(scenario.home)}, ${money(scenario.bankroll)} bankroll`, '', '| Strategy | Profit | Sold | Lost | Still held | Reconciles |', '| --- | ---: | ---: | ---: | ---: | --- |');
  for (const { strategy, books } of results) {
    if (!books.affordable) { lines.push(`| ${strategy.label} | can't afford the property | | | | |`); continue; }
    lines.push(`| ${strategy.label} | ${money(books.profitCents)} | ${books.sold.toLocaleString('en-US')} | ${books.lost.toLocaleString('en-US')} | ${books.held.toLocaleString('en-US')} | ${books.reconciled ? 'yes' : '**no**'} |`);
    if (!books.reconciled) problems.push(`${strategy.label} from ${name(scenario.home)} does not reconcile.`);
    if (books.profitCents < 0) losers.set(strategy.key, (losers.get(strategy.key) ?? 0) + 1);
  }
  winners.push(results[0]!.strategy.key);
  lines.push('');
}
if (new Set(winners).size === 1) problems.push(`${winners[0]} is the best strategy in every scenario.`);
for (const [key, count] of losers) if (count === scenarios.filter((scenario) => play(scenario.home, scenario.bankroll, strategies(scenario.home).find((entry) => entry.key === key)!).affordable).length) problems.push(`${key} loses money in every scenario.`);
lines.push('## Gate', '', problems.length ? problems.map((problem) => `- ${problem}`).join('\n') : `Passed: every scenario reconciles, the best strategy changes with home and bankroll (${[...new Set(winners)].join(', ')}), and no strategy loses money everywhere.`, '');
const report = lines.join('\n');
const output = flag('--output');
if (output) await writeFile(output, report);
if (!args.includes('--quiet')) console.log(report);
if (problems.length) process.exitCode = 1;
