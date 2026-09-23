import { useCallback, useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { formatCents, formatNumber, type TravelDto, type WireItemDto } from '@streets/shared';
import { api } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { CityDetail, RoadMap, SHORT_CITY, agoText } from '../components/CityMap.js';
import { Panel } from '../components/Panel.js';
import { ConvoysPanel } from '../components/ConvoysPanel.js';
import { MovePanel } from '../components/MovePanel.js';
import { LaunchPanel, ReceiptPanel, RunPanel } from '../components/RunPanels.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

const WIRE_SHOWN = 8;

function TravelMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'good' | 'warn' | 'accent';
}) {
  return (
    <div className={`se-travel-metric${tone ? ` se-travel-metric--${tone}` : ''}`}>
      <span className="se-travel-metric__label">{label}</span>
      <strong className="se-travel-metric__value">{value}</strong>
      {detail ? <span className="se-travel-metric__detail">{detail}</span> : null}
    </div>
  );
}

/** 0.5.0-C. What the street heard in the last day, newest first: gluts, droughts and some of Pip's supply news. */
function StreetWire({ items }: { items: WireItemDto[] }) {
  return (
    <Panel title="Street wire" aside="Last 24 hours" className="se-travel-panel">
      {items.length ? (
        <ul className="se-streetwire">
          {items.slice(0, WIRE_SHOWN).map((item) => {
            const live = item.endsAt !== null && new Date(item.endsAt).getTime() > Date.now();
            const tone = item.kind === 'GLUT' || item.supply === 'PLENTIFUL'
              ? 'good'
              : item.kind === 'DROUGHT' || item.kind === 'CRACKDOWN' || item.supply === 'OUT'
                ? 'warn'
                : '';
            return (
              <li key={`${item.at}-${item.city}-${item.product}-${item.kind}`} className={`se-streetwire__item${tone ? ` se-streetwire__item--${tone}` : ''}`}>
                <span className="se-streetwire__when se-muted">{agoText(item.at)}{live ? ' · still on' : ''}</span>
                <span>{item.text}</span>
              </li>
            );
          })}
        </ul>
      ) : <p className="se-hint">Quiet out there. Nothing worth a phone call in the last day.</p>}
      <p className="se-hint">The street hears about gluts, droughts, some of Pip&rsquo;s shortages, turf changing hands and Federal sweep warnings.</p>
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
  const runs = data?.runs ?? (data?.run ? [data.run] : []);
  const urgent = Boolean(me.convoyAlert);
  const runAts = runs.map((active) => active.position.road ?? { city: active.position.city });
  const runLimit = data?.rules.runLimit ?? 0;
  const openRunSlots = Math.max(0, runLimit - runs.length);
  const selectedKnown = Boolean(selected?.counter);
  const selectedDistance = selected?.isHome
    ? 'Home'
    : selected?.gameMinutes !== null && selected?.gameMinutes !== undefined
      ? `${formatNumber(Math.round(selected.gameMinutes))} min`
      : 'Unknown';

  return (
    <GameLayout>
      <div className="se-travel">
        <header className="se-travel-hero">
          <div className="se-travel-hero__copy">
            <span className="se-eyebrow">Road operations · {home?.name ?? me.city.name}</span>
            <h1>Travel</h1>
            <p>
              Read the road network, pick a market, load the cars, and keep tabs on every crew you have moving between cities.
            </p>
          </div>

          <div className="se-travel-hero__readout">
            <span>
              <small>Turns home</small>
              <strong>{data ? formatNumber(data.home.turns) : '—'}</strong>
            </span>
            <span>
              <small>Active runs</small>
              <strong>{data ? `${formatNumber(runs.length)} / ${formatNumber(runLimit)}` : '—'}</strong>
            </span>
            <span>
              <small>Low-Riders</small>
              <strong>{data ? formatNumber(data.home.lowRiders) : '—'}</strong>
            </span>
            <span>
              <small>Road alert</small>
              <strong>{urgent ? 'Attention' : 'Clear'}</strong>
            </span>
          </div>
        </header>

        {error ? <Alert>{error}</Alert> : null}
        {!data && !error ? <div className="se-travel-loading" role="status">Unfolding the map...</div> : null}

        {data && !data.enabled ? (
          <Panel title="One city" className="se-travel-panel">
            <p className="se-dim">This round is played in one city. Travel belongs to rounds on the 0.5.0 rules.</p>
          </Panel>
        ) : null}

        {data?.enabled && selected && home ? (
          <>
            {data.runsEnabled && urgent ? (
              <section className="se-travel-alerts">
                <div className="se-travel-sectionhead">
                  <div>
                    <span className="se-eyebrow">Road alert</span>
                    <h2>Convoy attention</h2>
                  </div>
                  <span className="se-travel-sectionhead__meta">Action may be waiting</span>
                </div>
                <ConvoysPanel products={data.products} refreshKey={data} />
              </section>
            ) : null}

            {data.runsEnabled && runs.length ? (
              <section className="se-travel-section">
                <div className="se-travel-sectionhead">
                  <div>
                    <span className="se-eyebrow">Crews on the road</span>
                    <h2>Active runs</h2>
                  </div>
                  <p>{formatNumber(runs.length)} active · {formatNumber(openRunSlots)} slot{openRunSlots === 1 ? '' : 's'} open</p>
                </div>

                <div className="se-travel-runs">
                  {runs.map((active) => (
                    <div className="se-travel-run" key={active.id}>
                      <RunPanel run={active} data={data} onDone={load} />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="se-travel-section">
              <div className="se-travel-sectionhead">
                <div>
                  <span className="se-eyebrow">Route board</span>
                  <h2>Plan the next move</h2>
                </div>
                <p>Select a city on the map first. The destination, route options, cargo, and city intel stay tied together.</p>
              </div>

              <div className="se-travel-routeboard">
                <div className="se-travel-routeboard__main">
                  <Panel title="The roads" aside={`${formatNumber(data.cities.length)} cities`} flush className="se-travel-panel se-travel-map">
                    <RoadMap data={data} selected={selected.slug} onSelect={select} runAts={runAts} />
                    <nav className="se-citypicker" aria-label="Pick a city">
                      {data.cities.map((city) => (
                        <button
                          key={city.slug}
                          type="button"
                          onClick={() => select(city.slug)}
                          className={`se-citypicker__city${city.slug === selected.slug ? ' se-citypicker__city--on' : ''}`}
                          aria-pressed={city.slug === selected.slug}
                        >
                          {SHORT_CITY[city.slug] ?? city.name}
                        </button>
                      ))}
                    </nav>
                  </Panel>

                  <div className="se-travel-destinationbar">
                    <TravelMetric
                      label="Selected"
                      value={selected.name}
                      detail={selected.isHome ? 'your home city' : 'destination'}
                      tone="accent"
                    />
                    <TravelMetric
                      label="From home"
                      value={selectedDistance}
                      detail={selected.isHome ? 'already here' : 'shortest known trip'}
                    />
                    <TravelMetric
                      label="Market read"
                      value={selectedKnown ? 'Known' : 'Unseen'}
                      detail={selectedKnown ? 'crew has price intel' : 'visit to reveal prices'}
                      tone={selectedKnown ? 'good' : 'warn'}
                    />
                    <TravelMetric
                      label="Run slots"
                      value={formatNumber(openRunSlots)}
                      detail={openRunSlots === 1 ? 'slot open' : 'slots open'}
                      tone={openRunSlots > 0 ? 'good' : 'warn'}
                    />
                  </div>

                  {data.runsEnabled && runs.length < data.rules.runLimit ? (
                    <div className="se-travel-launch">
                      <LaunchPanel data={data} to={selected.isHome ? '' : selected.slug} onPick={select} onDone={load} />
                    </div>
                  ) : data.runsEnabled ? (
                    <Panel title="Run limit reached" className="se-travel-panel">
                      <p className="se-dim">
                        Every run slot is in use. Bring a crew home before sending another one out.
                      </p>
                    </Panel>
                  ) : null}

                  {!runs.length && data.lastRun ? (
                    <div className="se-travel-lastreceipt">
                      <ReceiptPanel receipt={data.lastRun} products={data.products} />
                    </div>
                  ) : null}
                </div>

                <aside className="se-travel-routeboard__intel">
                  <CityDetail city={selected} products={data.products} home={home.name} />
                </aside>
              </div>
            </section>

            {data.runsEnabled && !urgent ? (
              <section className="se-travel-section">
                <div className="se-travel-sectionhead">
                  <div>
                    <span className="se-eyebrow">Road security</span>
                    <h2>Convoys</h2>
                  </div>
                  <p>Recon traffic, watch your own runs, and respond to tails from the same road board.</p>
                </div>
                <ConvoysPanel products={data.products} refreshKey={data} />
              </section>
            ) : null}

            {(data.relocation || (data.runsEnabled && data.rules.market) || (runs.length > 0 && data.lastRun)) ? (
              <section className="se-travel-section">
                <div className="se-travel-sectionhead">
                  <div>
                    <span className="se-eyebrow">Operations</span>
                    <h2>Home & market desk</h2>
                  </div>
                  <p>Long-term relocation, recent market chatter, and the latest completed run stay separate from route planning.</p>
                </div>

                <div className="se-travel-opsgrid">
                  <div className="se-travel-stack">
                    {data.relocation ? <MovePanel data={data} selected={selected.slug} onDone={load} /> : null}
                    {runs.length > 0 && data.lastRun ? <ReceiptPanel receipt={data.lastRun} products={data.products} /> : null}
                  </div>
                  <div className="se-travel-stack">
                    {data.runsEnabled && data.rules.market ? <StreetWire items={data.wire} /> : null}
                    <Panel title="Home road assets" className="se-travel-panel">
                      <div className="se-travel-assets">
                        <TravelMetric label="Cash" value={formatCents(data.home.cashCents)} detail="available at home" />
                        <TravelMetric label="Fit thugs" value={formatNumber(data.home.fitThugs)} detail="possible escorts" />
                        <TravelMetric label="Beer" value={formatNumber(data.home.beer)} detail="can ride in cargo" />
                        <TravelMetric
                          label="Cargo per car"
                          value={formatNumber(data.rules.cargoPerLowRider)}
                          detail={`${formatNumber(data.rules.thugsPerLowRider)} thug seats per car`}
                        />
                      </div>
                    </Panel>
                  </div>
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </GameLayout>
  );
}
