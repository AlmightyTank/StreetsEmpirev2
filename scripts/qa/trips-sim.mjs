import { writeFile } from 'node:fs/promises';
import { classicOgTripsE } from '@streets/rulesets';
import { runTripsRoundSimulation, tripsRoundGate, tripsRoundMarkdown } from '@streets/rules-engine';

const args = process.argv.slice(2);
let output = null;
let quiet = false;
try {
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help') {
      console.log('npm run qa:trips -- [--output trips.md] [--quiet]');
      process.exit(0);
    }
    if (flag === '--quiet') { quiet = true; continue; }
    if (flag !== '--output') throw new Error(`Unknown option: ${flag}`);
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Incomplete option: ${flag}`);
    output = args[++i];
  }
  // The trips release: flights, riding along, being hunted, bodyguards, the airport and the
  // girls noticing, on 0.8.0-H balance.
  const ruleset = classicOgTripsE;
  const rows = runTripsRoundSimulation(ruleset);
  const report = tripsRoundMarkdown(ruleset, rows);
  if (output) await writeFile(output, report, 'utf8');
  if (!quiet) console.log(report);

  const problems = tripsRoundGate(rows);
  if (problems.length) {
    console.error(`\nTrips gates failed:\n${problems.map((line) => `- ${line}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('\nTrips gates passed.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
