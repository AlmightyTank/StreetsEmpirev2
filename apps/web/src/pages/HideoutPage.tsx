import { useEffect, useState } from 'react';
import type {
  HideoutRoomV2Dto,
  HideoutUpgradeResult,
  HideoutV2Dto,
  TravelDto,
} from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { hideoutApi } from '../api/hideout.js';
import { api, ApiError } from '../api/client.js';
import { ActionResult } from '../components/ActionResult.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Row, Stat } from '../components/Panel.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

function securityTierLabel(tier: NonNullable<HideoutV2Dto['security']>['reconWarningTier']): string {
  if (tier === 'SOURCE') return 'Named warnings';
  if (tier === 'PRESENCE') return 'Anonymous warnings';
  return 'No recon warnings';
}

function RoomCard({
  room,
  cashCents,
  blocked,
  onUpgrade,
}: {
  room: HideoutRoomV2Dto;
  cashCents: number;
  /** Why no room can be upgraded right now, or null when they can. */
  blocked: string | null;
  onUpgrade: (room: HideoutRoomV2Dto) => void;
}) {
  const maxed = room.nextCostCents === null;
  const affordable = !maxed && cashCents >= room.nextCostCents!;
  const meter = room.maxLevel > 0 ? (room.level / room.maxLevel) * 100 : 0;

  return (
    <Panel title={room.name} aside={`Level ${formatNumber(room.level)} / ${formatNumber(room.maxLevel)}`}>
      <p className="se-dim">{room.blurb}</p>
      <div className="se-meter" aria-hidden="true">
        <div className="se-meter__fill" style={{ width: `${meter}%` }} />
      </div>
      <dl className="se-effects se-mt">
        <div><dt>Now</dt><dd>{room.currentEffect}</dd></div>
        <div><dt>Next</dt><dd className="se-effects__next">{room.nextEffect ?? 'Fully upgraded'}</dd></div>
        <div><dt>Cost</dt><dd className="se-num">{room.nextCostCents === null ? '-' : formatCents(room.nextCostCents)}</dd></div>
        {room.nextRequirements.map((requirement) => (
          <div key={requirement.key}>
            <dt>{requirement.label}</dt>
            <dd className={requirement.met ? 'se-dim' : undefined}>
              {formatNumber(requirement.current)} / {formatNumber(requirement.required)}
              {requirement.met ? ' ready' : ' needed'}
            </dd>
          </div>
        ))}
        {room.specialization ? (
          <div>
            <dt>Branches</dt>
            <dd>
              Level {formatNumber(room.specialization.unlockLevel)}: {room.specialization.choices.map((choice) => choice.name).join(' / ')}
              {room.specialization.selectedKey === null ? ' · choice not active yet' : ''}
            </dd>
          </div>
        ) : null}
      </dl>
      <Button
        type="button"
        className="se-btn se-btn--primary se-btn--block"
        disabledReason={blocked
          ?? room.lockReason
          ?? (!maxed && !affordable
            ? `This costs ${formatCents(room.nextCostCents!)} and you are ${formatCents(room.nextCostCents! - cashCents)} short.`
            : null)}
        onClick={() => onUpgrade(room)}
      >
        {maxed
          ? 'Fully upgraded'
          : !affordable
            ? `Need ${formatCents(room.nextCostCents!)}`
            : room.canUpgrade
              ? `Upgrade ${room.name}`
              : 'Requirements not met'}
      </Button>
    </Panel>
  );
}

/** Shows the current headquarters state and controls for seasonal room upgrades. */
export function HideoutPage() {
  const me = useSession((s) => s.me);
  const action = useGameAction<HideoutUpgradeResult>();
  const [hideout, setHideout] = useState<HideoutV2Dto | null>(null);
  const [travel, setTravel] = useState<TravelDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    hideoutApi.catalog()
      .then((data) => {
        if (!active) return;
        setHideout(data);
        setLoadError(null);
      })
      .catch((caught: unknown) => {
        if (active) setLoadError(caught instanceof ApiError ? caught.message : 'Could not load the hideout.');
      });

    api.get<TravelDto>('/game/travel')
      .then((data) => { if (active) setTravel(data); })
      .catch(() => { if (active) setTravel(null); });

    return () => { active = false; };
  }, [me?.resources.cashCents, reload]);

  async function upgrade(room: HideoutRoomV2Dto) {
    await action.run((actionId) => hideoutApi.upgrade({ room: room.key, actionId }));
    setReload((n) => n + 1);
  }

  const receipt = action.result?.result ?? null;
  const openRooms = hideout?.rooms.filter((room) => room.nextCostCents !== null) ?? [];
  const readyRooms = openRooms.filter((room) => room.canUpgrade);
  const nextRoom = [...openRooms].sort((a, b) => a.nextCostCents! - b.nextCostCents!)[0] ?? null;

  const productUnits = me?.products
    ? me.products.reduce((sum, product) => sum + product.quantity, 0)
    : me?.resources.product ?? 0;
  const activeRuns = travel?.runs.length ?? (me?.run ? 1 : 0);
  const garageRuns = travel?.runs ?? (travel?.run ? [travel.run] : []);
  const lowRidersAway = garageRuns.reduce((sum, run) => sum + run.lowRiders, 0);
  const lowRidersHome = travel?.home.lowRiders ?? me?.resources.lowRiders ?? 0;
  const cargoUsed = garageRuns.reduce(
    (sum, run) => sum + run.beer + run.cargo.reduce((cargo, row) => cargo + row.quantity, 0),
    0,
  );
  const cargoCapacity = garageRuns.reduce((sum, run) => sum + run.capacity, 0);
  const escortsAway = garageRuns.reduce((sum, run) => sum + run.escortThugs, 0);

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Hideout</h1>
          <p className="se-eyebrow">Seasonal headquarters and upgrades</p>
        </div>
      </div>

      {me ? (
        <Panel title="Headquarters">
          <div className="se-stats">
            <Stat label="Cash" value={formatCents(me.resources.cashCents)} />
            <Stat label="Crew" value={`${formatNumber(me.resources.whores)} hoes · ${formatNumber(me.resources.fitThugs)} fit`} />
            <Stat label="Security" value={`${formatNumber(me.resources.armedThugs)} armed · ${formatNumber(me.resources.postedThugs)} posted`} />
            <Stat label="Products" value={formatNumber(productUnits)} />
            <Stat label="Wounded" value={formatNumber(me.resources.woundedThugs)} />
            <Stat label="Turf" value={me.turf ? `${formatNumber(me.turf.blocksHeld)} blocks` : 'Not active'} />
            <Stat label="Active runs" value={formatNumber(activeRuns)} />
            <Stat label="Heat" value={me.heat ? `${formatNumber(me.heat.heat)} / ${formatNumber(me.heat.max)}` : 'Not active'} />
          </div>
        </Panel>
      ) : null}

      {hideout?.security ? (
        <Panel title="Lookouts & security" aside="0.7.0-C">
          <p className="se-dim">
            Lookouts warn you about activity around your operation without replacing paid recon.
            Higher levels extend the warning desk and eventually identify who reconned you.
          </p>
          <div className="se-stats">
            <Stat label="Home defense" value={`+${formatNumber(hideout.security.defenseBonusPercent)}%`} />
            <Stat label="Recon warnings" value={securityTierLabel(hideout.security.reconWarningTier)} />
            <Stat label="Security history" value={hideout.security.historyHours > 0 ? `${formatNumber(hideout.security.historyHours)}h` : 'None'} />
            <Stat label="Threat heads-up" value={hideout.security.convoyHeadsUpMinutes > 0 ? `~${hideout.security.convoyHeadsUpMinutes.toFixed(1)} min` : 'None'} />
            <Stat label="Run traffic near home" value={hideout.security.localTrafficCount === null ? 'Upgrade Lookouts' : formatNumber(hideout.security.localTrafficCount)} />
            <Stat label="Active threats" value={formatNumber(hideout.security.pendingConvoyThreats + hideout.security.pendingTurfThreats)} />
          </div>

          {hideout.security.suspicious.length ? (
            <div className="se-rows se-mt">
              {hideout.security.suspicious.map((event, index) => (
                <Row
                  key={`${event.kind}:${event.at}:${index}`}
                  label={event.title}
                  value={`${event.detail} · ${new Date(event.at).toLocaleString()}`}
                  strong={event.urgent}
                />
              ))}
            </div>
          ) : (
            <p className="se-muted se-mt">
              {hideout.security.reconWarningTier === 'NONE'
                ? 'Build Lookouts to start hearing about suspicious activity.'
                : 'Nothing suspicious is inside your current warning window.'}
            </p>
          )}

          <p className="se-hint">
            Nearby-run awareness is count-only. Names, cargo, escort strength and route details still require normal convoy recon or turf sightings.
          </p>
          <p className="se-hint">
            Specialization hooks are prepared but inactive until 0.7.0-G: Street Eyes would add {formatNumber(hideout.security.specializationHooks.streetEyes.warningHoursBonus)}h of warning history; Armed Watch would add +{formatNumber(hideout.security.specializationHooks.armedWatch.defenseBonusPercent)}% defense.
          </p>
        </Panel>
      ) : null}

      {hideout?.workshop ? (
        <Panel title="Workshop production" aside="0.7.0-D">
          <p className="se-dim">
            The Workshop now uses one bonus path for every cookable product. Output and ingredient efficiency are tuned separately.
          </p>
          <div className="se-stats">
            <Stat label="Output bonus" value={`+${formatNumber(hideout.workshop.outputBonusPercent)}%`} />
            <Stat label="Ingredient efficiency" value={`${formatNumber(hideout.workshop.ingredientEfficiencyPercent)}%`} />
          </div>
          <div className="se-rows se-mt">
            {hideout.workshop.recipes.map((recipe) => (
              <Row
                key={recipe.key}
                label={recipe.name}
                value={recipe.baseIngredientCentsPerUnit === recipe.effectiveIngredientCentsPerUnit
                  ? `${formatCents(recipe.baseIngredientCentsPerUnit)} ingredients / unit`
                  : `${formatCents(recipe.effectiveIngredientCentsPerUnit)} / unit · base ${formatCents(recipe.baseIngredientCentsPerUnit)}`}
                strong={recipe.effectiveIngredientCentsPerUnit < recipe.baseIngredientCentsPerUnit}
              />
            ))}
          </div>
          <p className="se-hint">
            Workshop output still tops out at 15%. Ingredient efficiency tops out at 8%, so production improves without becoming free.
          </p>
        </Panel>
      ) : null}

      {hideout?.garage ? (
        <Panel title="Garage & logistics" aside="0.7.0-D">
          <p className="se-dim">
            The Garage manages capacity, Low-Riders and moving costs. It does not make the roads faster or safer.
          </p>
          <div className="se-stats">
            <Stat label="Run slots" value={`${formatNumber(activeRuns)} / ${formatNumber(hideout.garage.runLimit)}`} />
            <Stat label="Low-Riders home" value={formatNumber(lowRidersHome)} />
            <Stat label="Low-Riders away" value={formatNumber(lowRidersAway)} />
            <Stat label="Escorts away" value={formatNumber(escortsAway)} />
            <Stat label="Cargo away" value={garageRuns.length ? `${formatNumber(cargoUsed)} / ${formatNumber(cargoCapacity)}` : 'None'} />
            <Stat label="Move discount" value={`${formatNumber(hideout.garage.relocationFeeDiscountPercent)}%`} />
          </div>
          {garageRuns.length ? (
            <div className="se-rows se-mt">
              {garageRuns.map((run, index) => {
                const used = run.beer + run.cargo.reduce((sum, row) => sum + row.quantity, 0);
                return (
                  <Row
                    key={run.id}
                    label={`Run ${index + 1} · ${run.position.cityName}`}
                    value={`${formatNumber(run.lowRiders)} cars · ${formatNumber(run.escortThugs)} escorts · ${formatNumber(used)} / ${formatNumber(run.capacity)} cargo`}
                    strong
                  />
                );
              })}
            </div>
          ) : <p className="se-muted se-mt">No runs are away right now.</p>}
          {travel?.relocation ? (
            <div className="se-rows se-mt">
              <Row
                label="Relocation"
                value={travel.relocation.moving
                  ? `Moving to ${travel.relocation.moving.toName}`
                  : travel.relocation.garageFeeDiscountPercent > 0
                    ? `${formatCents(travel.relocation.feeCents)} · save ${formatCents(travel.relocation.garageSavingsCents)}`
                    : formatCents(travel.relocation.feeCents)}
              />
            </div>
          ) : null}
          <p className="se-hint">
            Garage bonuses are deliberately logistical: a second concurrent run and a small relocation discount. Route time, police risk and local markets stay unchanged.
          </p>
        </Panel>
      ) : null}

      {hideout?.ledger ? (
        <Panel title="Back Office ledger" aside="0.7.0-E">
          <p className="se-dim">
            The Back Office tracks real cash income and expenses across street work, stores, production,
            combat, travel, relocation and Hideout spending. Cash merely loaded into a run is not counted as spending.
          </p>
          <div className="se-stats">
            {hideout.ledger.windows.map((window) => (
              <Stat
                key={window.days}
                label={window.days === 1 ? '24h net' : `${window.days}d net`}
                value={formatCents(window.netCents)}
              />
            ))}
            <Stat label="Itemized history" value={`${formatNumber(hideout.ledger.historyDays)}d · ${formatNumber(hideout.ledger.rowLimit)} rows`} />
          </div>
          {hideout.ledger.entries.length ? (
            <div className="se-rows se-mt">
              {hideout.ledger.entries.map((entry) => (
                <Row
                  key={entry.id}
                  label={entry.label}
                  value={`${entry.amountCents >= 0 ? '+' : '−'}${formatCents(Math.abs(entry.amountCents))} · ${new Date(entry.createdAt).toLocaleString()}`}
                  strong={entry.category === 'INCOME'}
                />
              ))}
            </div>
          ) : (
            <p className="se-muted se-mt">No cash-moving activity is inside your current ledger window yet.</p>
          )}
          <p className="se-hint">
            Rolling totals always show 24 hours, 7 days and 30 days. Back Office levels expand the itemized audit trail from {formatNumber(hideout.ledger.historyDays)} days at your current level.
          </p>
          <p className="se-hint">
            Specialization hooks are prepared but inactive until 0.7.0-G: Bookkeeping adds {formatNumber(hideout.ledger.specializationHooks.bookkeeping.historyDaysBonus)} days of ledger history; Connections adds +{formatNumber(hideout.ledger.specializationHooks.connections.takeBonusPercent)}% street take.
          </p>
        </Panel>
      ) : null}

      {hideout?.assetProtection ? (
        <Panel title="Safe Room protection" aside="0.7.0-B">
          <p className="se-dim">
            Cash below the raid floor and the highest-value product units inside the Safe Room cannot be taken.
            Product protection is calculated from your real stash; there is no second inventory to manage.
          </p>
          <div className="se-stats">
            <Stat label="Cash protected" value={formatCents(hideout.assetProtection.protectedCashCents)} />
            <Stat label="Cash exposed" value={formatCents(hideout.assetProtection.exposedCashCents)} />
            <Stat label="Product protected" value={`${formatNumber(hideout.assetProtection.protectedProductUnits)} / ${formatNumber(hideout.assetProtection.protectedProductCapacity)}`} />
            <Stat label="Product exposed" value={formatNumber(hideout.assetProtection.exposedProductUnits)} />
          </div>
          {hideout.assetProtection.products.length ? (
            <div className="se-rows se-mt">
              {hideout.assetProtection.products.map((product) => (
                <Row
                  key={product.key}
                  label={product.name}
                  value={`${formatNumber(product.protected)} protected · ${formatNumber(product.exposed)} exposed · ${formatNumber(product.total)} total`}
                  strong={product.protected > 0}
                />
              ))}
            </div>
          ) : <p className="se-muted se-mt">No product is stored here right now.</p>}
          <p className="se-hint">
            Storage priority: highest-value product first. Product above the cap stays exposed, so large stashes remain worth raiding.
          </p>
        </Panel>
      ) : null}

      <Panel title="Fair season build">
        <p className="se-dim">
          Hideout upgrades are mechanical and seasonal. Spend this round&apos;s cash and meet the listed
          progression gates for capped buffs now; the final build stays on the season record, and the
          next round starts fresh.
        </p>
      </Panel>

      {loadError ? <Alert>{loadError} <button className="se-btn se-btn--sm" onClick={() => setReload((n) => n + 1)}>Retry</button></Alert> : null}
      {action.error ? <Alert>{action.error}</Alert> : null}

      {receipt && action.result ? (
        <div className="se-store-receipt" aria-live="polite">
          <ActionResult
            title={`${receipt.roomName} upgraded`}
            subtitle={`Level ${receipt.levelBefore} -> ${receipt.levelAfter}`}
            result={action.result}
            onDismiss={action.clear}
            lines={[
              { label: 'Paid', delta: -receipt.costCents, money: true },
              { label: 'Effect', value: receipt.effect },
              { label: 'Turns used', value: '0' },
            ]}
          />
        </div>
      ) : null}

      {!hideout && !loadError ? <Panel title="Loading"><p className="se-muted">Checking the locks...</p></Panel> : null}

      {hideout && !hideout.enabled ? (
        <Panel title="Hideout closed">
          <p className="se-muted">This round does not use seasonal hideout upgrades.</p>
        </Panel>
      ) : null}

      {hideout?.enabled && me ? (
        <>
          <div className="se-stats se-mb">
            <Stat label="Upgrades" value={`${formatNumber(hideout.totalLevel)} / ${formatNumber(hideout.totalMaxLevel)}`} />
            <Stat label="Ready now" value={formatNumber(readyRooms.length)} />
            <Stat label="Framework" value={hideout.rulesVersion === 2 ? 'Hideout 2.0' : 'Classic'} />
          </div>

          <div className="se-grid se-grid--sidebar">
            <div className="se-grid se-grid--2">
              {hideout.rooms.map((room) => (
                <RoomCard
                  key={room.key}
                  room={room}
                  cashCents={me.resources.cashCents}
                  blocked={action.busy ? 'Your last upgrade is still going through.' : loadError !== null ? 'The hideout could not be loaded, so nothing can be built yet.' : null}
                  onUpgrade={(next) => void upgrade(next)}
                />
              ))}
            </div>

            <aside className="se-grid">
              <Panel title="Next upgrade" flush>
                {nextRoom ? (
                  <>
                    <div className="se-rows">
                      <Row label="Room" value={nextRoom.name} strong />
                      <Row label="Cost" value={formatCents(nextRoom.nextCostCents!)} />
                      <Row label="Effect" value={nextRoom.nextEffect} />
                      {nextRoom.nextRequirements.map((requirement) => (
                        <Row
                          key={requirement.key}
                          label={requirement.label}
                          value={`${formatNumber(requirement.current)} / ${formatNumber(requirement.required)}${requirement.met ? ' ready' : ''}`}
                        />
                      ))}
                    </div>
                    <Button
                      type="button"
                      className="se-btn se-btn--primary se-btn--block"
                      disabledReason={action.busy
                        ? 'Your last upgrade is still going through.'
                        : nextRoom.lockReason
                          ?? (me.resources.cashCents < nextRoom.nextCostCents!
                            ? `This costs ${formatCents(nextRoom.nextCostCents!)} and you are ${formatCents(nextRoom.nextCostCents! - me.resources.cashCents)} short.`
                            : null)}
                      onClick={() => void upgrade(nextRoom)}
                    >
                      {me.resources.cashCents < nextRoom.nextCostCents!
                        ? `Need ${formatCents(nextRoom.nextCostCents!)}`
                        : nextRoom.canUpgrade
                          ? `Upgrade ${nextRoom.name}`
                          : 'Upgrade locked'}
                    </Button>
                  </>
                ) : (
                  <p className="se-muted">Every room is fully upgraded for this season.</p>
                )}
              </Panel>

              <Panel title="Season scope">
                <p className="se-dim">
                  These bonuses help only this round. The build is saved to the season archive,
                  then the next round starts everyone from a clean hideout.
                </p>
              </Panel>
            </aside>
          </div>
        </>
      ) : null}
    </GameLayout>
  );
}
