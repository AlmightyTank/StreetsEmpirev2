import type { GameActionResult, TravelDto, VehiclePurchaseResult, VehicleServiceResult } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { Alert } from './Alert.js';
import { ItemTile } from './ItemTile.js';
import { Panel } from './Panel.js';
import { QuestLockNote } from './QuestLink.js';

type Fleet = NonNullable<TravelDto['vehicleFleet']>;
type VehicleClassId = Fleet[number]['classId'];

export const VEHICLE_NAMES: Record<VehicleClassId, string> = { LOW_RIDER: 'Low-Rider', SEDAN: 'Sedan', VAN: 'Van' };

export const vehiclePlural = (classId: VehicleClassId, count: number) => `${VEHICLE_NAMES[classId]}${count === 1 ? '' : 's'}`;

/** 1.5.0-B route profiles in player words, at the round's own numbers (1.5.0-E). */
export function routeProfileText(vehicle: Pick<Fleet[number], 'routeProfile' | 'routeRiskPercent'>): string {
  const percent = vehicle.routeRiskPercent ?? (vehicle.routeProfile === 'LOW_PROFILE' ? -10 : vehicle.routeProfile === 'HIGH_VISIBILITY' ? 15 : 0);
  return percent < 0 ? `${-percent}% lower route risk` : percent > 0 ? `${percent}% higher route risk` : 'normal route risk';
}

/** "2 Vans · 1 Sedan" from a class count; empty when every count is zero. */
export function vehicleCountsText(counts: Partial<Record<VehicleClassId, number>>): string {
  return (Object.entries(counts) as Array<[VehicleClassId, number]>)
    .filter(([, count]) => count > 0)
    .map(([classId, count]) => `${count} ${vehiclePlural(classId, count)}`)
    .join(' · ');
}

/**
 * 1.5.0-C. What road trouble does to a run's cars and what fixing them costs, shown
 * before a run commits. Null on a round without garage service.
 */
export function vehicleTroubleText(data: TravelDto): string | null {
  const service = data.vehicleService;
  const fleet = data.vehicleFleet ?? [];
  if (!service) return null;
  const range = (pick: (vehicle: Fleet[number]) => number | undefined) => {
    const prices = fleet.map(pick).filter((cents): cents is number => typeof cents === 'number');
    if (!prices.length) return '';
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    return low === high ? formatCents(low) : `${formatCents(low)}–${formatCents(high)}`;
  };
  const cars = (count: number) => (count === 1 ? 'one vehicle' : `${count} vehicles`);
  const order = service.damageOrder.filter((classId) => fleet.some((vehicle) => vehicle.classId === classId)).map((classId) => `${VEHICLE_NAMES[classId]}s`);
  return `A bust or a lost convoy fight brings ${cars(Math.max(service.damagedByBust, service.damagedByConvoyLoss))} home Damaged; an arrest leaves ${cars(service.disabledByArrest)} Disabled. `
    + `${order.join(', then ')} take trouble first. `
    + `Repairs run ${range((vehicle) => vehicle.repairCents)} a car and recovery ${range((vehicle) => vehicle.recoveryCents)}; nothing is lost for good.`;
}

/** 1.5.0-D. A price, with the list price struck through beside it when the road lane took some off. */
function Price({ cents, list }: { cents: number; list?: number }) {
  return list !== undefined && list > cents
    ? <><s className="se-muted">{formatCents(list)}</s> {formatCents(cents)}</>
    : <>{formatCents(cents)}</>;
}

const DISCOUNT_NAMES = { AUTO_GARAGE: 'Your Auto Garage', CHOP_SHOP: 'Your Chop Shop', ROAD_SAINTS: 'Road Saints MC' } as const;

/**
 * 1.5.0-D. Where this crew's garage discounts come from, and how to get the ones it lacks.
 * The road lane makes a fleet cheaper to keep running; it never unlocks a car.
 */
function DiscountNote({ discounts }: { discounts: NonNullable<NonNullable<TravelDto['vehicleService']>['discounts']> }) {
  const line = (kind: 'REPAIR' | 'RECOVER') => {
    const entry = discounts[kind];
    if (!entry.sources.length) return null;
    const parts = entry.sources.map((source) => `${DISCOUNT_NAMES[source.source]} ${source.percent}%`).join(' + ');
    const total = entry.sources.reduce((sum, source) => sum + source.percent, 0);
    return `${kind === 'REPAIR' ? 'Repairs' : 'Recovery'} ${entry.percent}% off (${parts}${total > entry.percent ? `, capped` : ''}).`;
  };
  const active = [line('REPAIR'), line('RECOVER')].filter(Boolean);
  return (
    <p className="se-hint">
      {active.length ? `${active.join(' ')} ` : ''}
      The road lane keeps a fleet cheaper to run: an Auto Garage on your blocks cuts repairs, a Chop Shop running Vehicle recovery cuts recovery, and Trusted standing with Road Saints MC cuts both.
    </p>
  );
}

/**
 * 1.5.0-C. The garage: every vehicle class with its picture, what it is for, where each
 * car is (Ready, Away, Damaged, Disabled), and what it costs to buy one or put one back
 * on the road. Prices are on the buttons, so nothing is charged that was not shown.
 */
export function GaragePanel({ data, onDone }: { data: TravelDto; onDone: () => void }) {
  const service = useGameAction<VehicleServiceResult>();
  const purchase = useGameAction<VehiclePurchaseResult>();
  const fleet = data.vehicleFleet ?? [];
  const cash = data.home.cashCents;
  const busy = service.busy || purchase.busy;
  const troubled = fleet.reduce((sum, vehicle) => sum + (vehicle.damaged ?? 0) + (vehicle.disabled ?? 0), 0);

  async function fix(classId: VehicleClassId, kind: 'REPAIR' | 'RECOVER', quantity: number) {
    await service.run((actionId): Promise<GameActionResult<VehicleServiceResult>> => api.post('/game/travel/vehicles/service', { classId, kind, quantity, actionId }));
    onDone();
  }

  async function buy(classId: VehicleClassId) {
    await purchase.run((actionId): Promise<GameActionResult<VehiclePurchaseResult>> => api.post('/game/travel/vehicles/purchase', { classId, quantity: 1, actionId }));
    onDone();
  }

  const done = service.result?.result;
  const bought = purchase.result?.result;

  return (
    <Panel title="Garage" aside={troubled ? `${formatNumber(troubled)} waiting on service` : 'Fleet ready'} className="se-travel-panel">
      <div className="se-garage">
        {fleet.map((vehicle) => {
          const damaged = vehicle.damaged ?? 0;
          const disabled = vehicle.disabled ?? 0;
          const buyable = vehicle.purchasePriceCents !== null && vehicle.purchasePriceCents !== undefined;
          return (
            <article className="se-garage__car" key={vehicle.classId}>
              <ItemTile item={vehicle.classId} quantity={vehicle.total} className="se-garage__art" />
              <div className="se-garage__about">
                <h3>{vehicle.name}</h3>
                <p className="se-dim">{vehicle.description}</p>
                <p className="se-hint">
                  {vehicle.cargoPercent ?? 100}% cargo · {vehicle.crewSeats ?? data.rules.thugsPerLowRider} seats · {routeProfileText(vehicle)}
                </p>
              </div>
              <dl className="se-garage__states">
                <div><dt>Ready</dt><dd className="se-num">{formatNumber(vehicle.home)}</dd></div>
                <div><dt>Away</dt><dd className="se-num">{formatNumber(vehicle.away)}</dd></div>
                <div className={damaged ? 'is-warn' : undefined}><dt>Damaged</dt><dd className="se-num">{formatNumber(damaged)}</dd></div>
                <div className={disabled ? 'is-bad' : undefined}><dt>Disabled</dt><dd className="se-num">{formatNumber(disabled)}</dd></div>
              </dl>
              <div className="se-garage__actions">
                {damaged > 0 && vehicle.repairCents !== undefined ? (
                  <>
                    <button type="button" className="se-btn se-btn--sm" disabled={busy || cash < vehicle.repairCents}
                      onClick={() => void fix(vehicle.classId, 'REPAIR', 1)}>Repair 1 · <Price cents={vehicle.repairCents} list={vehicle.listRepairCents} /></button>
                    {damaged > 1 ? (
                      <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={busy || cash < vehicle.repairCents * damaged}
                        onClick={() => void fix(vehicle.classId, 'REPAIR', damaged)}>Repair all {damaged} · {formatCents(vehicle.repairCents * damaged)}</button>
                    ) : null}
                  </>
                ) : null}
                {disabled > 0 && vehicle.recoveryCents !== undefined ? (
                  <>
                    <button type="button" className="se-btn se-btn--sm" disabled={busy || cash < vehicle.recoveryCents}
                      onClick={() => void fix(vehicle.classId, 'RECOVER', 1)}>Recover 1 · <Price cents={vehicle.recoveryCents} list={vehicle.listRecoveryCents} /></button>
                    {disabled > 1 ? (
                      <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={busy || cash < vehicle.recoveryCents * disabled}
                        onClick={() => void fix(vehicle.classId, 'RECOVER', disabled)}>Recover all {disabled} · {formatCents(vehicle.recoveryCents * disabled)}</button>
                    ) : null}
                  </>
                ) : null}
                {vehicle.charlie ? (
                  vehicle.charlie.unlocked
                    ? <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/stores/charlie">Buy at Charlie’s</Link>
                    : <span className="se-garage__lock"><QuestLockNote unlockName={vehicle.charlie.unlockName} quest={vehicle.charlie.quest} /></span>
                ) : buyable ? (
                  <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={busy || cash < (vehicle.buyCents ?? vehicle.purchasePriceCents!)}
                    onClick={() => void buy(vehicle.classId)}>Buy one · <Price cents={vehicle.buyCents ?? vehicle.purchasePriceCents!} list={vehicle.purchasePriceCents!} /></button>
                ) : vehicle.classId === 'LOW_RIDER' ? (
                  <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/stores/charlie">Charlie sells these</Link>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      {service.error ? <Alert>{service.error}</Alert> : null}
      {purchase.error ? <Alert>{purchase.error}</Alert> : null}
      {done ? (
        <p className="se-good se-mt" role="status">
          {done.kind === 'REPAIR' ? 'Repaired' : 'Recovered'} {done.quantity} {vehiclePlural(done.classId, done.quantity)} for {formatCents(done.paidCents)}{done.discountPercent ? ` (${done.discountPercent}% off)` : ''}. {done.readyCount} ready at home.
        </p>
      ) : bought ? (
        <p className="se-good se-mt" role="status">Bought {bought.quantity} {vehiclePlural(bought.classId, bought.quantity)} for {formatCents(bought.paidCents)}.</p>
      ) : null}
      <p className="se-hint se-mt">
        {vehicleTroubleText(data) ?? 'Vehicles in this round never need the garage.'} Service is paid from cash at home and the car is ready at once. Damaged and Disabled cars cannot go on runs or drive-bys.
      </p>
      {data.vehicleService?.discounts ? <DiscountNote discounts={data.vehicleService.discounts} /> : null}
    </Panel>
  );
}
