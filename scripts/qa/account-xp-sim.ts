import { writeFile } from 'node:fs/promises';
import { CROWN_EARN_RULES, rulesets, type Ruleset } from '@streets/rulesets';
import {
  ACCOUNT_TRUST_GATES,
  experienceCrownMilestones,
  experienceCrownsForLevel,
  EXPERIENCE_LEVEL_REWARDS,
  EXPERIENCE_PER_TURN,
  experienceLevelFor,
  experienceRequiredForLevel,
  questExperience,
} from '@streets/shared';

/**
 * Account XP pacing: how fast each kind of player climbs account levels over
 * several back-to-back seasons, when they clear the trust gates, and how many
 * Crowns the level milestones pay. XP sources are the live ones: turns spent
 * and finished quests (see street-pass-cred.service.ts). Player types match
 * `qa:street-pass`; turns per day top out at the ruleset's regen. Each season
 * includes one Double XP Weekend.
 *
 *   npm run qa:account-xp -- [--ruleset <id>] [--seasons 4] [--output report.md] [--quiet]
 */

const DAYS = 28;
/** One Double XP Weekend a month (Friday to Sunday, 2x account XP); modelled on the third weekend. */
const DOUBLE_XP_DAYS = new Set([19, 20, 21]);

interface Archetype {
  name: string;
  plays: (day: number) => boolean;
  dailiesPerDay: number;
  weekliesPerWeek: number;
  turnsPerDay: number;
  cityContractsPerDay: number;
  /** Share of the round's one-time Jobs finished, spread evenly over `oneTimeByDay`. */
  oneTimeShare: number;
  oneTimeByDay: number;
  /** Share of the round's season quests finished, on the last day. */
  seasonShare: number;
  /** Community events and alliance contracts over the round. */
  eventsPerRound: number;
}

const everyDay = () => true;
const weekends = (day: number) => day % 7 === 6 || day % 7 === 0;

const ARCHETYPES: Archetype[] = [
  { name: 'Hardcore', plays: everyDay, dailiesPerDay: 3, weekliesPerWeek: 2, turnsPerDay: 576, cityContractsPerDay: 2, oneTimeShare: 0.85, oneTimeByDay: 21, seasonShare: 0.8, eventsPerRound: 8 },
  { name: 'Active', plays: everyDay, dailiesPerDay: 3, weekliesPerWeek: 2, turnsPerDay: 400, cityContractsPerDay: 0.5, oneTimeShare: 0.5, oneTimeByDay: 24, seasonShare: 0.5, eventsPerRound: 2 },
  { name: 'Casual', plays: everyDay, dailiesPerDay: 2, weekliesPerWeek: 1, turnsPerDay: 150, cityContractsPerDay: 0, oneTimeShare: 0.25, oneTimeByDay: 28, seasonShare: 0.1, eventsPerRound: 0 },
  { name: 'Weekends only', plays: weekends, dailiesPerDay: 3, weekliesPerWeek: 1, turnsPerDay: 400, cityContractsPerDay: 0.5, oneTimeShare: 0.15, oneTimeByDay: 28, seasonShare: 0, eventsPerRound: 0 },
];

function questCounts(ruleset: Ruleset): { oneTime: number; season: number } {
  const quests = Object.values(ruleset.questDefinitions ?? {});
  return {
    oneTime: quests.filter((quest) => quest.repeatability === 'ONCE' && ['STORY', 'SIDE', 'SECRET', 'CONTRACT'].includes(quest.type)).length,
    season: quests.filter((quest) => quest.type === 'SEASON').length,
  };
}

/** XP earned on each day of one round (index 0 = day 1). */
function xpByDay(ruleset: Ruleset, player: Archetype, quests: { oneTime: number; season: number }): number[] {
  const regenPerDay = Math.floor((24 * 60) / ruleset.turns.intervalMinutes) * ruleset.turns.amountPerInterval;
  const turnsPerDay = Math.min(player.turnsPerDay, regenPerDay);
  const activeDays = Array.from({ length: DAYS }, (_, i) => i + 1).filter(player.plays);
  const jobDays = activeDays.filter((day) => day <= player.oneTimeByDay);
  const jobs = Math.round(quests.oneTime * player.oneTimeShare);
  const eventDays = activeDays.filter((_, i) => player.eventsPerRound > 0
    && Math.floor((i * player.eventsPerRound) / activeDays.length) !== Math.floor(((i + 1) * player.eventsPerRound) / activeDays.length));
  const out: number[] = [];
  let cityCarry = 0;
  let jobsDone = 0;
  for (let day = 1; day <= DAYS; day++) {
    let xp = 0;
    if (activeDays.includes(day)) {
      const turns = turnsPerDay + (day === activeDays[0] ? ruleset.round.startingPlayer.turns : 0);
      xp += turns * EXPERIENCE_PER_TURN;
      xp += player.dailiesPerDay * questExperience('DAILY');
      const week = Math.ceil(day / 7);
      const weekDays = activeDays.filter((d) => Math.ceil(d / 7) === week);
      if (weekDays.slice(-player.weekliesPerWeek).includes(day)) xp += questExperience('WEEKLY');
      cityCarry += player.cityContractsPerDay;
      while (cityCarry >= 1) { xp += questExperience('CITY_CONTRACT'); cityCarry -= 1; }
      if (eventDays.includes(day)) xp += questExperience('EVENT');
      const jobsByToday = jobDays.includes(day) ? Math.round((jobs * (jobDays.indexOf(day) + 1)) / jobDays.length) : jobsDone;
      xp += (jobsByToday - jobsDone) * questExperience('STORY');
      jobsDone = jobsByToday;
      if (day === activeDays[activeDays.length - 1]) xp += Math.round(quests.season * player.seasonShare) * questExperience('SEASON');
    }
    out.push(DOUBLE_XP_DAYS.has(day) ? xp * 2 : xp);
  }
  return out;
}

/** "S1 d3.4": the season and fractional day the running total first reaches `target`, or null. */
function whenReached(daily: number[], target: number): { day: number; label: string } | null {
  let total = 0;
  for (let i = 0; i < daily.length; i++) {
    const today = daily[i]!;
    if (total + today >= target) {
      const at = i + (today > 0 ? (target - total) / today : 0);
      const season = Math.floor(i / DAYS) + 1;
      return { day: at, label: `S${season} d${(at - (season - 1) * DAYS + 0.05).toFixed(1)}` };
    }
    total += today;
  }
  return null;
}

const args = process.argv.slice(2);
let rulesetId = 'classic-og-v2.2-a';
let seasons = 4;
let quiet = false;
let output: string | null = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ruleset') rulesetId = args[++i]!;
  else if (args[i] === '--seasons') seasons = Number(args[++i]);
  else if (args[i] === '--output') output = args[++i]!;
  else if (args[i] === '--quiet') quiet = true;
}

const ruleset = rulesets[rulesetId];
if (!ruleset) throw new Error(`Unknown ruleset: ${rulesetId}`);
const quests = questCounts(ruleset);
const lines: string[] = [];
const log = (line = '') => lines.push(line);
const failures: string[] = [];
const check = (ok: boolean, message: string) => { if (!ok) failures.push(message); };
const fmt = (n: number) => n.toLocaleString('en-US');

log(`# Account XP pacing · ${rulesetId}`);
log();
log(`${DAYS}-day seasons, played back to back. ${quests.oneTime} one-time Jobs and ${quests.season} season quests a round. `
  + `XP: ${EXPERIENCE_PER_TURN}/turn (regen ${ruleset.turns.amountPerInterval} per ${ruleset.turns.intervalMinutes} min, ${ruleset.round.startingPlayer.turns} to start), `
  + `daily ${questExperience('DAILY')}, weekly ${questExperience('WEEKLY')}, city/event/alliance ${questExperience('CITY_CONTRACT')}, Job ${questExperience('STORY')}, season ${questExperience('SEASON')}. `
  + `Double XP on days ${[...DOUBLE_XP_DAYS].join(', ')} of each season.`);

const timelines = new Map(ARCHETYPES.map((player) => {
  const round = xpByDay(ruleset, player, quests);
  return [player.name, Array.from({ length: seasons }, () => round).flat()];
}));

log();
log('## Level at the end of each season');
log();
log(`| Player | XP / season | ${Array.from({ length: seasons }, (_, i) => `S${i + 1}`).join(' | ')} |`);
log(`| --- | --- | ${Array.from({ length: seasons }, () => '---').join(' | ')} |`);
for (const player of ARCHETYPES) {
  const daily = timelines.get(player.name)!;
  const perSeason = daily.slice(0, DAYS).reduce((a, b) => a + b, 0);
  const levels = Array.from({ length: seasons }, (_, i) => experienceLevelFor(perSeason * (i + 1)));
  log(`| ${player.name} | ${fmt(perSeason)} | ${levels.join(' | ')} |`);
}

log();
log('## When each title and Crown milestone lands');
log();
const milestones = [...new Set([...EXPERIENCE_LEVEL_REWARDS.map((r) => r.level), ...experienceCrownMilestones(0, 75).map((r) => r.level)])].sort((a, b) => a - b);
log(`| Level | XP | Reward | ${ARCHETYPES.map((p) => p.name).join(' | ')} |`);
log(`| --- | --- | --- | ${ARCHETYPES.map(() => '---').join(' | ')} |`);
for (const level of milestones) {
  const title = EXPERIENCE_LEVEL_REWARDS.find((r) => r.level === level);
  const crowns = experienceCrownsForLevel(level);
  const reward = [title ? `"${title.title}"` : null, crowns ? `${crowns} Crowns` : null].filter(Boolean).join(' + ');
  const cells = ARCHETYPES.map((p) => whenReached(timelines.get(p.name)!, experienceRequiredForLevel(level))?.label ?? '–');
  log(`| ${level} | ${fmt(experienceRequiredForLevel(level))} | ${reward} | ${cells.join(' | ')} |`);
}

log();
log('## Level Crowns per season');
log();
log(`Play already pays up to ${CROWN_EARN_RULES.roundCap} Crowns a round. Level Crowns sit outside that cap and pay once per account: ${fmt(experienceCrownMilestones(0, 50).reduce((n, r) => n + r.crowns, 0))} by level 50, then more every 5 levels with no top.`);
log();
log(`| Player | ${Array.from({ length: seasons }, (_, i) => `S${i + 1}`).join(' | ')} |`);
log(`| --- | ${Array.from({ length: seasons }, () => '---').join(' | ')} |`);
for (const player of ARCHETYPES) {
  const daily = timelines.get(player.name)!;
  const perSeason = daily.slice(0, DAYS).reduce((a, b) => a + b, 0);
  const crowns = Array.from({ length: seasons }, (_, i) => {
    const from = experienceLevelFor(perSeason * i);
    const to = experienceLevelFor(perSeason * (i + 1));
    return experienceCrownMilestones(from, to).reduce((n, r) => n + r.crowns, 0);
  });
  crowns.forEach((amount, i) => check(amount <= CROWN_EARN_RULES.roundCap / 2,
    `${player.name} earns ${amount} level Crowns in season ${i + 1}; keep it to half the ${CROWN_EARN_RULES.roundCap} play cap`));
  log(`| ${player.name} | ${crowns.join(' | ')} |`);
}

log();
log('## Trust gates for a brand-new account');
log();
log(`| Gate | Level | XP | ${ARCHETYPES.map((p) => p.name).join(' | ')} |`);
log(`| --- | --- | --- | ${ARCHETYPES.map(() => '---').join(' | ')} |`);
for (const [key, gate] of Object.entries(ACCOUNT_TRUST_GATES)) {
  const xp = experienceRequiredForLevel(gate.level);
  const cells = ARCHETYPES.map((p) => whenReached(timelines.get(p.name)!, xp));
  log(`| ${gate.label} | ${gate.level} | ${fmt(xp)} | ${cells.map((c) => c?.label ?? '–').join(' | ')} |`);
  // A throwaway account that only burns its starting turns must not clear any gate.
  check(experienceLevelFor(ruleset.round.startingPlayer.turns * EXPERIENCE_PER_TURN) < gate.level, `Starting turns alone clear the ${key} gate`);
  const casual = cells[ARCHETYPES.findIndex((p) => p.name === 'Casual')];
  const limit = ({ casino: 2, coldMessage: 2, sportsbook: 3, foundAlliance: 4 } as Record<string, number>)[key] ?? 4;
  check(casual !== null && casual!.day <= limit, `A casual player should clear the ${key} gate within ${limit} days, not ${casual?.label ?? 'never'}`);
}

log();
log(failures.length
  ? `**Pace: FAIL**\n\n${failures.map((f) => `- ${f}`).join('\n')}`
  : '**Pace: PASS** (starting turns clear no gate, a casual player messages by day 2 and founds by day 4, no one earns more than half the play cap in level Crowns in a season).');

const markdown = lines.join('\n');
if (output) await writeFile(output, markdown, 'utf8');
if (!quiet) console.log(markdown);
if (failures.length) {
  console.error(`\nAccount XP pacing failed:\n${failures.map((f) => `- ${f}`).join('\n')}`);
  process.exitCode = 1;
}
