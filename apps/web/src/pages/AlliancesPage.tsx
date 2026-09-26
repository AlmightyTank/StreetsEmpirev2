import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AllianceDetailDto, AllianceRankingEntryDto, AllianceRankingsDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { allianceApi } from '../api/alliances.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { AllianceMembers, AllianceSummary } from './AlliancePage.js';

/** Alliances ranked by the combined net worth of their active members. Shared with the Rankings page. */
export function AllianceRankingTable({ rows }: { rows: AllianceRankingEntryDto[] }) {
  return (
    <div className="se-tablewrap">
      <table className="se-table se-table--cards se-ranking-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Alliance</th>
            <th className="se-table__number">Members</th>
            <th className="se-table__number">Combined Net Worth</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.tag} className={row.isYours ? 'se-rank-you' : undefined}>
              <td className="se-num" data-label="Rank">#{formatNumber(row.rank)}</td>
              <td className="se-td--title">
                <Link to={`/game/alliances/${encodeURIComponent(row.tag)}`} className="se-playerlink">
                  <span className="se-alliance-tag">[{row.tag}]</span>{row.name}
                </Link>
                {row.isYours ? <span className="se-you">YOURS</span> : null}
              </td>
              <td className="se-table__number se-num" data-label="Members">{formatNumber(row.memberCount)}</td>
              <td className="se-table__number se-num" data-label="Net worth">{formatCents(row.combinedNetWorthCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Alliance rankings: combined net worth of each alliance's active members. */
export function AlliancesPage() {
  const [data, setData] = useState<AllianceRankingsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    allianceApi.rankings().then(setData).catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Could not load the alliance rankings.');
    });
  }, []);

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Alliance Rankings</h1>
          <p className="se-eyebrow">Crews ranked by combined net worth</p>
        </div>
        <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/alliance">Your alliance</Link>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <Panel title="Alliances" flush>
        {!data ? <p className="se-muted se-admin-pad">Loading the board...</p> : null}
        {data && !data.enabled ? <p className="se-muted se-admin-pad">This round is played solo.</p> : null}
        {data?.enabled && data.alliances.length === 0 ? <p className="se-muted se-admin-pad">No alliances yet. <Link to="/game/alliance">Found the first one.</Link></p> : null}
        {data?.enabled && data.alliances.length ? <AllianceRankingTable rows={data.alliances} /> : null}
      </Panel>
    </GameLayout>
  );
}

/** Public alliance page: members, combined net worth and rank. */
export function AllianceDetailPage() {
  const { tag = '' } = useParams();
  const [alliance, setAlliance] = useState<AllianceDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAlliance(null);
    setError(null);
    allianceApi.detail(tag).then((data) => setAlliance(data.alliance)).catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Could not load that alliance.');
    });
  }, [tag]);

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">{alliance ? <>[{alliance.tag}] {alliance.name}</> : 'Alliance'}</h1>
          <p className="se-eyebrow">
            {alliance ? `${alliance.leader ? `Led by ${alliance.leader.displayName} · ` : ''}Founded ${new Date(alliance.foundedAt).toLocaleDateString()}` : 'Alliance'}
          </p>
        </div>
        <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/alliances">Alliance rankings</Link>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {alliance ? (
        <>
          {alliance.isYours ? <Alert tone="info">This is your alliance. <Link to="/game/alliance">Manage it here.</Link></Alert> : null}
          <Panel
            title="Recruitment"
            aside={alliance.recruitmentStatus === 'OPEN' ? 'Open' : alliance.recruitmentStatus === 'INVITE_ONLY' ? 'Invite only' : 'Closed'}
          >
            <p className="se-muted">{alliance.description || 'Leadership has not posted a crew description yet.'}</p>
          </Panel>
          {alliance.forumUrl ? <p className="se-mb"><a className="se-btn se-btn--ghost se-btn--sm" href={alliance.forumUrl} target="_blank" rel="noreferrer">Recruitment thread on the forum</a></p> : null}
          <AllianceSummary alliance={alliance} />
          <Panel title="Members" flush>
            <AllianceMembers alliance={alliance} />
          </Panel>
        </>
      ) : !error ? <Panel title="Loading"><p className="se-muted">Asking around...</p></Panel> : null}
    </GameLayout>
  );
}
