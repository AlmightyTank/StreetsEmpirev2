import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { HallOfFameRoundDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { classicOgV01, rulesets } from '@streets/rulesets';
import { communityApi } from '../api/community.js';
import { Shell } from '../layouts/Shell.js';
import { useSession } from '../stores/session.js';
import { formatDuration } from '../utils/time.js';

/** What the turn loop actually asks of a player, in the order they meet it. */
const LOOP = [
  { step: 'Spend turns', text: 'Turns come back on a clock. Scout a district, work the block or cook - every move costs them, and nothing costs money you have not made yet.' },
  { step: 'Build income', text: 'Hoes earn on the street, thugs guard the block and cook the product. Keep them supplied and happy or the take drops.' },
  { step: 'Gear up', text: 'Four traders, four shelves. Standing with them opens the gun rack, and your hideout turns cash into a permanent edge for the season.' },
  { step: 'Take it from someone', text: 'Scout a rival first, then hit them. What you take is theirs, what you lose is gone, and the whole board can see the score.' },
] as const;

const RAIDS = [
  { name: 'Cash raid', text: 'Walk off with the money and crack a scouted mark left exposed.' },
  { name: 'Drive-by', text: 'Cars full of shooters. A car comes home if anyone in it does.' },
  { name: 'Drug run', text: 'Burn through a rival supply of crack, condoms and working hoes.' },
  { name: 'Ride theft', text: 'Come back with one of their Low-Riders if a thug makes it out.' },
  { name: 'Lure run', text: 'Crack talks to unhappy hoes, beer talks to unhappy thugs.' },
] as const;

function statusTone(status: string): string {
  if (status === 'ACTIVE') return ' se-tag--good';
  if (status === 'REGISTRATION' || status === 'SCHEDULED') return ' se-tag--warn';
  return '';
}

function statusLine(status: string): string {
  if (status === 'ACTIVE') return 'Running now';
  if (status === 'REGISTRATION') return 'Taking players';
  if (status === 'SCHEDULED') return 'Starting soon';
  return 'Finished';
}

export function LandingPage() {
  const { account, round, me } = useSession();
  const [lastSeason, setLastSeason] = useState<HallOfFameRoundDto | null>(null);

  useEffect(() => {
    let active = true;
    communityApi.hallOfFame()
      .then((data) => { if (active) setLastSeason(data.rounds[0] ?? null); })
      // The archive is a nice-to-have here: the page stands without it.
      .catch(() => { if (active) setLastSeason(null); });
    return () => { active = false; };
  }, []);

  const ruleset = round ? (rulesets[round.rulesetId] ?? classicOgV01) : classicOgV01;
  const start = ruleset.round.startingPlayer;
  const live = round?.status === 'ACTIVE' || round?.status === 'REGISTRATION';

  const cta = !account
    ? { to: '/register', label: 'Claim your name' }
    : me
      ? { to: '/game', label: 'Back to the block' }
      : { to: '/join', label: round ? `Enter ${round.name}` : 'Find a round' };

  const champion = lastSeason?.podium[0] ?? null;

  return (
    <Shell>
      <section className="se-land-hero">
        <p className="se-eyebrow">StreetsEmpire &middot; {ruleset.round.defaultDurationDays}-day seasons &middot; free in your browser</p>
        <h1 className="se-display se-hero">
          Everyone starts with nothing.
          <br />
          <span className="se-accent">Somebody ends up owning the city.</span>
        </h1>
        <p className="se-lede">
          A round-based crime strategy game. You get a block, a handful of crew and a clock.
          Spend turns to earn, buy what your people need, then decide whether the fastest way up
          the board is building your own money or taking someone else&rsquo;s.
        </p>

        <div className="se-cta">
          <Link className="se-btn se-btn--primary" to={cta.to}>{cta.label}</Link>
          {account ? (
            <Link className="se-btn se-btn--ghost" to="/game/rules">Read the rules</Link>
          ) : (
            <Link className="se-btn se-btn--ghost" to="/login">I already have a name</Link>
          )}
        </div>

        {round ? (
          <div className="se-land-strip">
            <div className="se-land-strip__lead">
              <span className={`se-tag${statusTone(round.status)}`}>{statusLine(round.status)}</span>
              <strong>{round.name}</strong>
            </div>
            <div className="se-land-strip__facts">
              <span><span className="se-land-strip__k">Time left</span><b className="se-num">{live ? formatDuration(round.msRemaining) : '-'}</b></span>
              <span><span className="se-land-strip__k">Players</span><b className="se-num">{formatNumber(round.playerCount)}</b></span>
              <span><span className="se-land-strip__k">Turns</span><b className="se-num">+{ruleset.turns.amountPerInterval}/{ruleset.turns.intervalMinutes}m</b></span>
              <span><span className="se-land-strip__k">Ruleset</span><b className="se-num">{round.rulesetVersion}</b></span>
            </div>
          </div>
        ) : (
          <div className="se-land-strip">
            <div className="se-land-strip__lead">
              <span className="se-tag">Between seasons</span>
              <strong>No round is open right now</strong>
            </div>
            <div className="se-land-strip__facts">
              <span className="se-hint">Register anyway - your name, badges and past results are waiting when the next one opens.</span>
            </div>
          </div>
        )}
      </section>

      <section className="se-land-section">
        <h2 className="se-land-h2">A turn at a time</h2>
        <ol className="se-land-loop">
          {LOOP.map((entry, index) => (
            <li className="se-land-loop__item" key={entry.step}>
              <span className="se-land-loop__n se-num">{index + 1}</span>
              <h3 className="se-land-loop__title">{entry.step}</h3>
              <p>{entry.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="se-land-section se-land-two">
        <div className="se-land-card">
          <h2 className="se-land-h2">Five ways to take it</h2>
          <dl className="se-land-defs">
            {RAIDS.map((raid) => (
              <div className="se-land-defs__row" key={raid.name}>
                <dt>{raid.name}</dt>
                <dd>{raid.text}</dd>
              </div>
            ))}
          </dl>
          <p className="se-hint">
            Recon first. Rankings show money and rank; only scouting shows a rival&rsquo;s crew,
            guns, wounds and the cash they left out.
          </p>
        </div>

        <div className="se-land-card">
          <h2 className="se-land-h2">Seasons actually end</h2>
          <p>
            When the clock runs out the round freezes. Final net worth and ranks are written once,
            the podium goes into the hall of fame, and the next season starts everyone from the
            same empty block again - no head start for whoever played longest.
          </p>
          <ul className="se-list">
            <li>Money, crew and weapons stay inside the season that made them.</li>
            <li>Placements, achievements, titles and badges follow your account forever.</li>
            <li>Every season is pinned to its ruleset, so old results still mean what they meant.</li>
          </ul>
          <div className="se-cta se-mt">
            <Link className="se-btn se-btn--sm" to="/game/hall-of-fame">Hall of fame</Link>
            <Link className="se-btn se-btn--sm se-btn--ghost" to="/game/news">What changed lately</Link>
          </div>
        </div>
      </section>

      {champion && lastSeason ? (
        <section className="se-land-section">
          <div className="se-land-champ">
            <div>
              <p className="se-eyebrow">Last season &middot; {lastSeason.name}</p>
              <h2 className="se-land-champ__name">{champion.displayName}</h2>
              <p className="se-hint">
                Finished first in {champion.city} with <b className="se-num">{formatCents(champion.netWorthCents)}</b>,
                ahead of {formatNumber(Math.max(0, lastSeason.playerCount - 1))} other crews.
              </p>
            </div>
            <Link className="se-btn" to="/game/hall-of-fame">See the podium</Link>
          </div>
        </section>
      ) : null}

      <section className="se-land-section se-land-two">
        <div className="se-land-card">
          <h2 className="se-land-h2">What you start with</h2>
          <div className="se-land-kit">
            <span><b className="se-num">{formatCents(start.cashCents)}</b>cash</span>
            <span><b className="se-num">{formatNumber(ruleset.turns.cap)}</b>turns</span>
            <span><b className="se-num">{formatNumber(start.thugs)}</b>thugs</span>
            <span><b className="se-num">{formatNumber(start.pistols)}</b>pistols</span>
            <span><b className="se-num">{formatNumber(start.crack)}</b>crack</span>
            <span><b className="se-num">{formatNumber(start.medicine)}</b>medicine</span>
          </div>
          <p className="se-hint">
            The same kit for everyone who enters, whenever they enter. New players get protection
            from raids while they find their feet.
          </p>
        </div>

        <div className="se-land-card">
          <h2 className="se-land-h2">One name, everywhere</h2>
          <ul className="se-list">
            <li>Sign in with email and password, or with Discord.</li>
            <li>Link your forum account: both profiles point at each other, and your badges show up on the forum.</li>
            <li>Discord roles follow your rank, and the raid feed and news land in the server on their own.</li>
            <li>Lose your password and email gets you back in.</li>
          </ul>
          <div className="se-cta se-mt">
            <Link className="se-btn se-btn--sm" to="/game/community">Community</Link>
            <Link className="se-btn se-btn--sm se-btn--ghost" to="/game/rules">Rules</Link>
          </div>
        </div>
      </section>

      <section className="se-land-foot">
        <h2 className="se-land-h2">{live ? 'The season is running without you.' : 'Get your name in before the next one.'}</h2>
        <p className="se-lede">
          {live
            ? 'Joining late is normal - you start with the same kit as everyone else and protection while you build.'
            : 'Accounts are free and carry your history between seasons.'}
        </p>
        <div className="se-cta">
          <Link className="se-btn se-btn--primary" to={cta.to}>{cta.label}</Link>
          <Link className="se-btn se-btn--ghost" to="/game/rankings">See who is winning</Link>
        </div>
      </section>
    </Shell>
  );
}
