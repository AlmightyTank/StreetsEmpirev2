import { useEffect,useState } from 'react';
import { formatCentsCompact,type PublicCityPageDto } from '@streets/shared';
import { Link,useParams } from 'react-router-dom';
import { PublicApiError,publicSiteApi } from '../api/public.js';
import { PublicError,PublicLoading,PublicPageHero,PublicStatGrid } from '../components/PublicPageBits.js';

export function CityPage(){
  const{citySlug=''}=useParams();
  const[data,setData]=useState<PublicCityPageDto|null>(null);
  const[missing,setMissing]=useState(false);
  const[failed,setFailed]=useState(false);
  useEffect(()=>{let live=true;void publicSiteApi.city(citySlug).then(x=>live&&setData(x.city)).catch(e=>{if(!live)return;e instanceof PublicApiError&&e.status===404?setMissing(true):setFailed(true)});return()=>{live=false}},[citySlug]);
  if(missing)return <div className="site-page"><PublicPageHero eyebrow="City profile" title="We can't find that city."><p>It may have moved. Try the full list.</p><Link className="btn btn-primary" to="/cities">All cities</Link></PublicPageHero></div>;
  return (
    <div className="site-page">
      <PublicPageHero eyebrow={data?.trait??'City profile'} title={data?.name??'City'}>
        {data?<p>{data.blurb}</p>:<p>Loading this city…</p>}
        <p className="wiki-crumb"><Link to="/cities">All cities</Link> · <Link to="/wiki/economy">How cities work</Link></p>
      </PublicPageHero>
      <section className="site-section site-section--tight">
        <div className="container public-game-stack">
          {!data&&!failed?<PublicLoading/>:null}
          {failed?<PublicError/>:null}
          {data?(
            <>
              <PublicStatGrid stats={[['Players here',String(data.playerCount)],['Street economy',formatCentsCompact(data.economyNetWorthCents)],['Blocks claimed',`${data.turfBlocksHeld}/${data.turfBlocksTotal}`]]}/>
              <section className="site-panel">
                <div className="site-panel__head"><div><span className="site-card__eyebrow">Word on the street</span><h2>What locals say</h2></div></div>
                <ul className="site-feature-list">{data.talk.map(x=><li key={x}>{x}</li>)}</ul>
              </section>
              <section className="site-panel">
                <div className="site-panel__head"><div><span className="site-card__eyebrow">Right now</span><h2>Who holds the blocks</h2></div><Link className="public-panel-title" to="/wiki/turf">How turf works →</Link></div>
                <div className="district-grid">
                  {data.districts.map(d=>(
                    <article className="district-card" key={d.key}>
                      <span className="site-card__eyebrow">{d.key}</span>
                      <h3>{d.name}</h3>
                      <p>{d.blurb??'A block up for grabs.'}</p>
                      <div className="district-card__holder">
                        {d.holder?<><strong>{d.holder.alliance?`[${d.holder.alliance.tag}] `:''}{d.holder.displayName}</strong><Link to={`/players/${d.holder.publicPimpId}`}>See player #{d.holder.publicPimpId}</Link></>:<strong>Open — no one holds this yet</strong>}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <section className="site-panel content-callout">
                <div><span className="site-card__eyebrow">Like this city?</span><h2>Start here this season.</h2><p>Join the game, pick this city as home, and work its blocks. You can move cities later.</p></div>
                <a className="btn btn-primary" href="https://play.streetsempire.dev">Play free</a>
              </section>
            </>
          ):null}
        </div>
      </section>
    </div>
  );
}
