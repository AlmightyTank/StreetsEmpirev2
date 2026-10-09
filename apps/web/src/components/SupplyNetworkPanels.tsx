import { useRef, useState } from 'react';
import type { SupplyHistoryItemDto, SupplyLedgerDto, SupplyPickupPlanningDto, SupplyShipmentResult, SupplyVehicleClassId } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { supplyApi } from '../api/supply.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { newActionId } from '../utils/actionId.js';
import { formatWeekdayTime } from '../utils/time.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { minutesText } from './CityMap.js';
import { Panel, Row } from './Panel.js';
import { RISK_WORDS } from './SupplyPickupPanels.js';

/**
 * 1.6.0-F. Shipping stock between warehouses, and the network's books: what it cost, what
 * it made, where every unit is, and what moved.
 */

const money = (cents: number) => `${cents < 0 ? '-' : ''}$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
const CLASSES: readonly SupplyVehicleClassId[] = ['LOW_RIDER', 'SEDAN', 'VAN'];

function whole(value: string): number | '' {
  if (value === '') return '';
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : '';
}

/** Move stock to storage in another city, by run. */
export function ShipmentPlanner({ plan, onDone }: { plan: SupplyPickupPlanningDto; onDone: () => void }) {
  const action = useGameAction<SupplyShipmentResult>();
  const lanes = plan.shipmentLanes ?? [];
  const sources = plan.storage.filter((entry) => lanes.some((lane) => lane.from === entry.key));
  const [fromKey, setFromKey] = useState(sources[0]?.key ?? '');
  const source = sources.find((entry) => entry.key === fromKey) ?? sources[0] ?? null;
  const targets = lanes.filter((lane) => lane.from === source?.key);
  const [toKey, setToKey] = useState('');
  const lane = targets.find((entry) => entry.to === toKey) ?? targets[0] ?? null;
  const target = plan.storage.find((entry) => entry.key === lane?.to) ?? null;
  const [productKey, setProductKey] = useState('');
  const product = source?.stock.find((entry) => entry.productKey === productKey) ?? source?.stock[0] ?? null;
  const [routeIndex, setRouteIndex] = useState(0);
  const route = lane?.routes.find((entry) => entry.index === routeIndex) ?? lane?.routes[0] ?? null;
  const [vehicles, setVehicles] = useState<Record<SupplyVehicleClassId, number | ''>>({ LOW_RIDER: 0, SEDAN: 0, VAN: 0 });
  const [escorts, setEscorts] = useState<number | ''>(0);
  const [quantity, setQuantity] = useState<number | ''>('');
  const requestKey = useRef(newActionId());
  // A changed form is a new shipment; a retried one keeps its key and is never sent twice.
  const change = (update: () => void) => { requestKey.current = newActionId(); action.clear(); update(); };

  const spec = (classId: SupplyVehicleClassId) => plan.vehicles.find((vehicle) => vehicle.classId === classId);
  const count = (value: number | '') => (typeof value === 'number' ? value : 0);
  const capacity = Math.floor(CLASSES.reduce((sum, classId) => sum + count(vehicles[classId]) * (spec(classId)?.cargoUnits ?? 0), 0) * (1 + plan.cargoShare));
  const seats = CLASSES.reduce((sum, classId) => sum + count(vehicles[classId]) * (spec(classId)?.crewSeats ?? 0), 0);
  const fleet = CLASSES.reduce((sum, classId) => sum + count(vehicles[classId]), 0);
  const units = count(quantity);
  const most = Math.max(0, Math.min(product?.quantity ?? 0, capacity, target?.roomUnits ?? 0));
  const block = action.busy ? 'Sending.'
    : !source || !lane || !target ? 'You need stock in one city and storage that takes deliveries in another.'
      : !product ? 'That storage is empty.'
        : !route ? 'There is no road between them.'
          : fleet < 1 ? 'Choose at least one vehicle.'
            : CLASSES.some((classId) => count(vehicles[classId]) > (spec(classId)?.ready ?? 0)) ? 'You do not have that many vehicles ready at home.'
              : plan.activeRuns >= plan.runLimit ? 'Every run slot is in use.'
                : count(escorts) > Math.min(plan.fitThugs, seats) ? `Send at most ${Math.min(plan.fitThugs, seats)} escorts.`
                  : units < 1 ? 'Enter how many units to ship.'
                    : units > product.quantity ? `Only ${formatNumber(product.quantity)} ${product.productName} stored there.`
                      : units > capacity ? `These vehicles carry ${formatNumber(capacity)} units.`
                        : units > target.roomUnits ? `${formatNumber(units - target.roomUnits)} would not fit at the other end.`
                          : route.turns > plan.turns ? `This shipment costs ${route.turns} turns and you have ${plan.turns}.`
                            : null;

  if (!lanes.length) {
    return (
      <Panel title="Ship between cities">
        <p className="se-muted">Ship stock from one of your cities to storage in another: you need stock stored in one city and a warehouse that takes deliveries in another.</p>
      </Panel>
    );
  }

  return (
    <Panel title="Ship between cities" aside={`${formatNumber(plan.turns)} turns`}>
      {action.error ? <Alert>{action.error}</Alert> : null}
      {action.result ? <Alert tone="info">{action.result.result.replayed ? 'That shipment was already sent.' : `Shipped ${formatNumber(action.result.result.pickup.quantity)} ${action.result.result.pickup.productName} to ${action.result.result.pickup.destinationCityName}; it lands around ${action.result.result.pickup.expectedArrivalAt ? formatWeekdayTime(action.result.result.pickup.expectedArrivalAt) : 'soon'}.`}</Alert> : null}
      <div className="se-supply__form">
        <div className="se-launch__grid">
          <div className="se-field">
            <label htmlFor="ship-from">From</label>
            <select id="ship-from" className="se-input" value={source?.key ?? ''} onChange={(event) => change(() => setFromKey(event.target.value))}>
              {sources.map((entry) => <option key={entry.key} value={entry.key}>{entry.kind === 'STASH' ? entry.name : 'Warehouse'} · {entry.cityName}</option>)}
            </select>
          </div>
          <div className="se-field">
            <label htmlFor="ship-to">To</label>
            <select id="ship-to" className="se-input" value={lane?.to ?? ''} onChange={(event) => change(() => setToKey(event.target.value))}>
              {targets.map((entry) => {
                const place = plan.storage.find((candidate) => candidate.key === entry.to);
                return place ? <option key={entry.to} value={entry.to}>{place.kind === 'STASH' ? place.name : 'Warehouse'} · {place.cityName} · {formatNumber(place.roomUnits)} room</option> : null;
              })}
            </select>
          </div>
          <div className="se-field">
            <label htmlFor="ship-product">Product</label>
            <select id="ship-product" className="se-input" value={product?.productKey ?? ''} onChange={(event) => change(() => setProductKey(event.target.value))}>
              {source?.stock.map((entry) => <option key={entry.productKey} value={entry.productKey}>{entry.productName} · {formatNumber(entry.quantity)}</option>)}
            </select>
          </div>
        </div>
        {lane && lane.routes.length > 1 ? (
          <div className="se-routes" role="radiogroup" aria-label="Route">
            {lane.routes.map((entry) => (
              <label key={entry.index} className={`se-routes__route${entry.index === route?.index ? ' se-routes__route--on' : ''}`}>
                <input type="radio" name="ship-route" checked={entry.index === route?.index} onChange={() => change(() => setRouteIndex(entry.index))} />
                <span className="se-routes__way">{entry.stops.map((stop) => stop.name).join(' → ')}</span>
                <span className="se-routes__meta se-num">{entry.turns} turns · {RISK_WORDS[entry.risk].toLowerCase()}</span>
              </label>
            ))}
          </div>
        ) : null}
        <div className="se-supply__fleet">
          {plan.vehicles.map((vehicle) => (
            <div className="se-field" key={vehicle.classId}>
              <label htmlFor={`ship-${vehicle.classId}`}>{vehicle.name} <span className="se-muted">of {vehicle.ready}</span></label>
              <input id={`ship-${vehicle.classId}`} className="se-input" type="number" inputMode="numeric" min={0} max={vehicle.ready} value={vehicles[vehicle.classId]}
                onChange={(event) => change(() => setVehicles({ ...vehicles, [vehicle.classId]: whole(event.target.value) }))} />
            </div>
          ))}
          <div className="se-field">
            <label htmlFor="ship-escorts">Escorts</label>
            <input id="ship-escorts" className="se-input" type="number" inputMode="numeric" min={0} value={escorts} onChange={(event) => change(() => setEscorts(whole(event.target.value)))} />
          </div>
          <div className="se-field">
            <label htmlFor="ship-units">Units <span className="se-muted">up to {formatNumber(most)}</span></label>
            <input id="ship-units" className="se-input" type="number" inputMode="numeric" min={1} max={most} value={quantity} onChange={(event) => change(() => setQuantity(whole(event.target.value)))} />
          </div>
        </div>
        {route ? (
          <div className="se-supply__quote">
            <Row label="The trip" value={`${route.stops.map((stop) => stop.name).join(' → ')} · ${minutesText(route.roundTripMinutes)}`} />
            <Row label="Lands around" value={formatWeekdayTime(route.stops.length > 2 ? route.arriveAt : route.backAt)} />
            <Row label="The road" value={RISK_WORDS[route.risk]} tooltip="Road stops and convoy hits can take part of the load. What is lost is gone." />
            <Row label="Cost" value={`${route.turns} turns · no cash`} />
            <p>The units leave {source?.kind === 'STASH' ? 'the stash' : 'the warehouse'} now, so nothing else can claim them. Only what arrives is stored.</p>
          </div>
        ) : null}
        <Button className="se-btn se-btn--primary se-btn--block" disabledReason={block}
          onClick={async () => {
            await action.run((actionId) => supplyApi.ship({
              sourceWarehouseId: source!.key, destinationWarehouseId: lane!.to, productKey: product!.productKey, quantity: units,
              vehicleLoadout: { LOW_RIDER: count(vehicles.LOW_RIDER), SEDAN: count(vehicles.SEDAN), VAN: count(vehicles.VAN) },
              escortThugs: count(escorts), route: route!.index, requestKey: requestKey.current, actionId,
            }));
            requestKey.current = newActionId();
            onDone();
          }}>
          Ship {formatNumber(units)} · {route?.turns ?? 0} turns
        </Button>
      </div>
    </Panel>
  );
}

/** What the supply network cost and made this round, and where every unit is. */
export function LedgerPanel({ ledger }: { ledger: SupplyLedgerDto }) {
  const held = ledger.stock.awaitingPickup + ledger.stock.inTransit + ledger.stock.stored + ledger.stock.withCrews;
  return (
    <Panel title="Supply ledger" aside="This round">
      <div className="se-rows">
        <Row label="Sales" value={`${money(ledger.grossSalesCents)} · ${formatNumber(ledger.unitsSold)} units`} />
        <Row label="Dealers' cut" value={money(-ledger.dealerCutCents)} />
        <Row label="Dealer wages" value={money(-ledger.wagesCents)} />
        <Row label="Wholesale orders" value={money(-ledger.wholesaleCents)} />
        <Row label="Properties" value={money(-ledger.propertyCents)} />
        <Row label="Upkeep" value={money(-ledger.upkeepCents)} />
        <Row label="Net" strong value={<span className={ledger.netCents >= 0 ? 'se-good' : 'se-bad'}>{money(ledger.netCents)}</span>}
          tooltip="What sales paid in after the cut, less wages, wholesale, properties and upkeep. Stock still unsold is not counted: it is paid for and not yet earned." />
      </div>
      <h3 className="se-city__heading">Unsold stock <span className="se-num">{formatNumber(held)}</span></h3>
      <div className="se-rows">
        <Row label="Waiting at suppliers" value={formatNumber(ledger.stock.awaitingPickup)} />
        <Row label="On the road" value={formatNumber(ledger.stock.inTransit)} />
        <Row label="In storage" value={formatNumber(ledger.stock.stored)} />
        <Row label="With crews" value={formatNumber(ledger.stock.withCrews)} />
      </div>
    </Panel>
  );
}

/** What moved, newest first. */
export function HistoryPanel({ history }: { history: SupplyHistoryItemDto[] }) {
  return (
    <Panel title="Supply history" className="se-supply__history-panel">
      {history.length === 0 ? <p className="se-muted">Orders, pickups, deliveries, restocks and sales will appear here.</p> : (
        <ul className="se-run__trades">
          {history.map((item, index) => (
            <li key={`${item.at}-${index}`}>
              <span>{item.text}</span>
              <span className="se-muted se-num">{formatWeekdayTime(item.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
