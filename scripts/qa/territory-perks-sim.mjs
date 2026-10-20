import { performance } from 'node:perf_hooks';
import { classicOgV24A, territoryCatalogForRuleset, validateTerritoryCatalog } from '@streets/rulesets';
import { resolveTerritoryModifiers, applyTerritoryModifier } from '../../apps/server/src/services/territory-perks.service.ts';
import { settleTerritoryYield } from '../../apps/server/src/services/territory-yield.service.ts';
import { allocateTerritoryYield } from '../../apps/server/src/services/territory-yield-budget.ts';

const fail = (message) => { console.error(`FAIL ${message}`); process.exitCode = 1; };
const catalog = territoryCatalogForRuleset(classicOgV24A);
if (!catalog) throw new Error('territory catalog is unavailable');
const catalogIssues = validateTerritoryCatalog(catalog, classicOgV24A);
if (catalogIssues.length) for (const issue of catalogIssues) fail(issue);

const sources = [
  ...Object.entries(catalog.districts).map(([district, location]) => ({
    id: `district:${district}`, label: district, scope: 'district', district, citySlug: 'chicago', perk: location.perk,
  })).filter((source) => source.perk),
  ...Object.entries(catalog.cities).map(([citySlug, location]) => ({
    id: `city:${citySlug}`, label: citySlug, scope: 'city', citySlug, perk: location.perk,
  })).filter((source) => source.perk),
].slice(0, 20);

const start = performance.now();
let applied = 0;
for (let i = 0; i < 100_000; i++) {
  const action = ['PRODUCE', 'STORE_SELL', 'TRAVEL', 'TURF_DEFEND', 'SCOUT'][i % 5];
  const receipts = resolveTerritoryModifiers(sources, action);
  for (const receipt of receipts) {
    if (Math.abs(receipt.valueBasisPoints) > receipt.capBasisPoints) fail(`modifier exceeded cap: ${receipt.effectId}`);
    if (applyTerritoryModifier(10_001, receipt) < 0) fail('modifier produced negative value');
    applied++;
  }
}
const modifierMs = performance.now() - start;

const HOUR = 60 * 60 * 1000;
for (const profile of Object.values(catalog.yieldProfiles)) {
  const result = settleTerritoryYield({
    state: { ownerAllianceId: 'a', contents: {}, cashCents: 0, lastSettledAt: new Date(0), carryMillis: 0 },
    profile,
    intervals: [{ allianceId: 'a', startedAt: new Date(0), endedAt: null }],
    currentAllianceId: 'a', now: new Date(24 * HOUR), priorSameTierHoldings: 0,
  });
  for (const [key, quantity] of Object.entries(result.contents)) {
    if (quantity > (profile.goodsPerHour[key] ?? 0) * profile.cacheHours) fail(`${key} exceeded cache ceiling`);
  }
  if (result.cashCents > profile.cashCentsPerHour * profile.cacheHours) fail('cash exceeded cache ceiling');
}

const budget = allocateTerritoryYield({ goods: { WEED: 30 }, cashCents: 100_000, tollCents: 10_000, unitValues: { WEED: 250 }, availableValueCents: 25_000 });
if (budget.valueCents > 25_000) fail('daily collection allocation exceeded cap');
if (budget.valueCents !== 25_000) fail('daily collection allocation failed to use available budget');

console.log(`Territory catalog valid (${Object.keys(catalog.districts).length} districts, ${Object.keys(catalog.cities).length} cities, ${Object.keys(catalog.regions).length} regions).`);
console.log(`Modifier smoke: 100,000 resolutions, ${applied.toLocaleString()} receipts, ${modifierMs.toFixed(1)}ms.`);
console.log(`Yield ceilings: ${Object.keys(catalog.yieldProfiles).length} profiles checked; cache and daily collection caps passed.`);
if (!process.exitCode) console.log('Territory balance/load gate passed.');
