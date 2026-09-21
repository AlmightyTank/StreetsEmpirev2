import { useEffect, useState } from 'react';
import { formatCentsCompact, type PublicAlliancePageDto } from '@streets/shared';
import { Link, useParams } from 'react-router-dom';
import { PublicApiError, publicSiteApi } from '../api/public.js';
import { PublicError, PublicLoading, PublicPageHero, PublicStatGrid } from '../components/PublicPageBits.js';

export function AlliancePage() {
  const {tag=''}=useParams(); const [data,setData]=useState<PublicAlliancePageDto|null>(null); const [missing,setMissing]=useState(false); const [failed,setFailed]=useState(false);
  useEffect(()=>{let live=true;void publicSiteApi.alliance(tag).then(x=>live&&setData(x.alliance)).catch(e=>{if(!live)return;e instanceof PublicApiError&&e.status===404?setMissing(true):setFailed(true)});return()=>{live=false;};},[tag]);
  if(missing)return <div className="site-page"><PublicPageHero eyebrow="Alliance profile" title="Alliance not found"/></div>;
  return <div className="site-page"><PublicPageHero eyebrow="Alliance profile" title={data?`[${data.tag}] ${data.name}`:'Alliance'}>{data?<p>Founded {new Date(data.foundedAt).toLocaleDateString()}</p>:null}</PublicPageHero>
  <section className="site-section site-section--tight"><div className="container public-game-stack">{!data&&!failed?<PublicLoading/>:null}{failed?<PublicError/>:null}{data?<><PublicStatGrid stats={[['Rank','#'+data.rank],['Members',String(data.memberCount)],['Turf Blocks',String(data.turfBlocks)],['Combined Net Worth',formatCentsCompact(data.combinedNetWorthCents)]]}/>
  <section className="site-panel"><div className="site-panel__head"><div><span className="site-card__eyebrow">Roster</span><h2>{data.leader ? `Led by ${data.leader.displayName}` : 'Members'}</h2></div></div><div className="archive-table-wrap"><table className="archive-table"><thead><tr><th>National</th><th>Player</th><th>City</th><th>Role</th><th>Net Worth</th></tr></thead><tbody>{data.members.map(m=><tr key={m.publicPimpId}><td>#{m.nationalRank}</td><td><Link to={`/players/${m.publicPimpId}`}>{m.displayName} <small>#{m.publicPimpId}</small></Link></td><td>{m.city.name}</td><td>{m.isLeader?'Leader':'Member'}</td><td>{formatCentsCompact(m.netWorthCents)}</td></tr>)}</tbody></table></div></section></>:null}</div></section></div>;
}
