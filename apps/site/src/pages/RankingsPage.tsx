import { useEffect, useState } from 'react';
import { formatCentsCompact, type PublicRankingsDto } from '@streets/shared';
import { Link } from 'react-router-dom';
import { publicSiteApi } from '../api/public.js';
import { PublicError, PublicLoading, PublicPageHero, movementText } from '../components/PublicPageBits.js';

export function RankingsPage() {
  const [data, setData] = useState<PublicRankingsDto | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { let live = true; void publicSiteApi.rankings().then((x) => live && setData(x)).catch(() => live && setFailed(true)); return () => { live = false; }; }, []);
  return <div className="site-page">
    <PublicPageHero eyebrow="Competition" title="Rankings"><p>Guest-readable national standings for the current StreetsEmpire game.</p></PublicPageHero>
    <section className="site-section site-section--tight"><div className="container">
      {!data && !failed ? <PublicLoading label="Loading rankings…" /> : null}
      {failed ? <PublicError title="Rankings are temporarily unavailable." /> : null}
      {data ? <div className="site-panel"><div className="site-panel__head public-panel-title"><div><span className="site-card__eyebrow">{data.round?.name ?? 'No current game'}</span><h2>National leaderboard</h2></div></div>
        <div className="archive-table-wrap"><table className="archive-table"><thead><tr><th>Rank</th><th>Player</th><th>City</th><th>Alliance</th><th>Movement</th><th>Net Worth</th></tr></thead><tbody>
        {data.rankings.map((row)=><tr key={row.publicPimpId}><td>#{row.rank}</td><td><Link to={`/players/${row.publicPimpId}`}>{row.displayName} <small>#{row.publicPimpId}</small></Link></td><td>{row.city.name}</td><td>{row.alliance ? `[${row.alliance.tag}] ${row.alliance.name}` : 'Independent'}</td><td>{movementText(row.movement)}</td><td>{formatCentsCompact(row.netWorthCents)}</td></tr>)}
        </tbody></table></div></div> : null}
    </div></section>
  </div>;
}
