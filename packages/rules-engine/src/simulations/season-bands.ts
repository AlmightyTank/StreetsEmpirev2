import type { Ruleset } from '@streets/rulesets';
import { SEASON_STRATEGIES, simulateSeason, type SeasonAgentSummary, type SeasonResult, type SeasonStrategyKey } from './season.js';

/**
 * 1.0.0-D. The balance bands a season has to land in, one per roadmap question.
 *
 * The goal is not equality. It is that no system carries a season on its own,
 * that combat is a choice and the economy is not, that an early lead does not
 * close the round, and that mixed, skilled play generally beats grinding one
 * system blind. Each band names the question it answers, what it measures, and
 * the line it has to hold. Measures are medians across seeds, so one lucky
 * season cannot pass or fail a ruleset on its own.
 */

export interface SeasonBand {
  readonly key: string;
  readonly question: string;
  readonly measure: string;
  readonly value: number;
  /** Human-readable pass line, e.g. "≥ 1.10". */
  readonly line: string;
  readonly pass: boolean;
  readonly detail: string;
}

export interface SeasonBandReport {
  readonly rulesetId: string;
  readonly seeds: readonly number[];
  readonly pass: boolean;
  readonly bands: readonly SeasonBand[];
  /** Median final net worth per crew, in cents. */
  readonly standings: ReadonlyArray<{ name: string; strategy: SeasonStrategyKey; joinDay: number; netWorthCents: number }>;
}

/** The lines each band has to hold. Changing one is a design decision; write down why. */
export const SEASON_BAND_LINES = {
  /** Mixed play beats the plain street grinder by at least this much, in both play styles. */
  mixedOverStreet: 1.1,
  /** No strategy finishes more than this multiple of mixed play. */
  dominance: 1.5,
  /** The best crew that never fights reaches at least this share of the best crew overall. */
  combatOptional: 0.7,
  /** A crew with no economy at all ends below this share of the street grinder. */
  economyRequired: 0.25,
  /** Block changes per block per week, at least. */
  turfTurnover: 1,
  /** A late joiner's first week reaches at least this share of an opening crew's first week. */
  lateJoiner: 0.5,
  /** Travelling ends at least this share of staying home on the street. */
  travelOverStreet: 0.9,
  /** Share of all run income that hijackers take, at most. */
  runLosses: 0.5,
  /** The hideout investor ends at least level with the street grinder. */
  hideoutOverStreet: 1,
  /** Pushes on alliance blocks that land, at least, when anyone tries. */
  alliancePushWins: 0.2,
  /** An alliance specialist ends at most this multiple of a solo mixed player. */
  allianceOverSolo: 1.4,
  /** Distinct strategies that top at least one scenario (seed and play style). */
  distinctWinners: 2,
} as const;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function strategyName(key: SeasonStrategyKey): string {
  return SEASON_STRATEGIES.find((row) => row.key === key)!.name;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function evaluateSeasonBands(results: readonly SeasonResult[]): SeasonBandReport {
  const lines = SEASON_BAND_LINES;
  const byName = new Map<string, SeasonAgentSummary[]>();
  for (const result of results) for (const agent of result.agents) byName.set(agent.name, [...(byName.get(agent.name) ?? []), agent]);
  const nw = (name: string) => median((byName.get(name) ?? []).map((agent) => agent.netWorthCents));
  const styled = (key: SeasonStrategyKey, style: 'engaged' | 'casual') => `${strategyName(key)} (${style})`;
  const engaged = (key: SeasonStrategyKey) => nw(styled(key, 'engaged'));
  const casual = (key: SeasonStrategyKey) => nw(styled(key, 'casual'));
  const bands: SeasonBand[] = [];
  const band = (key: string, question: string, measure: string, value: number, line: string, pass: boolean, detail: string) =>
    bands.push({ key, question, measure, value: round2(value), line, pass, detail });
  const $ = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

  // Balance goal: mixed, skilled play beats grinding the street blind.
  const mixedEngaged = engaged('mixed');
  const mixedCasual = casual('mixed');
  const overStreet = Math.min(mixedEngaged / engaged('street'), mixedCasual / casual('street'));
  band('mixed-beats-grinding', 'Does mixed skilled play outperform blind single-system grinding?',
    'Mixed ÷ street-focused, the worse of the two play styles', overStreet, `≥ ${lines.mixedOverStreet}`, overStreet >= lines.mixedOverStreet,
    `engaged ${$(mixedEngaged)} vs ${$(engaged('street'))}; casual ${$(mixedCasual)} vs ${$(casual('street'))}`);

  // Q1: no single system dominates net worth.
  const engagedRows = SEASON_STRATEGIES.map((row) => ({ key: row.key, value: engaged(row.key) }));
  const top = engagedRows.reduce((a, b) => (b.value > a.value ? b : a));
  band('no-dominant-system', 'Does any single system dominate net worth?',
    'Best engaged strategy ÷ mixed', top.value / mixedEngaged, `≤ ${lines.dominance}`, top.value / mixedEngaged <= lines.dominance,
    `top: ${strategyName(top.key)} ${$(top.value)}`);

  // Q2: combat can be ignored.
  const nonCombat: SeasonStrategyKey[] = ['street', 'producer', 'trader', 'traveler', 'hideout', 'arbitrage'];
  const peaceful = nonCombat.map((key) => ({ key, value: engaged(key) })).reduce((a, b) => (b.value > a.value ? b : a));
  band('combat-optional', 'Can a player ignore combat entirely?',
    'Best never-fighting strategy ÷ best strategy', peaceful.value / top.value, `≥ ${lines.combatOptional}`, peaceful.value / top.value >= lines.combatOptional,
    `${strategyName(peaceful.key)} ${$(peaceful.value)} without a single raid, push or tail`);

  // Q3: the economy cannot.
  const pure = nw('Pure raider');
  band('economy-required', 'Can a player ignore the economy entirely?',
    'Pure raider (no street, no trade) ÷ street-focused', pure / engaged('street'), `≤ ${lines.economyRequired}`, pure / engaged('street') <= lines.economyRequired,
    `a crew that only raids ends at ${$(pure)}: without an economy it never grows strong enough to hit anyone`);

  // Q4: turf does not snowball.
  const ruleCap = Math.max(...results.map((result) => result.turf.maxBlocksPerGroup));
  const turnover = median(results.map((result) => result.turf.changes / Math.max(1, result.turf.contested) / (result.days / 7)));
  const turfTop = Math.max(engaged('turf'), nw('North turf wing'));
  const snowball = turnover >= lines.turfTurnover && turfTop / mixedEngaged <= lines.dominance;
  band('turf-no-snowball', 'Does controlling turf snowball uncontrollably?',
    'Block changes per block per week (and the best turf crew stays within the dominance band)', turnover, `≥ ${lines.turfTurnover}`, snowball,
    `most blocks one group held at the end: ${ruleCap}; best turf crew ${$(turfTop)} (${round2(turfTop / mixedEngaged)}× mixed)`);

  // Q5: late joiners are not locked out.
  const firstWeek = (name: string) => median((byName.get(name) ?? []).map((agent) => agent.daily[6] ?? 0));
  const opening = firstWeek(styled('mixed', 'engaged'));
  const late = ['Late mixed (day 7)', 'Late mixed (day 14)', 'Late mixed (day 21)'].map((name) => ({ name, value: firstWeek(name) }));
  const worstLate = late.reduce((a, b) => (b.value < a.value ? b : a));
  band('no-lockout', 'Can established players permanently lock new players out?',
    'Worst late joiner\'s first week ÷ an opening mixed crew\'s first week', worstLate.value / opening, `≥ ${lines.lateJoiner}`, worstLate.value / opening >= lines.lateJoiner,
    late.map((row) => `${row.name}: ${$(row.value)}`).join('; ') + `; opening week ${$(opening)}`);

  // Q6: travel profits are worth travel risks.
  const traveler = engaged('traveler') / engaged('street');
  const runIncome = results.flatMap((result) => result.agents).reduce((sum, agent) => sum + Math.max(0, agent.income.runs), 0);
  const runLosses = results.flatMap((result) => result.agents).reduce((sum, agent) => sum + agent.costs.convoyed, 0);
  const lossShare = runIncome > 0 ? runLosses / (runIncome + runLosses) : 0;
  band('travel-worth-it', 'Are travel profits worth travel risks?',
    'Traveler ÷ street-focused (and hijack losses stay a minority of run income)', traveler, `≥ ${lines.travelOverStreet}`,
    traveler >= lines.travelOverStreet && lossShare <= lines.runLosses,
    `hijackers took ${Math.round(lossShare * 100)}% of what runs would have made; pure trader ${$(engaged('trader'))}`);

  // Q7: the hideout pays for itself.
  const hideout = Math.min(engaged('hideout') / engaged('street'), casual('hideout') / casual('street'));
  band('hideout-pays', 'Are Hideout upgrades worth their cost?',
    'Hideout investor ÷ street-focused, the worse play style', hideout, `≥ ${lines.hideoutOverStreet}`, hideout >= lines.hideoutOverStreet,
    `engaged ${$(engaged('hideout'))}, casual ${$(casual('hideout'))}`);

  // Q8: store arbitrage does not beat everything.
  const arbitrage = engaged('arbitrage');
  const others = engagedRows.filter((row) => row.key !== 'arbitrage');
  const beaten = others.filter((row) => arbitrage >= row.value).length;
  band('arbitrage-bounded', 'Can store arbitrage outperform every other activity?',
    'Strategies store arbitrage beats', beaten, '< all', arbitrage < mixedEngaged && beaten < others.length,
    `store arbitrage ends at ${$(arbitrage)}: counters sell far below what they charge, so there is no loop to farm`);

  // Q9: alliances are not unbeatable walls.
  const pushes = results.reduce((sum, result) => ({ attempts: sum.attempts + result.turf.alliancePushes.attempts, wins: sum.wins + result.turf.alliancePushes.wins }), { attempts: 0, wins: 0 });
  const pushRate = pushes.attempts ? pushes.wins / pushes.attempts : 1;
  const allianceEdge = engaged('alliance') / mixedEngaged;
  band('alliances-not-walls', 'Do alliances create unbeatable defensive walls?',
    'Pushes on alliance blocks that land (and a specialist stays within reach of solo mixed play)', pushRate, `≥ ${lines.alliancePushWins}`,
    pushRate >= lines.alliancePushWins && allianceEdge <= lines.allianceOverSolo,
    `${pushes.wins} of ${pushes.attempts} pushes on allied blocks landed; alliance specialist ${round2(allianceEdge)}× solo mixed`);

  // Balance goal: different strategies win under different circumstances.
  const winners = new Set<string>();
  for (const result of results) {
    for (const style of ['engaged', 'casual'] as const) {
      const field = result.agents.filter((agent) => agent.name.endsWith(`(${style})`));
      const best = field.reduce((a, b) => (b.netWorthCents > a.netWorthCents ? b : a));
      winners.add(best.strategy);
    }
  }
  band('strategies-vary', 'Do different strategies win under different circumstances?',
    'Distinct strategies that top a scenario (each seed, each play style)', winners.size, `≥ ${lines.distinctWinners}`, winners.size >= lines.distinctWinners,
    [...winners].map((key) => strategyName(key as SeasonStrategyKey)).join(', '));

  const standings = [...byName.entries()].map(([name, rows]) => ({ name, strategy: rows[0]!.strategy, joinDay: rows[0]!.joinDay, netWorthCents: Math.round(median(rows.map((row) => row.netWorthCents))) }))
    .sort((a, b) => b.netWorthCents - a.netWorthCents);
  return { rulesetId: results[0]?.rulesetId ?? '', seeds: results.map((result) => result.seed), pass: bands.every((row) => row.pass), bands, standings };
}

/** Seasons for each seed, then the bands. */
export function runSeasonBands(ruleset: Ruleset, seeds: readonly number[] = [1, 2, 3]): { results: SeasonResult[]; report: SeasonBandReport } {
  const results = seeds.map((seed) => simulateSeason(ruleset, { seed }));
  return { results, report: evaluateSeasonBands(results) };
}

/** The season report as Markdown: the bands, then who finished where and how they made it. */
export function seasonMarkdown(report: SeasonBandReport, results: readonly SeasonResult[]): string {
  const $ = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
  const lines: string[] = [
    `# Whole-season balance · ${report.rulesetId}`,
    '',
    `${results.length} simulated seasons (seeds ${report.seeds.join(', ')}), ${results[0]?.days ?? 0} days each, ${results[0]?.agents.length ?? 0} crews. Medians across seeds.`,
    '',
    `**Overall: ${report.pass ? 'PASS' : 'FAIL'}**`,
    '',
    '| Question | Measure | Value | Line | Result |',
    '| --- | --- | ---: | ---: | --- |',
    ...report.bands.map((band) => `| ${band.question} | ${band.measure} | ${band.value} | ${band.line} | ${band.pass ? 'pass' : '**fail**'} |`),
    '',
    '## What each band saw',
    '',
    ...report.bands.map((band) => `- **${band.key}**: ${band.detail}`),
    '',
    '## Final standings (median net worth)',
    '',
    '| Crew | Strategy | Joined | Net worth |',
    '| --- | --- | ---: | ---: |',
    ...report.standings.map((row) => `| ${row.name} | ${SEASON_STRATEGIES.find((s) => s.key === row.strategy)!.name} | day ${row.joinDay} | ${$(row.netWorthCents)} |`),
    '',
    '## Where the money came from (first seed)',
    '',
    '| Crew | Street | Turf bonus | Turf tax | Back Office | Runs | Raids | Convoys | Lost to raids | Lost to hijacks |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...[...(results[0]?.agents ?? [])].sort((a, b) => b.netWorthCents - a.netWorthCents).map((agent) =>
      `| ${agent.name} | ${$(agent.income.street)} | ${$(agent.income.holdBonus)} | ${$(agent.income.turfTax)} | ${$(agent.income.backOffice)} | ${$(agent.income.runs)} | ${$(agent.income.raids)} | ${$(agent.income.convoys)} | ${$(agent.costs.raided)} | ${$(agent.costs.convoyed)} |`),
  ];
  return lines.join('\n');
}
