import { listRulesets } from '@streets/rules-engine';
import {
  addCase,
  addHeat,
  bustChance,
  caseFromHeat,
  caseFromPoints,
  cityCaseDelta,
  cityLaw,
  coolCase,
  decayHeat,
  planWorkSupply,
  seededRng,
  stageRank,
  wantedStage,
  warrantWindowHours,
} from '@streets/rules-engine';

/**
 * 1.3.0-G. `qa:law`: whole 28-day rounds of street work under a law ruleset, run through the
 * real engine maths (work-supply Heat, busts and arrests, Case from Heat, direct evidence,
 * city pace, cooling and warrants), for players who handle Heat sensibly and players who
 * ignore it.
 *
 * The bands are the 1.3.0 goal: a player who plays the Heat game sensibly reaches Warrant in
 * a city at most once or twice a round, and a player who ignores Heat entirely hits it
 * roughly weekly. Street work is the main Heat source; runs, production and rackets add on
 * top in a real round, which is what the "sensible" upper band leaves room for.
 *
 *   npm run qa:law -- [--ruleset classic-og-v1.3-g] [--seeds 200] [--quiet]
 */

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const quiet = args.includes('--quiet');
const seeds = Number(flag('seeds', '200'));
const newestLaw = listRulesets().filter((row) => row.meta.id.startsWith('classic-og-v1.3-')).at(-1);
const rulesetId = flag('ruleset', newestLaw?.meta.id);
const pinned = listRulesets().find((row) => row.meta.id === rulesetId);
if (!pinned) {
  console.error(`Unknown ruleset ${rulesetId}.`);
  process.exit(1);
}
const meta = pinned.meta;
// `--set law.heatToCase=0.02` tries a number without a new ruleset; repeat for several.
const overrides = args.flatMap((arg, index) => (arg === '--set' && args[index + 1] ? [args[index + 1]] : []));
const ruleset = overrides.length ? structuredClone(pinned) : pinned;
for (const override of overrides) {
  const [path, raw] = override.split('=');
  const parts = path.split('.');
  let target = ruleset;
  for (const part of parts.slice(0, -1)) target = target[part];
  target[parts.at(-1)] = Number(raw);
}
const law = ruleset.law;
if (!law || !ruleset.heat) {
  console.error(`${meta.id} has no law block.`);
  process.exit(1);
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const ROUND_DAYS = 28;
const TRIP_TURNS = 24;
const START = Date.UTC(2026, 0, 5, 0, 0, 0);

/** How a player handles Heat. */
const STYLES = {
  // Crack on the street, and stops for the session at the drag line.
  careful: { label: 'Careful (crack, stops at the drag line)', primary: 'CRACK', stopAt: () => ruleset.heat.drag.startsAt },
  // The heavy product, but still stops before busts start.
  managed: { label: 'Managed (cocaine, stops before busts)', primary: 'COCAINE', stopAt: () => ruleset.heat.bust.startsAt },
  // The heaviest product, works every turn whatever the Heat.
  reckless: { label: 'Reckless (meth, never stops)', primary: 'METH', stopAt: () => Infinity },
  // Careful on the street, but moves serious cash in one city every day (cage, registers, run
  // buys and sales), growing from $100,000 to $3,000,000 a day across the round.
  trader: { label: 'Trader (careful, big daily cash)', primary: 'CRACK', stopAt: () => ruleset.heat.drag.startsAt, cashPerDay: (day) => 100_000_00 + Math.round((2_900_000_00 * day) / (ROUND_DAYS - 1)) },
};

/** When a player logs in to spend their turns, by UTC hour. */
const SCHEDULES = {
  casual: [9, 21],
  regular: [8, 13, 18, 23],
  grinder: [0, 4, 8, 12, 16, 20],
};

/** Crew grows across the round, from a fresh start to a strong late game. */
function whoresOnDay(day) {
  return Math.round(100 + (1_100 * day) / (ROUND_DAYS - 1));
}

function simulate({ style, schedule, citySlug, seed }) {
  const rng = seededRng(seed);
  const pace = cityLaw(law, citySlug);
  const heatRules = ruleset.heat;
  const turnRules = ruleset.turns;
  let heat = 0;
  let heatAt = START;
  let turns = turnRules.cap;
  let turnsAt = START;
  let lockedUntil = 0;
  let clock = { caseHundredths: 0, caseAt: new Date(START), lastEvidenceAt: null };
  let warrant = null;
  let reportDay = -1;
  const out = { warrants: 0, firstWarrantDay: null, peakRank: 0, federalHours: 0, busts: 0, arrests: 0, heatDrawn: 0 };

  const settleTime = (now) => {
    const intervals = Math.floor((now - heatAt) / (turnRules.intervalMinutes * 60_000));
    if (intervals > 0) {
      heat = decayHeat(heat, intervals, heatRules);
      heatAt += intervals * turnRules.intervalMinutes * 60_000;
    }
    const earned = Math.floor((now - turnsAt) / (turnRules.intervalMinutes * 60_000));
    if (earned > 0) {
      const away = turnRules.awayBonus?.enabled && now - turnsAt >= turnRules.awayBonus.afterHours * HOUR_MS ? turnRules.awayBonus.amount : 0;
      turns = Math.min(turnRules.cap, turns + earned * turnRules.amountPerInterval) + away;
      turnsAt += earned * turnRules.intervalMinutes * 60_000;
    }
  };

  const readCase = (now) => coolCase(clock, new Date(now), law, pace.coolingSpeed);

  const record = (now, delta, active) => {
    const before = readCase(now);
    const after = addCase(before, cityCaseDelta(delta, pace), law);
    clock = { caseHundredths: after, caseAt: new Date(now), lastEvidenceAt: active && after > before ? new Date(now) : clock.lastEvidenceAt };
    out.peakRank = Math.max(out.peakRank, stageRank(wantedStage(after, law)));
    if (law.warrants && !warrant && after > before && stageRank(wantedStage(after, law)) >= stageRank('WARRANT')) {
      warrant = { servesAt: now + warrantWindowHours(law, pace, after) * HOUR_MS };
    }
  };

  const serveDue = (now) => {
    if (!warrant || warrant.servesAt > now) return;
    const at = warrant.servesAt;
    const before = readCase(at);
    const ceiling = law.warrants.caseAfterServed * 100;
    clock = { caseHundredths: Math.min(before, ceiling), caseAt: new Date(at), lastEvidenceAt: clock.lastEvidenceAt };
    out.warrants += 1;
    out.firstWarrantDay ??= (at - START) / DAY_MS;
    warrant = null;
  };

  const sessions = [];
  for (let day = 0; day < ROUND_DAYS; day++) {
    for (const hour of SCHEDULES[schedule]) sessions.push(START + day * DAY_MS + hour * HOUR_MS + Math.floor(rng() * 40) * 60_000);
  }
  // Hourly samples of time spent at Federal.
  let sampleAt = START;

  for (const now of sessions) {
    while (sampleAt < now) {
      serveDue(sampleAt);
      if (wantedStage(readCase(sampleAt), law) === 'FEDERAL') out.federalHours += 1;
      sampleAt += HOUR_MS;
    }
    serveDue(now);
    settleTime(now);
    if (now < lockedUntil) continue;
    const workers = whoresOnDay(Math.floor((now - START) / DAY_MS));
    const plan = (count) => planWorkSupply({
      job: 'LOW_RENT', workers, turns: count,
      policy: { primary: STYLES[style].primary, fallback: null, emergency: null, strict: true },
      inventory: { [STYLES[style].primary]: 1e12 }, ruleset,
    });
    // Currency reports: the day's cash, moved in one go at the first session of the day.
    const cashPerDay = STYLES[style].cashPerDay;
    if (cashPerDay && law.currencyReport) {
      const day = Math.floor((now - START) / DAY_MS);
      if (day !== reportDay) {
        reportDay = day;
        const reports = Math.floor(cashPerDay(day) / law.currencyReport.thresholdCents);
        record(now, caseFromPoints(reports * law.currencyReport.points), true);
      }
    }
    while (turns >= TRIP_TURNS && heat < STYLES[style].stopAt()) {
      const startHeat = heat;
      const added = Math.round(plan(TRIP_TURNS).heat);
      turns -= TRIP_TURNS;
      out.heatDrawn += added;
      let points = 0;
      let drop = 0;
      const arrest = heatRules.arrest && startHeat >= heatRules.arrest.startsAt
        ? heatRules.arrest.chanceAtMax * Math.min(1, (startHeat - heatRules.arrest.startsAt) / (heatRules.max - heatRules.arrest.startsAt))
        : 0;
      if (arrest > 0 && rng() < arrest) {
        out.arrests += 1;
        points += law.evidence?.arrest ?? 0;
        drop = heatRules.arrest.heatDrop;
        lockedUntil = now + heatRules.arrest.downtimeMinutes * 60_000;
      } else if (rng() < bustChance(startHeat, ruleset)) {
        out.busts += 1;
        points += law.evidence?.bust ?? 0;
        drop = heatRules.bust.heatDrop;
      }
      heat = addHeat(startHeat, added - drop, heatRules);
      record(now, caseFromHeat(added, law) + caseFromPoints(points), true);
      if (lockedUntil > now) break;
    }
  }
  const end = START + ROUND_DAYS * DAY_MS;
  while (sampleAt < end) {
    serveDue(sampleAt);
    if (wantedStage(readCase(sampleAt), law) === 'FEDERAL') out.federalHours += 1;
    sampleAt += HOUR_MS;
  }
  return out;
}

function profile(style, schedule, citySlug) {
  const runs = Array.from({ length: seeds }, (_, index) => simulate({ style, schedule, citySlug, seed: 1_000 + index }));
  const mean = (pick) => runs.reduce((sum, run) => sum + pick(run), 0) / runs.length;
  const firsts = runs.map((run) => run.firstWarrantDay).filter((day) => day !== null).sort((a, b) => a - b);
  return {
    style, schedule, citySlug,
    warrants: mean((run) => run.warrants),
    p90Warrants: [...runs.map((run) => run.warrants)].sort((a, b) => a - b)[Math.floor(runs.length * 0.9)],
    firstWarrantDay: firsts.length ? firsts[Math.floor(firsts.length / 2)] : null,
    federalShare: mean((run) => run.federalHours) / (ROUND_DAYS * 24),
    peak: ['Quiet', 'Noticed', 'Investigation', 'Warrant', 'Federal'][[...runs.map((run) => run.peakRank)].sort((a, b) => a - b)[Math.floor(runs.length / 2)]],
    busts: mean((run) => run.busts),
    arrests: mean((run) => run.arrests),
    caseFromHeatPerDay: mean((run) => run.heatDrawn) * law.heatToCase / ROUND_DAYS,
  };
}

/** The bands each profile must land in, per round. */
const BANDS = [
  { style: 'careful', schedule: 'casual', max: 1, why: 'a careful casual player rarely sees a warrant' },
  { style: 'careful', schedule: 'regular', max: 2, why: 'sensible play: at most once or twice a round' },
  { style: 'careful', schedule: 'grinder', max: 2, why: 'sensible play stays sensible at grinder hours' },
  { style: 'managed', schedule: 'regular', max: 3, why: 'heavy product managed under the bust line costs a little more' },
  { style: 'trader', schedule: 'regular', max: 2, why: 'big honest cash flow is noticed, not hunted' },
  { style: 'reckless', schedule: 'regular', min: 3, max: 6, why: 'ignoring Heat: roughly weekly' },
  { style: 'reckless', schedule: 'grinder', min: 3, max: 9, why: 'ignoring Heat around the clock: at least weekly, at most every three days' },
];

const cities = ['new-york-city', 'beverly-hills', 'atlanta'];
let failed = 0;
const rows = [];
for (const band of BANDS) {
  for (const citySlug of cities) {
    const result = profile(band.style, band.schedule, citySlug);
    // City pace is part of the game: the bands scale with how fast each city's police build a Case.
    const pace = cityLaw(law, citySlug).caseSpeed;
    const max = band.max === undefined ? undefined : Math.ceil(band.max * Math.max(1, pace));
    const min = band.min === undefined ? undefined : Math.max(1, Math.floor(band.min * Math.min(1, pace)));
    const ok = (max === undefined || result.warrants <= max) && (min === undefined || result.warrants >= min);
    if (!ok) failed += 1;
    rows.push({ ...result, ok, band: `${min ?? 0}–${max ?? '∞'}`, why: band.why });
  }
}

console.log(`qa:law on ${meta.id} (${meta.version})${overrides.length ? ` with ${overrides.join(', ')}` : ''}, ${seeds} rounds per profile, ${ROUND_DAYS}-day rounds, crew 100→1,200`);
const pad = (value, width) => String(value).padEnd(width);
if (!quiet || failed) {
  console.log(pad('profile', 34) + pad('city', 15) + pad('warrants', 10) + pad('p90', 5) + pad('band', 7) + pad('1st warrant', 13) + pad('peak', 15) + pad('federal', 9) + pad('busts', 7) + pad('Case/day', 9));
  for (const row of rows) {
    if (quiet && row.ok) continue;
    console.log(
      pad(`${row.ok ? ' ' : '✗'} ${row.style}/${row.schedule}`, 34)
      + pad(row.citySlug, 15)
      + pad(row.warrants.toFixed(2), 10)
      + pad(row.p90Warrants, 5)
      + pad(row.band, 7)
      + pad(row.firstWarrantDay === null ? '—' : `day ${row.firstWarrantDay.toFixed(1)}`, 13)
      + pad(row.peak, 15)
      + pad(`${(row.federalShare * 100).toFixed(0)}%`, 9)
      + pad(row.busts.toFixed(1), 7)
      + pad(row.caseFromHeatPerDay.toFixed(1), 9),
    );
  }
}
if (failed) {
  console.error(`\n${failed} law profile(s) outside their bands.`);
  process.exitCode = 1;
} else {
  console.log(`All ${rows.length} law profiles inside their bands.`);
}
