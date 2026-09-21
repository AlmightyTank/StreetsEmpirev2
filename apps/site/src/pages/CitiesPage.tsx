import { useEffect, useState } from 'react';
import { formatCentsCompact, type PublicCitiesDto } from '@streets/shared';
import { Link } from 'react-router-dom';
import { publicSiteApi } from '../api/public.js';
import { PublicError, PublicLoading, PublicPageHero } from '../components/PublicPageBits.js';

export function CitiesPage(){const[data,setData]=useState<PublicCitiesDto|null>(null);const[failed,setFailed]=useState(false);useEffect(()=>{let live=true;void publicSiteApi.cities().then(x=>live&&setData(x)).catch(()=>live&&setFailed(true));return()=>{live=false}},[]);
return <div className="site-page"><PublicPageHero eyebrow="The world" title="Cities"><p>Public city character, population, economy and turf control for the current game.</p></PublicPageHero><section className="site-section site-section--tight"><div className="container">{!data&&!failed?<PublicLoading/>:null}{failed?<PublicError/>:null}{data?<div className="world-card-grid">{data.cities.map(city=><Link className="world-card" key={city.slug} to={`/cities/${city.slug}`}><span className="site-card__eyebrow">{city.trait??'City'}</span><h2>{city.name}</h2><p>{city.blurb??city.talk[0]??'A StreetsEmpire city.'}</p><div className="world-card__stats"><span>{city.playerCount} players</span><span>{formatCentsCompact(city.economyNetWorthCents)} economy</span><span>{city.turfBlocksHeld}/{city.turfBlocksTotal} turf held</span></div><span className="site-card__link">Explore city →</span></Link>)}</div>:null}</div></section></div>}
