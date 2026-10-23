import { Link } from 'react-router-dom';
import type { AllianceRankingEntryDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { useSession } from '../stores/session.js';

/** Levels either side of yours that count as "near your level". */
const NEAR_LEVELS = 5;

/** Alliances ranked by the combined net worth of their active members, with each crew's average account level. */
export function AllianceRankingTable({ rows }: { rows: AllianceRankingEntryDto[] }) {
  const viewerLevel = useSession((state) => state.me?.experience?.level ?? null);
  const showLevels = rows.some((row) => row.averageLevel !== undefined);
  return (
    <div className="se-tablewrap">
      <table className="se-table se-table--cards se-ranking-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Alliance</th>
            <th className="se-table__number">Members</th>
            {showLevels ? <th className="se-table__number">Avg level</th> : null}
            <th className="se-table__number">Combined Net Worth</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const near = !row.isYours && viewerLevel !== null && row.averageLevel !== undefined && row.averageLevel > 0
              && Math.abs(row.averageLevel - viewerLevel) <= NEAR_LEVELS;
            return (
              <tr key={row.tag} className={row.isYours ? 'se-rank-you' : undefined}>
                <td className="se-num" data-label="Rank">#{formatNumber(row.rank)}</td>
                <td className="se-td--title">
                  <Link to={`/game/alliances/${encodeURIComponent(row.tag)}`} className="se-playerlink">
                    <span className="se-alliance-tag">[{row.tag}]</span>{row.name}
                  </Link>
                  {row.isYours ? <span className="se-you">YOURS</span> : null}
                  {near ? <span className="se-tag se-tag--good" title={`Average level within ${NEAR_LEVELS} of yours`}>Near your level</span> : null}
                </td>
                <td className="se-table__number se-num" data-label="Members">{formatNumber(row.memberCount)}</td>
                {showLevels ? <td className="se-table__number se-num" data-label="Avg level">{row.averageLevel ? formatNumber(row.averageLevel) : '-'}</td> : null}
                <td className="se-table__number se-num" data-label="Net worth">{formatCents(row.combinedNetWorthCents)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
