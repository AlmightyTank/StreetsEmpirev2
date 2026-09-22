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
