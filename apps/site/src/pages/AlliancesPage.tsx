import { useEffect, useState } from 'react';
import { formatCentsCompact, type PublicAlliancesDto } from '@streets/shared';
import { Link } from 'react-router-dom';
import { publicSiteApi } from '../api/public.js';
import { PublicError, PublicLoading, PublicPageHero } from '../components/PublicPageBits.js';

export function AlliancesPage() {
  const [data,setData]=useState<PublicAlliancesDto|null>(null); const [failed,setFailed]=useState(false);
  useEffect(()=>{let live=true;void publicSiteApi.alliances().then(x=>live&&setData(x)).catch(()=>live&&setFailed(true));return()=>{live=false;};},[]);
  return <div className="site-page"><PublicPageHero eyebrow="Crews together" title="Alliances"><p>Current alliance standings by combined public net worth, with turf presence.</p></PublicPageHero>
  <section className="site-section site-section--tight"><div className="container">{!data&&!failed?<PublicLoading label="Loading alliances…"/>:null}{failed?<PublicError/>:null}
  {data?<div className="site-panel"><div className="archive-table-wrap"><table className="archive-table"><thead><tr><th>Rank</th><th>Alliance</th><th>Members</th><th>Turf</th><th>Combined Net Worth</th></tr></thead><tbody>
  {data.alliances.map(a=><tr key={a.tag}><td>#{a.rank}</td><td><Link to={`/alliances/${a.tag}`}>[{a.tag}] {a.name}</Link></td><td>{a.memberCount}</td><td>{a.turfBlocks}</td><td>{formatCentsCompact(a.combinedNetWorthCents)}</td></tr>)}
  </tbody></table></div></div>:null}</div></section></div>;
}
