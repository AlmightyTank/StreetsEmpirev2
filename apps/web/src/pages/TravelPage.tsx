import { useCallback, useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import type { TravelDto, WireItemDto } from '@streets/shared';
import { api } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { CityDetail, RoadMap, SHORT_CITY, agoText } from '../components/CityMap.js';
import { Panel } from '../components/Panel.js';
import { LaunchPanel, ReceiptPanel, RunPanel } from '../components/RunPanels.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

const WIRE_SHOWN = 8;

/** 0.5.0-C. What the street heard in the last day, newest first: gluts, droughts and some of Pip's supply news. */
function StreetWire({ items }: { items: WireItemDto[] }) {
  return (
    <Panel title="Street wire" aside="Last 24 hours">
      {items.length ? (
        <ul className="se-streetwire">
          {items.slice(0, WIRE_SHOWN).map((item) => {
            const live = item.endsAt !== null && new Date(item.endsAt).getTime() > Date.now();
            const tone = item.kind === 'GLUT' || item.supply === 'PLENTIFUL' ? 'good' : item.kind === 'DROUGHT' || item.supply === 'OUT' ? 'warn' : '';
            return (
              <li key={`${item.at}-${item.city}-${item.product}-${item.kind}`} className={`se-streetwire__item${tone ? ` se-streetwire__item--${tone}` : ''}`}>
                <span className="se-streetwire__when se-muted">{agoText(item.at)}{live ? ' · still on' : ''}</span>
                <span>{item.text}</span>
              </li>
            );
          })}
        </ul>
      ) : <p className="se-hint">Quiet out there. Nothing worth a phone call in the last day.</p>}
      <p className="se-hint">The street hears about every glut and drought, and some of Pip&rsquo;s shortages. Not all of them.</p>
    </Panel>
  );
}

/**
 * 0.5.0-B. Travel: the run (loading one up, or where it is and what it holds), what
 * the last one brought home, and the map with what the crew knows about each city.
 */
export function TravelPage() {
  const me = useSession((s) => s.me);
  const [data, setData] = useState<TravelDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();

  const load = useCallback(() => {
    api.get<TravelDto>('/game/travel')
      .then((next) => { setData(next); setError(null); })
      .catch(() => setError('Could not load the map. Try again.'));
  }, []);
  useEffect(load, [load, me?.id]);

  if (!me) return <Navigate to="/join" replace />;
  const home = data?.cities.find((city) => city.isHome);
  const selected = data?.cities.find((city) => city.slug === params.get('city')) ?? home ?? data?.cities[0];
  const select = (slug: string) => setParams(slug === home?.slug ? {} : { city: slug }, { replace: true });
  const run = data?.run ?? null;
  const runAt = run ? (run.position.road ?? { city: run.position.city }) : null;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Travel</h1>
          <p className="se-eyebrow">
            {!home ? 'The map'
              : run ? (run.position.phase === 'town' ? `Your run is in ${run.position.cityName}` : `Your run is on the road`)
                : data?.runsEnabled ? `Home is ${home.name}. Load up and go.` : `Home is ${home.name}.`}
          </p>
        </div>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {!data && !error ? <p className="se-muted" role="status">Unfolding the map...</p> : null}
      {data && !data.enabled ? (
        <Panel title="One city">
          <p className="se-dim">This round is played in one city. Travel belongs to rounds on the 0.5.0 rules.</p>
        </Panel>
      ) : null}

      {data?.enabled && selected && home ? (
        <div className="se-grid">
          {data.runsEnabled ? (
            <div className="se-grid se-grid--2 se-cities">
              {run
                ? <RunPanel key={run.id} run={run} data={data} onDone={load} />
                : <LaunchPanel data={data} to={selected.isHome ? '' : selected.slug} onPick={select} onDone={load} />}
              {data.lastRun && !run ? <ReceiptPanel receipt={data.lastRun} products={data.products} /> : null}
            </div>
          ) : null}
          <div className="se-grid se-grid--2 se-cities">
            <Panel title="The roads" flush>
              <RoadMap data={data} selected={selected.slug} onSelect={select} runAt={runAt} />
              <nav className="se-citypicker" aria-label="Pick a city">
                {data.cities.map((city) => (
                  <button key={city.slug} type="button" onClick={() => select(city.slug)}
                    className={`se-citypicker__city${city.slug === selected.slug ? ' se-citypicker__city--on' : ''}`}
                    aria-pressed={city.slug === selected.slug}>
                    {SHORT_CITY[city.slug] ?? city.name}
                  </button>
                ))}
              </nav>
            </Panel>
            <CityDetail city={selected} products={data.products} home={home.name} />
          </div>
          {data.runsEnabled && data.rules.market ? <StreetWire items={data.wire} /> : null}
        </div>
      ) : null}
    </GameLayout>
  );
}
