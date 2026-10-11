import type { SportsbookBetStatus, SportsbookLineState } from './types/sportsbook.js';

/** A line older than this cannot take a ticket, even if the event is still pregame. */
export const SPORTSBOOK_ODDS_MAX_AGE_MINUTES = 45;

/**
 * 1.8.0-D. Game-cash risk limits, tuned with `npm run qa:sportsbook` (docs/SPORTSBOOK-SIMULATION-1.8.0-D.md).
 * Every limit is checked on the server inside the wager transaction; the bet slip uses the same
 * function only to show the player their largest allowed stake before they press the button.
 */
export interface SportsbookLimits {
  /** Smallest ticket. */
  readonly minStakeCents: number;
  /** Largest single ticket. */
  readonly maxStakeCents: number;
  /** Most one ticket can win (payout minus stake); long shots get a smaller top stake. */
  readonly maxProfitCents: number;
  /** One player's total stake on one game, both sides, every ticket. */
  readonly perGameStakeCents: number;
  /** One player's stake across all open tickets. */
  readonly openStakeCents: number;
  /** One player's open tickets at once. */
  readonly openTickets: number;
  /** One player's stake on tickets placed in the last 24 hours. */
  readonly dailyStakeCents: number;
  /** All players' potential winnings on one side of one game, so one bad line cannot flood the economy. */
  readonly sideLiabilityCents: number;
}

export const SPORTSBOOK_LIMITS: SportsbookLimits = {
  minStakeCents: 1_000, // $10
  maxStakeCents: 2_500_000, // $25,000: the smallest casino table maximum
  maxProfitCents: 5_000_000, // $50,000 to win
  perGameStakeCents: 2_500_000, // $25,000
  openStakeCents: 15_000_000, // $150,000
  openTickets: 20,
  dailyStakeCents: 12_500_000, // $125,000
  sideLiabilityCents: 100_000_000, // $1,000,000
};

export const SPORTSBOOK_MIN_STAKE_CENTS = SPORTSBOOK_LIMITS.minStakeCents;
export const SPORTSBOOK_MAX_STAKE_CENTS = SPORTSBOOK_LIMITS.maxStakeCents;

/**
 * Total return (stake + profit) for a winning ticket at American odds, rounded to the
 * nearest cent. Mirrors the server's BigInt payout so the bet slip shows the exact amount
 * the ticket will pin; stakes are capped well inside the safe-integer range.
 */
export function sportsbookPayoutCents(stakeCents: number, odds: number): number {
  const profit = odds > 0
    ? Math.floor((stakeCents * odds + 50) / 100)
    : Math.floor((stakeCents * 100 + Math.floor(Math.abs(odds) / 2)) / Math.abs(odds));
  return stakeCents + profit;
}

export function formatAmericanOdds(odds: number | null): string {
  if (odds === null) return 'Off';
  return odds > 0 ? `+${odds}` : String(odds);
}

/** One short sentence a player sees when a line will not take a ticket. */
export function sportsbookLineReason(state: SportsbookLineState): string | null {
  switch (state) {
    case 'OPEN': return null;
    case 'NO_LINE': return 'No moneyline is posted for this game yet.';
    case 'STALE_ODDS': return 'This line is waiting on a fresh price before it reopens.';
    case 'FEED_UNAVAILABLE': return 'The odds feed is catching up. Lines reopen after the next refresh.';
    case 'PULLED': return 'The book took this line down. It reopens if the game returns to the board.';
    case 'STARTED': return 'Betting closed at the scheduled start.';
  }
}

/** Game cash a ticket hands back when it settles. */
export function sportsbookReturnCents(status: SportsbookBetStatus, stakeCents: number, payoutCents: number): number {
  if (status === 'WON') return payoutCents;
  if (status === 'PUSH' || status === 'VOID') return stakeCents;
  return 0;
}

/** 1.8.0-C. Below these remaining datapoints the feed stops optional odds polls, then result checks. */
export const SPORTSBOOK_QUOTA_ODDS_FLOOR = 500;
export const SPORTSBOOK_QUOTA_RESULTS_FLOOR = 50;

/** What a player (and the book) already has riding, for the limit check. */
export interface SportsbookStakeUsage {
  /** Cash on hand where the boss is now. The server leaves this unbounded and lets the debit decide. */
  readonly cashCents: number;
  readonly openStakeCents: number;
  readonly openTickets: number;
  readonly dailyStakeCents: number;
  /** This player's stake already on this game. */
  readonly gameStakeCents: number;
  /** Every player's potential winnings already on this side of this game. */
  readonly sideLiabilityCents: number;
}

export type SportsbookLimitCode =
  | 'SPORTSBOOK_STAKE'
  | 'SPORTSBOOK_MAX_PROFIT'
  | 'SPORTSBOOK_GAME_LIMIT'
  | 'SPORTSBOOK_OPEN_LIMIT'
  | 'SPORTSBOOK_OPEN_TICKETS'
  | 'SPORTSBOOK_DAILY_LIMIT'
  | 'SPORTSBOOK_SIDE_LIMIT'
  | 'NOT_ENOUGH_CASH';

export function sportsbookProfitCents(stakeCents: number, odds: number): number {
  return sportsbookPayoutCents(stakeCents, odds) - stakeCents;
}

/** The largest stake whose rounded profit at `odds` stays within `profitCents`. */
export function sportsbookStakeForProfit(profitCents: number, odds: number, ceilingCents: number): number {
  if (profitCents <= 0) return 0;
  let low = 0;
  let high = ceilingCents;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (sportsbookProfitCents(mid, odds) <= profitCents) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** The largest stake every limit allows at this price, and which limit sets it. */
export function sportsbookMaxStake(
  odds: number,
  limits: SportsbookLimits,
  usage: SportsbookStakeUsage,
): { maxStakeCents: number; binding: SportsbookLimitCode } {
  if (usage.openTickets >= limits.openTickets) return { maxStakeCents: 0, binding: 'SPORTSBOOK_OPEN_TICKETS' };
  const ceiling = limits.maxStakeCents;
  const candidates: Array<[SportsbookLimitCode, number]> = [
    ['SPORTSBOOK_STAKE', ceiling],
    ['SPORTSBOOK_MAX_PROFIT', sportsbookStakeForProfit(limits.maxProfitCents, odds, ceiling)],
    ['SPORTSBOOK_GAME_LIMIT', limits.perGameStakeCents - usage.gameStakeCents],
    ['SPORTSBOOK_OPEN_LIMIT', limits.openStakeCents - usage.openStakeCents],
    ['SPORTSBOOK_DAILY_LIMIT', limits.dailyStakeCents - usage.dailyStakeCents],
    ['SPORTSBOOK_SIDE_LIMIT', sportsbookStakeForProfit(limits.sideLiabilityCents - usage.sideLiabilityCents, odds, ceiling)],
    ['NOT_ENOUGH_CASH', usage.cashCents],
  ];
  let best = candidates[0]!;
  for (const candidate of candidates) if (candidate[1] < best[1]) best = candidate;
  return { maxStakeCents: Math.max(0, best[1]), binding: best[0] };
}

function money(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  return `$${dollars.toLocaleString('en-US')}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

/** Null when `stakeCents` fits every limit; otherwise the limit it breaks, in the player's words. */
export function sportsbookStakeCheck(
  stakeCents: number,
  odds: number,
  limits: SportsbookLimits,
  usage: SportsbookStakeUsage,
): { code: SportsbookLimitCode; message: string; maxStakeCents: number } | null {
  const { maxStakeCents, binding } = sportsbookMaxStake(odds, limits, usage);
  if (stakeCents < limits.minStakeCents) {
    return { code: 'SPORTSBOOK_STAKE', maxStakeCents, message: `Tickets start at ${money(limits.minStakeCents)}.` };
  }
  if (stakeCents <= maxStakeCents) return null;
  const left = money(maxStakeCents);
  const message = {
    SPORTSBOOK_STAKE: `The largest ticket is ${money(limits.maxStakeCents)}.`,
    SPORTSBOOK_MAX_PROFIT: `A ticket can win at most ${money(limits.maxProfitCents)}, so the top stake at ${formatAmericanOdds(odds)} is ${left}.`,
    SPORTSBOOK_GAME_LIMIT: maxStakeCents
      ? `You can stake ${left} more on this game (${money(limits.perGameStakeCents)} per game).`
      : `You have reached the ${money(limits.perGameStakeCents)} limit on this game.`,
    SPORTSBOOK_OPEN_LIMIT: maxStakeCents
      ? `Open tickets can total ${money(limits.openStakeCents)}; you have room for ${left}.`
      : `Your open tickets already total ${money(limits.openStakeCents)}. Wait for one to settle.`,
    SPORTSBOOK_OPEN_TICKETS: `You can hold ${limits.openTickets} open tickets at once. Wait for one to settle.`,
    SPORTSBOOK_DAILY_LIMIT: maxStakeCents
      ? `Tickets placed in the last 24 hours can total ${money(limits.dailyStakeCents)}; you have ${left} left.`
      : `You have staked the ${money(limits.dailyStakeCents)} daily limit. It frees up 24 hours after each ticket.`,
    SPORTSBOOK_SIDE_LIMIT: maxStakeCents
      ? `This side is near the book's limit and can take ${left} more.`
      : 'This side has reached the book\'s limit for this game.',
    NOT_ENOUGH_CASH: `You have ${money(usage.cashCents)} cash on hand.`,
  }[binding];
  return { code: binding, message, maxStakeCents };
}
