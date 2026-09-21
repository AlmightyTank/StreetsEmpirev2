import { useEffect, useState } from 'react';
import { formatCentsCompact, formatNumber, type PublicGamesArchiveDto } from '@streets/shared';
import { Link } from 'react-router-dom';
import { publicSiteApi } from '../api/public.js';
import { formatPublicDate, timeRemaining } from '../components/PublicGameBlocks.js';

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; data: PublicGamesArchiveDto };

export function GamesPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    void publicSiteApi.games()
      .then((data) => {
        if (active) setState({ kind: 'ready', data });
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
          <p className="site-kicker">Seasons</p>
          <h1>Current & Past Games</h1>
          <p>
            Follow the game happening now and browse the permanent record of every
            completed StreetsEmpire season.
          </p>
        </div>
      </section>

      <section className="site-section site-section--tight">
        <div className="container public-game-stack">
          {state.kind === 'loading' ? (
            <div className="site-panel public-state"><strong>Loading the season archive…</strong></div>
          ) : null}

          {state.kind === 'error' ? (
            <div className="site-panel public-state">
              <strong>The season archive is temporarily unavailable.</strong>
              <p>The live game and the rest of the public site are still available.</p>
            </div>
          ) : null}

          {state.kind === 'ready' ? (
            <>
              <section className="site-panel archive-current">
                <div>
                  <span className="site-card__eyebrow">Current game</span>
                  {state.data.currentRound ? (
                    <>
                      <h2>{state.data.currentRound.name}</h2>
                      <p>
                        {state.data.currentRound.status} · {formatNumber(state.data.currentRound.playerCount)} players ·{' '}
                        {timeRemaining(state.data.currentRound.endsAt)}
                      </p>
                    </>
                  ) : (
                    <>
                      <h2>Between seasons</h2>
                      <p>No game is currently open.</p>
                    </>
                  )}
                </div>
                {state.data.currentRound ? (
                  <Link className="btn btn-primary" to="/games/current">View Current Game</Link>
                ) : (
                  <Link className="btn btn-outline-light" to="/news">Check News</Link>
                )}
              </section>

              <section>
                <div className="site-section__head archive-section-head">
                  <div>
                    <p className="site-kicker">Season history</p>
                    <h2>Completed Games</h2>
                  </div>
                  <p>{formatNumber(state.data.games.length)} archived season{state.data.games.length === 1 ? '' : 's'} shown.</p>
                </div>

                {state.data.games.length === 0 ? (
                  <div className="site-panel public-state">
                    <strong>No completed seasons yet.</strong>
                    <p>The first finished game will appear here automatically when its final standings are frozen.</p>
                  </div>
                ) : (
                  <div className="archive-grid">
                    {state.data.games.map((game) => (
                      <Link className="archive-card" key={game.id} to={`/games/${game.slug}`}>
                        <div className="archive-card__head">
                          <div>
                            <span className="site-status-badge">{game.status}</span>
                            <h3>{game.name}</h3>
                          </div>
                          <span className="archive-card__date">{formatPublicDate(game.endedAt)}</span>
                        </div>

                        <p className="archive-card__ruleset">
                          {game.ruleset.name} · {game.ruleset.version}
                        </p>

                        <div className="archive-card__champion">
                          <span>{game.champions.length > 1 ? 'Co-Champions' : 'Champion'}</span>
                          <strong>
                            {game.champions.length
                              ? game.champions.map((champion) =>
                                  `${champion.alliance ? `[${champion.alliance.tag}] ` : ''}${champion.displayName}`
                                ).join(' · ')
                              : 'No public champion'}
                          </strong>
                        </div>

                        <div className="archive-card__stats">
                          <span><strong>{formatNumber(game.stats.players)}</strong> players</span>
                          <span><strong>{formatCentsCompact(game.stats.economyNetWorthCents)}</strong> economy</span>
                          <span><strong>{formatNumber(game.stats.combatBattles)}</strong> battles</span>
                          <span><strong>{formatNumber(game.stats.turfCaptures)}</strong> captures</span>
                        </div>

                        <span className="site-card__link">Open season record →</span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
