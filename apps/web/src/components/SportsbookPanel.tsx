import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { LeagueTag, Matchup, SportsbookTicketCard, TeamSide, gameTime } from './sportsbook/SportsbookMatchup.js';
import { Panel } from './Panel.js';
import { useSession } from '../stores/session.js';
import { newActionId } from '../utils/actionId.js';
import { rememberedKey, useRememberedState } from '../utils/remembered.js';
import { formatDuration, formatWeekdayTime } from '../utils/time.js';
import {
  casinoSoundEnabled,
  playCasinoSound,
  setCasinoSoundEnabled,
} from '../lib/casinoAudio.js';

type LeagueFilter = 'ALL' | SportsbookLeagueKey;
type TicketView = 'open' | 'settled';
type Pick = { eventId: string; selection: SportsbookSelection; seenOdds: number };

const LEAGUE_FILTERS: readonly LeagueFilter[] = ['ALL', 'NFL', 'NBA', 'MLB', 'NHL', 'SOFTBALL', 'MMA'];
const LEAGUE_MARKS: Record<LeagueFilter, string> = { ALL: '◆', NFL: '🏈', NBA: '🏀', MLB: '⚾', NHL: '🏒', SOFTBALL: '🥎', MMA: '🥊' };
const QUICK_STAKES = [1_000, 2_500, 10_000, 50_000] as const;
/** Under this, the countdown turns urgent so a late pick is not a surprise. */
const CLOSING_SOON_MS = 15 * 60_000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

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

function signedCents(value: number): string {
  if (value === 0) return formatCentsExact(0);
  return (value > 0 ? '+' : '−') + formatCentsExact(Math.abs(value));
}

const RESULT_LABEL: Record<SportsbookBetDto['status'], string> = {
  OPEN: 'Open', WON: 'Won', LOST: 'Lost', PUSH: 'Push', VOID: 'Void',
};

export function SportsbookPanel({ bankrollCents, onPlaced }: { bankrollCents: number | null; onPlaced: () => Promise<void> }) {
  const me = useSession((state) => state.me);
  const [page, setPage] = useState<SportsbookPageDto | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [league, setLeague] = useRememberedState<LeagueFilter>(rememberedKey('sportsbook.league', me?.id), 'ALL', { accept: isLeagueFilter });
  const [ticketView, setTicketView] = useState<TicketView>('open');
  // Ticket-first on phones, original lines-first flow on desktop.
  const [mobileLayout, setMobileLayout] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches,
  );
  const [pick, setPick] = useState<Pick | null>(null);
  // The phone slip starts as a compact, non-modal betting dock; details expand on demand.
  const [slipExpanded, setSlipExpanded] = useState(false);
  const [stake, setStake] = useState('25');
  const [busy, setBusy] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState(() => casinoSoundEnabled());
  const [acceptedTicketId, setAcceptedTicketId] = useState<string | null>(null);
  const [settledTicketId, setSettledTicketId] = useState<string | null>(null);
  const [settlementStatus, setSettlementStatus] = useState<SportsbookBetDto['status'] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const ticketStatuses = useRef<Map<string, SportsbookBetDto['status']> | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px)');
    const onChange = () => setMobileLayout(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

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
    const refreshWhenVisible = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(refreshWhenVisible, 60_000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) setNow(Date.now() + clockOffset);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [clockOffset]);

  useEffect(() => {
    if (!page) return;
    const allTickets = [...page.tickets.open, ...page.tickets.settled];
    const previous = ticketStatuses.current;
    if (previous) {
      const newlySettled = allTickets.filter((bet) => previous.get(bet.id) === 'OPEN' && bet.status !== 'OPEN');
      if (newlySettled.length) {
        const result = newlySettled.find((bet) => bet.status === 'WON') ?? newlySettled[0]!;
        setSettledTicketId(result.id);
        setSettlementStatus(result.status);
        if (result.status === 'WON') playCasinoSound('SMALL_WIN', soundEnabled);
        else if (result.status === 'LOST') playCasinoSound('LOSS', soundEnabled);
        else playCasinoSound('TABLE_PUSH', soundEnabled);
        window.setTimeout(() => {
          setSettledTicketId(null);
          setSettlementStatus(null);
        }, 1_200);
      }
    }
    ticketStatuses.current = new Map(allTickets.map((bet) => [bet.id, bet.status]));
  }, [page, soundEnabled]);

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
    bankrollCents: bankrollCents ?? 0,
    openStakeCents: page?.limits.openStakeCents ?? 0,
    openTickets: page?.limits.openTickets ?? 0,
    dailyStakeCents: page?.limits.dailyStakeCents ?? 0,
    gameStakeCents: (page?.tickets.open ?? []).filter((bet) => bet.eventId === pick?.eventId).reduce((sum, bet) => sum + bet.stakeCents, 0),
    // Other players' stake on a side is not shown; the server explains if that book limit is hit.
    sideLiabilityCents: 0,
  };
  const topStakeCents = pickedOdds !== null ? sportsbookMaxStake(pickedOdds, limits, usage).maxStakeCents : Math.min(bankrollCents ?? 0, limits.maxStakeCents);

  let placeReason: string | null = null;
  // 1.8.0-E: a round whose ruleset predates the sportsbook takes no new tickets.
  const available = page?.limits.available ?? true;
  if (!available) placeReason = 'Sports betting is not part of this round\'s rules.';
  else if (bankrollCents === null) placeReason = 'Open a casino bankroll before placing a sports ticket.';
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
    const clearing = pick?.eventId === event.id && pick.selection === selection;
    playCasinoSound(clearing ? 'POKER_FOLD' : 'SPORTS_PICK', soundEnabled, selection === 'HOME' ? 1 : 0);
    setPick(clearing ? null : { eventId: event.id, selection, seenOdds: odds });
    setSlipExpanded(false);
  }

  async function place() {
    if (!pick || !pickedEvent || pickedOdds === null || stakeCents === null || placeReason) return;
    setBusy(true);
    setError('');
    setNotice('');
    playCasinoSound('CHIP_PLACE', soundEnabled);
    try {
      const result = await casinoApi.sportsbookBet({
        eventId: pick.eventId, selection: pick.selection, stakeCents, actionId: newActionId(), expectedOdds: pickedOdds,
      });
      const team = pick.selection === 'HOME' ? pickedEvent.homeTeam : pickedEvent.awayTeam;
      playCasinoSound('TICKET_PRINT', soundEnabled);
      setAcceptedTicketId(result.bet.id);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) await wait(420);
      setNotice(`Ticket accepted: ${team} ${formatAmericanOdds(result.bet.oddsAmerican)}, ${formatCentsExact(result.bet.stakeCents)} in chips to pay ${formatCentsExact(result.bet.payoutCents)} in chips. No turns were used.`);
      setPick(null);
      setSlipExpanded(false);
      setTicketView('open');
      await Promise.all([refresh(), onPlaced()]);
      window.setTimeout(() => setAcceptedTicketId(null), 1_200);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The wager could not be placed.');
      // A moved or closed line: reload so the slip shows what the server will accept now.
      if (cause instanceof ApiError && cause.code.startsWith('SPORTSBOOK_')) await refresh();
    } finally {
      setBusy(false);
    }
  }

  const tickets = page?.tickets ?? null;
  const summary = tickets?.summary ?? null;
  const settledTotal = summary ? summary.won + summary.lost + summary.push + summary.void : 0;
  const byLeague = (bet: SportsbookBetDto) => league === 'ALL' || bet.sport === league;
  const viewTickets = ticketView === 'open' ? tickets?.open ?? [] : tickets?.settled ?? [];
  const shownTickets = viewTickets.filter(byLeague);
  const otherOdds = (bet: SportsbookBetDto): number | null => {
    const event = events.find((row) => row.id === bet.eventId);
    return event ? sideOdds(event, bet.selection === 'HOME' ? 'AWAY' : 'HOME') : null;
  };
  const record = summary ? `${summary.won}-${summary.lost}-${summary.push}${summary.void ? ` · ${summary.void} void` : ''}` : '';
  const netTone = !summary || summary.netCents === 0 ? '' : summary.netCents > 0 ? 'is-good' : 'is-bad';

  const ticketHeader = tickets && summary ? (
          <section className="sb-tickets-head" aria-label="My sportsbook tickets">
            <div className="sb-tickets-head__row">
              <h3>My Tickets</h3>
              <div className="sb-segment" role="tablist" aria-label="Ticket view">
                {(['open', 'settled'] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    role="tab"
                    id={`sb-tab-${view}`}
                    aria-controls="sb-ticket-list"
                    aria-selected={ticketView === view}
                    className={`sb-segment__btn${ticketView === view ? ' is-active' : ''}`}
                    onClick={() => setTicketView(view)}
                  >
                    {view === 'open' ? 'Open' : 'Settled'}
                    <b>{view === 'open' ? summary.openCount : settledTotal}</b>
                  </button>
                ))}
              </div>
            </div>
            <p className="sb-tickets-head__summary">
              {ticketView === 'open' ? (
                <span>
                  <strong>{summary.openCount}</strong> open · <strong>{formatCentsExact(summary.openStakeCents)}</strong> at stake · pays up to <strong className="is-accent">{formatCentsExact(summary.openPayoutCents)}</strong>
                </span>
              ) : null}
              <span>Record {record} · Net <strong className={netTone}>{signedCents(summary.netCents)}</strong></span>
            </p>
          </section>
        ) : null;
  const ticketCards = tickets ? (
          <div className="sb-ticket-list" id="sb-ticket-list" role="tabpanel" aria-labelledby={`sb-tab-${ticketView}`}>
            {shownTickets.length === 0 ? (
              <p className="sb-empty">
                {viewTickets.length > 0
                  ? `No ${ticketView} ${league} tickets.`
                  : ticketView === 'open' ? 'No open tickets. Pick a side below to place one.' : 'No settled tickets yet.'}
              </p>
            ) : null}
            {shownTickets.map((bet) => (
              <SportsbookTicketCard
                key={bet.id}
                bet={bet}
                now={now}
                otherOdds={otherOdds(bet)}
                className={`${bet.id === acceptedTicketId ? ' is-new' : ''}${bet.id === settledTicketId ? ' is-just-settled' : ''}`}
              />
            ))}
            {ticketView === 'settled' && settledTotal > viewTickets.length ? (
              <p className="se-hint">Showing your {viewTickets.length} most recent settled tickets. The record covers all {settledTotal}.</p>
            ) : null}
          </div>
        ) : null;
  const soundToolbar = (
<div className="se-sportsbook__toolbar">
          <span aria-live="polite">
            {busy ? 'PRINTING TICKET' : settlementStatus ? `TICKET ${RESULT_LABEL[settlementStatus].toUpperCase()}` : 'SPORTS DESK'}
          </span>
          <button
            type="button"
            className="se-btn se-btn--ghost"
            aria-pressed={soundEnabled}
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabledState(next);
              setCasinoSoundEnabled(next);
              if (next) playCasinoSound('SPORTS_PICK', true);
            }}
          >
            {soundEnabled ? 'Sound on' : 'Muted'}
          </button>
        </div>
  );

  return (
    <Panel className="se-sportsbook-panel" title="Sportsbook" aside="Pregame · casino chips · no turns">
      <div className={`se-sportsbook${pick ? ' has-selection' : ''}`}>
        {!available ? (
          <p className="se-alert se-alert--info" role="status">Sports betting is not part of this round&apos;s rules, so no new tickets can be placed. Tickets you already hold still settle here.</p>
        ) : null}
        {error && !pick ? <p className="se-alert se-alert--error" role="alert">{error}</p> : null}
        {notice ? <p className="se-alert se-alert--success" role="status">{notice}</p> : null}

        {!mobileLayout ? soundToolbar : null}
        {mobileLayout ? ticketHeader : null}

        <div className="sb-leagues" role="group" aria-label="Filter by league">
          {LEAGUE_FILTERS.map((key) => {
            const count = key === 'ALL' ? events.length : page?.leagues.find((item) => item.key === key)?.eventCount ?? 0;
            return (
              <button
                key={key}
                type="button"
                className={`sb-leagues__pill sb-leagues__pill--${key.toLowerCase()}${league === key ? ' is-active' : ''}`}
                aria-pressed={league === key}
                onClick={() => setLeague(key)}
              >
                <span className="sb-leagues__mark" aria-hidden="true">{LEAGUE_MARKS[key]}</span>
                <span>{key === 'ALL' ? 'All' : key}</span>
                <b>{count}</b>
              </button>
            );
          })}
        </div>

        {mobileLayout ? ticketCards : null}
        {mobileLayout ? soundToolbar : null}

        <div className="sb-board-head">
          <h3>Lines</h3>
          <p className="se-hint">
            Moneylines for the next few scheduled games, paid in chips from your open casino bankroll. The price locks when the ticket is accepted and betting closes at the scheduled start.
            {' '}Tickets run {formatCents(limits.minStakeCents)} to {formatCents(limits.maxStakeCents)} and can win up to {formatCents(limits.maxProfitCents)}.
          </p>
        </div>

        <div className="se-sportsbook__layout">
          <div className="se-sportsbook__board" aria-label="Available sportsbook games">
            {!page && !error ? <p className="se-muted">Loading the board…</p> : null}
            {page && visible.length === 0 ? (
              <p className="sb-empty">
                {league === 'ALL' ? 'No upcoming games are on the board right now.' : `No ${league} games are on the current board.`}
              </p>
            ) : null}
            {feed ? groups.map((group) => (
              <section className="se-sportsbook__day" key={group.key} aria-labelledby={`sb-day-${group.key}`}>
                <h3 id={`sb-day-${group.key}`}>{group.label}</h3>
                {group.events.map((event) => {
                  const state = liveLineState(event, feed, now);
                  // A stale feed closes every line at once; the banner already says so.
                  const reason = state === 'FEED_UNAVAILABLE' ? null : sportsbookLineReason(state);
                  const untilStart = Date.parse(event.startsAt) - now;
                  const soon = state === 'OPEN' && untilStart <= CLOSING_SOON_MS;
                  const side = (selection: SportsbookSelection) => {
                    const odds = sideOdds(event, selection);
                    const team = selection === 'HOME' ? event.homeTeam : event.awayTeam;
                    const selected = pick?.eventId === event.id && pick.selection === selection;
                    return (
                      <TeamSide
                        league={event.sport}
                        name={team}
                        selection={selection}
                        picked={selected}
                        onSelect={busy || !available || state !== 'OPEN' || odds === null ? undefined : () => choose(event, selection)}
                      >
                        <button
                          type="button"
                          className={`sb-odds sb-odds--pick${selected ? ' is-selected' : ''}`}
                          aria-pressed={selected}
                          aria-label={`${team} ${formatAmericanOdds(odds)}`}
                          disabled={busy || !available || state !== 'OPEN' || odds === null}
                          title={odds === null ? 'No moneyline for this side.' : undefined}
                          onClick={() => choose(event, selection)}
                        >
                          {formatAmericanOdds(odds)}
                        </button>
                      </TeamSide>
                    );
                  };
                  return (
                    <article className={`sb-card sb-event${state === 'OPEN' ? '' : ' is-closed'}${pick?.eventId === event.id ? ' has-pick' : ''}`} key={event.id}>
                      <header className="sb-card__top">
                        <LeagueTag league={event.sport} />
                        <time dateTime={event.startsAt}>{gameTime(event.startsAt)}</time>
                        <span className={`sb-chip is-${state === 'OPEN' ? 'upcoming' : 'review'}`}>{state === 'OPEN' ? 'Open' : state === 'STARTED' ? 'Closed' : 'Paused'}</span>
                        <span className={`sb-card__countdown${soon ? ' is-soon' : ''}`}>
                          {state === 'STARTED' ? 'Betting closed' : `Closes in ${formatDuration(untilStart)}`}
                        </span>
                      </header>
                      <Matchup away={side('AWAY')} home={side('HOME')} />
                      {reason ? <p className="se-sportsbook__reason">{reason}</p> : null}
                    </article>
                  );
                })}
              </section>
            )) : null}
          </div>

          <aside
            id="sb-bet-slip"
            className={`se-sportsbook__slip${pick ? ' has-pick' : ''}${slipExpanded ? ' is-expanded' : ''}${acceptedTicketId ? ' is-accepted' : ''}`}
            aria-label="Bet slip"
          >
            <div className="se-sportsbook__slip-head">
              <h3>Bet slip</h3>
              <button
                type="button"
                className="se-sportsbook__slip-details"
                aria-controls="sb-slip-extra"
                aria-expanded={slipExpanded}
                onClick={() => setSlipExpanded((current) => !current)}
              >
                {slipExpanded ? 'Less' : 'Details'}
              </button>
              <button type="button" className="se-sportsbook__slip-close" aria-label="Clear selected bet" onClick={() => { setPick(null); setSlipExpanded(false); }}>
                <span aria-hidden="true">×</span>
              </button>
            </div>
            {pick && pickedEvent ? (
              <div className="se-sportsbook__pick">
                <strong>{pick.selection === 'HOME' ? pickedEvent.homeTeam : pickedEvent.awayTeam} <b>{formatAmericanOdds(pickedOdds)}</b></strong>
                <span className="se-sportsbook__pick-matchup">
                  {pickedEvent.sport} · {pickedEvent.awayTeam} at {pickedEvent.homeTeam} · {formatWeekdayTime(pickedEvent.startsAt)}
                </span>
                {pickedOdds !== null && pickedOdds !== pick.seenOdds ? (
                  <span className="se-sportsbook__moved" role="status">Price moved from {formatAmericanOdds(pick.seenOdds)} to {formatAmericanOdds(pickedOdds)}.</span>
                ) : null}
              </div>
            ) : (
              <p className="se-muted">{pick ? 'This game is no longer on the board.' : 'Pick a side on any open line to build a ticket.'}</p>
            )}
            <div className="se-sportsbook__wager">
                <label className="se-sportsbook__stake">
                <span>Stake (chips)</span>
                <input
                className="se-input"
                inputMode="decimal"
                value={stake}
                aria-describedby="sb-cash"
                onChange={(event) => setStake(event.target.value)}
                />
                </label>
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
            </div>
            <div id="sb-slip-extra" className="se-sportsbook__extras">
                <div className="se-sportsbook__quick" role="group" aria-label="Quick stake">
                {QUICK_STAKES.map((cents) => (
                <button key={cents} type="button" className="se-sportsbook__chip" onClick={() => { setStake(centsToStake(cents)); playCasinoSound('CHIP_PLACE', soundEnabled, cents); }}>
                  {formatCents(cents)}
                </button>
                ))}
                <button
                type="button"
                className="se-sportsbook__chip"
                disabled={topStakeCents < limits.minStakeCents}
                onClick={() => { setStake(centsToStake(topStakeCents)); playCasinoSound('CHIP_PLACE', soundEnabled, 3); }}
                >
                Max
                </button>
                </div>
                <details className="se-sportsbook__limits">
                <summary>Chip bankroll & betting limits</summary>
                <small id="sb-cash" className="se-muted">
                Floor bankroll: {bankrollCents === null ? 'No session open' : formatCentsExact(bankrollCents)} · uses no turns
                {pickedOdds !== null ? <><br />Top stake at {formatAmericanOdds(pickedOdds)}: {formatCentsExact(topStakeCents)}</> : null}
                <br />Last 24 hours: {formatCentsExact(usage.dailyStakeCents)} of {formatCentsExact(limits.dailyStakeCents)} staked
                <br />Open: {formatCentsExact(usage.openStakeCents)} of {formatCentsExact(limits.openStakeCents)} · {usage.openTickets} of {limits.openTickets} tickets
                </small>
                </details>
            </div>
            {error && pick ? <p className="se-alert se-alert--error" role="alert">{error}</p> : null}
            <div className="se-sportsbook__slip-actions">
              <Button type="button" className="se-btn se-btn--primary se-btn--block" disabled={busy} disabledReason={busy ? null : placeReason} onClick={() => void place()}>
                {busy ? 'Printing ticket…' : 'Place ticket'}
              </Button>
              {pick ? <button type="button" className="se-btn se-btn--ghost" onClick={() => { setPick(null); setSlipExpanded(false); }}>Clear</button> : null}
            </div>
          </aside>
        </div>

        {!mobileLayout ? ticketHeader : null}
        {!mobileLayout ? ticketCards : null}
      </div>
    </Panel>
  );
}
