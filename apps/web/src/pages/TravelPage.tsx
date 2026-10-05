import { useCallback, useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { formatCents, formatNumber, type TravelDto, type WireItemDto } from '@streets/shared';
import { api } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { CityDetail, RoadMap, SHORT_CITY, agoText } from '../components/CityMap.js';
import { Panel } from '../components/Panel.js';
import { ConvoysPanel } from '../components/ConvoysPanel.js';
import { MovePanel } from '../components/MovePanel.js';
import { TripPanel } from '../components/TripPanel.js';
import { BossPresencePanel } from '../components/BossPresencePanel.js';
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

type TravelTab = 'runs' | 'trip' | 'convoys' | 'move' | 'market';

/**
 * 0.5.0-B, reworked for 1.4: the map is the page. Pick a city on it (its intel
 * sits beside the map), then act on it from one tab at a time: runs, the
 * boss's trip, convoys, moving house, or the market wire. Anything urgent on
 * the road is pinned above the map.
 */
export function TravelPage() {
  const me = useSession((s) => s.me);
  const [data, setData] = useState<TravelDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cityOpen, setCityOpen] = useState(false);
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
  const runs = data?.runs ?? (data?.run ? [data.run] : []);
  const urgent = me.convoyAlert;
  const runAts = runs.map((active) => active.position.road ?? { city: active.position.city });
  const runLimit = data?.rules.runLimit ?? 0;
  const openRunSlots = Math.max(0, runLimit - runs.length);
  const bossAway = Boolean(data?.trips?.trip);

  const tabs: Array<{ key: TravelTab; label: string; badge?: string; alert?: boolean }> = data?.enabled ? [
    ...(data.runsEnabled ? [{ key: 'runs' as const, label: 'Runs', badge: `${formatNumber(runs.length)}/${formatNumber(runLimit)}` }] : []),
    ...(data.trips ? [{ key: 'trip' as const, label: bossAway ? 'Boss away' : 'Boss trip', alert: bossAway }] : []),
    ...(data.runsEnabled ? [{ key: 'convoys' as const, label: 'Convoys', alert: Boolean(urgent) }] : []),
    ...(data.relocation ? [{ key: 'move' as const, label: 'Move house', alert: Boolean(me.moving) }] : []),
    { key: 'market' as const, label: 'Market' },
  ] : [];
  const requested = params.get('tab') as TravelTab | null;
  const fallback: TravelTab | undefined = urgent && tabs.some((tab) => tab.key === 'convoys')
    ? 'convoys'
    : runs.length && tabs.some((tab) => tab.key === 'runs')
      ? 'runs'
      : bossAway ? 'trip' : tabs[0]?.key;
  const tab = tabs.some((candidate) => candidate.key === requested) ? requested! : fallback;

  const setParam = (key: 'city' | 'tab', value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };
  const select = (slug: string) => setParam('city', slug === home?.slug ? null : slug);

  const selectedKnown = Boolean(selected?.counter);
  const selectedDistance = selected?.isHome
    ? 'Home'
    : selected?.gameMinutes !== null && selected?.gameMinutes !== undefined
      ? `${formatNumber(Math.round(selected.gameMinutes))} min away`
      : 'Distance unknown';

  return (
    <GameLayout>
      <div className="se-travel">
        <header className="se-travel-head">
          <div>
            <span className="se-eyebrow">Road operations · home in {home?.name ?? me.city.name}</span>
            <h1>Travel</h1>
          </div>
          {data?.enabled ? (
            <dl className="se-travel-head__stats">
              <div><dt>Turns home</dt><dd>{formatNumber(data.home.turns)}</dd></div>
              <div><dt>Low-Riders</dt><dd>{formatNumber(data.home.lowRiders)}</dd></div>
              <div><dt>Cash home</dt><dd>{formatCents(data.home.cashCents)}</dd></div>
            </dl>
          ) : null}
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
            {urgent ? (
              <div className={`se-travel-alert se-travel-alert--${urgent.kind === 'tailed' ? 'bad' : 'warn'}`} role="alert">
                <strong>{urgent.kind === 'tailed' ? `Your run is being tailed near ${urgent.cityName}` : `An ally needs backup in ${urgent.cityName}`}</strong>
                <button type="button" className="se-btn se-btn--sm" onClick={() => setParam('tab', 'convoys')}>Respond</button>
              </div>
            ) : null}

            <section className="se-travel-deck" aria-label="Road map">
              <div className="se-travel-deck__map">
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
              </div>
              <aside className={`se-travel-deck__city${cityOpen ? ' is-open' : ''}`} id="travel-city-intel">
                <CityDetail city={selected} products={data.products} home={home.name} />
              </aside>
            </section>

            <div className="se-travel-cityline">
              <strong>{selected.name}</strong>
              <span>{selectedDistance}</span>
              <span className={selectedKnown ? 'se-good' : 'se-muted'}>{selectedKnown ? 'Market known' : 'Market unseen'}</span>
              {data.runsEnabled ? <span>{formatNumber(openRunSlots)} run slot{openRunSlots === 1 ? '' : 's'} open</span> : null}
              <button
                type="button"
                className="se-travel-cityline__toggle"
                aria-expanded={cityOpen}
                aria-controls="travel-city-intel"
                onClick={() => setCityOpen((open) => !open)}
              >
                {cityOpen ? 'Hide city intel' : 'City intel'}
              </button>
            </div>

            <nav className="se-travel-tabs" role="tablist" aria-label="Travel">
              {tabs.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === entry.key}
                  className={`se-travel-tabs__tab${tab === entry.key ? ' is-active' : ''}${entry.alert ? ' has-alert' : ''}`}
                  onClick={() => setParam('tab', entry.key)}
                >
                  {entry.label}
                  {entry.badge ? <small>{entry.badge}</small> : null}
                </button>
              ))}
            </nav>

            <section className="se-travel-tabpanel" role="tabpanel">
              {tab === 'runs' ? (
                <>
                  {runs.length ? (
                    <div className="se-travel-runs">
                      {runs.map((active) => (
                        <div className="se-travel-run" key={active.id}>
                          <RunPanel run={active} data={data} onDone={load} />
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {runs.length < runLimit ? (
                    <LaunchPanel data={data} to={selected.isHome ? '' : selected.slug} onPick={select} onDone={load} />
                  ) : (
                    <Panel title="Run limit reached" className="se-travel-panel">
                      <p className="se-dim">Every run slot is in use. Bring a crew home before sending another one out.</p>
                    </Panel>
                  )}
                  {!runs.length && data.lastRun ? <ReceiptPanel receipt={data.lastRun} products={data.products} /> : null}
                </>
              ) : null}

              {tab === 'trip' ? (
                <>
                  <p className="se-travel-tabpanel__lede">The boss travels in person. Home keeps working while the lieutenant runs it.</p>
                  <TripPanel data={data} selected={selected.slug} onDone={load} />
                  <BossPresencePanel data={data} onDone={load} />
                </>
              ) : null}

              {tab === 'convoys' ? <ConvoysPanel products={data.products} refreshKey={data} /> : null}

              {tab === 'move' && data.relocation ? <MovePanel data={data} selected={selected.slug} onDone={load} /> : null}

              {tab === 'market' ? (
                <div className="se-travel-market">
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
                  {runs.length > 0 && data.lastRun ? <ReceiptPanel receipt={data.lastRun} products={data.products} /> : null}
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </GameLayout>
  );
}
