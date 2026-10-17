import { useEffect, useState } from 'react';
import {
  formatCentsCompact,
  formatNumber,
  type PublicGameDetailDto,
  type PublicSeasonStandingDto,
} from '@streets/shared';
import { Link, useParams } from 'react-router-dom';
import { PublicApiError, publicSiteApi } from '../api/public.js';
import { formatPublicDate } from '../components/PublicGameBlocks.js';
import { PublicPageHero } from '../components/PublicPageBits.js';

type State =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'error' }
  | { kind: 'ready'; game: PublicGameDetailDto };

function PlayerName({ row }: { row: PublicSeasonStandingDto }) {
  return (
    <span>
      {row.alliance ? <span className="archive-alliance-tag">[{row.alliance.tag}] </span> : null}
      {row.displayName} <small>#{row.publicPimpId}</small>
    </span>
  );
}

export function GameArchivePage() {
  const { gameId } = useParams();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (!gameId) {
      setState({ kind: 'not-found' });
      return;
    }

    let active = true;
    void publicSiteApi.game(gameId)
      .then(({ game }) => {
        if (active) setState({ kind: 'ready', game });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState(error instanceof PublicApiError && error.status === 404
          ? { kind: 'not-found' }
          : { kind: 'error' });
      });

    return () => {
      active = false;
    };
  }, [gameId]);

  if (state.kind === 'loading') {
    return <div className="site-page"><section className="site-section"><div className="container"><div className="site-panel public-state"><strong>Opening the season record…</strong></div></div></section></div>;
  }

  if (state.kind === 'not-found') {
    return (
      <div className="site-page">
        <PublicPageHero eyebrow="Season archive" title="We can't find that season.">
          <p>That completed season is not in the public archive.</p>
          <Link className="btn btn-primary" to="/games">Back to seasons</Link>
        </PublicPageHero>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="site-page">
        <section className="site-section">
          <div className="container">
            <div className="site-panel public-state">
              <strong>This season record is temporarily unavailable.</strong>
              <p>Try the season archive again later.</p>
              <Link className="btn btn-outline-light" to="/games">Back to seasons</Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const { game } = state;
  const statRows = [
    ['Players', formatNumber(game.stats.players)],
    ['Alliances', formatNumber(game.stats.alliances)],
    ['Cities', formatNumber(game.stats.cities)],
    ['Final Economy', formatCentsCompact(game.stats.economyNetWorthCents)],
    ['Combat Battles', formatNumber(game.stats.combatBattles)],
    ['Drive-Bys', formatNumber(game.stats.driveBys)],
    ['Completed Runs', formatNumber(game.stats.travelRuns)],
    ['Turf Battles', formatNumber(game.stats.turfBattles)],
    ['Turf Captures', formatNumber(game.stats.turfCaptures)],
    ['Blocks Held at End', formatNumber(game.stats.turfBlocksHeldAtEnd)],
  ] as const;

  return (
    <div className="site-page">
      <section className="site-page-hero archive-hero">
        <div className="container">
          <p className="site-kicker">Season record</p>
          <div className="archive-hero__status">
            <span className="site-status-badge">{game.status}</span>
            <span>{formatPublicDate(game.startsAt)} – {formatPublicDate(game.endedAt)}</span>
          </div>
          <h1>{game.name}</h1>
          <p>{game.ruleset.name} · ruleset {game.ruleset.version} · frozen final results</p>
        </div>
      </section>

      <section className="site-section site-section--tight">
        <div className="container public-game-stack">
          <section className="site-panel archive-champion-panel">
            <span className="site-card__eyebrow">{game.champions.length > 1 ? 'Winners' : 'Winner'}</span>
            {game.champions.length ? (
              <div className="archive-champions">
                {game.champions.map((champion) => (
                  <div key={champion.publicPimpId}>
                    <strong><PlayerName row={champion} /></strong>
                <span>{champion.city.name} · finished with {formatCentsCompact(champion.netWorthCents)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="public-empty">No public champion is available for this season.</p>
            )}
          </section>

          <div className="archive-stat-grid">
            {statRows.map(([label, value]) => (
              <div className="public-stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          <section className="site-panel">
            <div className="site-panel__head public-panel-title">
              <div>
                <span className="site-card__eyebrow">Final result</span>
                <h2>Everyone who placed</h2>
              </div>
              <span>{formatNumber(game.standings.length)} ranked players</span>
            </div>
            <div className="archive-table-wrap">
              <table className="archive-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>City</th>
                    <th>Alliance</th>
                    <th>Final Net Worth</th>
                  </tr>
                </thead>
                <tbody>
                  {game.standings.map((row) => (
                    <tr key={row.publicPimpId}>
                      <td data-label="Rank">#{row.nationalRank}</td>
                      <td data-label="Player"><PlayerName row={row} /></td>
                      <td data-label="City">{row.city.name}</td>
                      <td data-label="Alliance">{row.alliance ? `[${row.alliance.tag}] ${row.alliance.name}` : 'Independent'}</td>
                      <td data-label="Final net worth">{formatCentsCompact(row.netWorthCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="public-two-column archive-results-grid">
            <section className="site-panel">
              <div className="site-panel__head public-panel-title">
                <div>
                  <span className="site-card__eyebrow">Crew results</span>
                  <h2>Alliance standings</h2>
                </div>
              </div>
              {game.allianceStandings.length ? (
                <div className="public-list">
                  {game.allianceStandings.map((alliance) => (
                    <div className="archive-alliance-row" key={alliance.tag}>
                      <span className="public-ranking-row__rank">#{alliance.rank}</span>
                      <div>
                        <strong>[{alliance.tag}] {alliance.name}</strong>
                        <small>{formatNumber(alliance.memberCount)} member{alliance.memberCount === 1 ? '' : 's'}</small>
                      </div>
                      <strong>{formatCentsCompact(alliance.combinedNetWorthCents)}</strong>
                    </div>
                  ))}
                </div>
              ) : <p className="public-empty">No alliances finished this season.</p>}
            </section>

            <section className="site-panel">
              <div className="site-panel__head public-panel-title">
                <div>
                  <span className="site-card__eyebrow">City results</span>
                  <h2>Local winners</h2>
                </div>
              </div>
              {game.cityResults.length ? (
                <div className="public-list">
                  {game.cityResults.map((city) => (
                    <div className="archive-city-row" key={city.city.slug}>
                      <div>
                        <strong>{city.city.name}</strong>
                        <small>{formatNumber(city.playerCount)} players · {formatCentsCompact(city.economyNetWorthCents)}</small>
                      </div>
                      <span>
                        {city.champions.length
                          ? city.champions.map((champion) => champion.displayName).join(' · ')
                          : 'No public winner'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : <p className="public-empty">No city results are available.</p>}
            </section>
          </div>

          <div className="archive-back">
            <Link className="btn btn-outline-light" to="/games">← All seasons</Link>
            <Link className="btn btn-outline-light" to="/hall-of-fame">Hall of Fame</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
