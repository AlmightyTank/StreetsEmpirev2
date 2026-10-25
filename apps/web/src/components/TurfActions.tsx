import { useEffect, useState } from 'react';
import type {
  GameActionResult,
  TurfBlockDto,
  TurfClaimResult,
  TurfPostResult,
  TurfPullResult,
  TurfPushBackupResult,
  TurfPushCallResult,
  TurfPushStartResult,
} from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { api } from '../api/client.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { useSession } from '../stores/session.js';
import { Button } from './Button.js';
import { formatClockTime } from '../utils/time.js';
import { homeSquadBlock, initialTurfSquad } from '../utils/turfSquad.js';
import { QuantityStepper } from './QuantityStepper.js';

type TurfResult =
  | TurfClaimResult
  | TurfPostResult
  | TurfPullResult
  | TurfPushStartResult
  | TurfPushBackupResult
  | TurfPushCallResult;

export function TurfActions({
  block,
  isHome,
  holdingEnabled,
  warsEnabled,
  onChanged,
}: {
  block: TurfBlockDto;
  isHome: boolean;
  holdingEnabled: boolean;
  warsEnabled: boolean;
  onChanged?: () => void;
}) {
  const action = useGameAction<TurfResult>();
  const me = useSession((s) => s.me);
  const armedAtHome = me?.resources.armedThugs ?? 0;
  const owned = Boolean(block.isMine);
  const suggested = block.holder
    ? Math.max(1, block.cornerMinimumThugs)
    : Math.max(1, block.cornerMinimumThugs, Math.ceil(block.localsThugs * 1.25));
  const [thugs, setThugs] = useState(() => initialTurfSquad(owned, armedAtHome, suggested, block.cornerThugs));

  useEffect(() => {
    setThugs(initialTurfSquad(owned, armedAtHome, suggested, block.cornerThugs));
  }, [block.city, block.district, block.holder?.publicPimpId, block.cornerMinimumThugs, block.localsThugs, block.cornerThugs, armedAtHome, owned, suggested]);

  const sendBlock = homeSquadBlock(armedAtHome, thugs);
  const sendBlockedReason = sendBlock === 'away'
    ? 'Your thugs are already away. Nobody fit and armed is at home.'
    : sendBlock === 'short'
      ? `You only have ${formatNumber(armedAtHome)} fit, armed thugs at home.`
      : sendBlock === 'empty'
        ? 'Choose at least 1 thug who is at home.'
        : null;
  const squadMax = owned ? Math.max(block.cornerThugs, armedAtHome, 1) : Math.max(0, armedAtHome);

  if (!holdingEnabled) return null;

  async function run(path: string, amount: number) {
    await action.run((actionId) => api.post<GameActionResult<TurfResult>>(path, {
      district: block.district,
      thugs: amount,
      actionId,
    }));
    onChanged?.();
  }

  async function push(amount: number) {
    await action.run((actionId) => api.post<GameActionResult<TurfResult>>('/game/turf/push', {
      district: block.district,
      squad: amount,
      actionId,
    }));
    onChanged?.();
  }

  async function backup(pushId: string, amount: number) {
    await action.run((actionId) => api.post<GameActionResult<TurfResult>>('/game/turf/push/backup', {
      pushId,
      thugs: amount,
      actionId,
    }));
    onChanged?.();
  }

  async function callAllies(pushId: string) {
    await action.run((actionId) => api.post<GameActionResult<TurfResult>>('/game/turf/push/call', {
      pushId,
      actionId,
    }));
    onChanged?.();
  }

  if (block.push) {
    const label = block.push.role === 'attacker'
      ? 'Your push'
      : block.push.role === 'defender'
        ? 'Incoming push'
        : 'Alliance call';
    return (
      <div className="se-turfactions">
        <span className="se-hint">
          {label} · {formatNumber(block.push.squad)} attacking · lands {formatClockTime(block.push.landsAt)}
        </span>
        {block.push.role !== 'attacker' ? (
          <>
            <div className="se-field">
              <span className="se-field__label">Fight backup</span>
              <input
                className="se-input"
                type="number"
                inputMode="numeric"
                min={armedAtHome > 0 ? 1 : 0}
                max={Math.max(0, armedAtHome)}
                step={1}
                value={armedAtHome > 0 ? Math.min(thugs, armedAtHome) : 0}
                disabled={block.push.backupSent || action.busy || armedAtHome < 1}
                onChange={(event) => setThugs(Math.min(armedAtHome, Math.max(1, Math.floor(Number(event.target.value) || 1))))}
              />
              <QuantityStepper value={armedAtHome > 0 ? Math.min(thugs, armedAtHome) : 0} onChange={setThugs}
                min={armedAtHome > 0 ? 1 : 0} max={Math.max(0, armedAtHome)} disabled={block.push.backupSent || action.busy || armedAtHome < 1} unitLabel="thugs" />
            </div>
            <div className="se-actions-row">
              <Button
                type="button"
                className="se-btn se-btn--sm"
                disabledReason={block.push.backupSent ? 'Your help is already committed.' : action.busy ? 'That turf move is still going through.' : sendBlockedReason}
                onClick={() => void backup(block.push!.id, Math.min(thugs, Math.max(0, armedAtHome)))}
              >
                {block.push.backupSent ? 'Backup sent' : <>Send {formatNumber(Math.min(thugs, Math.max(0, armedAtHome)))}</>}
              </Button>
              {block.push.role === 'defender' && isHome ? (
                <Button
                  type="button"
                  className="se-btn se-btn--ghost se-btn--sm"
                  disabledReason={action.busy ? 'That turf move is still going through.' : null}
                  onClick={() => void run('/game/turf/pull', block.cornerThugs)}
                >
                  Abandon corner
                </Button>
              ) : null}
              {block.push.canCallAllies ? (
                <Button
                  type="button"
                  className="se-btn se-btn--ghost se-btn--sm"
                  disabledReason={action.busy ? 'That turf move is still going through.' : null}
                  onClick={() => void callAllies(block.push!.id)}
                >
                  Call allies
                </Button>
              ) : null}
            </div>
            {block.push.role === 'ally' ? <span className="se-hint">Alliance help has a chance to arrive when the push lands.</span> : null}
            {block.push.alliesCalled && block.push.role === 'defender' ? <span className="se-hint">Alliance call is out.</span> : null}
            {action.error ? <span className="se-error" role="alert">{action.error}</span> : null}
          </>
        ) : null}
      </div>
    );
  }

  // Away corners are established/serviced by a run below the Turf board.
  // Incoming pushes still need to be defendable here by the remote owner.
  if (!isHome) return null;

  const controls = !block.holder ? (
    <Button
      type="button"
      className="se-btn se-btn--sm"
      disabledReason={action.busy ? 'That corner move is still going through.' : block.claimBlockedReason ?? sendBlockedReason}
      onClick={() => void run('/game/turf/claim', Math.min(thugs, Math.max(0, armedAtHome)))}
    >
      Claim with {formatNumber(thugs)}
    </Button>
  ) : block.isMine ? (
    <>
      <Button
        type="button"
        className="se-btn se-btn--sm"
        disabledReason={action.busy ? 'That corner move is still going through.' : sendBlockedReason}
        onClick={() => void run('/game/turf/post', Math.min(thugs, Math.max(0, armedAtHome)))}
      >
        Reinforce +{formatNumber(Math.min(thugs, Math.max(0, armedAtHome)))}
      </Button>
      <Button
        type="button"
        className="se-btn se-btn--ghost se-btn--sm"
        disabledReason={action.busy ? 'That corner move is still going through.' : null}
        onClick={() => void run('/game/turf/pull', Math.min(thugs, block.cornerThugs))}
      >
        Pull {formatNumber(Math.min(thugs, block.cornerThugs))}
      </Button>
    </>
  ) : warsEnabled ? (
    <Button
      type="button"
      className="se-btn se-btn--danger se-btn--sm"
      disabledReason={action.busy ? 'That turf move is still going through.' : block.pushBlockedReason ?? sendBlockedReason}
      onClick={() => void push(Math.min(thugs, Math.max(0, armedAtHome)))}
    >
      Push with {formatNumber(thugs)}
    </Button>
  ) : null;

  if (!controls) return block.claimBlockedReason ? <span className="se-hint">{block.claimBlockedReason}</span> : null;

  return (
    <div className="se-turfactions">
      <div className="se-field">
        <span className="se-field__label">{block.holder ? 'Corner thugs' : 'Claim squad'}</span>
        <input
          className="se-input"
          type="number"
          inputMode="numeric"
          min={squadMax > 0 ? 1 : 0}
          max={squadMax}
          step={1}
          value={squadMax > 0 ? Math.min(thugs, squadMax) : 0}
          onChange={(event) => {
            const next = Math.floor(Number(event.target.value) || 0);
            setThugs(squadMax > 0 ? Math.min(squadMax, Math.max(1, next)) : 0);
          }}
        />
        <QuantityStepper value={squadMax > 0 ? Math.min(thugs, squadMax) : 0} onChange={setThugs}
          min={squadMax > 0 ? 1 : 0} max={squadMax} unitLabel="thugs" />
      </div>
      <span className="se-hint">
        {formatNumber(armedAtHome)} fit, armed {armedAtHome === 1 ? 'thug is' : 'thugs are'} at home.
        {armedAtHome < 1 ? ' Posted crew stays where they were sent.' : ''}
      </span>
      {!block.holder ? (
        <span className="se-hint">
          Locals have {formatNumber(block.localsThugs)} on this block. The {formatNumber(block.cornerMinimumThugs)}-thug corner minimum is what you must leave posted after a win, not the force needed to beat them.
        </span>
      ) : null}
      <div className="se-actions-row">{controls}</div>
      {block.claimBlockedReason && !block.isMine ? <span className="se-hint">{block.claimBlockedReason}</span> : null}
      {block.pushBlockedReason && block.holder && !block.isMine ? <span className="se-hint">{block.pushBlockedReason}</span> : null}
      {action.error ? <span className="se-error" role="alert">{action.error}</span> : null}
      {action.result && 'won' in action.result.result && 'localsThugs' in action.result.result ? (
        action.result.result.won
          ? <span className="se-action-confirm">You took {action.result.result.districtName} with {formatNumber(action.result.result.squad)} thugs.</span>
          : <span className="se-error" role="alert">The locals held {action.result.result.districtName}. Your {formatNumber(action.result.result.squad)}-thug squad lost to {formatNumber(action.result.result.localsThugs)} locals.</span>
      ) : action.result ? <span className="se-action-confirm">Corner updated.</span> : null}
    </div>
  );
}
