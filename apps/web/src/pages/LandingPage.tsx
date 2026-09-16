import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { HallOfFameRoundDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { classicOgV01, rulesets } from '@streets/rulesets';
import { communityApi } from '../api/community.js';
import { Seo } from '../components/Seo.js';
import { Shell } from '../layouts/Shell.js';
import { useSession } from '../stores/session.js';
import { formatDate, formatDuration } from '../utils/time.js';

const SEO_TITLE = 'StreetsEmpire - Free Browser Crime Strategy Game';
const SEO_DESCRIPTION = 'Play StreetsEmpire, a free browser crime strategy game with turn-based crew management, raids, rankings, achievements and fair seasonal resets.';

const GAME_STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'StreetsEmpire',
  applicationCategory: 'GameApplication',
  gamePlatform: 'Web browser',
  genre: ['Strategy', 'Browser game', 'Crime'],
  playMode: 'MultiPlayer',
  operatingSystem: 'Any',
  description: SEO_DESCRIPTION,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
};

/** What the season asks of a player, in the order they feel it. */
const LOOP = [
  { step: 'Spend turns', text: 'Turns return on a clock, so every action has weight: scout, produce, shop, heal or hold for the raid window.' },
  { step: 'Grow the take', text: 'Crew, supplies, happiness and district choice decide whether your block prints money or drains it.' },
  { step: 'Buy leverage', text: 'Trader reputation opens better weapons, restocks faster shelves and makes the hideout worth pouring cash into.' },
  { step: 'Hit rivals', text: 'Recon shows what rankings hide. Pick the angle, send fit muscle, then live with the public result.' },
] as const;

const RAIDS = [
  { name: 'Cash raid', text: 'Take exposed money from a scouted target.' },
  { name: 'Drive-by', text: 'Wound defenders and soften a crew before the real grab.' },
  { name: 'Drug run', text: 'Burn a rival stash and cut into their street work.' },
  { name: 'Ride theft', text: 'Send thugs after Low-Riders and bring one home if they survive.' },
  { name: 'Lure run', text: 'Turn unhappy crew with the supplies they want most.' },
] as const;

const PROOF = [
  { label: 'Fair resets', value: 'Every season starts from the same kit' },
  { label: 'Public stakes', value: 'Rankings, raid reports and final podiums stay visible' },
  { label: 'Permanent bragging rights', value: 'Badges, titles and Hall of Fame finishes follow the account' },
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
      // The newest season with a winner: an empty round has nobody to show.
      .then((data) => { if (active) setLastSeason(data.rounds.find((season) => season.podium.length > 0) ?? null); })
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
      <Seo title={SEO_TITLE} description={SEO_DESCRIPTION} structuredData={GAME_STRUCTURED_DATA} />

      <section className="se-land-hero" aria-labelledby="landing-title">
        <div className="se-land-hero__copy">
          <p className="se-eyebrow">StreetsEmpire &middot; {ruleset.round.defaultDurationDays}-day seasons &middot; free browser strategy</p>
          <h1 id="landing-title" className="se-display se-hero">
            Claim the block.
            <br />
            Build the crew.
            <br />
            <span className="se-accent">End the season on top.</span>
          </h1>
          <p className="se-lede">
            StreetsEmpire is a round-based crime strategy game where turns, supplies,
            crew morale and raids all push on the same leaderboard. Build steady income,
            scout vulnerable rivals, then decide when the city is worth taking by force.
          </p>

          <div className="se-cta">
            <Link className="se-btn se-btn--primary" to={cta.to}>{cta.label}</Link>
            {account ? (
              <Link className="se-btn se-btn--ghost" to="/game/rules">Read the rules</Link>
            ) : (
              <Link className="se-btn se-btn--ghost" to="/login">I already have a name</Link>
            )}
          </div>
        </div>

        <div className="se-land-visual" aria-label="Example season dashboard">
          <div className="se-land-map">
            <span className="se-land-map__road se-land-map__road--a" />
            <span className="se-land-map__road se-land-map__road--b" />
            <span className="se-land-map__road se-land-map__road--c" />
            <span className="se-land-map__zone se-land-map__zone--home">You</span>
            <span className="se-land-map__zone se-land-map__zone--rival">Rival</span>
            <span className="se-land-map__zone se-land-map__zone--shop">Trader</span>
          </div>

          <div className="se-land-terminal">
            <div className="se-land-terminal__head">
              <span>Season board</span>
              <b className="se-num">{round?.rulesetVersion ?? ruleset.meta.version}</b>
            </div>
            <div className="se-land-terminal__rows">
              <span>
                <b>Cash</b>
                <strong className="se-num">{formatCents(start.cashCents)}</strong>
              </span>
              <span>
                <b>Turns</b>
                <strong className="se-num">+{ruleset.turns.amountPerInterval}/{ruleset.turns.intervalMinutes}m</strong>
              </span>
              <span>
                <b>Season</b>
                <strong>{round ? statusLine(round.status) : 'Next round'}</strong>
              </span>
              <span>
                <b>Objective</b>
                <strong>Own the leaderboard</strong>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="se-land-strip" aria-label="Current season status">
        {round ? (
          <>
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
          </>
        ) : (
          <>
            <div className="se-land-strip__lead">
              <span className="se-tag">Between seasons</span>
              <strong>No round is open right now</strong>
            </div>
            <div className="se-land-strip__facts">
              <span className="se-hint">Register anyway - your name, badges and past results are waiting when the next one opens.</span>
            </div>
          </>
        )}
      </section>

      <section className="se-land-proof" aria-label="Why the season matters">
        {PROOF.map((item) => (
          <div className="se-land-proof__item" key={item.label}>
            <span className="se-eyebrow">{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </section>

      <section className="se-land-section">
        <h2 className="se-land-h2">The loop that pulls you in</h2>
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
          <h2 className="se-land-h2">Five ways to make a move</h2>
          <dl className="se-land-defs">
            {RAIDS.map((raid) => (
              <div className="se-land-defs__row" key={raid.name}>
                <dt>{raid.name}</dt>
                <dd>{raid.text}</dd>
              </div>
            ))}
          </dl>
          <p className="se-hint">
            Scout first. Rankings show money and rank; only recon shows a rival&rsquo;s crew,
            guns, wounds and the cash they left out.
          </p>
        </div>

        <div className="se-land-card">
          <h2 className="se-land-h2">Seasons end cleanly</h2>
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
              <p className="se-eyebrow">Last season &middot; {lastSeason.name} &middot; ended {formatDate(lastSeason.endedAt)}</p>
              <h2 className="se-land-champ__name">{champion.displayName}</h2>
              <p className="se-hint">
                Finished first in {champion.city} with <b className="se-num">{formatCents(champion.netWorthCents)}</b>
                {lastSeason.playerCount > 2
                  ? `, ahead of ${formatNumber(lastSeason.playerCount - 1)} other crews.`
                  : lastSeason.playerCount === 2 ? ', ahead of one other crew.' : '.'}
              </p>
            </div>
            <Link className="se-btn" to="/game/hall-of-fame">See the podium</Link>
          </div>
        </section>
      ) : null}

      <section className="se-land-section se-land-two">
        <div className="se-land-card">
          <h2 className="se-land-h2">Everyone starts equal</h2>
          <div className="se-land-kit">
            <span><b className="se-num">{formatCents(start.cashCents)}</b>cash</span>
            <span><b className="se-num">{formatNumber(ruleset.turns.cap)}</b>turns</span>
            <span><b className="se-num">{formatNumber(start.thugs)}</b>thugs</span>
            <span><b className="se-num">{formatNumber(start.pistols)}</b>pistols</span>
            <span><b className="se-num">{formatNumber(start.crack)}</b>product</span>
            <span><b className="se-num">{formatNumber(start.medicine)}</b>medicine</span>
          </div>
          <p className="se-hint">
            The same kit for everyone who enters, whenever they enter. New players get protection
            from raids while they find their feet.
          </p>
        </div>

        <div className="se-land-card">
          <h2 className="se-land-h2">One identity across the city</h2>
          <ul className="se-list">
            <li>Sign in with email and password, or with Discord.</li>
            <li>Link your forum account: both profiles point at each other, and your badges show up on the forum.</li>
            <li>Discord roles follow your rank, and the raid feed and news land in the server on their own.</li>
            <li>Lose your password and email gets you back in.</li>
          </ul>
          <div className="se-cta se-mt">
            <a className="se-btn se-btn--sm" href="https://forum.streetsempire.dev">Forum</a>
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
