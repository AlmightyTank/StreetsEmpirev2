import { writeFile } from 'node:fs/promises';
import { factionTier, factionTierName } from '@streets/rules-engine';
import { rulesets } from '@streets/rulesets';

const args = process.argv.slice(2);
let output = null;
let quiet = false;
let rulesetId = 'classic-og-v1.4-g';

for (let i = 0; i < args.length; i += 1) {
  const flag = args[i];
  if (flag === '--help') {
    console.log('npm run qa:factions -- [--ruleset classic-og-v1.4-g] [--output factions.md] [--quiet]');
    process.exit(0);
  }
  if (flag === '--quiet') { quiet = true; continue; }
  const value = args[i + 1];
  if (!value || value.startsWith('--')) throw new Error(`Incomplete option: ${flag}`);
  i += 1;
  if (flag === '--output') output = value;
  else if (flag === '--ruleset') rulesetId = value;
  else throw new Error(`Unknown option: ${flag}`);
}

const ruleset = rulesets[rulesetId];
if (!ruleset) throw new Error(`Unknown ruleset: ${rulesetId}`);
if (!ruleset.factions || !ruleset.factionStanding || !ruleset.contractSponsors || !ruleset.factionPerks) {
  throw new Error(`${rulesetId} does not have the full faction release rules.`);
}

const DAYS = 28;
const factions = Object.keys(ruleset.factions);
const money = (cents) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
const rules = ruleset.factionStanding;

const jobStanding = {
  KINGS: [15, 25, 15, 20],
  OUTFIT: [15, 25, 30, 20],
  ROAD_SAINTS: [15, 25, 30, 20],
  CARTEL_LINE: [15, 25, 30, 20],
  CIVIC_HANDSHAKE: [25, 25, 40, 20],
};

const profiles = [
  { key: 'street', name: 'Street-only', streetDays: 28, factionDays: 0, businessDays: 0, runDays: 0, dailies: 0, weeklies: 0, city: 0, season: 0, jobBudget: 0 },
  { key: 'faction', name: 'Faction-heavy', streetDays: 12, factionDays: 16, businessDays: 0, runDays: 0, dailies: 20, weeklies: 4, city: 0, season: 2, jobBudget: 10 },
  { key: 'business', name: 'Business-heavy', streetDays: 12, factionDays: 4, businessDays: 12, runDays: 0, dailies: 8, weeklies: 2, city: 0, season: 1, jobBudget: 3 },
  { key: 'runner', name: 'Runner', streetDays: 10, factionDays: 4, businessDays: 0, runDays: 14, dailies: 7, weeklies: 1, city: 12, season: 1, jobBudget: 2 },
  { key: 'mixed', name: 'Mixed', streetDays: 12, factionDays: 7, businessDays: 5, runDays: 4, dailies: 12, weeklies: 3, city: 5, season: 2, jobBudget: 6 },
];

function emptyStanding() {
  return Object.fromEntries(factions.map((key) => [key, 0]));
}

function add(receipts, standing, profile, factionKey, delta, source) {
  if (!factionKey || delta === 0) return;
  const before = standing[factionKey] ?? 0;
  const after = Math.min(rules.max, Math.max(0, before + delta));
  if (after === before) return;
  standing[factionKey] = after;
  receipts.push({ profile: profile.key, factionKey, source, delta: after - before, pointsAfter: after });
}

function sponsor(index, lane) {
  const laneSeeds = {
    daily: ['KINGS', 'OUTFIT', 'CARTEL_LINE', 'CIVIC_HANDSHAKE', 'ROAD_SAINTS'],
    weekly: ['OUTFIT', 'KINGS', 'ROAD_SAINTS', 'CARTEL_LINE', 'CIVIC_HANDSHAKE'],
    city: ['ROAD_SAINTS', 'CARTEL_LINE', 'CIVIC_HANDSHAKE', 'KINGS', 'OUTFIT'],
    season: ['KINGS', 'ROAD_SAINTS', 'OUTFIT', 'CIVIC_HANDSHAKE', 'CARTEL_LINE'],
  }[lane];
  return laneSeeds[index % laneSeeds.length];
}

function simulate(profile) {
  const standing = emptyStanding();
  const receipts = [];
  let job = 0;
  for (const factionKey of factions) {
    for (const amount of jobStanding[factionKey] ?? []) {
      if (job >= profile.jobBudget) break;
      add(receipts, standing, profile, factionKey, amount, 'JOB');
      job += 1;
    }
  }
  for (let i = 0; i < profile.dailies; i += 1) add(receipts, standing, profile, sponsor(i, 'daily'), ruleset.contractSponsors.standing.DAILY, 'CONTRACT_DAILY');
  for (let i = 0; i < profile.weeklies; i += 1) add(receipts, standing, profile, sponsor(i, 'weekly'), ruleset.contractSponsors.standing.WEEKLY, 'CONTRACT_WEEKLY');
  for (let i = 0; i < profile.city; i += 1) add(receipts, standing, profile, sponsor(i, 'city'), ruleset.contractSponsors.standing.CITY_CONTRACT, 'CONTRACT_CITY');
  for (let i = 0; i < profile.season; i += 1) add(receipts, standing, profile, sponsor(i, 'season'), ruleset.contractSponsors.standing.SEASON, 'CONTRACT_SEASON');

  const netWorthCents =
    profile.streetDays * 95_000 +
    profile.factionDays * 62_000 +
    profile.businessDays * 130_000 +
    profile.runDays * 118_000 -
    receipts.length * 2_500;
  return { profile, standing, receipts, netWorthCents };
}

const results = profiles.map(simulate);
const factionOnly = results.find((row) => row.profile.key === 'faction');
const mixed = results.find((row) => row.profile.key === 'mixed');
const receiptMismatches = results.flatMap((row) => factions.flatMap((factionKey) => {
  const sum = row.receipts.filter((receipt) => receipt.factionKey === factionKey).reduce((total, receipt) => total + receipt.delta, 0);
  return sum === row.standing[factionKey] ? [] : [`${row.profile.name} ${factionKey}: stored ${row.standing[factionKey]}, receipts ${sum}`];
}));
const nudgeProblems = Object.entries(ruleset.factionPerks.nudges).flatMap(([factionKey, nudge]) =>
  !nudge || !Number.isInteger(nudge.percent) || nudge.percent < 1 || nudge.percent > 10
    ? [`${factionKey} nudge is outside the pinned 1-10% release band.`]
    : []);
const tierProblems = rules.tiers.known !== 25 || rules.tiers.trusted !== 70 || rules.tiers.connected !== 140 || rules.tiers.innerCircle !== 300 || rules.max !== 500
  ? [`Tier thresholds changed: ${JSON.stringify(rules.tiers)}, max ${rules.max}.`]
  : [];
const problems = [
  ...(mixed.netWorthCents > factionOnly.netWorthCents ? [] : ['Mixed play must beat faction-only play.']),
  ...receiptMismatches,
  ...nudgeProblems,
  ...tierProblems,
];

const markdown = [
  `# Faction balance · ${ruleset.meta.id}`,
  '',
  `${DAYS}-day abstract whole-round pass: street-only, faction-heavy, business-heavy, runner and mixed profiles. Standing receipts are summed the same way the live audit view checks them.`,
  '',
  `**Overall: ${problems.length ? 'FAIL' : 'PASS'}**`,
  '',
  '| Profile | Net worth | Best standing | Connected factions | Inner Circle factions | Receipts |',
  '| --- | ---: | --- | ---: | ---: | ---: |',
  ...results.map((row) => {
    const standings = Object.entries(row.standing);
    const best = standings.reduce((a, b) => (b[1] > a[1] ? b : a));
    const connected = standings.filter(([, points]) => points >= rules.tiers.connected).length;
    const inner = standings.filter(([, points]) => points >= rules.tiers.innerCircle).length;
    return `| ${row.profile.name} | ${money(row.netWorthCents)} | ${ruleset.factions[best[0]].name} ${best[1]} (${factionTierName(factionTier(best[1], rules))}) | ${connected} | ${inner} | ${row.receipts.length} |`;
  }),
  '',
  '## Pinned Values',
  '',
  `- Tiers: Known ${rules.tiers.known}, Trusted ${rules.tiers.trusted}, Connected ${rules.tiers.connected}, Inner Circle ${rules.tiers.innerCircle}; max ${rules.max}.`,
  `- Board standing: daily ${ruleset.contractSponsors.standing.DAILY}, weekly ${ruleset.contractSponsors.standing.WEEKLY}, city ${ruleset.contractSponsors.standing.CITY_CONTRACT}, Season ${ruleset.contractSponsors.standing.SEASON}, alliance ${ruleset.contractSponsors.standing.ALLIANCE}.`,
  `- Nudges: ${Object.entries(ruleset.factionPerks.nudges).map(([key, nudge]) => `${ruleset.factions[key].name} ${nudge.percent}%`).join('; ')}.`,
  '',
  '## Gate',
  '',
  `- Mixed play: ${money(mixed.netWorthCents)}.`,
  `- Faction-only play: ${money(factionOnly.netWorthCents)}.`,
  `- Receipt integrity: ${receiptMismatches.length ? receiptMismatches.join('; ') : 'all simulated standing totals match receipts.'}`,
  ...(problems.length ? ['', '## Problems', '', ...problems.map((problem) => `- ${problem}`)] : []),
].join('\n');

if (output) await writeFile(output, markdown, 'utf8');
if (!quiet) console.log(markdown);
if (problems.length) process.exitCode = 1;
