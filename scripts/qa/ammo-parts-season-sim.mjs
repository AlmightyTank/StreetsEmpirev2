import { writeFile } from 'node:fs/promises';
import { classicOgV24F } from '@streets/rulesets';
import { ammoCombatScenarios, combatSimulationMarkdown, runCombatSimulation } from '@streets/rules-engine';

// A season-level budget projection built from sampled combat spend. The activity
// rates are explicit knobs, so balance review can rerun the same assumptions.
const args = process.argv.slice(2);
let samples = 10_000;
let seed = 20261021;
let days = 30;
let attacksPerDay = 1.5;
let defensesPerDay = 0.8;
let output;
let quiet = false;
for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  if (flag === '--help') {
    console.log('npm run qa:ammo-season -- [--samples 10000] [--seed 20261021] [--days 30] [--attacks-per-day 1.5] [--defenses-per-day 0.8] [--output report.md]');
    process.exit(0);
  }
  if (flag === '--quiet') { quiet = true; continue; }
  if (!['--samples', '--seed', '--days', '--attacks-per-day', '--defenses-per-day', '--output'].includes(flag) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Unknown or incomplete option: ${flag}`);
  const value = args[++i];
  if (flag === '--samples') samples = Number(value);
  else if (flag === '--seed') seed = Number(value);
  else if (flag === '--days') days = Number(value);
  else if (flag === '--attacks-per-day') attacksPerDay = Number(value);
  else if (flag === '--defenses-per-day') defensesPerDay = Number(value);
  else output = value;
}
if (![samples, seed, days].every(Number.isSafeInteger) || samples < 1 || days < 1 || attacksPerDay < 0 || defensesPerDay < 0) throw new Error('Samples/days must be positive integers and activity rates non-negative.');
const combat = classicOgV24F.combat;
const ammo = classicOgV24F.ammoParts;
if (!combat || !ammo?.enabled || !ammo.combatEnabled) throw new Error('Slice F must enable the ammo combat economy.');
const rows = runCombatSimulation(samples, seed, combat, ammoCombatScenarios);
const byName = new Map(rows.map((row) => [row.name, row]));
const early = byName.get('Stocked early mirror');
const middle = byName.get('Capped middle attack');
const late = byName.get('Stocked late mirror');
const dry = byName.get('Empty early mirror');
const scenarios = [
  { name: 'New player / early', row: early, rounds: 120, label: 'early stocked mirror' },
  { name: 'Established attacker', row: middle, rounds: 20_000, label: 'capped middle attack' },
  { name: 'Established defender', row: late, rounds: 100_000, label: 'late stocked mirror' },
];
const currency = (cents) => `$${(cents / 100).toFixed(2)}`;
const projected = scenarios.map(({ name, row, rounds, label }) => {
  const perFight = row.meanAttackerAmmoSpent ?? 0;
  const seasonRounds = Math.ceil(perFight * attacksPerDay * days);
  const spendCents = seasonRounds * ammo.ammo.costPerRoundCents;
  const openingValueCents = rounds * ammo.ammo.costPerRoundCents;
  return `| ${name} (${label}) | ${perFight.toFixed(1)} | ${seasonRounds.toLocaleString()} | ${currency(spendCents)} | ${currency(openingValueCents)} |`;
});
const defenderSeasonRounds = Math.ceil((late.meanDefenderAmmoSpent ?? 0) * defensesPerDay * days);
const dryDefense = (dry.meanDefenderAmmoSpent ?? 0) === 0 && ammo.ammo.defenderFloor > 0;
const report = [
  '# Ammo and parts season simulation', '',
  `Ruleset: ${classicOgV24F.meta.id} (${classicOgV24F.meta.version}). ${samples.toLocaleString()} combat samples per fixture; seed ${seed}.`,
  `Season length: ${days} days. Activity assumptions: ${attacksPerDay} attacks/player/day and ${defensesPerDay} defended fights/player/day.`, '',
  '## Per-player attacker ammo budget', '',
  '| Profile | Mean rounds / attack | Projected rounds / season | Ammo replacement value | Example opening ammo value |',
  '| --- | ---: | ---: | ---: | ---: |', ...projected, '',
  `A late-game defender at ${defensesPerDay} fights/day is projected to spend ${defenderSeasonRounds.toLocaleString()} rounds across the season. Replacement value uses the configured per-round price (${currency(ammo.ammo.costPerRoundCents)}).`, '',
  '## Defense floor and territory supply', '',
  `Empty new-player defense: ${dryDefense ? 'PASS — the configured free defender floor supplies defense without ammo.' : 'CHECK — inspect the empty-crew scenario and defender-floor configuration.'}`,
  `Territory supply enabled: ${ammo.territoryYieldsEnabled ? 'yes' : 'no'}; Chicago yield is 150 ammo rounds/hour and Detroit yields 1 vehicle part/hour. This is a production rate, so actual value depends on collection cadence and territory ownership.`, '',
  '## Combat fixtures', '',
  combatSimulationMarkdown(rows, samples, seed, combat),
  '## Limits', '',
  'This is a deterministic balance projection, not a live-player forecast. It applies sampled mean fight consumption to the stated activity rates; it does not model matchmaking, player growth, territory capture duration, collection caps, or ammo looting as a continuing feedback loop.', '',
].join('\n');
if (output) await writeFile(output, report, 'utf8');
if (!quiet) console.log(report);
