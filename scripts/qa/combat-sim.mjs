import { writeFile } from 'node:fs/promises';
import { combatPrototype } from '@streets/rulesets';
import { runCombatSimulation, combatSimulationMarkdown } from '@streets/rules-engine';

const args = process.argv.slice(2);
let samples = 10_000;
let seed = 20260910;
let output;
try {
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help') {
      console.log('npm run qa:combat -- [--samples 10000] [--seed 20260910] [--output path.md]');
      process.exit(0);
    }
    if (!['--samples', '--seed', '--output'].includes(flag) || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error(`Unknown or incomplete option: ${flag}`);
    }
    const value = args[++i];
    if (flag === '--samples') samples = Number(value);
    if (flag === '--seed') seed = Number(value);
    if (flag === '--output') output = value;
  }
  const rows = runCombatSimulation(samples, seed);
  const report = combatSimulationMarkdown(rows, samples, seed, combatPrototype);
  if (output) await writeFile(output, report, 'utf8');
  console.log(report);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
