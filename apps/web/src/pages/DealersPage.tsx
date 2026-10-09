import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DealerCrewDto, DealerCrewEstablishInput, DealerPageDto, DemandWordDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { dealersApi } from '../api/dealers.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Row } from '../components/Panel.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import '../styles/supply.css';

/**
 * 1.6.0-E. Dealer crews: post thugs in a district where you have a foothold, give them one
 * product from storage in that city and a price, and see what they would sell.
 */

const DEMAND_WORDS: Record<DemandWordDto, string> = { STRONG: 'Strong demand', STEADY: 'Steady demand', MODEST: 'Modest demand', THIN: 'Thin demand' };
/** Dealer prices are retail: they show the cents. */
const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const money = (cents: number) => `${cents < 0 ? '-' : ''}$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
const trafficWord = (traffic: number) => (traffic >= 1.2 ? 'busy' : traffic >= 1 ? 'ordinary' : traffic >= 0.85 ? 'quiet' : 'slow');

function whole(value: string): number | '' {
  if (value === '') return '';
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : '';
}

function hoursText(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  return `${(hours / 24).toFixed(1)} days`;
}

function EstablishPanel({ data, onDone }: { data: DealerPageDto; onDone: () => void }) {
  const action = useGameAction<unknown>();
  const rules = data.rules!;
  const [citySlug, setCitySlug] = useState(data.cities[0]?.citySlug ?? '');
  const city = data.cities.find((entry) => entry.citySlug === citySlug) ?? data.cities[0] ?? null;
  const open = city?.districts.filter((district) => !district.taken) ?? [];
  const [districtKey, setDistrictKey] = useState('');
  const district = open.find((entry) => entry.key === districtKey) ?? open[0] ?? null;
  const [count, setCount] = useState<number | ''>(Math.min(2, rules.maxDealersPerCrew));
  const dealers = typeof count === 'number' ? count : 0;
  const most = Math.min(rules.maxDealersPerCrew, data.fitThugs);
  const returning = data.careers.slice(0, dealers);
  const block = action.busy ? 'Setting up.'
    : data.crews.length >= rules.maxCrews ? `You run ${rules.maxCrews} crews, the most allowed.`
      : !city ? 'You need a foothold: home, or a city with a paid-up safehouse.'
        : !district ? 'You already have a crew in every district there.'
          : dealers < 1 ? 'Post at least one dealer.'
            : dealers > rules.maxDealersPerCrew ? `A crew takes at most ${rules.maxDealersPerCrew} dealers.`
              : dealers > data.fitThugs ? `You have ${data.fitThugs} fit thugs at home.`
                : data.turns < rules.setupTurns ? `Setting up costs ${rules.setupTurns} turns.`
                  : null;

  return (
    <Panel title="Set up a crew" aside={`${data.crews.length}/${rules.maxCrews} crews`}>
      {action.error ? <Alert>{action.error}</Alert> : null}
      <div className="se-supply__form">
        <div className="se-field">
          <label htmlFor="crew-city">City</label>
          <select id="crew-city" className="se-input" value={city?.citySlug ?? ''} onChange={(event) => setCitySlug(event.target.value)}>
            {data.cities.map((entry) => <option key={entry.citySlug} value={entry.citySlug}>{entry.cityName}{entry.isHome ? ' (home)' : ''}</option>)}
          </select>
          <small className="se-muted">Crews work where you have a foothold: home, or a city with a paid-up <Link className="se-golink" to="/game/supply">safehouse</Link>.</small>
        </div>
        <div className="se-field">
          <label htmlFor="crew-district">District</label>
          <select id="crew-district" className="se-input" value={district?.key ?? ''} onChange={(event) => setDistrictKey(event.target.value)}>
            {open.map((entry) => <option key={entry.key} value={entry.key}>{entry.name} · {trafficWord(entry.traffic)} foot traffic</option>)}
          </select>
        </div>
        <div className="se-field">
          <label htmlFor="crew-dealers">Dealers <span className="se-muted">of {most}</span></label>
          <input id="crew-dealers" className="se-input" type="number" inputMode="numeric" min={1} max={most} value={count} onChange={(event) => setCount(whole(event.target.value))} />
          <small className="se-muted">
            Each carries {formatNumber(rules.unitsPerDealer)} units and costs {money(rules.operatingCentsPerDealerHour)} an hour while the crew works.
            {returning.length ? ` ${returning.length} released dealer${returning.length === 1 ? ' comes' : 's come'} back first, with ${returning.length === 1 ? 'his' : 'their'} experience: ${returning.map((career) => career.tierName).join(', ')}.` : ''}
          </small>
        </div>
        <p className="se-hint">Dealers are thugs from home: they stay yours and count toward your crew, but they do not fight, scout or cook while posted. Setting up costs {rules.setupTurns} turns.</p>
        <Button className="se-btn se-btn--primary se-btn--block" disabledReason={block}
          onClick={async () => {
            await action.run((actionId) => dealersApi.establish({ citySlug: city!.citySlug, districtKey: district!.key as DealerCrewEstablishInput['districtKey'], dealers, actionId }));
            onDone();
          }}>
          Set up {dealers} dealer{dealers === 1 ? '' : 's'}{district ? ` in ${district.name}` : ''} · {rules.setupTurns} turns
        </Button>
      </div>
    </Panel>
  );
}

function CrewCard({ crew, data, onDone }: { crew: DealerCrewDto; data: DealerPageDto; onDone: () => void }) {
  const action = useGameAction<unknown>();
  const rules = data.rules!;
  const [product, setProduct] = useState(crew.productKey ?? crew.products[0]?.key ?? '');
  const chosen = crew.products.find((entry) => entry.key === product) ?? null;
  const switching = product !== crew.productKey;
  const street = chosen?.streetPriceCents ?? 0;
  const [priceText, setPriceText] = useState(((crew.priceCents ?? street) / 100).toFixed(2));
  useEffect(() => { setPriceText(((switching ? street : crew.priceCents ?? street) / 100).toFixed(2)); }, [product, crew.priceCents, street, switching]);
  const priceCents = Math.round(Number(priceText) * 100);
  const minCents = Math.ceil(street * rules.priceRange.min);
  const maxCents = Math.floor(street * rules.priceRange.max);
  const [warehouseId, setWarehouseId] = useState(crew.warehouses[0]?.id ?? '');
  const warehouse = crew.warehouses.find((entry) => entry.id === warehouseId) ?? crew.warehouses[0] ?? null;
  const [units, setUnits] = useState<number | ''>('');
  const quantity = typeof units === 'number' ? units : 0;
  const room = crew.capacityUnits - crew.inventoryUnits;
  const [moveTo, setMoveTo] = useState('');
  const city = data.cities.find((entry) => entry.citySlug === crew.citySlug);
  const moveOptions = city?.districts.filter((entry) => !entry.taken) ?? [];
  const paused = crew.status === 'PAUSED';
  const run = async (call: Parameters<typeof action.run>[0]) => { await action.run(call); onDone(); };

  const offerBlock = action.busy ? 'Working.'
    : !chosen ? 'Pick a product.'
      : switching && crew.inventoryUnits > 0 ? 'Return the stock before switching product.'
        : !Number.isFinite(priceCents) || priceCents < minCents || priceCents > maxCents ? `Ask between ${price(minCents)} and ${price(maxCents)}.`
          : !switching && priceCents === crew.priceCents ? 'That is the price already.'
            : null;
  const loadBlock = action.busy ? 'Working.' : !crew.productKey ? 'Pick what the crew sells first.' : !warehouse ? 'No storage in this city.'
    : quantity < 1 ? 'Enter units.' : quantity > room ? `The crew can hold ${formatNumber(room)} more.` : quantity > warehouse.available ? `${warehouse.name} holds ${formatNumber(warehouse.available)}.` : null;
  const returnBlock = action.busy ? 'Working.' : !warehouse ? 'No storage in this city.'
    : quantity < 1 ? 'Enter units.' : quantity > crew.inventoryUnits ? `The crew holds ${formatNumber(crew.inventoryUnits)}.` : quantity > warehouse.roomUnits ? `${warehouse.name} has room for ${formatNumber(warehouse.roomUnits)}.` : null;

  return (
    <Panel title={`${crew.districtName} · ${crew.cityName}`} aside={paused ? 'Paused' : 'Working'}>
      {action.error ? <Alert>{action.error}</Alert> : null}
      {!crew.foothold ? <Alert tone="warning">The safehouse this crew relies on is gone or behind on upkeep.</Alert> : null}
      <div className="se-dealers__crew">
        <div className="se-rows">
          <Row label="Selling" value={crew.productName ? `${crew.productName} at ${price(crew.priceCents ?? 0)}` : 'Nothing yet'} strong />
          {crew.demand ? <Row label="The street" value={`${DEMAND_WORDS[crew.demand]} · ${trafficWord(crew.traffic)} foot traffic · street price ${price(crew.streetPriceCents ?? 0)}`} /> : null}
          <Row label="Holding" value={`${formatNumber(crew.inventoryUnits)} of ${formatNumber(crew.capacityUnits)}`} />
          <Row label="Would sell" value={crew.pace.unitsPerHour > 0 ? `${crew.pace.unitsPerHour.toFixed(1)} an hour · out in ${hoursText(crew.pace.hoursToSellOut ?? 0)}` : paused ? 'Nothing: paused' : 'Nothing: needs a product, a price and stock'} />
          <Row label="An hour" tooltip="Gross at this price, less the dealers' cut and wages. Sales and payouts open in the next update."
            value={`${money(crew.pace.grossCentsPerHour)} gross · ${crew.pace.cutPercent.toFixed(0)}% cut · ${money(crew.pace.operatingCentsPerHour)} wages · ${money(crew.pace.netCentsPerHour)} net`} />
        </div>

        <h3 className="se-city__heading">Dealers</h3>
        <ul className="se-dealers__staff">
          {crew.dealers.map((dealer) => (
            <li key={dealer.id}>
              <span><strong>{dealer.tierName}</strong> · {formatNumber(dealer.experiencePoints)} xp{dealer.nextTierAt ? ` of ${formatNumber(dealer.nextTierAt)}` : ''} · {dealer.cutPercent}% cut</span>
              <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={action.busy} onClick={() => void run((actionId) => dealersApi.releaseDealer(dealer.id, actionId))}>Release</button>
            </li>
          ))}
        </ul>
        <Button className="se-btn se-btn--sm" disabledReason={action.busy ? 'Working.' : crew.dealers.length >= rules.maxDealersPerCrew ? `A crew takes at most ${rules.maxDealersPerCrew}.` : data.fitThugs < 1 ? 'No fit thugs at home.' : null}
          onClick={() => void run((actionId) => dealersApi.addDealer(crew.id, actionId, data.careers[0]?.id))}>
          Add a dealer{data.careers[0] ? ` (${data.careers[0].tierName} comes back)` : ''}
        </Button>

        <h3 className="se-city__heading">Offering</h3>
        <div className="se-launch__grid">
          <div className="se-field">
            <label htmlFor={`crew-product-${crew.id}`}>Product</label>
            <select id={`crew-product-${crew.id}`} className="se-input" value={product} onChange={(event) => setProduct(event.target.value)}>
              {crew.products.map((entry) => <option key={entry.key} value={entry.key}>{entry.name} · {DEMAND_WORDS[entry.demand].toLowerCase()} · {formatNumber(entry.stored)} stored here</option>)}
            </select>
          </div>
          <div className="se-field">
            <label htmlFor={`crew-price-${crew.id}`}>Price a unit</label>
            <input id={`crew-price-${crew.id}`} className="se-input" type="number" inputMode="decimal" step="0.01" min={minCents / 100} max={maxCents / 100} value={priceText} onChange={(event) => setPriceText(event.target.value)} />
            {chosen ? <small className="se-muted">Street {price(street)} · {price(minCents)}–{price(maxCents)}. Higher sells slower; lower sells faster.</small> : null}
          </div>
        </div>
        <Button className="se-btn se-btn--sm" disabledReason={offerBlock}
          onClick={() => void run((actionId) => dealersApi.offer(crew.id, { productKey: product, priceCents, actionId }))}>
          {switching ? `Sell ${chosen?.name ?? ''}` : 'Set price'}
        </Button>

        <h3 className="se-city__heading">Stock</h3>
        {crew.warehouses.length === 0 ? <p className="se-hint">No storage in {crew.cityName}. Deliver a pickup to a warehouse here first.</p> : (
          <>
            <div className="se-launch__grid">
              <div className="se-field">
                <label htmlFor={`crew-warehouse-${crew.id}`}>Storage</label>
                <select id={`crew-warehouse-${crew.id}`} className="se-input" value={warehouse?.id ?? ''} onChange={(event) => setWarehouseId(event.target.value)}>
                  {crew.warehouses.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {formatNumber(entry.available)} {crew.productName ?? ''}</option>)}
                </select>
              </div>
              <div className="se-field">
                <label htmlFor={`crew-units-${crew.id}`}>Units</label>
                <input id={`crew-units-${crew.id}`} className="se-input" type="number" inputMode="numeric" min={1} value={units} onChange={(event) => setUnits(whole(event.target.value))} />
              </div>
            </div>
            <div className="se-actions-row">
              <Button className="se-btn se-btn--sm" disabledReason={loadBlock} onClick={() => void run((actionId) => dealersApi.stock(crew.id, { warehouseId: warehouse!.id, direction: 'LOAD', quantity, actionId }))}>Load</Button>
              <Button className="se-btn se-btn--ghost se-btn--sm" disabledReason={returnBlock} onClick={() => void run((actionId) => dealersApi.stock(crew.id, { warehouseId: warehouse!.id, direction: 'RETURN', quantity, actionId }))}>Return</Button>
            </div>
          </>
        )}

        <h3 className="se-city__heading">Crew</h3>
        <div className="se-actions-row">
          <Button className="se-btn se-btn--sm" disabledReason={action.busy ? 'Working.' : null}
            onClick={() => void run((actionId) => dealersApi.manage(crew.id, { action: paused ? 'RESUME' : 'PAUSE', actionId }))}>
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button className="se-btn se-btn--ghost se-btn--sm" disabledReason={action.busy ? 'Working.' : crew.inventoryUnits > 0 ? 'Return its stock first.' : null}
            onClick={() => void run((actionId) => dealersApi.manage(crew.id, { action: 'CLOSE', actionId }))}>
            Close crew
          </Button>
        </div>
        {paused ? (
          <div className="se-launch__grid se-mt">
            <div className="se-field">
              <label htmlFor={`crew-move-${crew.id}`}>Move to</label>
              <select id={`crew-move-${crew.id}`} className="se-input" value={moveTo || moveOptions[0]?.key || ''} onChange={(event) => setMoveTo(event.target.value)}>
                {moveOptions.map((entry) => <option key={entry.key} value={entry.key}>{entry.name} · {trafficWord(entry.traffic)}</option>)}
              </select>
            </div>
            <Button className="se-btn se-btn--sm" disabledReason={action.busy ? 'Working.' : !moveOptions.length ? 'No free district.' : data.turns < rules.setupTurns ? `Moving costs ${rules.setupTurns} turns.` : null}
              onClick={() => void run((actionId) => dealersApi.manage(crew.id, { action: 'MOVE', districtKey: (moveTo || moveOptions[0]!.key) as DealerCrewEstablishInput['districtKey'], actionId }))}>
              Move · {rules.setupTurns} turns
            </Button>
          </div>
        ) : <p className="se-hint">Pause the crew to move it to another district. A paused crew neither sells nor costs wages.</p>}
      </div>
    </Panel>
  );
}

export function DealersPage() {
  const me = useSession((state) => state.me);
  const [data, setData] = useState<DealerPageDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const load = useCallback(() => {
    let active = true;
    dealersApi.page()
      .then((next) => { if (active) { setData(next); setError(null); } })
      .catch((caught: unknown) => { if (active) setError(caught instanceof ApiError ? caught.message : 'Could not load your crews. Try again.'); });
    return () => { active = false; };
  }, []);
  useEffect(load, [load, reload, me?.id]);
  const done = () => setReload((value) => value + 1);

  return (
    <GameLayout>
      <div className="se-supply">
        <header className="se-supply__hero">
          <span className="se-eyebrow">Supply network</span>
          <h1>Dealer Crews</h1>
          <p>Post dealers in a district where you have a foothold, stock them from storage in that city, and set the price. Sales and payouts open in the next update; until then crews hold stock and show what they would sell.</p>
        </header>
        {error ? <Alert>{error}</Alert> : null}
        {data && !data.enabled ? <Alert tone="info">Dealer crews are not available in this season.</Alert> : null}
        {data?.enabled && data.rules ? (
          <div className="se-supply__grid">
            <EstablishPanel data={data} onDone={done} />
            <Panel title="Your dealers" aside={`${formatNumber(data.dealerThugs)} posted · ${formatNumber(data.fitThugs)} fit at home`}>
              <div className="se-rows">
                {data.rules.tiers.map((tier) => (
                  <Row key={tier.key} label={tier.name} value={`${formatNumber(tier.minExperience)}+ xp · ${tier.cutPercent}% cut · ${tier.paceBonus ? `+${Math.round(tier.paceBonus * 100)}% pace` : 'base pace'}`} />
                ))}
              </div>
              <p className="se-hint">Dealers earn experience from what they sell. Released dealers keep it and come back first when a crew needs hands{data.careers.length ? `: ${data.careers.length} waiting` : ''}.</p>
            </Panel>
            {data.crews.map((crew) => <CrewCard key={crew.id} crew={crew} data={data} onDone={done} />)}
          </div>
        ) : null}
      </div>
    </GameLayout>
  );
}
