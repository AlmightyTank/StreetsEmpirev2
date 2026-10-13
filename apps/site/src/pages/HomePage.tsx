import { useEffect, useState } from 'react';
import { formatNumber, type PublicOverviewDto } from '@streets/shared';
import { Link } from 'react-router-dom';
import { publicSiteApi } from '../api/public.js';
import {
  CurrentGameHeader,
  PublicEvents,
  PublicGameStats,
  PublicRankings,
} from '../components/PublicGameBlocks.js';

const steps = [
  { title: 'Work the streets', body: 'Spend turns to earn cash, grow your crew and find product. Easy to start, fun to master.', to: '/wiki/getting-started' },
  { title: 'Take turf', body: 'Claim blocks with your crew, build businesses and defend them in block wars.', to: '/wiki/turf' },
  { title: 'Outlast everyone', body: 'Dodge the law, outsmart rivals and finish the season on top. Then do it again.', to: '/wiki/seasons' },
] as const;

const wikiTeasers = [
  { to: '/wiki/getting-started', title: 'Getting started', body: 'Your first turns, explained simply.' },
  { to: '/wiki/economy', title: 'Making money', body: 'How earning actually works.' },
  { to: '/wiki/law', title: 'Staying free', body: 'Heat, cases and warrants, in plain words.' },
] as const;

export function HomePage() {
  const [overview, setOverview] = useState<PublicOverviewDto | null>(null);
  const [overviewFailed, setOverviewFailed] = useState(false);
  const currentGame = overview?.currentGame ?? null;

  useEffect(() => {
    let active = true;
    void publicSiteApi.overview()
      .then((result) => {
        if (active) setOverview(result);
      })
      .catch(() => {
        if (active) setOverviewFailed(true);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <section className="site-hero site-hero--welcome">
        <div className="container site-hero__layout">
          <div>
            <p className="site-kicker">Free browser strategy · no download</p>
            <h1>Build your crew. Take the streets.</h1>
            <p className="site-lead">
              StreetsEmpire is a friendly seasonal strategy game. Play a few minutes a day:
              earn money, grow your crew, claim turf and see if you can top the season.
              Everyone starts fresh each season, so newcomers always have a shot.
            </p>
            <div className="site-hero__actions">
              <a className="btn btn-primary btn-lg" href="https://play.streetsempire.dev">
                Play free now
              </a>
              <Link className="btn btn-outline-light btn-lg" to="/wiki">
                Learn the game
              </Link>
            </div>
            <p className="site-hero__reassure">
              Free to play · no pay-to-win · a season lasts weeks, not forever
            </p>
          </div>

          <div className="site-hero__board" aria-label="Current season at a glance">
            <div className="site-panel__head">
              <h2>{currentGame ? currentGame.round.name : 'This season'}</h2>
              <span className="site-kicker">{currentGame ? 'Live now' : overviewFailed ? 'Offline' : 'Checking…'}</span>
            </div>
            <div className="site-hero__board-body">
              <div><span>Players in it</span><strong>{currentGame ? formatNumber(currentGame.stats.players) : '—'}</strong></div>
              <div><span>Blocks claimed</span><strong>{currentGame ? formatNumber(currentGame.stats.turfBlocksHeld) : '—'}</strong></div>
              <div><span>Past seasons</span><strong>{overview ? formatNumber(overview.allTime.completedGames) : '—'}</strong></div>
              <div><span>Your cost</span><strong>Free</strong></div>
            </div>
            <div className="site-hero__board-foot">
              <Link to="/games/current">See the live season →</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="container">
          <div className="site-section__head site-section__head--simple">
            <div>
              <p className="site-kicker">How it works</p>
              <h2>Three steps. That&apos;s it.</h2>
            </div>
            <p>You don&apos;t need to learn everything first. Start playing, the game teaches you the rest.</p>
          </div>

          <div className="welcome-steps">
            {steps.map((step, i) => (
              <Link className="site-card" key={step.to} to={step.to}>
                <span className="site-card__eyebrow">Step {i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                <span className="site-card__link">Learn more →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section site-section--live">
        <div className="container">
          <div className="site-section__head site-section__head--simple">
            <div>
              <p className="site-kicker">Happening now</p>
              <h2>The season is live.</h2>
            </div>
            <p>Real players, real standings. This is a small public peek — no private secrets shared.</p>
          </div>

          {!overview && !overviewFailed ? (
            <div className="site-panel public-state"><strong>Checking the live season…</strong></div>
          ) : null}

          {overviewFailed ? (
            <div className="site-panel public-state">
              <strong>The live view is taking a break.</strong>
              <p>You can still play or browse past seasons.</p>
              <div className="archive-back">
                <a className="btn btn-primary" href="https://play.streetsempire.dev">Play now</a>
                <Link className="btn btn-outline-light" to="/games">Past seasons</Link>
              </div>
            </div>
          ) : null}

          {overview && !overview.currentGame ? (
            <div className="site-panel public-state">
              <strong>A new season is getting ready.</strong>
              <p>
                {formatNumber(overview.allTime.completedGames)} seasons are in the history books.
                Read the wiki while you wait.
              </p>
              <div className="archive-back">
                <Link className="btn btn-outline-light" to="/games">Browse seasons</Link>
                <Link className="btn btn-outline-light" to="/wiki">Open the wiki</Link>
              </div>
            </div>
          ) : null}

          {overview?.currentGame ? (
            <div className="public-game-stack">
              <div className="site-panel public-game-panel">
                <CurrentGameHeader game={overview.currentGame} />
                <PublicGameStats game={overview.currentGame} />
                <div className="public-game-panel__actions">
                  <a className="btn btn-primary" href="https://play.streetsempire.dev">Join this season</a>
                  <Link className="btn btn-outline-light" to="/games/current">Season details</Link>
                </div>
              </div>

              <div className="public-two-column">
                <section className="site-panel">
                  <div className="site-panel__head public-panel-title">
                    <div>
                      <span className="site-card__eyebrow">Top of the board</span>
                      <h2>Leading players</h2>
                    </div>
                    <Link to="/rankings">All →</Link>
                  </div>
                  <PublicRankings game={overview.currentGame} limit={5} />
                </section>

                <section className="site-panel">
                  <div className="site-panel__head public-panel-title">
                    <div>
                      <span className="site-card__eyebrow">Fresh ink</span>
                      <h2>Latest turf moves</h2>
                    </div>
                    <Link to="/turf">Map →</Link>
                  </div>
                  <PublicEvents game={overview.currentGame} limit={5} />
                </section>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="site-section">
        <div className="container">
          <div className="site-section__head site-section__head--simple">
            <div>
              <p className="site-kicker">The wiki</p>
              <h2>Learn only what you need.</h2>
            </div>
            <p>Short guides in plain words. Start anywhere.</p>
          </div>

          <div className="site-card-grid">
            {wikiTeasers.map((card) => (
              <Link className="site-card" key={card.to} to={card.to}>
                <span className="site-card__eyebrow">Wiki</span>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
                <span className="site-card__link">Read →</span>
              </Link>
            ))}
          </div>
          <p className="welcome-more"><Link to="/wiki">Open the full wiki →</Link></p>
        </div>
      </section>

      <section className="site-cta">
        <div className="container site-cta__inner">
          <div>
            <p className="site-kicker">Come try a season</p>
            <h2>Your crew is waiting.</h2>
            <p className="site-cta__sub">Free, in your browser, a few minutes a day. Quit anytime — seasons reset anyway.</p>
          </div>
          <div className="archive-back">
            <a className="btn btn-primary btn-lg" href="https://play.streetsempire.dev">
              Play free
            </a>
            <Link className="btn btn-outline-light btn-lg" to="/wiki/getting-started">
              First steps
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
