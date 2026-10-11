import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SPORTSBOOK_LIMITS,
  formatAmericanOdds,
  formatCents,
  formatCentsExact,
  sportsbookLineReason,
  sportsbookMaxStake,
  sportsbookPayoutCents,
  sportsbookStakeCheck,
  type SportsbookBetDto,
  type SportsbookEventDto,
  type SportsbookFeedDto,
  type SportsbookLeagueKey,
  type SportsbookLineState,
  type SportsbookPageDto,
  type SportsbookSelection,
} from '@streets/shared';
import { casinoApi } from '../api/casino.js';
import { ApiError } from '../api/client.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';
import { useSession } from '../stores/session.js';
import { newActionId } from '../utils/actionId.js';
import { rememberedKey, useRememberedState } from '../utils/remembered.js';
import { formatAgo, formatClockTime, formatDuration, formatWeekdayTime, formatWhen } from '../utils/time.js';

type LeagueFilter = 'ALL' | SportsbookLeagueKey;
type TicketView = 'open' | 'settled';
type Pick = { eventId: string; selection: SportsbookSelection; seenOdds: number };

const LEAGUE_FILTERS: readonly LeagueFilter[] = ['ALL', 'NFL', 'NBA', 'MLB', 'NHL'];
const QUICK_STAKES = [1_000, 2_500, 10_000, 50_000] as const;
/** Under this, the countdown turns urgent so a late pick is not a surprise. */
const CLOSING_SOON_MS = 15 * 60_000;

const isLeagueFilter = (value: unknown): value is LeagueFilter =>
  typeof value === 'string' && (LEAGUE_FILTERS as readonly string[]).includes(value);

function stakeToCents(value: string): number | null {
  const clean = value.trim().replaceAll(',', '').replace(/^\$/, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return null;
  const [whole = '0', fraction = ''] = clean.split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

function centsToStake(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(iso: string, now: number): string {
  const date = new Date(iso);
  const label = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  if (localDayKey(date) === localDayKey(new Date(now))) return `Today · ${label}`;
  if (localDayKey(date) === localDayKey(new Date(now + 86_400_000))) return `Tomorrow · ${label}`;
  return label;
}

/** "Sun, Oct 11 · 8:30 AM": the day stays on the card even when its day heading has scrolled away. */
function kickoffLabel(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${formatClockTime(date)}`;
}

/** The server decides a line's state; the screen only adds what the clock changed since. */
function liveLineState(event: SportsbookEventDto, feed: SportsbookFeedDto, now: number): SportsbookLineState {
  if (Date.parse(event.startsAt) <= now) return 'STARTED';
  if (event.lineState !== 'OPEN') return event.lineState;
  if (!event.oddsUpdatedAt || now - Date.parse(event.oddsUpdatedAt) > feed.oddsMaxAgeMinutes * 60_000) return 'STALE_ODDS';
  return 'OPEN';
}

function sideOdds(event: SportsbookEventDto, selection: SportsbookSelection): number | null {
  return selection === 'HOME' ? event.homeOdds : event.awayOdds;
}

function feedLine(feed: SportsbookFeedDto, now: number): { tone: 'good' | 'warn' | 'off'; text: string } {
  switch (feed.status) {
    case 'FRESH':
      return { tone: 'good', text: `Lines updated ${formatAgo(feed.refreshedAt!, now)} · refreshed about every ${feed.pollMinutes} min` };
    case 'STALE':
      return { tone: 'warn', text: `Odds last updated ${formatAgo(feed.refreshedAt!, now)}. Betting is paused until the feed refreshes.` };
    case 'WAITING':
      return { tone: 'warn', text: 'Waiting for the first odds snapshot. Lines open as soon as it lands.' };
    case 'OFF':
      return { tone: 'off', text: 'The odds feed is offline, so betting is paused.' };
  }
}

function signedCents(value: number): string {
  if (value === 0) return formatCentsExact(0);
  return (value > 0 ? '+' : '−') + formatCentsExact(Math.abs(value));
}

const RESULT_LABEL: Record<SportsbookBetDto['status'], string> = {
  OPEN: 'Open', WON: 'Won', LOST: 'Lost', PUSH: 'Push', VOID: 'Void',
};

/** An open ticket is not necessarily an unstarted game. Show the provider's stage. */
function openTicketStage(bet: SportsbookBetDto, now: number): string {
  if (bet.eventStatus === 'LIVE') return 'Game in progress';
  if (bet.eventStatus === 'PULLED') return 'Game unavailable · awaiting review';
  if (bet.eventStatus === 'FINAL') return 'Final · awaiting settlement';
  return Date.parse(bet.startsAt) <= now ? 'Awaiting game update' : 'Upcoming';
}

function settledCash(bet: SportsbookBetDto): string {
  switch (bet.status) {
    case 'WON': return `${signedCents(bet.returnCents)} paid (${signedCents(bet.returnCents - bet.stakeCents)} profit)`;
    case 'LOST': return `${signedCents(-bet.stakeCents)} stake lost`;
    case 'PUSH': return `${formatCentsExact(bet.returnCents)} stake returned · tie game`;
    case 'VOID': return `${formatCentsExact(bet.returnCents)} stake returned · game cancelled or postponed`;
    default: return '';
  }
}

function finalScore(bet: SportsbookBetDto): string | null {
  if (bet.eventStatus !== 'FINAL' || bet.homeScore === null || bet.awayScore === null) return null;
  return `Final: ${bet.awayTeam} ${bet.awayScore}, ${bet.homeTeam} ${bet.homeScore}`;
}

export function SportsbookPanel({ cashCents, onPlaced }: { cashCents: number; onPlaced: () => Promise<void> }) {
  const me = useSession((state) => state.me);
  const [page, setPage] = useState<SportsbookPageDto | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [league, setLeague] = useRememberedState<LeagueFilter>(rememberedKey('sportsbook.league', me?.id), 'ALL', { accept: isLeagueFilter });
  const [ticketView, setTicketView] = useState<TicketView>('open');
  const [pick, setPick] = useState<Pick | null>(null);
  const [stake, setStake] = useState('25');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    try {
      const next = await casinoApi.sportsbook();
      // Kickoff countdowns follow the server's clock, not a device clock that may be off.
      const offset = Date.parse(next.serverTime) - Date.now();
      setClockOffset(offset);
      setNow(Date.now() + offset);
      setPage(next);
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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + clockOffset), 15_000);
    return () => window.clearInterval(timer);
  }, [clockOffset]);

  const feed = page?.feed ?? null;
  const events = useMemo(() => page?.events ?? [], [page]);
  const visible = useMemo(() => (league === 'ALL' ? events : events.filter((event) => event.sport === league)), [events, league]);
  const groups = useMemo(() => {
    const byDay = new Map<string, { key: string; label: string; events: SportsbookEventDto[] }>();
    for (const event of visible) {
      const key = localDayKey(new Date(event.startsAt));
      const group = byDay.get(key) ?? { key, label: dayLabel(event.startsAt, now), events: [] };
      group.events.push(event);
      byDay.set(key, group);
    }
    return [...byDay.values()];
  }, [visible, now]);

  const pickedEvent = pick ? events.find((event) => event.id === pick.eventId) ?? null : null;
  const pickedState = pickedEvent && feed ? liveLineState(pickedEvent, feed, now) : null;
  const pickedOdds = pickedEvent && pick ? sideOdds(pickedEvent, pick.selection) : null;
  const stakeCents = stakeToCents(stake);
  const payoutCents = stakeCents !== null && pickedOdds !== null ? sportsbookPayoutCents(stakeCents, pickedOdds) : null;

  // 1.8.0-D: the same limit check the server runs, so the slip can say the top stake up front.
  const limits = page?.limits.limits ?? SPORTSBOOK_LIMITS;
  const usage = {
    cashCents,
    openStakeCents: page?.limits.openStakeCents ?? 0,
    openTickets: page?.limits.openTickets ?? 0,
    dailyStakeCents: page?.limits.dailyStakeCents ?? 0,
    gameStakeCents: (page?.tickets.open ?? []).filter((bet) => bet.eventId === pick?.eventId).reduce((sum, bet) => sum + bet.stakeCents, 0),
    // Other players' stake on a side is not shown; the server explains if that book limit is hit.
    sideLiabilityCents: 0,
  };
  const topStakeCents = pickedOdds !== null ? sportsbookMaxStake(pickedOdds, limits, usage).maxStakeCents : Math.min(cashCents, limits.maxStakeCents);

  let placeReason: string | null = null;
  // 1.8.0-E: a round whose ruleset predates the sportsbook takes no new tickets.
  const available = page?.limits.available ?? true;
  if (!available) placeReason = 'Sports betting is not part of this round\'s rules.';
  else if (!pick) placeReason = 'Pick a side first.';
  else if (!pickedEvent) placeReason = 'This game is no longer on the board.';
  else if (pickedState !== 'OPEN') placeReason = sportsbookLineReason(pickedState ?? 'FEED_UNAVAILABLE');
  else if (pickedOdds === null) placeReason = 'That side has no moneyline right now.';
  else if (stakeCents === null) placeReason = 'Enter a stake in dollars, such as 25 or 25.00.';
  else placeReason = sportsbookStakeCheck(stakeCents, pickedOdds, limits, usage)?.message ?? null;

  function choose(event: SportsbookEventDto, selection: SportsbookSelection) {
    const odds = sideOdds(event, selection);
    if (odds === null) return;
    setNotice('');
    setError('');
    setPick((current) => (current?.eventId === event.id && current.selection === selection ? null : { eventId: event.id, selection, seenOdds: odds }));
  }

  async function place() {
    if (!pick || !pickedEvent || pickedOdds === null || stakeCents === null || placeReason) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await casinoApi.sportsbookBet({
        eventId: pick.eventId, selection: pick.selection, stakeCents, actionId: newActionId(), expectedOdds: pickedOdds,
      });
      const team = pick.selection === 'HOME' ? pickedEvent.homeTeam : pickedEvent.awayTeam;
      setNotice(`Ticket accepted: ${team} ${formatAmericanOdds(result.bet.oddsAmerican)}, ${formatCentsExact(result.bet.stakeCents)} to pay ${formatCentsExact(result.bet.payoutCents)}. No turns were used.`);
      setPick(null);
      setTicketView('open');
      await Promise.all([refresh(), onPlaced()]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The wager could not be placed.');
      // A moved or closed line: reload so the slip shows what the server will accept now.
      if (cause instanceof ApiError && cause.code.startsWith('SPORTSBOOK_')) await refresh();
    } finally {
      setBusy(false);
    }
  }

  const feedStatus = feed ? feedLine(feed, now) : null;
  const tickets = page?.tickets ?? null;
  const summary = tickets?.summary ?? null;
  const settledTotal = summary ? summary.won + summary.lost + summary.push + summary.void : 0;
  const shownTickets = ticketView === 'open' ? tickets?.open ?? [] : tickets?.settled ?? [];

  return (
    <Panel title="Sportsbook" aside="Pregame · game cash · no turns">
      <div className="se-sportsbook">
        <p className="se-hint">
          Moneylines for today and tomorrow. Pick a side, set a stake, and the price locks when the ticket is accepted. Betting closes at the scheduled start.
          {' '}Tickets run {formatCents(limits.minStakeCents)} to {formatCents(limits.maxStakeCents)} and can win up to {formatCents(limits.maxProfitCents)}.
        </p>
        {feedStatus ? (
          <p className={`se-sportsbook__feed is-${feedStatus.tone}`} role="status">
            <span className="se-sportsbook__dot" aria-hidden="true" />
            {feedStatus.text}
          </p>
        ) : null}
        {!available ? (
          <p className="se-alert se-alert--info" role="status">Sports betting is not part of this round&apos;s rules, so no new tickets can be placed. Tickets you already hold still settle here.</p>
        ) : null}
        {error ? <p className="se-alert se-alert--error" role="alert">{error}</p> : null}
        {notice ? <p className="se-alert se-alert--success" role="status">{notice}</p> : null}

        <div className="se-sportsbook__leagues" role="group" aria-label="Filter by league">
          {LEAGUE_FILTERS.map((key) => {
            const count = key === 'ALL' ? events.length : page?.leagues.find((item) => item.key === key)?.eventCount ?? 0;
            return (
              <button
                key={key}
                type="button"
                className={`se-sportsbook__league${league === key ? ' is-active' : ''}`}
                aria-pressed={league === key}
                onClick={() => setLeague(key)}
              >
                <span>{key === 'ALL' ? 'All' : key}</span>
                <strong>{count}</strong>
              </button>
            );
          })}
        </div>

        <div className="se-sportsbook__layout">
          <div className="se-sportsbook__board">
            {!page && !error ? <p className="se-muted">Loading the board…</p> : null}
            {page && visible.length === 0 ? (
              <p className="se-muted">
                {league === 'ALL' ? 'No upcoming games are on the board right now.' : `No ${league} games are on the board for today or tomorrow.`}
              </p>
            ) : null}
            {feed ? groups.map((group) => (
              <section className="se-sportsbook__day" key={group.key} aria-labelledby={`sb-day-${group.key}`}>
                <h3 id={`sb-day-${group.key}`}>{group.label}</h3>
                {group.events.map((event) => {
                  const state = liveLineState(event, feed, now);
                  // A stale feed closes every line at once; the feed banner already says so.
                  const reason = state === 'FEED_UNAVAILABLE' ? null : sportsbookLineReason(state);
                  const untilStart = Date.parse(event.startsAt) - now;
                  const soon = state === 'OPEN' && untilStart <= CLOSING_SOON_MS;
                  return (
                    <article className={`se-sportsbook__event${state === 'OPEN' ? '' : ' is-closed'}`} key={event.id}>
                      <header>
                        <span className="se-sportsbook__tag">{event.sport}</span>
                        <time dateTime={event.startsAt}>{kickoffLabel(event.startsAt)}</time>
                        <span className={`se-sportsbook__countdown${soon ? ' is-soon' : ''}`}>
                          {state === 'STARTED' ? 'Closed' : `Closes in ${formatDuration(untilStart)}`}
                        </span>
                      </header>
                      <div className="se-sportsbook__prices">
                        {(['AWAY', 'HOME'] as const).map((selection) => {
                          const odds = sideOdds(event, selection);
                          const team = selection === 'HOME' ? event.homeTeam : event.awayTeam;
                          const selected = pick?.eventId === event.id && pick.selection === selection;
                          return (
                            <button
                              key={selection}
                              type="button"
                              className={`se-sportsbook__price${selected ? ' is-selected' : ''}`}
                              aria-pressed={selected}
                              disabled={busy || !available || state !== 'OPEN' || odds === null}
                              title={odds === null ? 'No moneyline for this side.' : undefined}
                              onClick={() => choose(event, selection)}
                            >
                              <span>
                                <small>{selection === 'HOME' ? 'Home' : 'Away'}</small>
                                {team}
                              </span>
                              <b>{formatAmericanOdds(odds)}</b>
                            </button>
                          );
                        })}
                      </div>
                      {reason ? <p className="se-sportsbook__reason">{reason}</p> : null}
                    </article>
                  );
                })}
              </section>
            )) : null}
          </div>

          <aside className={`se-sportsbook__slip${pick ? ' has-pick' : ''}`} aria-label="Bet slip">
            <h3>Bet slip</h3>
            {pick && pickedEvent ? (
              <div className="se-sportsbook__pick">
                <strong>{pick.selection === 'HOME' ? pickedEvent.homeTeam : pickedEvent.awayTeam} <b>{formatAmericanOdds(pickedOdds)}</b></strong>
                <span>
                  {pickedEvent.sport} · {pickedEvent.awayTeam} at {pickedEvent.homeTeam} · {formatWeekdayTime(pickedEvent.startsAt)}
                </span>
                {pickedOdds !== null && pickedOdds !== pick.seenOdds ? (
                  <span className="se-sportsbook__moved" role="status">Price moved from {formatAmericanOdds(pick.seenOdds)} to {formatAmericanOdds(pickedOdds)}.</span>
                ) : null}
              </div>
            ) : (
              <p className="se-muted">{pick ? 'This game is no longer on the board.' : 'Pick a side on any open line to build a ticket.'}</p>
            )}
            <label className="se-sportsbook__stake">
              <span>Stake ($)</span>
              <input
                className="se-input"
                inputMode="decimal"
                value={stake}
                aria-describedby="sb-cash"
                onChange={(event) => setStake(event.target.value)}
              />
            </label>
            <div className="se-sportsbook__quick" role="group" aria-label="Quick stake">
              {QUICK_STAKES.map((cents) => (
                <button key={cents} type="button" className="se-sportsbook__chip" onClick={() => setStake(centsToStake(cents))}>
                  {formatCents(cents)}
                </button>
              ))}
              <button
                type="button"
                className="se-sportsbook__chip"
                disabled={topStakeCents < limits.minStakeCents}
                onClick={() => setStake(centsToStake(topStakeCents))}
              >
                Max
              </button>
            </div>
            <div className="se-sportsbook__return" aria-live="polite">
              <div>
                <span>Potential payout</span>
                <strong>{payoutCents !== null ? formatCentsExact(payoutCents) : '—'}</strong>
              </div>
              <small>
                {payoutCents !== null && stakeCents !== null
                  ? `Includes your stake · ${formatCentsExact(payoutCents - stakeCents)} profit`
                  : 'Choose a side and enter a stake to see your return.'}
              </small>
            </div>
            <details className="se-sportsbook__limits">
              <summary>Cash & betting limits</summary>
              <small id="sb-cash" className="se-muted">
                Cash on hand: {formatCentsExact(cashCents)} · uses no turns
                {pickedOdds !== null ? <><br />Top stake at {formatAmericanOdds(pickedOdds)}: {formatCentsExact(topStakeCents)}</> : null}
                <br />Last 24 hours: {formatCentsExact(usage.dailyStakeCents)} of {formatCentsExact(limits.dailyStakeCents)} staked
                <br />Open: {formatCentsExact(usage.openStakeCents)} of {formatCentsExact(limits.openStakeCents)} · {usage.openTickets} of {limits.openTickets} tickets
              </small>
            </details>
            <div className="se-sportsbook__slip-actions">
              <Button type="button" className="se-btn se-btn--primary se-btn--block" disabled={busy} disabledReason={busy ? null : placeReason} onClick={() => void place()}>
                {busy ? 'Placing…' : 'Place ticket'}
              </Button>
              {pick ? <button type="button" className="se-btn se-btn--ghost" onClick={() => setPick(null)}>Clear</button> : null}
            </div>
          </aside>
        </div>

        {tickets && summary ? (
          <section className="se-sportsbook__tickets" aria-label="My sportsbook tickets">
            <div className="se-sportsbook__tickets-head">
              <h3>My tickets</h3>
              <div className="se-sportsbook__ticket-tabs" role="tablist" aria-label="Ticket view">
                {(['open', 'settled'] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    role="tab"
                    id={`sb-tab-${view}`}
                    aria-controls="sb-ticket-list"
                    aria-selected={ticketView === view}
                    className={`se-sportsbook__league${ticketView === view ? ' is-active' : ''}`}
                    onClick={() => setTicketView(view)}
                  >
                    <span>{view === 'open' ? 'Open' : 'Settled'}</span>
                    <strong>{view === 'open' ? summary.openCount : settledTotal}</strong>
                  </button>
                ))}
              </div>
            </div>
            <p className="se-sportsbook__summary">
              {ticketView === 'open'
                ? `${summary.openCount} open · ${formatCentsExact(summary.openStakeCents)} at stake · pays up to ${formatCentsExact(summary.openPayoutCents)}`
                : `Record ${summary.won}-${summary.lost}-${summary.push}${summary.void ? ` · ${summary.void} void` : ''} · Net ${signedCents(summary.netCents)}`}
            </p>
            <div className="se-sportsbook__ticket-list" id="sb-ticket-list" role="tabpanel" aria-labelledby={`sb-tab-${ticketView}`}>
              {shownTickets.length === 0 ? (
                <p className="se-muted">{ticketView === 'open' ? 'No open tickets. Pick a side above to place one.' : 'No settled tickets yet.'}</p>
              ) : null}
              {shownTickets.map((bet) => {
                const started = Date.parse(bet.startsAt) <= now;
                const score = finalScore(bet);
                return (
                  <article className={`se-sportsbook__ticket is-${bet.status.toLowerCase()}`} key={bet.id}>
                    <header>
                      <strong>{bet.pickTeam} <b>{formatAmericanOdds(bet.oddsAmerican)}</b></strong>
                      <span className="se-sportsbook__result">
                        {bet.status === 'OPEN' ? openTicketStage(bet, now) : RESULT_LABEL[bet.status]}
                      </span>
                    </header>
                    <span className="se-sportsbook__ticket-meta">
                      {bet.sport} · {bet.awayTeam} at {bet.homeTeam} · {bet.status === 'OPEN' && !started ? `starts ${formatWeekdayTime(bet.startsAt)}` : formatWhen(bet.startsAt)}
                    </span>
                    {bet.status === 'OPEN' ? (
                      <dl className="se-sportsbook__figures">
                        <div><dt>Stake</dt><dd>{formatCentsExact(bet.stakeCents)}</dd></div>
                        <div><dt>To win</dt><dd>{formatCentsExact(bet.payoutCents - bet.stakeCents)}</dd></div>
                        <div><dt>Payout</dt><dd>{formatCentsExact(bet.payoutCents)}</dd></div>
                      </dl>
                    ) : (
                      <>
                        {score ? <span className="se-sportsbook__ticket-meta">{score}</span> : null}
                        <span className="se-sportsbook__cash">
                          {formatCentsExact(bet.stakeCents)} stake · {settledCash(bet)}
                          {bet.settledAt ? <> · settled {formatWhen(bet.settledAt)}</> : null}
                        </span>
                      </>
                    )}
                  </article>
                );
              })}
              {ticketView === 'settled' && settledTotal > shownTickets.length ? (
                <p className="se-hint">Showing your {shownTickets.length} most recent settled tickets. The record covers all {settledTotal}.</p>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </Panel>
  );
}
