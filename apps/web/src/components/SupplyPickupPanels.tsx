import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  SupplyOrderDto,
  SupplyPickupDispatchResult,
  SupplyPickupDto,
  SupplyPickupPlanningDto,
  SupplyRouteRiskDto,
  SupplyVehicleClassId,
} from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { supplyApi } from '../api/supply.js';
import { ApiError } from '../api/client.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { newActionId } from '../utils/actionId.js';
import { formatClockTime, formatWeekdayTime } from '../utils/time.js';
import { ActionResult } from './ActionResult.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { minutesText } from './CityMap.js';
import { ItemLabel } from './ItemTile.js';
import { Panel, Row } from './Panel.js';

/**
 * 1.6.0-C. Collect a paid order in vehicle loads: pick the order, the fleet and the load,
 * see the road, the turns and the room at home before the crew leaves.
 */

const PENDING_PICKUP_KEY = 'streets.supply.pending-pickup.v1';
const CLASSES: readonly SupplyVehicleClassId[] = ['LOW_RIDER', 'SEDAN', 'VAN'];
type Counts = Record<SupplyVehicleClassId, number | ''>;

interface PendingPickupIntent {
  requestKey: string;
  actionId: string | null;
  orderId: string;
  quantity: number;
  vehicleLoadout: Record<SupplyVehicleClassId, number>;
  escortThugs: number;
  route: number;
}

function readPendingPickup(): PendingPickupIntent | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_PICKUP_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingPickupIntent> | null;
    if (!value || typeof value.requestKey !== 'string' || typeof value.orderId !== 'string' || !Number.isSafeInteger(value.quantity)
      || !value.vehicleLoadout || typeof value.vehicleLoadout !== 'object') return null;
    return {
      requestKey: value.requestKey,
      actionId: typeof value.actionId === 'string' ? value.actionId : null,
      orderId: value.orderId,
      quantity: value.quantity as number,
      vehicleLoadout: { LOW_RIDER: Number(value.vehicleLoadout.LOW_RIDER) || 0, SEDAN: Number(value.vehicleLoadout.SEDAN) || 0, VAN: Number(value.vehicleLoadout.VAN) || 0 },
      escortThugs: Number(value.escortThugs) || 0,
      route: Number(value.route) || 0,
    };
  } catch {
    return null;
  }
}

function savePending(intent: PendingPickupIntent | null) {
  try {
    if (intent) window.sessionStorage.setItem(PENDING_PICKUP_KEY, JSON.stringify(intent));
    else window.sessionStorage.removeItem(PENDING_PICKUP_KEY);
  } catch {
    // A private window without storage still dispatches; it only cannot recover after a reload.
  }
}

/** Whole numbers only; an empty box stays empty while typing. */
function whole(value: string): number | '' {
  if (value === '') return '';
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : '';
}
const count = (value: number | '') => (typeof value === 'number' ? value : 0);

export const RISK_WORDS: Record<SupplyRouteRiskDto, string> = {
  QUIET: 'Quiet roads',
  WATCHED: 'Watched roads',
  HEAVY: 'Heavy police',
};

export function pickupStatusLabel(pickup: Pick<SupplyPickupDto, 'status' | 'loadedAt'>): string {
  switch (pickup.status) {
    case 'PLANNED': return 'Driving to supplier';
    case 'IN_TRANSIT': return 'Loaded · heading home';
    case 'DELIVERED': return 'Delivered';
    case 'FAILED': return 'Lost on the road';
    case 'CANCELLED': return 'Cancelled';
    default: return pickup.status;
  }
}

/** Plan and send one load. `orders` are the player's paid orders; the plan is the server's. */
export function PickupPlanner({ plan, orders, onDone }: { plan: SupplyPickupPlanningDto; orders: SupplyOrderDto[]; onDone: () => void }) {
  const [restored] = useState(readPendingPickup);
  const pending = useRef<PendingPickupIntent | null>(restored);
  const [uncertain, setUncertain] = useState(Boolean(restored));
  const action = useGameAction<SupplyPickupDispatchResult>();

  const collectable = plan.orders.filter((entry) => entry.availableQuantity > 0);
  const [orderId, setOrderId] = useState(restored?.orderId ?? collectable[0]?.orderId ?? '');
  const [vehicles, setVehicles] = useState<Counts>(restored?.vehicleLoadout ?? { LOW_RIDER: 0, SEDAN: 0, VAN: 0 });
  const [escorts, setEscorts] = useState<number | ''>(restored?.escortThugs ?? 0);
  const [route, setRoute] = useState(restored?.route ?? 0);
  const [quantity, setQuantity] = useState<number | ''>(restored?.quantity ?? '');

  // A plan that no longer offers the picked order (collected, or loads already promised) moves on.
  useEffect(() => {
    if (uncertain || action.busy) return;
    if (!collectable.some((entry) => entry.orderId === orderId)) setOrderId(collectable[0]?.orderId ?? '');
  }, [plan, orderId, uncertain, action.busy, collectable]);

  const orderPlan = plan.orders.find((entry) => entry.orderId === orderId) ?? null;
  const order = orders.find((entry) => entry.id === orderId) ?? null;
  const chosenRoute = orderPlan && !orderPlan.local ? orderPlan.routes.find((entry) => entry.index === route) ?? orderPlan.routes[0] ?? null : null;
  useEffect(() => { if (orderPlan && !orderPlan.local && !orderPlan.routes.some((entry) => entry.index === route)) setRoute(orderPlan.routes[0]?.index ?? 0); }, [orderPlan, route]);

  const spec = (classId: SupplyVehicleClassId) => plan.vehicles.find((vehicle) => vehicle.classId === classId);
  const selected = Object.fromEntries(CLASSES.map((classId) => [classId, count(vehicles[classId])])) as Record<SupplyVehicleClassId, number>;
  const fleetSize = CLASSES.reduce((sum, classId) => sum + selected[classId], 0);
  // The server's own sum: every vehicle's cargo, the round's bonus, rounded down once for the fleet.
  const capacity = Math.floor(CLASSES.reduce((sum, classId) => sum + selected[classId] * (spec(classId)?.cargoUnits ?? 0), 0) * (1 + plan.cargoShare));
  const seats = CLASSES.reduce((sum, classId) => sum + selected[classId] * (spec(classId)?.crewSeats ?? 0), 0);
  const fleetRisk = fleetSize
    ? Math.round(CLASSES.reduce((sum, classId) => sum + selected[classId] * (spec(classId)?.routeRiskPercent ?? 0), 0) / fleetSize)
    : 0;
  const escortMax = Math.min(plan.fitThugs, seats);
  const available = orderPlan?.availableQuantity ?? 0;
  const most = Math.max(0, Math.min(available, capacity, plan.stash.roomUnits));
  const load = count(quantity);
  const turns = orderPlan?.local ? plan.localPickupTurns : chosenRoute?.turns ?? 0;
  const local = Boolean(orderPlan?.local);

  function changed(update: () => void) {
    if (uncertain || action.busy) return;
    pending.current = null;
    savePending(null);
    action.clear();
    update();
  }

  const block = uncertain ? null
    : !orderPlan || !order ? 'No paid order has anything left to send for.'
      : fleetSize < 1 ? 'Choose at least one vehicle.'
        : CLASSES.some((classId) => selected[classId] > (spec(classId)?.ready ?? 0)) ? 'You do not have that many vehicles ready at home.'
          : !local && !chosenRoute ? 'There is no road to that supplier.'
            : !local && plan.activeRuns >= plan.runLimit ? (plan.runLimit === 1 ? 'You already have a run out. A pickup is a run: wait for it to come home.' : `All ${plan.runLimit} of your runs are out.`)
              : !local && count(escorts) > escortMax ? `Send at most ${escortMax} escorts: ${seats} seats, ${plan.fitThugs} fit thugs at home.`
                : load < 1 ? 'Enter how many units to collect.'
                  : load > available ? `Only ${formatNumber(available)} units of this order are left to send for.`
                    : load > capacity ? `These vehicles carry ${formatNumber(capacity)} units.`
                      : load > plan.stash.roomUnits ? `The ${plan.stash.name.toLowerCase()} has room for ${formatNumber(plan.stash.roomUnits)} more units.`
                        : turns > plan.turns ? `This pickup costs ${turns} turns and you have ${plan.turns}.`
                          : null;

  async function dispatch() {
    if (!orderPlan) return;
    const fresh: PendingPickupIntent = {
      requestKey: newActionId(), actionId: null, orderId, quantity: load, vehicleLoadout: selected, escortThugs: local ? 0 : count(escorts), route: chosenRoute?.index ?? 0,
    };
    const intent = uncertain && pending.current ? pending.current : fresh;
    if (!uncertain && block) return;
    pending.current = intent;
    savePending(intent);
    await action.run(async (actionId) => {
      intent.actionId = actionId;
      savePending(intent);
      try {
        const outcome = await supplyApi.dispatchPickup({
          orderId: intent.orderId, quantity: intent.quantity, vehicleLoadout: intent.vehicleLoadout, escortThugs: intent.escortThugs, route: intent.route, requestKey: intent.requestKey, actionId,
        });
        pending.current = null;
        savePending(null);
        setUncertain(false);
        setQuantity('');
        onDone();
        return outcome;
      } catch (caught) {
        if (!(caught instanceof ApiError) || caught.isUncertain) setUncertain(true);
        else {
          pending.current = null;
          savePending(null);
          setUncertain(false);
        }
        throw caught;
      }
    }, { actionId: intent.actionId ?? undefined });
  }

  const sent = action.result?.result ?? null;

  return (
    <Panel title="Send a pickup" aside={`${formatNumber(plan.turns)} turns`}>
      {uncertain ? <Alert tone="warning">We could not confirm the last pickup. Retry it to check safely; the form is locked until the result is known.</Alert> : null}
      {action.error ? <Alert>{action.error}</Alert> : null}
      {sent && action.result ? (
        <ActionResult
          title={sent.replayed ? 'Pickup already sent' : sent.pickup.local ? 'Loaded into the stash' : 'Pickup on the road'}
          subtitle={`${formatNumber(sent.pickup.quantity)} ${sent.pickup.productName} · ${sent.pickup.supplierName}`}
          result={action.result}
          onDismiss={action.clear}
          lines={[
            sent.pickup.local
              ? { label: 'Stored', value: formatNumber(sent.pickup.deliveredQuantity) }
              : { label: 'Home around', value: sent.pickup.expectedArrivalAt ? formatWeekdayTime(sent.pickup.expectedArrivalAt) : '—' },
            ...(sent.risk ? [{ label: 'The road', value: RISK_WORDS[sent.risk] }] : []),
          ]}
        />
      ) : null}

      {collectable.length === 0 ? (
        <p className="se-muted">
          {plan.orders.length ? 'Every open order already has its last units loaded or on the way.' : 'Place a paid order first. Pickups collect it in loads.'}
        </p>
      ) : (
        <div className="se-supply__form">
          <div className="se-field">
            <label htmlFor="pickup-order">Order</label>
            <select id="pickup-order" className="se-input" value={orderId} disabled={uncertain || action.busy} onChange={(event) => changed(() => setOrderId(event.target.value))}>
              {collectable.map((entry) => {
                const row = orders.find((candidate) => candidate.id === entry.orderId);
                return <option key={entry.orderId} value={entry.orderId}>{row ? `${row.productName} · ${row.supplierName} (${row.supplierCityName})` : entry.orderId} · {formatNumber(entry.availableQuantity)} left</option>;
              })}
            </select>
            {orderPlan && orderPlan.reservedQuantity > 0 ? <small className="se-muted">{formatNumber(orderPlan.reservedQuantity)} more are promised to a pickup still driving out.</small> : null}
          </div>

          {local ? (
            <p className="se-supply__description">The supplier is in {plan.homeCityName}. Loads go straight off the dock into your {plan.stash.name.toLowerCase()}: no road, {plan.localPickupTurns} turn{plan.localPickupTurns === 1 ? '' : 's'}, and the vehicles stay home.</p>
          ) : orderPlan ? (
            <div className="se-routes" role="radiogroup" aria-label="Route to the supplier">
              {orderPlan.routes.map((entry) => (
                <label key={entry.index} className={`se-routes__route${entry.index === chosenRoute?.index ? ' se-routes__route--on' : ''}`}>
                  <input type="radio" name="pickup-route" checked={entry.index === chosenRoute?.index} disabled={uncertain || action.busy} onChange={() => changed(() => setRoute(entry.index))} />
                  <span className="se-routes__way">{entry.cities.length > 2 ? <>Through {entry.cities.slice(1, -1).map((city) => city.name).join(', ')}</> : 'Direct'}</span>
                  <span className="se-routes__meta se-num">{minutesText(entry.gameMinutes)} out · {entry.turns} turns · {RISK_WORDS[entry.risk].toLowerCase()}</span>
                </label>
              ))}
            </div>
          ) : null}

          <div className="se-supply__fleet">
            {plan.vehicles.map((vehicle) => (
              <div className="se-field" key={vehicle.classId}>
                <label htmlFor={`pickup-${vehicle.classId}`}><ItemLabel itemKey={vehicle.classId}>{vehicle.name} <span className="se-muted">of {vehicle.ready}</span></ItemLabel></label>
                <input id={`pickup-${vehicle.classId}`} className="se-input" type="number" inputMode="numeric" min={0} max={vehicle.ready} value={vehicles[vehicle.classId]}
                  disabled={uncertain || action.busy} onChange={(event) => changed(() => setVehicles({ ...vehicles, [vehicle.classId]: whole(event.target.value) }))} />
                <small className="se-muted">{formatNumber(Math.floor(vehicle.cargoUnits))} units · {vehicle.routeRiskPercent < 0 ? `${-vehicle.routeRiskPercent}% quieter` : vehicle.routeRiskPercent > 0 ? `${vehicle.routeRiskPercent}% more noticed` : 'normal profile'}</small>
              </div>
            ))}
            {!local ? (
              <div className="se-field">
                <label htmlFor="pickup-escorts">Escorts <span className="se-muted">of {escortMax}</span></label>
                <input id="pickup-escorts" className="se-input" type="number" inputMode="numeric" min={0} max={escortMax} value={escorts}
                  disabled={uncertain || action.busy} onChange={(event) => changed(() => setEscorts(whole(event.target.value)))} />
              </div>
            ) : null}
          </div>
          <p className="se-hint">Need more room? Buy, repair or recover vehicles in the <Link className="se-golink" to="/game/travel?tab=garage">Garage</Link>.</p>

          <div className="se-field">
            <label htmlFor="pickup-quantity">Units to collect</label>
            <div className="se-launch__with-all">
              <input id="pickup-quantity" className="se-input" type="number" inputMode="numeric" min={1} max={most} value={quantity}
                disabled={uncertain || action.busy} onChange={(event) => changed(() => setQuantity(whole(event.target.value)))} />
              <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={uncertain || action.busy || most < 1} onClick={() => changed(() => setQuantity(most))}>Max</button>
            </div>
            <small className="se-muted">Up to {formatNumber(most)}: the least of what is left on the order, what the vehicles carry, and the room at home.</small>
          </div>

          <div className="se-supply__quote">
            <Row label="Vehicles" value={fleetSize ? `${formatNumber(fleetSize)} · ${formatNumber(capacity)} units of cargo` : 'None picked'} />
            <Row label="This load" value={`${formatNumber(load)} of ${formatNumber(available)} left`} strong />
            <Row label="Left on the order after" value={formatNumber(Math.max(0, available - load))} />
            <Row label={`${plan.stash.name} room after`} value={`${formatNumber(Math.max(0, plan.stash.roomUnits - load))} of ${formatNumber(plan.stash.capacityUnits)}`} />
            {chosenRoute ? (
              <>
                <Row label="At the supplier" value={`${formatClockTime(chosenRoute.arriveAt)} · ${minutesText(chosenRoute.gameMinutes)}`} />
                <Row label="Back home" value={`${formatWeekdayTime(chosenRoute.backAt)} · ${minutesText(chosenRoute.roundTripMinutes)} round trip`} />
                <Row label="The road" value={`${RISK_WORDS[chosenRoute.risk]}${fleetRisk ? ` · fleet ${fleetRisk > 0 ? `${fleetRisk}% more noticed` : `${-fleetRisk}% quieter`}` : ''}`}
                  tooltip="Road stops, busts on the way and convoy hits can take part of the load. What is lost is gone: the order counts it as collected." />
              </>
            ) : null}
            <Row label="Cost" value={`${formatNumber(turns)} turn${turns === 1 ? '' : 's'}${local ? '' : ' · no cash'}`} />
            <p>
              {local
                ? 'Loaded and stored at once.'
                : `The run drives out empty, loads at the supplier and spends up to ${minutesText(plan.townWindowMinutes)} there, then drives home. It cannot trade on the way. Whatever is still in the trunk when it gets home goes into your ${plan.stash.name.toLowerCase()}; the rest of the order waits for the next trip.`}
            </p>
          </div>

          <Button className="se-btn se-btn--primary se-btn--block" onClick={() => void dispatch()} disabled={action.busy} disabledReason={block}>
            {action.busy ? 'Sending…' : uncertain ? 'Retry pickup check' : local ? `Load ${formatNumber(load)} into the stash` : `Send the pickup · ${formatNumber(turns)} turns`}
          </Button>
        </div>
      )}
    </Panel>
  );
}

/** What is in the stash, and what is on its way there. */
export function StashPanel({ plan }: { plan: SupplyPickupPlanningDto }) {
  const { stash } = plan;
  const used = stash.storedUnits + stash.inboundUnits;
  return (
    <Panel title={`${stash.name} · ${stash.cityName}`} aside={`${formatNumber(used)} / ${formatNumber(stash.capacityUnits)}`}>
      <div className="se-meter" aria-label={`${formatNumber(used)} of ${formatNumber(stash.capacityUnits)} units used`}>
        <div className="se-meter__fill" style={{ width: `${stash.capacityUnits ? Math.min(100, (used / stash.capacityUnits) * 100) : 0}%` }} />
      </div>
      <div className="se-rows se-mt">
        <Row label="Stored" value={formatNumber(stash.storedUnits)} strong />
        <Row label="On the way" value={formatNumber(stash.inboundUnits)} tooltip="Loads still on the road hold their room until they land." />
        <Row label="Room" value={formatNumber(stash.roomUnits)} />
        {stash.stock.map((row) => <Row key={row.productKey} label={row.productName} value={formatNumber(row.quantity)} />)}
      </div>
      <p className="se-hint">Delivered supply waits here. It is not carried stock, and it is not counted in net worth.</p>
    </Panel>
  );
}

/** Pickups on the road first, then the latest that came home. */
export function PickupList({ pickups }: { pickups: SupplyPickupDto[] }) {
  return (
    <Panel title="Pickups" aside={`${pickups.filter((row) => row.status === 'PLANNED' || row.status === 'IN_TRANSIT').length} on the road`}>
      {pickups.length === 0 ? <p className="se-muted">Pickups you send will appear here.</p> : (
        <div className="se-supply__history">
          {pickups.map((row) => {
            const active = row.status === 'PLANNED' || row.status === 'IN_TRANSIT';
            return (
              <div className="se-supply__history-row" key={row.id}>
                <div>
                  <strong>{formatNumber(row.quantity)} {row.productName} · {row.supplierName}</strong>
                  <span>
                    {pickupStatusLabel(row)}
                    {active && row.expectedArrivalAt ? ` · home ${formatWeekdayTime(row.expectedArrivalAt)}` : ''}
                    {!active && row.lostQuantity > 0 ? ` · ${formatNumber(row.lostQuantity)} lost on the road` : ''}
                    {row.local ? ' · local' : ''}
                  </span>
                </div>
                <strong className={row.status === 'FAILED' ? 'se-bad' : active ? undefined : 'se-good'}>
                  {active ? '—' : formatNumber(row.deliveredQuantity)}
                </strong>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
