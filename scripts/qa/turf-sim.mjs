import { writeFile } from 'node:fs/promises';
import { classicOgV06A } from '@streets/rulesets';
import { runTurfSimulation, turfGate, turfMarkdown } from '@streets/rules-engine';

const args = process.argv.slice(2);
let output = null;
let quiet = false;
try {
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help') {
      console.log('npm run qa:turf -- [--output turf.md] [--quiet]');
      process.exit(0);
    }
    if (flag === '--quiet') { quiet = true; continue; }
    if (flag !== '--output') throw new Error(`Unknown option: ${flag}`);
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Incomplete option: ${flag}`);
    output = args[++i];
  }
  // The current turf ruleset: 0.5.0-F balance plus the 0.6.0-A turf block.
  const ruleset = classicOgV06A;
  const summaries = runTurfSimulation(ruleset);
  const report = turfMarkdown(ruleset, summaries);
  if (output) await writeFile(output, report, 'utf8');
  if (!quiet) console.log(report);

  const problems = turfGate(ruleset, summaries);
  if (problems.length) {
    console.error(`\nTurf gates failed:\n${problems.map((line) => `- ${line}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('\nTurf gates passed.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
