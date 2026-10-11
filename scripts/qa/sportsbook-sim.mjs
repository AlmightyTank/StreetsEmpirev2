/**
 * 1.8.0-D. Sportsbook limits Monte Carlo.
 *
 *   npm run qa:sportsbook [-- --runs 2000] [--markdown] [--limits '{"dailyStakeCents":15000000}']
 *
 * Plays a 28-day round of pregame moneylines for one player at a time under several betting
 * styles, against the 1.8.0-A limits (one $1,000,000 ticket cap, nothing else) and the 1.8.0-D
 * limits in @streets/shared. Lines carry a typical 4.5% bookmaker margin. A "sharp" player beats
 * that margin by betting delayed lines, which is the realistic abuse case for a cached free feed.
 *
 * The question is not whether the house wins (it does, slowly) but how far one player can move
 * up the leaderboard with sportsbook cash alone. Results are compared with the median engaged
 * end-of-round net worth from docs/BALANCE-1.0.0-D.md. Exits 1 if a 1.8.0-D band fails.
 */
import { seededRng } from '@streets/rules-engine';
import { SPORTSBOOK_LIMITS, sportsbookMaxStake, sportsbookPayoutCents } from '@streets/shared';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const RUNS = Number(option('runs', '2000'));
const MARKDOWN = args.includes('--markdown');
if (!Number.isSafeInteger(RUNS) || RUNS < 200) throw new Error('--runs must be at least 200.');

const DAYS = 28;
const GAMES_PER_DAY = 24;
const MARGIN = 0.045;
const SHARP_EDGE = 0.03;
/** Median engaged end-of-round net worth, BALANCE-1.0.0-D. */
const REFERENCE_NET_WORTH_CENTS = 1_100_000_000;
/** $5,000 start to ~$11M by day 28; about a third is cash on hand at any time. */
const cashOnHandCents = (day) => Math.round(500_000 * (REFERENCE_NET_WORTH_CENTS / 500_000) ** (day / (DAYS - 1)) * 0.35);

const UNLIMITED = 1e15;
const CONFIGS = {
  '1.8.0-A': {
    minStakeCents: 100, maxStakeCents: 100_000_000, maxProfitCents: UNLIMITED, perGameStakeCents: UNLIMITED,
    openStakeCents: UNLIMITED, openTickets: 1_000_000, dailyStakeCents: UNLIMITED, sideLiabilityCents: UNLIMITED,
  },
  '1.8.0-D': SPORTSBOOK_LIMITS,
};
// Tuning: --limits '{"dailyStakeCents":15000000}' adds a "candidate" set (1.8.0-D with overrides).
if (option('limits', '')) CONFIGS.candidate = { ...SPORTSBOOK_LIMITS, ...JSON.parse(option('limits', '{}')) };

function american(probability) {
  return probability >= 0.5
    ? -Math.max(100, Math.round((100 * probability) / (1 - probability)))
    : Math.max(100, Math.round((100 * (1 - probability)) / probability));
}

/** One day's board: true win chances and the book's prices with margin. */
function slate(rng) {
  return Array.from({ length: GAMES_PER_DAY }, (_, id) => {
    const favourite = 0.5 + 0.42 * rng() ** 1.6;
    const home = rng() < 0.5 ? favourite : 1 - favourite;
    return {
      id,
      sides: [
        { trueP: home, odds: american(Math.min(0.97, home * (1 + MARGIN))) },
        { trueP: 1 - home, odds: american(Math.min(0.97, (1 - home) * (1 + MARGIN))) },
      ],
    };
  });
}

const decimal = (odds) => (odds > 0 ? 1 + odds / 100 : 1 + 100 / -odds);

const STYLES = {
  /** A few small bets a day on whatever looks fun. */
  recreational: { picks: (games, rng) => Array.from({ length: 3 }, () => games[Math.floor(rng() * games.length)].sides[rng() < 0.5 ? 0 : 1]), stake: (cash) => Math.round(cash * 0.01) },
  /** The biggest underdogs, as much as allowed, chasing a leaderboard jump. */
  longshot: { picks: (games) => games.flatMap((game) => game.sides).sort((a, b) => b.odds - a.odds).slice(0, 10), stake: (cash) => cash },
  /** Heavy favourites, as much as allowed. */
  favourite: { picks: (games) => games.flatMap((game) => game.sides).sort((a, b) => a.odds - b.odds).slice(0, 10), stake: (cash) => cash },
  /** Bets delayed lines that have already moved elsewhere: a real +3% edge on every ticket. */
  sharp: {
    picks: (games, rng) => games.slice(0, 12).map((game) => {
      const side = game.sides[rng() < 0.5 ? 0 : 1];
      return { ...side, trueP: Math.min(0.99, (1 + SHARP_EDGE) / decimal(side.odds)) };
    }),
    stake: (cash) => cash,
  },
  /** Half of cash on one long shot every day. */
  allIn: { picks: (games) => [games.flatMap((game) => game.sides).sort((a, b) => b.odds - a.odds)[0]], stake: (cash) => Math.round(cash * 0.5) },
};

function playRound(limits, style, seed) {
  const rng = seededRng(seed);
  let profit = 0;
  let turnover = 0;
  for (let day = 0; day < DAYS; day += 1) {
    const games = slate(rng);
    let cash = Math.max(0, cashOnHandCents(day) + profit);
    const usage = { openStakeCents: 0, openTickets: 0, dailyStakeCents: 0 };
    const pending = [];
    const perGame = new Map();
    for (const side of style.picks(games, rng)) {
      const game = games.find((candidate) => candidate.sides.includes(side) || candidate.sides.some((s) => s.odds === side.odds)) ?? { id: -1 };
      const { maxStakeCents } = sportsbookMaxStake(side.odds, limits, {
        cashCents: cash, openStakeCents: usage.openStakeCents, openTickets: usage.openTickets,
        dailyStakeCents: usage.dailyStakeCents, gameStakeCents: perGame.get(game.id) ?? 0, sideLiabilityCents: 0,
      });
      const stake = Math.min(style.stake(cash), maxStakeCents);
      if (stake < limits.minStakeCents) continue;
      cash -= stake;
      usage.openStakeCents += stake;
      usage.openTickets += 1;
      usage.dailyStakeCents += stake;
      perGame.set(game.id, (perGame.get(game.id) ?? 0) + stake);
      turnover += stake;
      pending.push({ stake, payout: sportsbookPayoutCents(stake, side.odds), won: rng() < side.trueP });
    }
    // Every ticket settles before the next day's board.
    for (const ticket of pending) profit += (ticket.won ? ticket.payout : 0) - ticket.stake;
  }
  return { profit, turnover };
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const dollars = (cents) => `${cents < 0 ? '-' : ''}$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
const share = (cents) => `${((cents / REFERENCE_NET_WORTH_CENTS) * 100).toFixed(1)}%`;

const results = {};
for (const [configName, limits] of Object.entries(CONFIGS)) {
  for (const [styleName, style] of Object.entries(STYLES)) {
    const profits = [];
    let profitSum = 0;
    let turnoverSum = 0;
    for (let run = 0; run < RUNS; run += 1) {
      const { profit, turnover } = playRound(limits, style, 1_800_400 + run * 7 + styleName.length);
      profits.push(profit);
      profitSum += profit;
      turnoverSum += turnover;
    }
    profits.sort((a, b) => a - b);
    results[`${configName}/${styleName}`] = {
      config: configName, style: styleName,
      median: percentile(profits, 0.5), p95: percentile(profits, 0.95), p99: percentile(profits, 0.99), max: profits[profits.length - 1],
      hold: turnoverSum ? -profitSum / turnoverSum : 0, turnoverPerRound: turnoverSum / RUNS,
    };
  }
}

const rows = Object.values(results);
if (MARKDOWN) {
  console.log('| Limits | Style | Median | p95 | p99 | Best run | p99 vs median net worth | House hold | Staked per round |');
  console.log('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const row of rows) {
    console.log(`| ${row.config} | ${row.style} | ${dollars(row.median)} | ${dollars(row.p95)} | ${dollars(row.p99)} | ${dollars(row.max)} | ${share(row.p99)} | ${(row.hold * 100).toFixed(1)}% | ${dollars(row.turnoverPerRound)} |`);
  }
} else {
  console.log(`Sportsbook limits Monte Carlo: ${RUNS.toLocaleString('en-US')} rounds per style, ${DAYS} days, ${GAMES_PER_DAY} games/day, ${(MARGIN * 100).toFixed(1)}% margin`);
  for (const row of rows) {
    console.log(`${row.config.padEnd(8)} ${row.style.padEnd(13)} median ${dollars(row.median).padStart(14)}  p95 ${dollars(row.p95).padStart(14)}  p99 ${dollars(row.p99).padStart(14)} (${share(row.p99)})  best ${dollars(row.max).padStart(15)}  hold ${(row.hold * 100).toFixed(1)}%`);
  }
}

// 1.8.0-D bands: sportsbook cash alone should not decide a leaderboard.
const failures = [];
const d = (style) => results[`1.8.0-D/${style}`];
const band = (label, ok, detail) => { if (!ok) failures.push(`${label}: ${detail}`); };
band('Sharp p95 within 5% of median net worth', d('sharp').p95 <= REFERENCE_NET_WORTH_CENTS * 0.05, dollars(d('sharp').p95));
for (const style of ['longshot', 'allIn', 'favourite']) {
  band(`${style} p99 within 10% of median net worth`, d(style).p99 <= REFERENCE_NET_WORTH_CENTS * 0.1, dollars(d(style).p99));
}
band('Recreational hold near the 4.5% margin', d('recreational').hold > 0.01 && d('recreational').hold < 0.08, `${(d('recreational').hold * 100).toFixed(1)}%`);
band('Largest ticket no bigger than the largest casino table bet ($100,000)', SPORTSBOOK_LIMITS.maxStakeCents <= 10_000_000, dollars(SPORTSBOOK_LIMITS.maxStakeCents));
if (failures.length) {
  console.error(`\n${failures.length} 1.8.0-D band(s) failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
if (!MARKDOWN) console.log('\nAll 1.8.0-D bands pass.');
