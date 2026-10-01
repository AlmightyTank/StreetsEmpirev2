import { writeFile } from 'node:fs/promises';
import { classicOgV11D } from '@streets/rulesets';
import { blockWarGate, blockWarMarkdown, businessGate, businessMarkdown, runBlockWarSimulation, runBusinessSimulation } from '@streets/rules-engine';

const args = process.argv.slice(2);
let output = null;
let quiet = false;
try {
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help') {
      console.log('npm run qa:business -- [--output business.md] [--quiet]');
      process.exit(0);
    }
    if (flag === '--quiet') { quiet = true; continue; }
    if (flag !== '--output') throw new Error(`Unknown option: ${flag}`);
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Incomplete option: ${flag}`);
    output = args[++i];
  }
  // 1.1.0-D: every lot, the home caps (with and without cash rackets), laundering caps,
  // the war/fatigue/tier/decay timings, and whole block wars against an online-rate model.
  // Business balance is A's, unchanged.
  const ruleset = classicOgV11D;
  const summaries = runBusinessSimulation(ruleset);
  const wars = runBlockWarSimulation(ruleset);
  const report = `${businessMarkdown(ruleset, summaries)}\n${blockWarMarkdown(ruleset, wars)}`;
  if (output) await writeFile(output, report, 'utf8');
  if (!quiet) console.log(report);

  const problems = [...businessGate(ruleset, summaries), ...blockWarGate(ruleset, wars)];
  if (problems.length) {
    console.error(`\nBusiness gates failed:\n${problems.map((line) => `- ${line}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('\nBusiness gates passed.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
