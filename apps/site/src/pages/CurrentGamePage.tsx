import { useEffect, useState } from 'react';
import type { PublicCurrentGameDto } from '@streets/shared';
import { Link } from 'react-router-dom';
import { publicSiteApi } from '../api/public.js';
import {
  CurrentGameHeader,
  PublicEvents,
  PublicGameStats,
  PublicNews,
  PublicRankings,
} from '../components/PublicGameBlocks.js';

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'empty' }
  | { kind: 'ready'; game: PublicCurrentGameDto };

export function CurrentGamePage() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    void publicSiteApi.currentGame()
      .then(({ currentGame }) => {
        if (!active) return;
        setState(currentGame ? { kind: 'ready', game: currentGame } : { kind: 'empty' });
      })
      .catch(() => {
        if (active) setState({ kind: 'error' });
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="site-page">
      <section className="site-page-hero">
        <div className="container">
          <p className="site-kicker">Current season</p>
          <h1>Current Game</h1>
          <p>Follow the public side of the StreetsEmpire season happening right now.</p>
        </div>
      </section>

      <section className="site-section site-section--tight">
        <div className="container">
          {state.kind === 'loading' ? (
            <div className="site-panel public-state"><strong>Loading the current game…</strong></div>
          ) : null}

          {state.kind === 'error' ? (
            <div className="site-panel public-state">
              <strong>Live game statistics are temporarily unavailable.</strong>
              <p>The public website is still available, and the live game can be opened directly.</p>
              <a className="btn btn-primary" href="https://play.streetsempire.dev">Open Live Game</a>
            </div>
          ) : null}

          {state.kind === 'empty' ? (
            <div className="site-panel public-state">
              <strong>StreetsEmpire is between games.</strong>
              <p>Check News and the Roadmap for the next season announcement.</p>
              <div className="site-hero__actions">
                <Link className="btn btn-outline-light" to="/news">News</Link>
                <Link className="btn btn-outline-light" to="/roadmap">Roadmap</Link>
              </div>
            </div>
          ) : null}

          {state.kind === 'ready' ? (
            <div className="public-game-stack">
              <div className="site-panel public-game-panel">
                <CurrentGameHeader game={state.game} />
                <PublicGameStats game={state.game} />
              </div>

              <div className="public-two-column">
                <section className="site-panel">
                  <div className="site-panel__head public-panel-title">
                    <div>
                      <span className="site-card__eyebrow">Competition</span>
                      <h2>Top Players</h2>
                    </div>
                    <Link to="/rankings">All rankings →</Link>
                  </div>
                  <PublicRankings game={state.game} />
                </section>

                <section className="site-panel">
                  <div className="site-panel__head public-panel-title">
                    <div>
                      <span className="site-card__eyebrow">Street wire</span>
                      <h2>Recent Turf Captures</h2>
                    </div>
                    <Link to="/turf">View turf →</Link>
                  </div>
                  <PublicEvents game={state.game} />
                </section>
              </div>

              <section className="site-panel">
                <div className="site-panel__head public-panel-title">
                  <div>
                    <span className="site-card__eyebrow">Official</span>
                    <h2>Latest News</h2>
                  </div>
                  <Link to="/news">All news →</Link>
                </div>
                <PublicNews game={state.game} />
              </section>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
