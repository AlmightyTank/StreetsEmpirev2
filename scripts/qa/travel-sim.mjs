import { writeFile } from 'node:fs/promises';
import { classicOgV05B } from '@streets/rulesets';
import { runTravelSimulation, travelGate, travelMarkdown } from '@streets/rules-engine';

const args = process.argv.slice(2);
let output = null;
let quiet = false;
try {
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help') {
      console.log('npm run qa:travel -- [--output travel.md] [--quiet]');
      process.exit(0);
    }
    if (flag === '--quiet') { quiet = true; continue; }
    if (flag !== '--output') throw new Error(`Unknown option: ${flag}`);
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Incomplete option: ${flag}`);
    output = args[++i];
  }
  // The current travel ruleset: 0.5.0-A cities and roads, and 0.5.0-B runs, on 0.4.0-E balance.
  const ruleset = classicOgV05B;
  const summaries = runTravelSimulation(ruleset);
  const report = travelMarkdown(ruleset, summaries);
  if (output) await writeFile(output, report, 'utf8');
  if (!quiet) console.log(report);

  const { problems } = travelGate(ruleset, summaries);
  if (problems.length) {
    console.error(`\nTravel gates failed:\n${problems.map((line) => `- ${line}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('\nTravel gates passed.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
