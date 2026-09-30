import { writeFile } from 'node:fs/promises';
import {
  rulesets,
  STREET_PASS_S1,
  STREET_PASS_S1_COSMETICS,
  streetPassCredWithBonus,
  streetPassTierForCred,
  type QuestRewardDefinition,
  type Ruleset,
  type StreetPassRules,
} from '@streets/rulesets';
import { calculateNetWorthCents, simulateSeason } from '@streets/rules-engine';

/**
 * Street Pass step 5: how fast each kind of player climbs the pass, and how
 * much the rewards are worth next to the economy they land in.
 *
 * Cred is modelled day by day from the round's own rates. Net worth comes
 * from the season simulation (`qa:season`), so "worth" means the same thing
 * it does on the rankings. See docs/STREET-PASS.md.
 *
 *   npm run qa:street-pass -- [--ruleset <id>] [--costs 800,1200,1600] [--output report.md] [--quiet]
 */

const DAYS = 28;

interface Archetype {
  name: string;
  joinDay: number;
  /** Plays on this day of the round (1-based)? */
  plays: (day: number) => boolean;
  dailiesPerDay: number;
  weekliesPerWeek: number;
  turnsPerDay: number;
  cityContractsPerDay: number;
  /** Share of the round's one-time Jobs finished, spread evenly over `oneTimeByDay`. */
  oneTimeShare: number;
  oneTimeByDay: number;
  /** Community events and alliance contracts over the round. */
  eventsPerRound: number;
}

const everyDay = () => true;
const weekends = (day: number) => day % 7 === 6 || day % 7 === 0;

const ARCHETYPES: Archetype[] = [
  { name: 'Hardcore', joinDay: 1, plays: everyDay, dailiesPerDay: 3, weekliesPerWeek: 2, turnsPerDay: 576, cityContractsPerDay: 2, oneTimeShare: 0.85, oneTimeByDay: 21, eventsPerRound: 8 },
  { name: 'Active', joinDay: 1, plays: everyDay, dailiesPerDay: 3, weekliesPerWeek: 2, turnsPerDay: 400, cityContractsPerDay: 0.5, oneTimeShare: 0.5, oneTimeByDay: 24, eventsPerRound: 2 },
  { name: 'Casual', joinDay: 1, plays: everyDay, dailiesPerDay: 2, weekliesPerWeek: 1, turnsPerDay: 150, cityContractsPerDay: 0, oneTimeShare: 0.25, oneTimeByDay: 28, eventsPerRound: 0 },
  { name: 'Weekends only', joinDay: 1, plays: weekends, dailiesPerDay: 3, weekliesPerWeek: 1, turnsPerDay: 400, cityContractsPerDay: 0.5, oneTimeShare: 0.15, oneTimeByDay: 28, eventsPerRound: 0 },
  { name: 'Active, joins day 15', joinDay: 15, plays: everyDay, dailiesPerDay: 3, weekliesPerWeek: 2, turnsPerDay: 400, cityContractsPerDay: 0.5, oneTimeShare: 0.4, oneTimeByDay: 28, eventsPerRound: 1 },
  { name: 'Active, joins day 22', joinDay: 22, plays: everyDay, dailiesPerDay: 3, weekliesPerWeek: 2, turnsPerDay: 400, cityContractsPerDay: 0.5, oneTimeShare: 0.25, oneTimeByDay: 28, eventsPerRound: 1 },
];

function oneTimeJobCount(ruleset: Ruleset): number {
  return Object.values(ruleset.questDefinitions ?? {}).filter((quest) =>
    quest.repeatability === 'ONCE' && ['STORY', 'SIDE', 'SECRET', 'CONTRACT'].includes(quest.type)).length;
}

function lateJoinBonus(rules: StreetPassRules, joinDay: number): number {
  const weeks = Math.floor((joinDay - 1) / 7);
  return Math.min(rules.lateJoin.maxBonusPercent, weeks * rules.lateJoin.bonusPercentPerWeek);
}

/** Cred at the end of each day of the round (index 0 = day 1). */
function credByDay(rules: StreetPassRules, player: Archetype, oneTimeJobs: number): number[] {
  const bonus = lateJoinBonus(rules, player.joinDay);
  const s = rules.sources;
  const award = (base: number) => streetPassCredWithBonus(base, bonus);
  const activeDays = Array.from({ length: DAYS }, (_, i) => i + 1).filter((day) => day >= player.joinDay && player.plays(day));
  const jobDays = activeDays.filter((day) => day <= Math.max(player.oneTimeByDay, player.joinDay));
  const jobs = Math.round(oneTimeJobs * player.oneTimeShare);
  const eventDays = new Set(Array.from({ length: player.eventsPerRound }, (_, i) =>
    activeDays[Math.floor(((i + 0.5) * activeDays.length) / Math.max(1, player.eventsPerRound))]));
  let cred = 0;
  let cityCarry = 0;
  let jobsDone = 0;
  const out: number[] = [];
  for (let day = 1; day <= DAYS; day++) {
    if (activeDays.includes(day)) {
      cred += player.dailiesPerDay * award(s.dailyContract);
      cred += award(Math.min(s.dailyTurnCap, player.turnsPerDay * s.perTurnSpent));
      // Weeklies land on the player's last active days of each week.
      const week = Math.ceil(day / 7);
      const weekDays = activeDays.filter((d) => Math.ceil(d / 7) === week);
      if (weekDays.slice(-player.weekliesPerWeek).includes(day)) cred += award(s.weeklyContract);
      cityCarry += player.cityContractsPerDay;
      while (cityCarry >= 1) { cred += award(s.eventContract); cityCarry -= 1; }
      if (eventDays.has(day)) cred += award(s.eventContract);
      const jobsByToday = jobDays.includes(day) ? Math.round((jobs * (jobDays.indexOf(day) + 1)) / jobDays.length) : jobsDone;
      cred += (jobsByToday - jobsDone) * award(s.oneTimeJob);
      jobsDone = jobsByToday;
    }
    out.push(cred);
  }
  return out;
}

/** Net worth of every reward on tiers 1..tier, valued the way rankings value them. */
function passValueCents(ruleset: Ruleset, rules: StreetPassRules, tier: number): bigint {
  const holdings: Record<string, number> = { cashCents: 0, whores: 0, thugs: 0, lowRiders: 0, medicine: 0, crack: 0, condoms: 0, beer: 0, pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 };
  const products: Record<string, number> = {};
  const add = (reward: QuestRewardDefinition) => {
    const amount = reward.amount ?? 0;
    if (reward.kind === 'CASH') holdings.cashCents! += amount;
    else if (reward.kind === 'ITEM' && reward.key && reward.key in holdings) holdings[reward.key]! += amount;
    else if (reward.kind === 'PRODUCT' && reward.key) {
      if (reward.key === 'CRACK') holdings.crack! += amount;
      else products[reward.key] = (products[reward.key] ?? 0) + amount;
    }
  };
  for (const t of rules.tiers.slice(0, tier)) t.rewards.forEach(add);
  return calculateNetWorthCents({ ...holdings, products } as unknown as Parameters<typeof calculateNetWorthCents>[0], ruleset);
}

const dollars = (cents: number | bigint) => `$${Math.round(Number(cents) / 100).toLocaleString('en-US')}`;
const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '–');

const args = process.argv.slice(2);
let rulesetId = 'classic-og-street-pass-a';
let quiet = false;
let output: string | null = null;
/** Try other Cred costs per third of the track, e.g. --costs 800,1200,1600. */
let costs: number[] | null = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ruleset') rulesetId = args[++i]!;
  else if (args[i] === '--output') output = args[++i]!;
  else if (args[i] === '--costs') costs = args[++i]!.split(',').map(Number);
  else if (args[i] === '--quiet') quiet = true;
}

const found = rulesets[rulesetId];
if (!found) throw new Error(`Unknown ruleset: ${rulesetId}`);
// A ruleset without a pass is previewed with Season 1 attached.
const ruleset: Ruleset = found.streetPass
  ? found
  : { ...found, cosmetics: { ...found.cosmetics, ...STREET_PASS_S1_COSMETICS }, streetPass: STREET_PASS_S1 };
const baseRules = ruleset.streetPass!;
const rules: StreetPassRules = costs
  ? { ...baseRules, credPerTier: baseRules.credPerTier.map((range, i) => ({ ...range, cred: costs![i] ?? range.cred })) }
  : baseRules;

const oneTimeJobs = oneTimeJobCount(ruleset);
const lines: string[] = [];
const log = (line = '') => lines.push(line);
const failures: string[] = [];

log(`# Street Pass balance · ${rules.name} on ${rulesetId}`);
log();
log(`${rules.tiers.length} tiers, ${oneTimeJobs} one-time Jobs in the round. Cred per source: daily ${rules.sources.dailyContract}, weekly ${rules.sources.weeklyContract}, one-time Job ${rules.sources.oneTimeJob}, event/city/alliance ${rules.sources.eventContract}, ${rules.sources.perTurnSpent}/turn up to ${rules.sources.dailyTurnCap}/day.`);
log();
log('## How fast players climb');
log();
log('| Player | Joins | Tier day 7 | Tier day 14 | Tier day 21 | Tier day 28 | Finishes | Cred |');
log('| --- | --- | --- | --- | --- | --- | --- | --- |');
const finished: Record<string, number | null> = {};
const tierAt: Record<string, number[]> = {};
for (const player of ARCHETYPES) {
  const cred = credByDay(rules, player, oneTimeJobs);
  const tiers = cred.map((c) => streetPassTierForCred(rules, c));
  tierAt[player.name] = tiers;
  const done = tiers.findIndex((t) => t === rules.tiers.length);
  finished[player.name] = done === -1 ? null : done + 1;
  const at = (day: number) => (day < player.joinDay ? '–' : String(tiers[day - 1]));
  log(`| ${player.name} | day ${player.joinDay} | ${at(7)} | ${at(14)} | ${at(21)} | ${at(28)} | ${done === -1 ? 'no' : `day ${done + 1}`} | ${cred[DAYS - 1]!.toLocaleString('en-US')} |`);
}

// The design targets in docs/STREET-PASS.md.
const check = (ok: boolean, message: string) => { if (!ok) failures.push(message); };
const active = finished.Active;
check(active !== null && active! >= 22, `Active should finish in the last week, not day ${active}`);
check(active !== null, 'Active should finish the pass');
const casual = tierAt.Casual![DAYS - 1]!;
check(casual >= 15 && casual < rules.tiers.length, `Casual should reach tier 15–29, reached ${casual}`);
const hardcore = finished.Hardcore;
check(hardcore === null || hardcore >= 16, `Hardcore finishes on day ${hardcore}; the pass should last past the second week`);
check(tierAt['Active, joins day 15']![DAYS - 1]! >= 15, 'A day-15 active joiner should get past tier 15');

log();
log('## What the pass is worth next to the economy');
log();
log('Pass value is the net worth of every reward on the tiers reached (cosmetics count for nothing).');
log('Economy numbers are the season simulation\'s mixed player, seed 1.');
log();
const season = simulateSeason(ruleset, { seed: 1 });
const engaged = season.agents.find((a) => a.name === 'Mixed player (engaged)')!;
const casualAgent = season.agents.find((a) => a.name === 'Mixed player (casual)')!;
log('| Day | Active: tier · pass value | Engaged net worth | Share | Casual: tier · pass value | Casual net worth | Share |');
log('| --- | --- | --- | --- | --- | --- | --- |');
for (const day of [7, 14, 21, 28]) {
  const aTier = tierAt.Active![day - 1]!;
  const cTier = tierAt.Casual![day - 1]!;
  const aValue = passValueCents(ruleset, rules, aTier);
  const cValue = passValueCents(ruleset, rules, cTier);
  const eNw = engaged.daily[day - 1] ?? engaged.netWorthCents;
  const cNw = casualAgent.daily[day - 1] ?? casualAgent.netWorthCents;
  log(`| ${day} | ${aTier} · ${dollars(aValue)} | ${dollars(eNw)} | ${pct(Number(aValue), eNw)} | ${cTier} · ${dollars(cValue)} | ${dollars(cNw)} | ${pct(Number(cValue), cNw)} |`);
}
const full = rules.tiers.flatMap((t) => t.rewards);
const sum = (kind: string, key?: string) => full.filter((r) => r.kind === kind && (key === undefined || r.key === key)).reduce((n, r) => n + (r.amount ?? 0), 0);
log();
log(`Crew from a full pass: ${sum('ITEM', 'whores')} hoes (${pct(sum('ITEM', 'whores'), engaged.whores)} of an engaged crew's ${engaged.whores}, ${pct(sum('ITEM', 'whores'), casualAgent.whores)} of a casual crew's ${casualAgent.whores}) and ${sum('ITEM', 'thugs')} thugs (${pct(sum('ITEM', 'thugs'), engaged.thugs)} of ${engaged.thugs}, ${pct(sum('ITEM', 'thugs'), casualAgent.thugs)} of ${casualAgent.thugs}).`);
log(`Cash from a full pass: ${dollars(sum('CASH'))}.`);

log();
log(failures.length ? `**Pace: FAIL**\n\n${failures.map((f) => `- ${f}`).join('\n')}` : '**Pace: PASS** (Active finishes in the last week, Casual lands mid-track, Hardcore can\'t finish in two weeks, a day-15 joiner gets past tier 15).');

const markdown = lines.join('\n');
if (output) await writeFile(output, markdown, 'utf8');
if (!quiet) console.log(markdown);
if (failures.length) {
  console.error(`\nStreet Pass balance failed:\n${failures.map((f) => `- ${f}`).join('\n')}`);
  process.exitCode = 1;
}
