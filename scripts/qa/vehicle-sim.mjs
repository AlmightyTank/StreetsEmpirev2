import { writeFile } from 'node:fs/promises';
import { runVehicleSimulation, vehicleGate, vehicleMarkdown } from '@streets/rules-engine';
import { rulesets } from '@streets/rulesets';

const args = process.argv.slice(2);
let output = null;
let quiet = false;
let rulesetId = 'classic-og-v1.5-e3';
let samples;

try {
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (flag === '--help') {
      console.log('npm run qa:vehicles -- [--ruleset classic-og-v1.5-e3] [--samples 2000] [--output vehicles.md] [--quiet]');
      process.exit(0);
    }
    if (flag === '--quiet') { quiet = true; continue; }
    const value = args[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Incomplete option: ${flag}`);
    i += 1;
    if (flag === '--output') output = value;
    else if (flag === '--ruleset') rulesetId = value;
    else if (flag === '--samples') samples = Number(value);
    else throw new Error(`Unknown option: ${flag}`);
  }
  const ruleset = rulesets[rulesetId];
  if (!ruleset) throw new Error(`Unknown ruleset: ${rulesetId}`);
  // 1.5.0-E: every vehicle class through the run scenarios, on the engine the server uses.
  const result = runVehicleSimulation(ruleset, samples);
  const report = vehicleMarkdown(ruleset, result);
  if (output) await writeFile(output, report, 'utf8');
  if (!quiet) console.log(report);
  const problems = vehicleGate(ruleset, result);
  if (problems.length) {
    console.error(`\nVehicle gates failed:\n${problems.map((line) => `- ${line}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('\nVehicle gates passed.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
