import { writeFile } from 'node:fs/promises';
import { rulesets } from '@streets/rulesets';
import { runSeasonBands, seasonMarkdown } from '@streets/rules-engine';

// 1.0.0-D release gate: whole seasons where every strategy plays at once, judged against the balance bands.
const args = process.argv.slice(2);
let output = null;
let quiet = false;
let rulesetId = 'classic-og-v1.4-c2';
let seeds = [1, 2, 3, 4, 5];
try {
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help') {
      console.log('npm run qa:season -- [--ruleset classic-og-v1.4-c2] [--seeds 1,2,3,4,5] [--output season.md] [--quiet]');
      process.exit(0);
    }
    if (flag === '--quiet') { quiet = true; continue; }
    const value = args[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`Incomplete option: ${flag}`);
    i++;
    if (flag === '--output') output = value;
    else if (flag === '--ruleset') rulesetId = value;
    else if (flag === '--seeds') seeds = value.split(',').map((seed) => Number.parseInt(seed, 10)).filter(Number.isFinite);
    else throw new Error(`Unknown option: ${flag}`);
  }
  const ruleset = rulesets[rulesetId];
  if (!ruleset) throw new Error(`Unknown ruleset: ${rulesetId}`);
  if (!seeds.length) throw new Error('Give at least one seed.');
  const { results, report } = runSeasonBands(ruleset, seeds);
  const markdown = seasonMarkdown(report, results);
  if (output) await writeFile(output, markdown, 'utf8');
  if (!quiet) console.log(markdown);
  if (!report.pass) {
    console.error(`\nSeason balance failed:\n${report.bands.filter((band) => !band.pass).map((band) => `- ${band.key}: ${band.value} (needs ${band.line})`).join('\n')}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
