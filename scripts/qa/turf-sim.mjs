import { writeFile } from 'node:fs/promises';
import { classicOgV06F } from '@streets/rulesets';
import { runTurfRoundSimulation, runTurfSimulation, turfGate, turfMarkdown, turfRoundGate, turfRoundMarkdown } from '@streets/rules-engine';

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
  // 0.6.0-F release gate: run all existing 40-block and push balance checks against the shipping ruleset.
  const ruleset = classicOgV06F;
  const summaries = runTurfSimulation(ruleset);
  const round = runTurfRoundSimulation(ruleset);
  const report = [turfMarkdown(ruleset, summaries), turfRoundMarkdown(ruleset, round)].join('\n\n');
  if (output) await writeFile(output, report, 'utf8');
  if (!quiet) console.log(report);

  const problems = [...turfGate(ruleset, summaries), ...turfRoundGate(ruleset, round)];
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
