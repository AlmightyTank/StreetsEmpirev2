import { useEffect, useState } from 'react';
import type { HideoutDto, HideoutRoomDto, HideoutUpgradeResult } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { hideoutApi } from '../api/hideout.js';
import { ApiError } from '../api/client.js';
import { ActionResult } from '../components/ActionResult.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row, Stat } from '../components/Panel.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

function RoomCard({
  room,
  cashCents,
  disabled,
  onUpgrade,
}: {
  room: HideoutRoomDto;
  cashCents: number;
  disabled: boolean;
  onUpgrade: (room: HideoutRoomDto) => void;
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
      <div className="se-rows se-mt">
        <Row label="Current" value={room.currentEffect} />
        <Row label="Next" value={room.nextEffect ?? 'Fully upgraded'} strong />
        <Row label="Cost" value={room.nextCostCents === null ? '-' : formatCents(room.nextCostCents)} />
      </div>
      <button
        type="button"
        className="se-btn se-btn--primary se-btn--block"
        disabled={disabled || maxed || !affordable}
        onClick={() => onUpgrade(room)}
      >
        {maxed ? 'Fully upgraded' : affordable ? `Upgrade ${room.name}` : `Need ${formatCents(room.nextCostCents!)}`}
      </button>
    </Panel>
  );
}

export function HideoutPage() {
  const me = useSession((s) => s.me);
  const action = useGameAction<HideoutUpgradeResult>();
  const [hideout, setHideout] = useState<HideoutDto | null>(null);
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
    return () => { active = false; };
  }, [me?.resources.cashCents, reload]);

  async function upgrade(room: HideoutRoomDto) {
    await action.run((actionId) => hideoutApi.upgrade({ room: room.key, actionId }));
    setReload((n) => n + 1);
  }

  const receipt = action.result?.result ?? null;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Hideout</h1>
          <p className="se-eyebrow">Seasonal upgrades and small buffs</p>
        </div>
      </div>

      <Panel title="Fair season build">
        <p className="se-dim">
          Hideout upgrades are mechanical and seasonal. Spend this round's cash for capped buffs now;
          the final build stays on the season record, and the next round starts fresh.
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
            <Stat label="Cash" value={formatCents(me.resources.cashCents)} />
            <Stat label="Upgrades" value={`${formatNumber(hideout.totalLevel)} / ${formatNumber(hideout.totalMaxLevel)}`} />
            <Stat label="Scope" value="Seasonal" />
          </div>

          <div className="se-grid se-grid--2">
            {hideout.rooms.map((room) => (
              <RoomCard
                key={room.key}
                room={room}
                cashCents={me.resources.cashCents}
                disabled={action.busy || loadError !== null}
                onUpgrade={(next) => void upgrade(next)}
              />
            ))}
          </div>
        </>
      ) : null}
    </GameLayout>
  );
}
