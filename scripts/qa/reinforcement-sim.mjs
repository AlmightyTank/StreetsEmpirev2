import { writeFile } from 'node:fs/promises';
import { classicOgV03D } from '@streets/rulesets';
import { reinforcementSimulationMarkdown, runReinforcementSimulation } from '@streets/rules-engine';

const args = process.argv.slice(2);
let samples = 10_000;
let seed = 20260917;
let output;
try {
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help') {
      console.log('npm run qa:reinforcement -- [--samples 10000] [--seed 20260917] [--output path.md]');
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
  const model = classicOgV03D.combat;
  const report = reinforcementSimulationMarkdown(runReinforcementSimulation(model, samples, seed), model, samples, seed);
  if (output) await writeFile(output, report, 'utf8');
  console.log(report);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
