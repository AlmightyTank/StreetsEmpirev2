import { useEffect, useState } from 'react';
import { formatCentsCompact, type PublicCitiesDto } from '@streets/shared';
import { Link } from 'react-router-dom';
import { publicSiteApi } from '../api/public.js';
import { PublicError, PublicLoading, PublicPageHero } from '../components/PublicPageBits.js';

export function CitiesPage(){
  const[data,setData]=useState<PublicCitiesDto|null>(null);
  const[failed,setFailed]=useState(false);
  useEffect(()=>{let live=true;void publicSiteApi.cities().then(x=>live&&setData(x)).catch(()=>live&&setFailed(true));return()=>{live=false}},[]);
  return (
    <div className="site-page">
      <PublicPageHero eyebrow="The world" title="Pick your home turf.">
        <p>Every city feels different — different prices, police and opportunities. New here? Any city is fine to start. You can move later.</p>
        <div className="archive-back">
          <Link className="btn btn-outline-light" to="/wiki/economy">How cities differ →</Link>
        </div>
      </PublicPageHero>
      <section className="site-section site-section--tight">
        <div className="container">
          {!data&&!failed?<PublicLoading label="Finding the cities…" />:null}
          {failed?<PublicError title="The cities are taking a break."> <p>Live city numbers could not be reached. The wiki still explains how cities work.</p><div className="archive-back"><Link className="btn btn-outline-light" to="/wiki/economy">How cities work</Link></div></PublicError>:null}
          {data?(
            <>
              <p className="wiki-crumb">Live right now · {data.cities.length} cities · numbers change through the season</p>
              <div className="world-card-grid">
                {data.cities.map(city=>(
                  <Link className="world-card" key={city.slug} to={`/cities/${city.slug}`}>
                    <span className="site-card__eyebrow">{city.trait??'City'}</span>
                    <h2>{city.name}</h2>
                    <p>{city.blurb??city.talk[0]??'A StreetsEmpire city.'}</p>
                    <div className="world-card__stats">
                      <span><strong>{city.playerCount}</strong> players here</span>
                      <span><strong>{formatCentsCompact(city.economyNetWorthCents)}</strong> street economy</span>
                      <span><strong>{city.turfBlocksHeld}/{city.turfBlocksTotal}</strong> blocks claimed</span>
                    </div>
                    <span className="site-card__link">Look around →</span>
                  </Link>
                ))}
              </div>
              <section className="site-panel content-callout">
                <div><span className="site-card__eyebrow">New player tip</span><h2>Start anywhere. Really.</h2><p>New York is the classic start. Las Vegas has the big casino. Your home sets your local blocks — you can relocate later.</p></div>
                <Link className="btn btn-primary" to="/wiki/getting-started">First steps</Link>
              </section>
            </>
          ):null}
        </div>
      </section>
    </div>
  );
}
