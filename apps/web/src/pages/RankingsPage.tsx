import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { RankingEntryDto, RankingsDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

function heldFor(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function movementText(value: number | null): string {
  if (value === null || value === 0) return 'even';
  return value > 0 ? `up ${formatNumber(value)}` : `down ${formatNumber(Math.abs(value))}`;
}

function legacyText(row: RankingEntryDto): string {
  if (row.legacy.roundWins > 0) return `${formatNumber(row.legacy.roundWins)} wins`;
  if (row.legacy.bestNationalRank) return `best #${formatNumber(row.legacy.bestNationalRank)}`;
  if (row.legacy.roundsPlayed > 0) return `${formatNumber(row.legacy.roundsPlayed)} played`;
  return 'new blood';
}

function RankingTable({ rows, showCity }: { rows: RankingEntryDto[]; showCity: boolean }) {
  if (rows.length === 0) {
    return <div className="se-panel__body"><p className="se-muted">Nobody is ranked yet.</p></div>;
  }

  return (
    <div className="se-tablewrap">
      <table className="se-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Pimp</th>
            {showCity ? <th>City</th> : null}
            <th className="se-table__number">Net Worth</th>
            <th>Held</th>
            <th>Move</th>
            <th>Legacy</th>
            <th>Awards</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.publicPimpId} className={row.isYou ? 'se-rank-you' : undefined}>
              <td className="se-num">#{formatNumber(row.rank)}</td>
              <td>
                <Link to={`/game/players/${row.publicPimpId}`} className="se-playerlink">
                  {row.displayName} <span className="se-muted se-num">(#{row.publicPimpId})</span>
                </Link>
                {row.isYou ? <span className="se-you">YOU</span> : null}
              </td>
              {showCity ? <td>{row.city.name}</td> : null}
              <td className="se-table__number se-num">{formatCents(row.netWorthCents)}</td>
              <td className="se-num" title={`Held since ${new Date(row.rankHeldSinceAt).toLocaleString()}`}>{heldFor(row.rankHeldSinceAt)}</td>
              <td className="se-num">{movementText(row.rankMovement)}</td>
              <td>{legacyText(row)}</td>
              <td>{row.awards.length ? row.awards.map((award) => award.title).join(', ') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RankingsPage() {
  const me = useSession((s) => s.me);
  const [data, setData] = useState<RankingsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    communityApi.rankings()
      .then(setData)
      .catch((caught: unknown) => {
        setError(caught instanceof ApiError ? caught.message : 'Could not load the rankings.');
      });
  }, []);

  if (!me) return <Navigate to="/join" replace />;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Rankings</h1>
          <p className="se-eyebrow">Who owns the streets right now</p>
        </div>
        {data ? (
          <div className="se-pagehead__right se-rank-summary">
            <span>Local <b className="se-num">#{formatNumber(data.me.localRank)}</b></span>
            <span>National <b className="se-num">#{formatNumber(data.me.nationalRank)}</b></span>
          </div>
        ) : null}
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {data ? (
        <Alert tone="info">Rankings are public bragging rights: money, current rank, rank streak, movement, past placements and awards. Recon is still where you learn private raid intel like fit thugs, weapons and exposed cash.</Alert>
      ) : null}

      <div className="se-grid">
        <Panel title="National" flush>
          {data ? <RankingTable rows={data.national} showCity /> : <div className="se-panel__body"><p className="se-muted">Loading the board...</p></div>}
        </Panel>

        <Panel title={data ? data.localCity.name : 'Local'} flush>
          {data ? <RankingTable rows={data.local} showCity={false} /> : <div className="se-panel__body"><p className="se-muted">Loading your city...</p></div>}
        </Panel>
      </div>
    </GameLayout>
  );
}
