import { useEffect, useState } from 'react';
import { formatCentsCompact, formatNumber, type PublicPlayerPageDto } from '@streets/shared';
import { Link, useParams } from 'react-router-dom';
import { PublicApiError, publicSiteApi } from '../api/public.js';
import { PublicError, PublicLoading, PublicPageHero, PublicStatGrid, movementText, relativeTime } from '../components/PublicPageBits.js';

export function PlayerPage() {
  const { playerId } = useParams();
  const id = Number(playerId);
  const [data, setData] = useState<PublicPlayerPageDto | null>(null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!Number.isSafeInteger(id) || id < 1) { setMissing(true); return; }
    let live = true;
    void publicSiteApi.player(id).then((x)=>live&&setData(x.player)).catch((e)=>{ if(!live)return; e instanceof PublicApiError && e.status===404 ? setMissing(true) : setFailed(true); });
    return ()=>{live=false;};
  },[id]);
  if(missing) return <div className="site-page"><PublicPageHero eyebrow="Public career" title="Player not found"><p>That player id is not in the current game.</p></PublicPageHero></div>;
  return <div className="site-page">
    <PublicPageHero eyebrow="Public career" title={data?.player.displayName ?? 'Player profile'}>{data ? <p>#{data.player.publicPimpId} · {data.player.city.name}{data.player.alliance ? ` · [${data.player.alliance.tag}] ${data.player.alliance.name}` : ''}</p> : null}</PublicPageHero>
    <section className="site-section site-section--tight"><div className="container public-game-stack">
      {!data && !failed ? <PublicLoading label="Loading player profile…" /> : null}
      {failed ? <PublicError title="This player profile is temporarily unavailable." /> : null}
      {data ? <>
        <PublicStatGrid stats={[
          ['National Rank', '#'+formatNumber(data.player.rank.national)],
          ['Local Rank', '#'+formatNumber(data.player.rank.local)],
          ['Net Worth', formatCentsCompact(data.player.netWorthCents)],
          ['National Move', movementText(data.player.rank.nationalMovement)],
          ['Past Games', formatNumber(data.career.roundsPlayed)],
          ['Championships', formatNumber(data.career.roundWins)],
        ]}/>
        <div className="public-two-column"><section className="site-panel"><div className="site-panel__head"><div><span className="site-card__eyebrow">Current season</span><h2>{data.round.name}</h2></div></div>
          <div className="profile-summary"><p><strong>City</strong><span>{data.player.city.name}</span></p><p><strong>Alliance</strong><span>{data.player.alliance ? `[${data.player.alliance.tag}] ${data.player.alliance.name}` : 'Independent'}</span></p><p><strong>Title</strong><span>{data.player.cosmetics.title ?? 'None'}</span></p><p><strong>Last active</strong><span>{relativeTime(data.player.lastActiveAt)}</span></p></div>
        </section>
        <section className="site-panel"><div className="site-panel__head"><div><span className="site-card__eyebrow">Career</span><h2>Legacy</h2></div></div>
          <div className="profile-summary"><p><strong>Best national</strong><span>{data.career.bestNationalRank ? '#'+data.career.bestNationalRank : '—'}</span></p><p><strong>Top-ten finishes</strong><span>{data.career.topTenFinishes}</span></p><p><strong>Final net worth total</strong><span>{formatCentsCompact(data.career.totalFinalNetWorthCents)}</span></p></div>
        </section></div>
        <section className="site-panel"><div className="site-panel__head"><div><span className="site-card__eyebrow">Past seasons</span><h2>Career History</h2></div></div>
        {data.career.seasons.length ? <div className="archive-table-wrap"><table className="archive-table"><thead><tr><th>Game</th><th>Name</th><th>National</th><th>Local</th><th>City</th><th>Alliance</th><th>Final Net Worth</th></tr></thead><tbody>
          {data.career.seasons.map((s)=><tr key={s.round.slug}><td><Link to={`/games/${s.round.slug}`}>{s.round.name}</Link></td><td>{s.displayName} <small>#{s.publicPimpId}</small></td><td>{s.nationalRank ? '#'+s.nationalRank : '—'}</td><td>{s.localRank ? '#'+s.localRank : '—'}</td><td>{s.city.name}</td><td>{s.alliance ? `[${s.alliance.tag}]` : '—'}</td><td>{formatCentsCompact(s.finalNetWorthCents)}</td></tr>)}
        </tbody></table></div> : <p className="public-empty">No completed past seasons yet.</p>}
        </section>
      </> : null}
    </div></section>
  </div>;
}
