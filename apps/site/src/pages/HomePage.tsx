import { useEffect, useState } from 'react';
import { formatCentsCompact, formatNumber, type PublicOverviewDto } from '@streets/shared';
import { Link } from 'react-router-dom';
import { publicSiteApi } from '../api/public.js';
import {
  CurrentGameHeader,
  PublicEvents,
  PublicGameStats,
  PublicRankings,
} from '../components/PublicGameBlocks.js';

const sections = [
  { to: '/games', eyebrow: 'Seasons', title: 'Current & Past Games', body: 'Follow the current season and browse the permanent history of completed StreetsEmpire games.' },
  { to: '/rankings', eyebrow: 'Competition', title: 'Rankings', body: 'Track the public leaderboards, movement and the crews fighting for the top spots.' },
  { to: '/cities', eyebrow: 'World', title: 'Cities', body: 'Explore the cities, their districts and the public face of each local economy.' },
  { to: '/turf', eyebrow: 'Control', title: 'Turf', body: 'See district control, city power and the public history of the fight for territory.' },
  { to: '/hall-of-fame', eyebrow: 'Legacy', title: 'Hall of Fame', body: 'Celebrate season champions, long-running records and the strongest careers in game history.' },
  { to: '/guide', eyebrow: 'Learn', title: 'How to Play', body: 'Learn the core StreetsEmpire systems from your first turns through combat, travel and turf.' },
] as const;

export function HomePage() {
  const [overview, setOverview] = useState<PublicOverviewDto | null>(null);
  const [overviewFailed, setOverviewFailed] = useState(false);
  const currentGame = overview?.currentGame ?? null;
  const seasonLabel = currentGame
    ? currentGame.round.name
    : overviewFailed
      ? 'Live data unavailable'
      : overview
        ? 'Next season pending'
        : 'Checking...';

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
      <section className="site-hero">
        <div className="container site-hero__layout">
          <div>
            <p className="site-kicker">Seasonal street strategy</p>
            <h1>Build your crew. Control the streets. Build an empire.</h1>
            <p className="site-lead">
              StreetsEmpire is a competitive browser strategy game where every season
              starts fresh, every turn matters and public history keeps the best players
              on the record.
            </p>
            <div className="site-hero__actions">
              <a className="btn btn-primary btn-lg" href="https://play.streetsempire.dev">
                Play StreetsEmpire
              </a>
              <Link className="btn btn-outline-light btn-lg" to="/game">
                Explore the Game
              </Link>
            </div>
          </div>

          <div className="site-hero__board" aria-label="StreetsEmpire season board preview">
            <div className="site-panel__head">
              <h2>Season Board</h2>
              <span className="site-kicker">{currentGame ? currentGame.ruleset.version : overviewFailed ? 'Offline' : overview ? 'Between Games' : 'Live Data'}</span>
            </div>
            <div className="site-hero__board-body">
              <div><span>Season</span><strong>{seasonLabel}</strong></div>
              <div><span>Players</span><strong>{currentGame ? formatNumber(currentGame.stats.players) : '-'}</strong></div>
              <div><span>Economy</span><strong>{currentGame ? formatCentsCompact(currentGame.stats.economyNetWorthCents) : '-'}</strong></div>
              <div><span>Objective</span><strong>Own the leaderboard</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section className="site-strip" aria-label="Website destinations">
        <div className="container site-strip__grid">
          <div><span>Public Hub</span><strong>streetsempire.dev</strong></div>
          <div><span>Live Game</span><strong>play.streetsempire.dev</strong></div>
          <div><span>Beta Server</span><strong>beta.streetsempire.dev</strong></div>
          <div><span>Community</span><strong>forum.streetsempire.dev</strong></div>
        </div>
      </section>

      <section className="site-section site-section--live">
        <div className="container">
          <div className="site-section__head">
            <div>
              <p className="site-kicker">Live StreetsEmpire</p>
              <h2>What's happening right now.</h2>
            </div>
            <p>
              Public season information updates from the game server without exposing
              inventory, defense, Recon intelligence or other private player data.
            </p>
          </div>

          {!overview && !overviewFailed ? (
            <div className="site-panel public-state"><strong>Loading live game data…</strong></div>
          ) : null}

          {overviewFailed ? (
            <div className="site-panel public-state">
              <strong>Live statistics are temporarily unavailable.</strong>
              <p>You can still explore the site or open the live game directly.</p>
            </div>
          ) : null}

          {overview && !overview.currentGame ? (
            <div className="site-panel public-state">
              <strong>StreetsEmpire is between games.</strong>
              <p>
                {formatNumber(overview.allTime.completedGames)} completed games are already in the
                history books. Watch News for the next season.
              </p>
              <Link className="btn btn-outline-light" to="/games">Browse Games</Link>
            </div>
          ) : null}

          {overview?.currentGame ? (
            <div className="public-game-stack">
              <div className="site-panel public-game-panel">
                <CurrentGameHeader game={overview.currentGame} />
                <PublicGameStats game={overview.currentGame} />
                <div className="public-game-panel__actions">
                  <Link className="btn btn-outline-light" to="/games/current">View Current Game</Link>
                  <a className="btn btn-primary" href="https://play.streetsempire.dev">Play the Current Season</a>
                </div>
              </div>

              <div className="public-two-column">
                <section className="site-panel">
                  <div className="site-panel__head public-panel-title">
                    <div>
                      <span className="site-card__eyebrow">Top of the board</span>
                      <h2>Leading Players</h2>
                    </div>
                    <Link to="/rankings">Rankings →</Link>
                  </div>
                  <PublicRankings game={overview.currentGame} limit={3} />
                </section>

                <section className="site-panel">
                  <div className="site-panel__head public-panel-title">
                    <div>
                      <span className="site-card__eyebrow">Public street wire</span>
                      <h2>Recent Captures</h2>
                    </div>
                    <Link to="/turf">Turf →</Link>
                  </div>
                  <PublicEvents game={overview.currentGame} limit={3} />
                </section>
              </div>

              <div className="public-alltime">
                <div>
                  <span>Completed Games</span>
                  <strong>{formatNumber(overview.allTime.completedGames)}</strong>
                </div>
                <div>
                  <span>Active Accounts</span>
                  <strong>{formatNumber(overview.allTime.activeAccounts)}</strong>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="site-section">
        <div className="container">
          <div className="site-section__head">
            <div>
              <p className="site-kicker">The StreetsEmpire hub</p>
              <h2>A living public record.</h2>
            </div>
            <p>
              Scout the world before you join, follow the current leaders and dig through
              completed seasons without needing a live account.
            </p>
          </div>

          <div className="site-card-grid">
            {sections.map((section) => (
              <Link className="site-card" key={section.to} to={section.to}>
                <span className="site-card__eyebrow">{section.eyebrow}</span>
                <h3>{section.title}</h3>
                <p>{section.body}</p>
                <span className="site-card__link">Explore →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="site-cta">
        <div className="container site-cta__inner">
          <div>
            <p className="site-kicker">Ready to hit the streets?</p>
            <h2>Your next empire starts in the live game.</h2>
          </div>
          <a className="btn btn-primary btn-lg" href="https://play.streetsempire.dev">
            Play Now
          </a>
        </div>
      </section>
    </>
  );
}
