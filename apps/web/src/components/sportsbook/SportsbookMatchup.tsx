import type { ReactNode } from 'react';
import {
  formatAmericanOdds,
  formatCentsExact,
  type SportsbookBetDto,
  type SportsbookLeagueKey,
  type SportsbookSelection,
} from '@streets/shared';
import { formatClockTime, formatDuration, formatWhen } from '../../utils/time.js';
import { SportsbookTeamLogo } from '../SportsbookTeamLogo.js';

const TWO_WORD_NICKNAMES = ['Red Sox', 'White Sox', 'Blue Jays', 'Trail Blazers', 'Maple Leafs', 'Red Wings', 'Blue Jackets', 'Golden Knights'];

/** "Kansas City" / "Chiefs", so long names stack on two lines. */
function splitName(name: string): { city: string; nickname: string } {
  const twoWord = TWO_WORD_NICKNAMES.find((nick) => name.endsWith(` ${nick}`));
  if (twoWord) return { city: name.slice(0, -twoWord.length - 1), nickname: twoWord };
  const at = name.lastIndexOf(' ');
  return at > 0 ? { city: name.slice(0, at), nickname: name.slice(at + 1) } : { city: '', nickname: name };
}

/** One side of a matchup: badge, the name stacked city over nickname, the away/home tag and a price slot. */
export function TeamSide({
  league, name, selection, picked = false, children, onSelect,
}: { league: SportsbookLeagueKey; name: string; selection: SportsbookSelection; picked?: boolean; children?: ReactNode; onSelect?: () => void }) {
  const { city, nickname } = splitName(name);
  const clickable = Boolean(onSelect);
  const selectFromSide = () => onSelect?.();
  return (
    <div
      className={`sb-side sb-side--${selection.toLowerCase()}${picked ? ' is-picked' : ''}${clickable ? ' is-clickable' : ''}`}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? picked : undefined}
      aria-label={clickable ? `${name}${picked ? ', selected' : ''}` : undefined}
      onClick={(event) => {
        // The price control is also inside this side; let its own handler run once.
        if ((event.target as HTMLElement).closest('button')) return;
        selectFromSide();
      }}
      onKeyDown={(event) => {
        if (clickable && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          selectFromSide();
        }
      }}
    >
      <span className="sb-badge"><SportsbookTeamLogo sport={league} team={name} /></span>
      <span className="sb-side__name">
        {city ? <small>{city}</small> : null}
        <strong>{nickname}</strong>
      </span>
      <span className="sb-side__tag">{picked ? 'Your pick' : selection === 'HOME' ? 'Home' : 'Away'}</span>
      {children}
    </div>
  );
}

export function Matchup({ away, center, home }: { away: ReactNode; center?: ReactNode; home: ReactNode }) {
  return (
    <div className="sb-matchup">
      {away}
      <span className="sb-matchup__vs">{center ?? 'VS'}</span>
      {home}
    </div>
  );
}

export function LeagueTag({ league }: { league: SportsbookLeagueKey }) {
  return <span className={`sb-league sb-league--${league.toLowerCase()}`}>{league}</span>;
}

/** "Sun 8:30 PM": the game time on a ticket's top row. */
export function gameTime(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${formatClockTime(date)}`;
}

type Tone = 'upcoming' | 'live' | 'review' | 'won' | 'lost' | 'push';

function ticketStatus(bet: SportsbookBetDto, now: number): { tone: Tone; label: string; right: string } {
  switch (bet.status) {
    case 'WON': return { tone: 'won', label: 'Won', right: bet.settledAt ? `Settled ${formatWhen(bet.settledAt)}` : 'Settled' };
    case 'LOST': return { tone: 'lost', label: 'Lost', right: bet.settledAt ? `Settled ${formatWhen(bet.settledAt)}` : 'Settled' };
    case 'PUSH': return { tone: 'push', label: 'Push', right: 'Tie game · stake back' };
    case 'VOID': return { tone: 'push', label: 'Void', right: 'Cancelled · stake back' };
    default: break;
  }
  // An open ticket is not necessarily an unstarted game. Show the provider's stage.
  if (bet.eventStatus === 'LIVE') return { tone: 'live', label: 'Live', right: 'Game in progress' };
  if (bet.eventStatus === 'PULLED') return { tone: 'review', label: 'Review', right: 'Game unavailable' };
  if (bet.eventStatus === 'FINAL') return { tone: 'review', label: 'Final', right: 'Awaiting settlement' };
  const untilStart = Date.parse(bet.startsAt) - now;
  if (untilStart <= 0) return { tone: 'review', label: 'Started', right: 'Awaiting game update' };
  return { tone: 'upcoming', label: 'Upcoming', right: `Starts in ${formatDuration(untilStart)}` };
}

function signed(value: number): string {
  if (value === 0) return formatCentsExact(0);
  return (value > 0 ? '+' : '−') + formatCentsExact(Math.abs(value));
}

/**
 * A placed ticket as a full matchup. The picked side carries the locked price; the other side shows
 * the board's current price when the game is still listed.
 */
export function SportsbookTicketCard({
  bet, now, otherOdds, className = '',
}: { bet: SportsbookBetDto; now: number; otherOdds: number | null; className?: string }) {
  const status = ticketStatus(bet, now);
  const scored = bet.homeScore !== null && bet.awayScore !== null && (bet.eventStatus === 'FINAL' || bet.eventStatus === 'LIVE');
  const side = (selection: SportsbookSelection) => {
    const picked = bet.selection === selection;
    const odds = picked ? bet.oddsAmerican : otherOdds;
    return (
      <TeamSide league={bet.sport} name={selection === 'HOME' ? bet.homeTeam : bet.awayTeam} selection={selection} picked={picked}>
        {odds === null ? (
          <span className="sb-odds is-empty" title="This game is no longer on the board">—</span>
        ) : (
          <span className={`sb-odds${picked ? ' is-locked' : ''}`} title={picked ? 'Locked when the ticket was accepted' : 'Current board price'}>
            {formatAmericanOdds(odds)}
          </span>
        )}
      </TeamSide>
    );
  };
  const settled = bet.status !== 'OPEN';
  const profit = bet.payoutCents - bet.stakeCents;
  return (
    <article className={`sb-card sb-ticket is-${status.tone}${className}`}>
      <header className="sb-card__top">
        <LeagueTag league={bet.sport} />
        <time dateTime={bet.startsAt}>{gameTime(bet.startsAt)}</time>
        <span className={`sb-chip is-${status.tone}`}>{status.label}</span>
        <span className="sb-card__countdown">{status.right}</span>
      </header>
      <Matchup
        away={side('AWAY')}
        center={scored ? <span className="sb-score">{bet.awayScore}<i>–</i>{bet.homeScore}</span> : undefined}
        home={side('HOME')}
      />
      <dl className="sb-money">
        <div><dt>Stake</dt><dd>{formatCentsExact(bet.stakeCents)}</dd></div>
        {settled ? (
          <>
            <div><dt>Net</dt><dd className="sb-money__net">{signed(bet.returnCents - bet.stakeCents)}</dd></div>
            <div><dt>Returned</dt><dd>{formatCentsExact(bet.returnCents)}</dd></div>
          </>
        ) : (
          <>
            <div><dt>To win</dt><dd>{formatCentsExact(profit)}</dd></div>
            <div className="is-payout"><dt>Payout</dt><dd>{formatCentsExact(bet.payoutCents)}</dd></div>
          </>
        )}
      </dl>
    </article>
  );
}
