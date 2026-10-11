import { useCallback, useEffect, useState } from 'react';
import { formatCents, type SportsbookBoardDto, type SportsbookBetDto } from '@streets/shared';
import { casinoApi } from '../api/casino.js';
import { ApiError } from '../api/client.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';
import { newActionId } from '../utils/actionId.js';

function oddsLabel(odds: number | null): string {
  if (odds === null) return 'Off';
  return odds > 0 ? '+' + odds : String(odds);
}

function when(value: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export function SportsbookPanel({ cashCents, onPlaced }: { cashCents: number; onPlaced: () => Promise<void> }) {
  const [board, setBoard] = useState<(SportsbookBoardDto & { bets: SportsbookBetDto[] }) | null>(null);
  const [stake, setStake] = useState('25');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      setBoard(await casinoApi.sportsbook());
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the cached sportsbook board.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    // This reads StreetsEmpire's database cache; it never polls TheRundown from a player page.
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function place(eventId: string, selection: 'HOME' | 'AWAY') {
    const clean = stake.trim().replaceAll(',', '').replace(/^\$/, '');
    if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) {
      setError('Enter a stake in dollars, such as 25 or 25.00.');
      return;
    }
    const [whole, fraction = ''] = clean.split('.');
    const stakeCents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
    if (!Number.isSafeInteger(stakeCents) || stakeCents < 100) {
      setError('The minimum bet is $1.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await casinoApi.sportsbookBet({ eventId, selection, stakeCents, actionId: newActionId() });
      setNotice(`Ticket accepted at ${oddsLabel(result.bet.oddsAmerican)}. No turns were used.`);
      await Promise.all([refresh(), onPlaced()]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The wager could not be placed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Sportsbook" aside="Pregame · game cash · no turns">
      <div className="se-sportsbook">
        <p className="se-hint">NFL · NBA · MLB · NHL. Lines are cached and may be delayed. Bets close at kickoff.</p>
        {board?.refreshedAt ? <p className="se-hint">Odds cache refreshed {when(board.refreshedAt)}.</p> : null}
        {error ? <p className="se-alert se-alert--error" role="alert">{error}</p> : null}
        {notice ? <p className="se-alert se-alert--success" role="status">{notice}</p> : null}
        {!board?.enabled ? <p className="se-muted">The pregame line board is waiting for its first provider snapshot.</p> : null}
        {board?.enabled && board.events.length === 0 ? <p className="se-muted">No upcoming games are on the board right now.</p> : null}
        {board?.events.map((event) => (
          <article className="se-sportsbook__event" key={event.id}>
            <header><strong>{event.sport}</strong><time dateTime={event.startsAt}>{when(event.startsAt)}</time></header>
            <div className="se-sportsbook__matchup"><span>{event.awayTeam} at {event.homeTeam}</span></div>
            <div className="se-sportsbook__prices">
              <Button type="button" className="se-btn" disabled={busy || !board.enabled || event.awayOdds === null || cashCents < 100} onClick={() => void place(event.id, 'AWAY')}>
                {event.awayTeam} <b>{oddsLabel(event.awayOdds)}</b>
              </Button>
              <Button type="button" className="se-btn" disabled={busy || !board.enabled || event.homeOdds === null || cashCents < 100} onClick={() => void place(event.id, 'HOME')}>
                {event.homeTeam} <b>{oddsLabel(event.homeOdds)}</b>
              </Button>
            </div>
          </article>
        ))}
        <label className="se-sportsbook__stake">
          <span>Stake ($)</span>
          <input className="se-input" inputMode="decimal" value={stake} onChange={(event) => setStake(event.target.value)} />
          <small>Cash on hand: {formatCents(cashCents)}</small>
        </label>
        {board?.bets.length ? (
          <section className="se-sportsbook__tickets" aria-label="Recent sportsbook tickets">
            <h3>My tickets</h3>
            {board.bets.map((bet) => (
              <div className="se-sportsbook__ticket" key={bet.id}>
                <span>{bet.sport} · {bet.selection === 'HOME' ? bet.homeTeam : bet.awayTeam} ({oddsLabel(bet.oddsAmerican)})</span>
                <span>{formatCents(bet.stakeCents)} · {bet.status}</span>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </Panel>
  );
}
