import { writeFile } from 'node:fs/promises';
import { classicOgV11F } from '@streets/rulesets';
import { blockWarGate, blockWarMarkdown, businessGate, businessMarkdown, runBlockWarSimulation, runBusinessSimulation, simulateSeason } from '@streets/rules-engine';

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
  // 1.1.0-F: use the release ruleset. Existing lot/racket/war gates stay pinned,
  // then add a 28-day strategy profile for business-heavy, turf-raider, runner and mixed play.
  const ruleset = classicOgV11F;
  const summaries = runBusinessSimulation(ruleset);
  const wars = runBlockWarSimulation(ruleset);
  const report = `${businessMarkdown(ruleset, summaries)}\n${blockWarMarkdown(ruleset, wars)}`;
  if (output) await writeFile(output, report, 'utf8');
  if (!quiet) console.log(report);

  const releaseRoster = [
    { name: 'Turf-raider', strategy: 'raider', joinDay: 0, sessionsPerDay: 4 },
    { name: 'Runner', strategy: 'trader', joinDay: 0, sessionsPerDay: 4 },
    { name: 'Mixed', strategy: 'mixed', joinDay: 0, sessionsPerDay: 4 },
  ];
  const fullRound = simulateSeason(ruleset, { seed: 110, days: 28, roster: releaseRoster });
  const bestBusinessDay = Math.max(0, ...summaries.flatMap((crew) => crew.homeCaps.map((cap) => cap.netCentsPerDay)));
  const pureBusinessCents = Math.round(bestBusinessDay * 28);
  const mixed = fullRound.agents.find((agent) => agent.name === 'Mixed');

  if (!quiet) {
    console.log('\n## 1.1.0-F full-round release profiles');
    console.log(`- Business-heavy: ${(pureBusinessCents / 100).toFixed(0)}`);
    for (const agent of fullRound.agents) console.log(`- ${agent.name}: ${(agent.netWorthCents / 100).toFixed(0)}`);
  }

  const problems = [...businessGate(ruleset, summaries), ...blockWarGate(ruleset, wars)];
  if (!mixed || mixed.netWorthCents <= pureBusinessCents) {
    problems.push(`Mixed play must beat pure business play over a full round (mixed ${mixed?.netWorthCents ?? 0}, business ${pureBusinessCents}).`);
  }
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
