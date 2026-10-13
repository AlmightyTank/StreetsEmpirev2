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
    <PublicPageHero eyebrow="Rankings" title="See who's running the streets."><p>Live standings for the current season. Net worth decides the ladder, but city, alliance and movement show the story behind the number.</p><div className="archive-back"><Link className="btn btn-outline-light" to="/wiki/economy">How net worth works</Link><Link className="btn btn-outline-light" to="/games/current">Current season</Link></div></PublicPageHero>
    <section className="site-section site-section--tight"><div className="container">
      {!data && !failed ? <PublicLoading label="Checking the leaderboard…" /> : null}
      {failed ? <PublicError title="The leaderboard is temporarily unavailable." /> : null}
      {data ? <div className="site-panel"><div className="site-panel__head public-panel-title"><div><span className="site-card__eyebrow">{data.round?.name ?? 'No current season'}</span><h2>National leaderboard</h2></div><span>{data.rankings.length} ranked player{data.rankings.length === 1 ? '' : 's'}</span></div>
        <div className="archive-table-wrap"><table className="archive-table archive-table--stack"><thead><tr><th>Rank</th><th>Player</th><th>City</th><th>Alliance</th><th>Movement</th><th>Net Worth</th></tr></thead><tbody>
        {data.rankings.map((row)=><tr key={row.publicPimpId}><td data-label="Rank">#{row.rank}</td><td data-label="Player"><Link to={`/players/${row.publicPimpId}`}>{row.displayName} <small>#{row.publicPimpId}</small></Link></td><td data-label="City">{row.city.name}</td><td data-label="Alliance">{row.alliance ? `[${row.alliance.tag}] ${row.alliance.name}` : 'Independent'}</td><td data-label="Movement">{movementText(row.movement)}</td><td data-label="Net worth">{formatCentsCompact(row.netWorthCents)}</td></tr>)}
        </tbody></table></div>{data.rankings.length === 0 ? <p className="public-empty">No ranked players yet. Be early.</p> : null}</div> : null}
    </div></section>
  </div>;
}
