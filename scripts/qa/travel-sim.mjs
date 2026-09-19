import { writeFile } from 'node:fs/promises';
import { classicOgV05F } from '@streets/rulesets';
import {
  convoyGate,
  convoyMarkdown,
  livingMarkdown,
  runConvoySimulation,
  runTravelRiskSimulation,
  runTravelRoundSimulation,
  runTravelSimulation,
  travelGate,
  travelMarkdown,
  travelRiskGate,
  travelRiskMarkdown,
  travelRoundGate,
  travelRoundMarkdown,
} from '@streets/rules-engine';

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
  // The current travel ruleset: 0.5.0-A cities and roads, 0.5.0-B runs, 0.5.0-C markets and risk,
  // 0.5.0-D moves, 0.5.0-E convoys and the 0.5.0-F release, on 0.4.0-E balance.
  const ruleset = classicOgV05F;
  const summaries = runTravelSimulation(ruleset);
  const risk = runTravelRiskSimulation(ruleset);
  const convoys = runConvoySimulation(ruleset);
  const round = runTravelRoundSimulation(ruleset);
  const report = [travelMarkdown(ruleset, summaries), travelRiskMarkdown(ruleset, risk), livingMarkdown(ruleset), convoyMarkdown(ruleset, convoys), travelRoundMarkdown(ruleset, round)].join('\n');
  if (output) await writeFile(output, report, 'utf8');
  if (!quiet) console.log(report);

  const problems = [...travelGate(ruleset, summaries).problems, ...travelRiskGate(ruleset, risk).problems, ...convoyGate(convoys), ...travelRoundGate(ruleset, round)];
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
