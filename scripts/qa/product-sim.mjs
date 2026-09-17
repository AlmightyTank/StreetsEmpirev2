import { writeFile } from 'node:fs/promises';
import { classicOgV04D } from '@streets/rulesets';
import { dominantProducts, productEconomyMarkdown, productLoops, productSimulationMarkdown, productWinners, runProductSimulation } from '@streets/rules-engine';

const args = process.argv.slice(2);
let output;
let economyOutput;
try {
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help') {
      console.log('npm run qa:products -- [--output effects.md] [--economy-output economy.md]');
      process.exit(0);
    }
    if (!['--output', '--economy-output'].includes(flag) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Unknown or incomplete option: ${flag}`);
    if (flag === '--output') output = args[++i];
    else economyOutput = args[++i];
  }
  // The current products ruleset: 0.4.0-C effects and Heat, with the 0.4.0-D economy.
  const ruleset = classicOgV04D;
  const rows = runProductSimulation(ruleset);
  const report = productSimulationMarkdown(ruleset, rows);
  const economy = productEconomyMarkdown(ruleset);
  if (output) await writeFile(output, report, 'utf8');
  if (economyOutput) await writeFile(economyOutput, economy, 'utf8');
  console.log(report);
  console.log(economy);
  if (dominantProducts(productWinners(rows)).length || productLoops(ruleset).length) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
