import { useEffect, useState, type ReactNode } from 'react';
import type {
  HideoutRoomV2Dto,
  HideoutSpecializationResult,
  HideoutSpecializationRoomDto,
  HideoutUpgradeResult,
  HideoutWeaponPriorityDto,
  HideoutWeaponPriorityResult,
  HideoutV2Dto,
  TravelDto,
} from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { hideoutApi } from '../api/hideout.js';
import { api, ApiError } from '../api/client.js';
import { ActionResult } from '../components/ActionResult.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Row } from '../components/Panel.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

function securityTierLabel(tier: NonNullable<HideoutV2Dto['security']>['reconWarningTier']): string {
  if (tier === 'SOURCE') return 'Named warnings';
  if (tier === 'PRESENCE') return 'Anonymous warnings';
  return 'No recon warnings';
}

function Metric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'good' | 'warn' | 'bad' | 'accent';
}) {
  return (
    <div className={`se-hideout-metric${tone ? ` se-hideout-metric--${tone}` : ''}`}>
      <span className="se-hideout-metric__label">{label}</span>
      <strong className="se-hideout-metric__value">{value}</strong>
      {detail ? <span className="se-hideout-metric__detail">{detail}</span> : null}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  copy,
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="se-hideout-sectionhead">
      <span className="se-eyebrow">{eyebrow}</span>
      <div>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
    </div>
  );
}

function RoomCard({
  room,
  cashCents,
  blocked,
  specializing,
  onUpgrade,
  onSpecialize,
}: {
  room: HideoutRoomV2Dto;
  cashCents: number;
  /** Why no room can be upgraded right now, or null when they can. */
  blocked: string | null;
  specializing: boolean;
  onUpgrade: (room: HideoutRoomV2Dto) => void;
  onSpecialize: (room: HideoutRoomV2Dto, key: string) => void;
}) {
  const maxed = room.nextCostCents === null;
  const affordable = !maxed && cashCents >= room.nextCostCents!;
  const selectedSpecialization = room.specialization?.selectedKey
    ? room.specialization.choices.find((choice) => choice.key === room.specialization!.selectedKey) ?? null
    : null;
  const specializationReady = Boolean(
    room.specialization
    && room.level >= room.specialization.unlockLevel
    && room.specialization.selectedKey === null
  );
  const requirementsMet = room.nextRequirements.every((requirement) => requirement.met);
  const state = maxed
    ? 'maxed'
    : room.canUpgrade
      ? 'ready'
      : !affordable
        ? 'cash'
        : !requirementsMet || room.lockReason
          ? 'locked'
          : 'locked';
  const stateLabel = state === 'maxed'
    ? 'Max level'
    : state === 'ready'
      ? 'Ready'
      : state === 'cash'
        ? 'Need cash'
        : 'Locked';

  return (
    <article className={`se-hideout-room se-hideout-room--${state}`} data-room={room.key.toLowerCase()}>
      <div className="se-hideout-room__head">
        <div>
          <span className="se-hideout-room__kicker">{room.key.replaceAll('_', ' ')}</span>
          <h3>{room.name}</h3>
        </div>
        <span className={`se-hideout-status se-hideout-status--${state}`}>{stateLabel}</span>
      </div>

      <p className="se-hideout-room__blurb">{room.blurb}</p>

      <div className="se-hideout-room__levels" aria-label={`${room.level} of ${room.maxLevel} levels complete`}>
        {Array.from({ length: room.maxLevel }, (_, index) => (
          <span
            key={index}
            className={index < room.level ? 'is-filled' : undefined}
            aria-hidden="true"
          />
        ))}
      </div>

      <div className="se-hideout-room__effect">
        <span>Active effect</span>
        <strong>{room.currentEffect}</strong>
      </div>

      {!maxed ? (
        <div className="se-hideout-room__next">
          <div>
            <span>Next level</span>
            <strong>{room.nextEffect}</strong>
          </div>
          <div className="se-hideout-room__price">
            <span>Cost</span>
            <strong>{formatCents(room.nextCostCents!)}</strong>
          </div>
        </div>
      ) : (
        <div className="se-hideout-room__next se-hideout-room__next--maxed">
          <div>
            <span>Build complete</span>
            <strong>Fully upgraded for this season</strong>
          </div>
        </div>
      )}

      {room.nextRequirements.length ? (
        <div className="se-hideout-room__requirements">
          {room.nextRequirements.map((requirement) => (
            <div key={requirement.key} className={requirement.met ? 'is-met' : undefined}>
              <span>{requirement.label}</span>
              <strong>{formatNumber(requirement.current)} / {formatNumber(requirement.required)}</strong>
            </div>
          ))}
        </div>
      ) : null}

      {room.specialization ? (
        <div className="se-hideout-room__specialization">
          <span className="se-hideout-room__specialization-label">Specialization</span>
          {selectedSpecialization ? (
            <div>
              <strong>{selectedSpecialization.name}</strong>
              <p>{selectedSpecialization.blurb}</p>
            </div>
          ) : room.level < room.specialization.unlockLevel ? (
            <p>
              Unlocks at level {formatNumber(room.specialization.unlockLevel)} ·{' '}
              {room.specialization.choices.map((choice) => choice.name).join(' / ')}
            </p>
          ) : (
            <p>Choose one permanent branch for this season.</p>
          )}
        </div>
      ) : null}

      {specializationReady && room.specialization ? (
        <div className="se-hideout-room__choices">
          {room.specialization.choices.map((choice) => (
            <Button
              key={choice.key}
              type="button"
              className="se-btn se-btn--ghost se-btn--sm"
              disabledReason={specializing ? 'Saving your permanent branch choice.' : null}
              onClick={() => onSpecialize(room, choice.key)}
            >
              {choice.name}
            </Button>
          ))}
        </div>
      ) : null}

      <Button
        type="button"
        className="se-btn se-btn--primary se-btn--block"
        disabledReason={blocked
          ?? (maxed ? 'This room is fully upgraded for this season.' : null)
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
              ? `Upgrade to level ${formatNumber(room.level + 1)}`
              : 'Requirements not met'}
      </Button>
    </article>
  );
}

/** Shows the current headquarters state and controls for seasonal room upgrades. */
export function HideoutPage() {
  const me = useSession((s) => s.me);
  const action = useGameAction<HideoutUpgradeResult>();
  const armoryAction = useGameAction<HideoutWeaponPriorityResult>();
  const specializationAction = useGameAction<HideoutSpecializationResult>();
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

  async function setWeaponPriority(priority: HideoutWeaponPriorityDto) {
    await armoryAction.run((actionId) => hideoutApi.setWeaponPriority({ priority, actionId }));
    setReload((n) => n + 1);
  }

  async function specialize(room: HideoutRoomV2Dto, specialization: string) {
    const choice = room.specialization?.choices.find((candidate) => candidate.key === specialization);
    if (!choice || room.key === 'GARAGE') return;
    if (!window.confirm(
      `Choose ${choice.name} for ${room.name}? This choice is permanent for the rest of this season.`,
    )) return;

    await specializationAction.run((actionId) => hideoutApi.specialize({
      room: room.key as HideoutSpecializationRoomDto,
      specialization,
      actionId,
    }));
    setReload((n) => n + 1);
  }

  const receipt = action.result?.result ?? null;
  const openRooms = hideout?.rooms.filter((room) => room.nextCostCents !== null) ?? [];
  const readyRooms = openRooms.filter((room) => room.canUpgrade);
  const nextRoom = [...openRooms].sort((a, b) => a.nextCostCents! - b.nextCostCents!)[0] ?? null;
  const buildProgress = hideout && hideout.totalMaxLevel > 0
    ? Math.round((hideout.totalLevel / hideout.totalMaxLevel) * 100)
    : 0;

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
  const activeThreats = hideout?.security
    ? hideout.security.pendingConvoyThreats + hideout.security.pendingTurfThreats
    : 0;

  return (
    <GameLayout>
      <div className="se-hideout">
        <header className="se-hideout-hero">
          <div className="se-hideout-hero__copy">
            <span className="se-eyebrow">Your operation · seasonal headquarters</span>
            <h1>Hideout</h1>
            <p>
              Protect the stash, run your crew, and build permanent-for-the-season upgrades from one headquarters screen.
            </p>
          </div>
          {hideout?.enabled ? (
            <div className="se-hideout-hero__progress">
              <div>
                <span>Build progress</span>
                <strong>{formatNumber(hideout.totalLevel)} / {formatNumber(hideout.totalMaxLevel)}</strong>
              </div>
              <div className="se-hideout-progress" aria-label={`${buildProgress}% of hideout upgrades complete`}>
                <span style={{ width: `${buildProgress}%` }} />
              </div>
              <small>{formatNumber(buildProgress)}% complete · {formatNumber(readyRooms.length)} ready now</small>
            </div>
          ) : null}
        </header>

        {loadError ? (
          <Alert>
            {loadError}{' '}
            <button className="se-btn se-btn--sm" onClick={() => setReload((n) => n + 1)}>Retry</button>
          </Alert>
        ) : null}
        {action.error ? <Alert>{action.error}</Alert> : null}
        {specializationAction.error ? <Alert>{specializationAction.error}</Alert> : null}

        {!hideout && !loadError ? (
          <Panel title="Loading"><p className="se-muted">Checking the locks...</p></Panel>
        ) : null}

        {hideout && !hideout.enabled ? (
          <Panel title="Hideout closed">
            <p className="se-muted">This round does not use seasonal hideout upgrades.</p>
          </Panel>
        ) : null}

        {hideout?.enabled && me ? (
          <>
            <nav className="se-hideout-nav" aria-label="Hideout sections">
              <a href="#hideout-overview">Overview</a>
              <a href="#hideout-upgrades">Upgrades <span>{formatNumber(readyRooms.length)}</span></a>
              <a href="#hideout-security">Security</a>
              <a href="#hideout-operations">Operations</a>
            </nav>

            <section id="hideout-overview" className="se-hideout-overview">
              <div className="se-hideout-overview__primary">
                <div className="se-hideout-overview__title">
                  <div>
                    <span className="se-eyebrow">Headquarters snapshot</span>
                    <h2>Operation status</h2>
                  </div>
                  <span className="se-hideout-chip">Hideout 2.0</span>
                </div>

                <div className="se-hideout-metrics">
                  <Metric label="Cash on hand" value={formatCents(me.resources.cashCents)} tone="accent" />
                  <Metric
                    label="Cash exposed"
                    value={hideout.assetProtection ? formatCents(hideout.assetProtection.exposedCashCents) : '—'}
                    detail={hideout.assetProtection ? `${formatCents(hideout.assetProtection.protectedCashCents)} protected` : undefined}
                    tone={hideout.assetProtection && hideout.assetProtection.exposedCashCents > 0 ? 'warn' : 'good'}
                  />
                  <Metric
                    label="Products"
                    value={formatNumber(productUnits)}
                    detail={hideout.assetProtection
                      ? `${formatNumber(hideout.assetProtection.exposedProductUnits)} exposed`
                      : undefined}
                  />
                  <Metric
                    label="Crew"
                    value={formatNumber(me.resources.whores + me.resources.fitThugs + me.resources.woundedThugs)}
                    detail={`${formatNumber(me.resources.whores)} hoes · ${formatNumber(me.resources.fitThugs)} fit thugs`}
                  />
                  <Metric
                    label="Active runs"
                    value={formatNumber(activeRuns)}
                    detail={hideout.garage ? `${formatNumber(hideout.garage.runLimit)} slot limit` : undefined}
                  />
                  <Metric
                    label="Threats"
                    value={formatNumber(activeThreats)}
                    detail={securityTierLabel(hideout.security?.reconWarningTier ?? 'NONE')}
                    tone={activeThreats > 0 ? 'bad' : 'good'}
                  />
                  <Metric
                    label="Heat"
                    value={me.heat ? `${formatNumber(me.heat.heat)} / ${formatNumber(me.heat.max)}` : 'Not active'}
                  />
                  <Metric
                    label="Turf"
                    value={me.turf ? `${formatNumber(me.turf.blocksHeld)} blocks` : 'Not active'}
                  />
                </div>
              </div>

              <aside className="se-hideout-priority">
                <span className="se-eyebrow">Next build target</span>
                {nextRoom ? (
                  <>
                    <div className="se-hideout-priority__room">
                      <div>
                        <h3>{nextRoom.name}</h3>
                        <span>Level {formatNumber(nextRoom.level)} → {formatNumber(nextRoom.level + 1)}</span>
                      </div>
                      <strong>{formatCents(nextRoom.nextCostCents!)}</strong>
                    </div>
                    <p>{nextRoom.nextEffect}</p>
                    {nextRoom.nextRequirements.length ? (
                      <div className="se-hideout-priority__reqs">
                        {nextRoom.nextRequirements.map((requirement) => (
                          <span key={requirement.key} className={requirement.met ? 'is-met' : undefined}>
                            {requirement.label} {formatNumber(requirement.current)}/{formatNumber(requirement.required)}
                          </span>
                        ))}
                      </div>
                    ) : null}
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
                  <div className="se-hideout-priority__complete">
                    <strong>Hideout complete</strong>
                    <p>Every room is fully upgraded for this season.</p>
                  </div>
                )}
              </aside>
            </section>

            <section id="hideout-upgrades" className="se-hideout-section">
              <SectionHeading
                eyebrow="Build"
                title="Room upgrades"
                copy="Spend cash and meet progression gates to shape this season's headquarters."
              />

              <div className="se-hideout-roomgrid">
                {hideout.rooms.map((room) => (
                  <RoomCard
                    key={room.key}
                    room={room}
                    cashCents={me.resources.cashCents}
                    blocked={action.busy
                      ? 'Your last upgrade is still going through.'
                      : loadError !== null
                        ? 'The hideout could not be loaded, so nothing can be built yet.'
                        : null}
                    specializing={specializationAction.busy}
                    onUpgrade={(next) => void upgrade(next)}
                    onSpecialize={(next, key) => void specialize(next, key)}
                  />
                ))}
              </div>
            </section>

            <section id="hideout-security" className="se-hideout-section">
              <SectionHeading
                eyebrow="Protect"
                title="Security & assets"
                copy="See what is protected, what is exposed, and whether anything is moving against your home operation."
              />

              <div className="se-hideout-detailgrid">
                {hideout.security ? (
                  <Panel
                    title="Lookouts & security"
                    aside={activeThreats > 0 ? `${formatNumber(activeThreats)} active` : 'Quiet'}
                    className="se-hideout-panel"
                  >
                    <div className="se-hideout-panelstats">
                      <Metric label="Home defense" value={`+${formatNumber(hideout.security.defenseBonusPercent)}%`} tone="good" />
                      <Metric label="Warning tier" value={securityTierLabel(hideout.security.reconWarningTier)} />
                      <Metric
                        label="History"
                        value={hideout.security.historyHours > 0 ? `${formatNumber(hideout.security.historyHours)}h` : 'None'}
                      />
                      <Metric
                        label="Threat heads-up"
                        value={hideout.security.convoyHeadsUpMinutes > 0
                          ? `~${hideout.security.convoyHeadsUpMinutes.toFixed(1)} min`
                          : 'None'}
                      />
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

                    <div className="se-hideout-note">
                      Nearby-run awareness stays count-only. Names, cargo, escort strength, and route details still require normal recon or turf sightings.
                    </div>
                  </Panel>
                ) : null}

                {hideout.assetProtection ? (
                  <Panel title="Safe Room" aside="Raid protection" className="se-hideout-panel">
                    <div className="se-hideout-panelstats">
                      <Metric label="Cash protected" value={formatCents(hideout.assetProtection.protectedCashCents)} tone="good" />
                      <Metric label="Cash exposed" value={formatCents(hideout.assetProtection.exposedCashCents)} tone={hideout.assetProtection.exposedCashCents > 0 ? 'warn' : 'good'} />
                      <Metric
                        label="Product protected"
                        value={`${formatNumber(hideout.assetProtection.protectedProductUnits)} / ${formatNumber(hideout.assetProtection.protectedProductCapacity)}`}
                        tone="good"
                      />
                      <Metric label="Product exposed" value={formatNumber(hideout.assetProtection.exposedProductUnits)} tone={hideout.assetProtection.exposedProductUnits > 0 ? 'warn' : 'good'} />
                    </div>
                    {hideout.assetProtection.products.length ? (
                      <div className="se-rows se-mt">
                        {hideout.assetProtection.products.map((product) => (
                          <Row
                            key={product.key}
                            label={product.name}
                            value={`${formatNumber(product.protected)} safe · ${formatNumber(product.exposed)} exposed`}
                            strong={product.exposed > 0}
                          />
                        ))}
                      </div>
                    ) : <p className="se-muted se-mt">No product is stored here right now.</p>}
                    <div className="se-hideout-note">
                      The Safe Room protects your highest-value product first. Anything above its capacity stays exposed.
                    </div>
                  </Panel>
                ) : null}

                {hideout.armory ? (
                  <Panel title="Armory" aside="Weapon policy" className="se-hideout-panel">
                    <div className="se-hideout-panelstats">
                      <Metric label="Weapons home" value={formatNumber(hideout.armory.weapons.total)} />
                      <Metric label="Armed capacity" value={formatNumber(hideout.armory.armedCapacity)} tone="accent" />
                      <Metric label="Fit thugs" value={formatNumber(hideout.armory.fitThugs)} />
                      <Metric label="Unarmed fit" value={formatNumber(hideout.armory.unarmedFitThugs)} tone={hideout.armory.unarmedFitThugs > 0 ? 'warn' : 'good'} />
                    </div>
                    <div className="se-rows se-mt">
                      <Row label="Pistols" value={formatNumber(hideout.armory.weapons.pistols)} />
                      <Row label="Shotguns" value={formatNumber(hideout.armory.weapons.shotguns)} />
                      <Row label="Tek-9s" value={formatNumber(hideout.armory.weapons.tek9s)} />
                      <Row label="AK-47s" value={formatNumber(hideout.armory.weapons.ak47s)} />
                    </div>
                    <div className="se-hideout-policy">
                      <span className="se-eyebrow">Equip first</span>
                      <div className="se-hideout-policy__buttons">
                        {hideout.armory.choices.map((choice) => (
                          <Button
                            key={choice.key}
                            type="button"
                            className={`se-btn ${hideout.armory!.priority === choice.key ? 'se-btn--primary' : 'se-btn--ghost'}`}
                            disabledReason={armoryAction.busy
                              ? 'Saving the Armory policy.'
                              : hideout.armory!.priority === choice.key
                                ? 'This policy is already active.'
                                : null}
                            onClick={() => void setWeaponPriority(choice.key)}
                          >
                            {choice.name}
                          </Button>
                        ))}
                      </div>
                      <p>{hideout.armory.choices.find((choice) => choice.key === hideout.armory!.priority)?.blurb}</p>
                    </div>
                    {armoryAction.error ? <Alert tone="error">{armoryAction.error}</Alert> : null}
                  </Panel>
                ) : null}

                {hideout.infirmary ? (
                  <Panel title="Infirmary" aside="Crew recovery" className="se-hideout-panel">
                    <div className="se-hideout-panelstats">
                      <Metric label="Fit thugs" value={formatNumber(hideout.infirmary.fitThugs)} />
                      <Metric label="Wounded" value={formatNumber(hideout.infirmary.woundedThugs)} tone={hideout.infirmary.woundedThugs > 0 ? 'warn' : 'good'} />
                      <Metric label="Medicine" value={formatNumber(hideout.infirmary.medicine)} />
                      <Metric label="Treat now" value={formatNumber(hideout.infirmary.maxTreatableThugs)} tone="accent" />
                    </div>
                    <div className="se-rows se-mt">
                      <Row
                        label="Medicine efficiency"
                        value={hideout.infirmary.medicineEfficiencyPercent > 0
                          ? `${formatNumber(hideout.infirmary.medicineEfficiencyPercent)}%`
                          : 'Base'}
                      />
                      <Row
                        label="Medicine for all wounds"
                        value={formatNumber(hideout.infirmary.medicineNeededForAll)}
                      />
                      <Row
                        label="Next natural recovery"
                        value={hideout.infirmary.nextRecoveryAt
                          ? new Date(hideout.infirmary.nextRecoveryAt).toLocaleString()
                          : 'No wounds queued'}
                      />
                    </div>
                    <div className="se-hideout-note">
                      Treatment remains on Combat so there is still one authoritative recovery action.
                    </div>
                  </Panel>
                ) : null}
              </div>
            </section>

            <section id="hideout-operations" className="se-hideout-section">
              <SectionHeading
                eyebrow="Run"
                title="Operations"
                copy="Production, logistics, and the books—everything that keeps the headquarters moving."
              />

              <div className="se-hideout-detailgrid">
                {hideout.workshop ? (
                  <Panel title="Workshop" aside="Production" className="se-hideout-panel">
                    <div className="se-hideout-panelstats">
                      <Metric label="Output bonus" value={`+${formatNumber(hideout.workshop.outputBonusPercent)}%`} tone="good" />
                      <Metric label="Ingredient efficiency" value={`${formatNumber(hideout.workshop.ingredientEfficiencyPercent)}%`} tone="good" />
                    </div>
                    <div className="se-rows se-mt">
                      {hideout.workshop.recipes.map((recipe) => (
                        <Row
                          key={recipe.key}
                          label={recipe.name}
                          value={recipe.baseIngredientCentsPerUnit === recipe.effectiveIngredientCentsPerUnit
                            ? `${formatCents(recipe.baseIngredientCentsPerUnit)} / unit`
                            : `${formatCents(recipe.effectiveIngredientCentsPerUnit)} / unit · base ${formatCents(recipe.baseIngredientCentsPerUnit)}`}
                          strong={recipe.effectiveIngredientCentsPerUnit < recipe.baseIngredientCentsPerUnit}
                        />
                      ))}
                    </div>
                    <div className="se-hideout-note">
                      Output tops out at 15%; ingredient efficiency tops out at 8%. The Workshop improves every cookable product.
                    </div>
                  </Panel>
                ) : null}

                {hideout.garage ? (
                  <Panel title="Garage" aside="Logistics" className="se-hideout-panel">
                    <div className="se-hideout-panelstats">
                      <Metric label="Run slots" value={`${formatNumber(activeRuns)} / ${formatNumber(hideout.garage.runLimit)}`} tone="accent" />
                      <Metric label="Low-Riders home" value={formatNumber(lowRidersHome)} />
                      <Metric label="Low-Riders away" value={formatNumber(lowRidersAway)} />
                      <Metric label="Escorts away" value={formatNumber(escortsAway)} />
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
                    <div className="se-rows se-mt">
                      <Row
                        label="Cargo away"
                        value={garageRuns.length ? `${formatNumber(cargoUsed)} / ${formatNumber(cargoCapacity)}` : 'None'}
                      />
                      <Row
                        label="Move discount"
                        value={`${formatNumber(hideout.garage.relocationFeeDiscountPercent)}%`}
                      />
                      {travel?.relocation ? (
                        <Row
                          label="Relocation"
                          value={travel.relocation.moving
                            ? `Moving to ${travel.relocation.moving.toName}`
                            : travel.relocation.garageFeeDiscountPercent > 0
                              ? `${formatCents(travel.relocation.feeCents)} · save ${formatCents(travel.relocation.garageSavingsCents)}`
                              : formatCents(travel.relocation.feeCents)}
                        />
                      ) : null}
                    </div>
                    <div className="se-hideout-note">
                      Garage bonuses stay logistical. Route time, police risk, and local markets are unchanged.
                    </div>
                  </Panel>
                ) : null}

                {hideout.ledger ? (
                  <Panel title="Back Office" aside="Ledger" className="se-hideout-panel se-hideout-panel--wide">
                    <div className="se-hideout-panelstats se-hideout-panelstats--ledger">
                      {hideout.ledger.windows.map((window) => (
                        <Metric
                          key={window.days}
                          label={window.days === 1 ? '24h net' : `${window.days}d net`}
                          value={formatCents(window.netCents)}
                          tone={window.netCents > 0 ? 'good' : window.netCents < 0 ? 'bad' : undefined}
                        />
                      ))}
                      <Metric
                        label="Audit history"
                        value={`${formatNumber(hideout.ledger.historyDays)}d`}
                        detail={`${formatNumber(hideout.ledger.rowLimit)} rows`}
                      />
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
                    <div className="se-hideout-note">
                      Cash merely loaded into a run is not counted as spending. Rolling totals always show 24 hours, 7 days, and 30 days.
                    </div>
                  </Panel>
                ) : null}
              </div>
            </section>

            <footer className="se-hideout-season">
              <div>
                <span className="se-eyebrow">Season rules</span>
                <strong>Your build matters this round.</strong>
              </div>
              <p>
                Hideout upgrades are mechanical and seasonal. Level-3 specialization choices are permanent until the season ends;
                the final build is archived, then the next round starts with a clean headquarters.
              </p>
            </footer>
          </>
        ) : null}

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
      </div>
    </GameLayout>
  );
}
