/**
 * 1.6.0-H. Every way to buy a product abroad, at three order sizes: what a unit costs once it
 * is stored (goods and card fees over what is expected to arrive), how long it takes, and how
 * likely a search is, landing in the card's quietest entry city. Domestic depots are listed for
 * price. The gate: no supplier or card wins on order size, price, time and risk all at once.
 *
 *   npm run qa:supply-lanes -- [--ruleset classic-og-v1.6-h] [--output docs/SUPPLY-LANES-1.6.0-H.md]
 */
import { writeFile } from 'node:fs/promises';
import { rulesets, type Ruleset, type SupplyLaneRouteKey } from '@streets/rulesets';
import { laneExpectedLoss, laneOdds, laneQuote, laneRiskWord, laneRules, type LaneRiskWord } from '@streets/rules-engine';

const args = process.argv.slice(2);
const flag = (name: string) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const ruleset = rulesets[flag('--ruleset') ?? 'classic-og-v1.6-h'] as Ruleset | undefined;
if (!ruleset) throw new Error('Unknown ruleset.');
const rules = laneRules(ruleset);
if (!rules) throw new Error('That ruleset has no lanes.');
const SIZES = [1_000, 5_000, 20_000];
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const cityName = (slug: string) => ruleset.cities?.[slug]?.name ?? slug;
const pressure = (slug: string) => ruleset.cities?.[slug]?.policePressure ?? 1;

interface Option { label: string; supplier: string; route: SupplyLaneRouteKey | 'DOMESTIC'; perUnit: number; hours: number | null; risk: LaneRiskWord | null; loss: number }

const products = [...new Set(rules.suppliers.flatMap((supplier) => Object.keys(supplier.offers)))];
const results = new Map<string, Map<number, Option[]>>();
for (const product of products) {
  const bySize = new Map<number, Option[]>();
  for (const size of SIZES) {
    const options: Option[] = [];
    for (const supplier of rules.suppliers) {
      const offer = supplier.offers[product];
      if (!offer || size < offer.minOrderQuantity || size > offer.maxOrderQuantity) continue;
      for (const key of supplier.routes) {
        const route = rules.routes[key];
        // The quietest place this card lands: the planner's best case for it.
        const entry = [...route.entryCities].sort((a, b) => pressure(a) - pressure(b))[0]!;
        const odds = laneOdds(route, pressure(entry));
        const loads = Math.ceil(size / route.capacityUnits);
        if (loads > rules.maxInTransit) continue;
        const fees = Array.from({ length: loads }, (_, index) => laneQuote(route, offer.unitCostCents, Math.min(route.capacityUnits, size - index * route.capacityUnits)))
          .reduce((sum, quote) => sum + quote.totalCents, 0);
        const loss = laneExpectedLoss(route, odds);
        options.push({ label: `${supplier.name} · ${route.name} into ${cityName(entry)}${loads > 1 ? ` (${loads} loads)` : ''}`, supplier: supplier.name, route: key, perUnit: fees / (size * (1 - loss)), hours: route.transitHours, risk: laneRiskWord(odds), loss });
      }
    }
    for (const supplier of ruleset.supplyNetwork?.suppliers ?? []) {
      const offer = supplier.offers[product];
      if (!offer || size < offer.minOrderQuantity || size > offer.maxOrderQuantity) continue;
      options.push({ label: `${supplier.name} (${cityName(supplier.citySlug)}), picked up by run`, supplier: supplier.name, route: 'DOMESTIC', perUnit: offer.unitCostCents, hours: null, risk: null, loss: 0 });
    }
    bySize.set(size, options.sort((a, b) => a.perUnit - b.perUnit));
  }
  results.set(product, bySize);
}

const problems: string[] = [];
const lanesOnly = (options: Option[]) => options.filter((option) => option.route !== 'DOMESTIC');
const cheapestLane = (options: Option[]) => lanesOnly(options)[0];
// Order size matters: the cheapest card is not the same at every size for every product.
const sizeWinners = products.map((product) => SIZES.map((size) => cheapestLane(results.get(product)!.get(size)!)?.route).filter(Boolean).join(','));
if (sizeWinners.every((winners) => new Set(winners.split(',')).size <= 1)) problems.push('The same card is cheapest at every order size for every product.');
// Price, time and risk pull different ways.
for (const product of products) {
  for (const size of SIZES) {
    const options = lanesOnly(results.get(product)!.get(size)!);
    // Only one card can move this much: size has already chosen, so there is nothing to trade.
    if (new Set(options.map((option) => option.route)).size < 2) continue;
    const cheap = options[0]!;
    const fast = [...options].sort((a, b) => a.hours! - b.hours! || a.perUnit - b.perUnit)[0]!;
    const safe = [...options].sort((a, b) => a.loss - b.loss || a.perUnit - b.perUnit)[0]!;
    if (cheap.route === fast.route && cheap.route === safe.route && cheap.supplier === fast.supplier) {
      problems.push(`${product} × ${size}: ${cheap.label} is the cheapest, the fastest and the safest.`);
    }
  }
}
// No supplier is cheapest for everything it competes on.
const supplierWins = new Set(products.flatMap((product) => SIZES.map((size) => cheapestLane(results.get(product)!.get(size)!)?.supplier).filter(Boolean)));
if (supplierWins.size < 2) problems.push('One supplier is the cheapest for every product and size.');

const lines = [
  `# Supply lanes — ${ruleset.meta.version}`,
  '',
  `Generated by \`npm run qa:supply-lanes -- --ruleset ${ruleset.meta.id}\`. A unit's landed cost is the goods and every card fee, over what is expected to arrive after searches, landing in each card's quietest entry city. Orders bigger than a card carries go as several loads, up to ${rules.maxInTransit} at once. Domestic depots are listed for price only: their cost is a pickup run.`,
  '',
];
for (const product of products) {
  lines.push(`## ${ruleset.products?.[product]?.name ?? product}`, '');
  for (const size of SIZES) {
    const options = results.get(product)!.get(size)!;
    if (!options.length) continue;
    lines.push(`### ${size.toLocaleString('en-US')} units`, '', '| Option | Landed a unit | Transit | Risk |', '| --- | ---: | ---: | --- |');
    for (const option of options) lines.push(`| ${option.label} | ${money(option.perUnit)} | ${option.hours === null ? 'a run' : `${option.hours}h`} | ${option.risk ? option.risk.toLowerCase() : 'the road'} |`);
    lines.push('');
  }
}
lines.push('## Gate', '', problems.length ? problems.map((problem) => `- ${problem}`).join('\n') : 'Passed: the cheapest card changes with order size, price, time and risk pull different ways for every product and size, and more than one supplier wins somewhere.', '');
const report = lines.join('\n');
const output = flag('--output');
if (output) await writeFile(output, report);
if (!args.includes('--quiet')) console.log(report);
if (problems.length) process.exitCode = 1;
