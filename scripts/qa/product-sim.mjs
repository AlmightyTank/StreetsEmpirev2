import { writeFile } from 'node:fs/promises';
import { classicOgV04E } from '@streets/rulesets';
import {
  combatProductGate,
  combatProductMarkdown,
  dominantProducts,
  productEconomyMarkdown,
  productLoops,
  productRoundGate,
  productRoundMarkdown,
  productSimulationMarkdown,
  productWinners,
  runCombatProductSimulation,
  runProductRoundSimulation,
  runProductSimulation,
} from '@streets/rules-engine';

const OUTPUTS = {
  '--output': 'effects',
  '--economy-output': 'economy',
  '--combat-output': 'combat',
  '--round-output': 'round',
};

const args = process.argv.slice(2);
const outputs = {};
let samples = 20_000;
let quiet = false;
const seed = 20260917;
try {
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help') {
      console.log('npm run qa:products -- [--output effects.md] [--economy-output economy.md] [--combat-output combat.md] [--round-output round.md] [--samples 20000] [--quiet]');
      process.exit(0);
    }
    if (flag === '--quiet') { quiet = true; continue; }
    if (!(flag in OUTPUTS) && flag !== '--samples') throw new Error(`Unknown option: ${flag}`);
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Incomplete option: ${flag}`);
    if (flag === '--samples') samples = Number(args[++i]);
    else outputs[OUTPUTS[flag]] = args[++i];
  }
  // The current products ruleset: 0.4.0-C effects and Heat, the 0.4.0-D economy and 0.4.0-E fight supply.
  const ruleset = classicOgV04E;
  const effectRows = runProductSimulation(ruleset);
  const combatRows = runCombatProductSimulation(ruleset, samples, seed);
  const roundRows = runProductRoundSimulation(ruleset);
  const reports = {
    effects: productSimulationMarkdown(ruleset, effectRows),
    economy: productEconomyMarkdown(ruleset),
    combat: combatProductMarkdown(ruleset, combatRows, samples, seed),
    round: productRoundMarkdown(ruleset, roundRows),
  };
  for (const [key, path] of Object.entries(outputs)) await writeFile(path, reports[key], 'utf8');
  if (!quiet) for (const report of Object.values(reports)) console.log(report);

  const failures = [
    ...dominantProducts(productWinners(effectRows)).map((row) => `Effects: ${row.product} is best on every job in ${row.situation}.`),
    ...productLoops(ruleset).map((line) => `Economy: ${line}`),
    ...combatProductGate(combatRows).problems.map((line) => `Combat: ${line}`),
    ...productRoundGate(roundRows).map((line) => `Round: ${line}`),
  ];
  if (failures.length) {
    console.error(`\nProduct gates failed:\n${failures.map((line) => `- ${line}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('\nProduct gates passed.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
