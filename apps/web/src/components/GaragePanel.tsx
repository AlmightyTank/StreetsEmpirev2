import type { GameActionResult, TravelDto, VehiclePurchaseResult, VehicleServiceResult } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { Alert } from './Alert.js';
import { ItemTile } from './ItemTile.js';
import { Panel } from './Panel.js';

type Fleet = NonNullable<TravelDto['vehicleFleet']>;
type VehicleClassId = Fleet[number]['classId'];

export const VEHICLE_NAMES: Record<VehicleClassId, string> = { LOW_RIDER: 'Low-Rider', SEDAN: 'Sedan', VAN: 'Van' };

export const vehiclePlural = (classId: VehicleClassId, count: number) => `${VEHICLE_NAMES[classId]}${count === 1 ? '' : 's'}`;

/** 1.5.0-B route profiles in player words. */
export function routeProfileText(profile: Fleet[number]['routeProfile']): string {
  return profile === 'LOW_PROFILE' ? '10% lower route risk' : profile === 'HIGH_VISIBILITY' ? '15% higher route risk' : 'normal route risk';
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
                  {vehicle.cargoPercent ?? 100}% cargo · {vehicle.crewSeats ?? data.rules.thugsPerLowRider} seats · {routeProfileText(vehicle.routeProfile)}
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
                      onClick={() => void fix(vehicle.classId, 'REPAIR', 1)}>Repair 1 · {formatCents(vehicle.repairCents)}</button>
                    {damaged > 1 ? (
                      <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={busy || cash < vehicle.repairCents * damaged}
                        onClick={() => void fix(vehicle.classId, 'REPAIR', damaged)}>Repair all {damaged} · {formatCents(vehicle.repairCents * damaged)}</button>
                    ) : null}
                  </>
                ) : null}
                {disabled > 0 && vehicle.recoveryCents !== undefined ? (
                  <>
                    <button type="button" className="se-btn se-btn--sm" disabled={busy || cash < vehicle.recoveryCents}
                      onClick={() => void fix(vehicle.classId, 'RECOVER', 1)}>Recover 1 · {formatCents(vehicle.recoveryCents)}</button>
                    {disabled > 1 ? (
                      <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={busy || cash < vehicle.recoveryCents * disabled}
                        onClick={() => void fix(vehicle.classId, 'RECOVER', disabled)}>Recover all {disabled} · {formatCents(vehicle.recoveryCents * disabled)}</button>
                    ) : null}
                  </>
                ) : null}
                {buyable ? (
                  <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={busy || cash < vehicle.purchasePriceCents!}
                    onClick={() => void buy(vehicle.classId)}>Buy one · {formatCents(vehicle.purchasePriceCents!)}</button>
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
          {done.kind === 'REPAIR' ? 'Repaired' : 'Recovered'} {done.quantity} {vehiclePlural(done.classId, done.quantity)} for {formatCents(done.paidCents)}. {done.readyCount} ready at home.
        </p>
      ) : bought ? (
        <p className="se-good se-mt" role="status">Bought {bought.quantity} {vehiclePlural(bought.classId, bought.quantity)} for {formatCents(bought.paidCents)}.</p>
      ) : null}
      <p className="se-hint se-mt">
        {vehicleTroubleText(data) ?? 'Vehicles in this round never need the garage.'} Service is paid from cash at home and the car is ready at once. Damaged and Disabled cars cannot go on runs or drive-bys.
      </p>
    </Panel>
  );
}
