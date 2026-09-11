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
              <td className="se-table__number se-num" title={row.intelRequired ? 'Exact opponent net worth now requires recon.' : undefined}>
                {row.netWorthCents === null ? 'Hidden' : formatCents(row.netWorthCents)}
              </td>
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

      {data?.national.some((row) => row.intelRequired) || data?.local.some((row) => row.intelRequired) ? (
        <Alert tone="info">Ranks still show who is ahead, but exact opponent net worth is hidden in this combat round. Use recon on the Raids page for cash bands, fit thugs and weapons.</Alert>
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
