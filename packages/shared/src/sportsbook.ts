import type { SportsbookBetStatus, SportsbookLineState } from './types/sportsbook.js';

/** A line older than this cannot take a ticket, even if the event is still pregame. */
export const SPORTSBOOK_ODDS_MAX_AGE_MINUTES = 45;
export const SPORTSBOOK_MIN_STAKE_CENTS = 100;
export const SPORTSBOOK_MAX_STAKE_CENTS = 100_000_000;

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
    case 'STARTED': return 'Betting closed at the scheduled start.';
  }
}

/** Game cash a ticket hands back when it settles. */
export function sportsbookReturnCents(status: SportsbookBetStatus, stakeCents: number, payoutCents: number): number {
  if (status === 'WON') return payoutCents;
  if (status === 'PUSH' || status === 'VOID') return stakeCents;
  return 0;
}
