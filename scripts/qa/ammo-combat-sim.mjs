import { writeFile } from 'node:fs/promises';
import { classicOgV24D } from '@streets/rulesets';
import { ammoCombatScenarios, combatSimulationMarkdown, runCombatSimulation } from '@streets/rules-engine';

const args = process.argv.slice(2);
let samples = 10_000;
let seed = 20261021;
let output;
try {
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help') {
      console.log('npm run qa:ammo-combat -- [--samples 10000] [--seed 20261021] [--output path.md]');
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
  const model = classicOgV24D.combat;
  if (!model) throw new Error('The 2.4.0-D ruleset does not define combat.');
  const report = combatSimulationMarkdown(runCombatSimulation(samples, seed, model, ammoCombatScenarios), samples, seed, model);
  if (output) await writeFile(output, report, 'utf8');
  console.log(report);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
