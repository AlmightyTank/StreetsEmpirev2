import { useState } from 'react';
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
import { Button } from './Button.js';

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
  const [thugs, setThugs] = useState(Math.max(1, block.cornerMinimumThugs));

  if (!holdingEnabled || !isHome) return null;

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
          {label} · {formatNumber(block.push.squad)} attacking · lands {new Date(block.push.landsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </span>
        {block.push.role !== 'attacker' ? (
          <>
            <label className="se-field">
              <span className="se-field__label">Fight backup</span>
              <input
                className="se-input"
                type="number"
                min={1}
                step={1}
                value={thugs}
                disabled={block.push.backupSent || action.busy}
                onChange={(event) => setThugs(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
              />
            </label>
            <div className="se-actions-row">
              <Button
                type="button"
                className="se-btn se-btn--sm"
                disabledReason={block.push.backupSent ? 'Your help is already committed.' : action.busy ? 'That turf move is still going through.' : null}
                onClick={() => void backup(block.push!.id, thugs)}
              >
                {block.push.backupSent ? 'Backup sent' : <>Send {formatNumber(thugs)}</>}
              </Button>
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
            {action.error ? <span className="se-error">{action.error}</span> : null}
          </>
        ) : null}
      </div>
    );
  }

  const controls = !block.holder ? (
    <Button
      type="button"
      className="se-btn se-btn--sm"
      disabledReason={action.busy ? 'That corner move is still going through.' : block.claimBlockedReason}
      onClick={() => void run('/game/turf/claim', thugs)}
    >
      Claim with {formatNumber(thugs)}
    </Button>
  ) : block.isMine ? (
    <>
      <Button
        type="button"
        className="se-btn se-btn--sm"
        disabledReason={action.busy ? 'That corner move is still going through.' : null}
        onClick={() => void run('/game/turf/post', thugs)}
      >
        Reinforce +{formatNumber(thugs)}
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
      disabledReason={action.busy ? 'That turf move is still going through.' : block.pushBlockedReason}
      onClick={() => void push(thugs)}
    >
      Push with {formatNumber(thugs)}
    </Button>
  ) : null;

  if (!controls) return block.claimBlockedReason ? <span className="se-hint">{block.claimBlockedReason}</span> : null;

  return (
    <div className="se-turfactions">
      <label className="se-field">
        <span className="se-field__label">Corner thugs</span>
        <input
          className="se-input"
          type="number"
          min={1}
          step={1}
          value={thugs}
          onChange={(event) => setThugs(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
        />
      </label>
      <div className="se-actions-row">{controls}</div>
      {block.claimBlockedReason && !block.isMine ? <span className="se-hint">{block.claimBlockedReason}</span> : null}
      {block.pushBlockedReason && block.holder && !block.isMine ? <span className="se-hint">{block.pushBlockedReason}</span> : null}
      {action.error ? <span className="se-error">{action.error}</span> : null}
      {action.result ? <span className="se-action-confirm">Corner updated.</span> : null}
    </div>
  );
}
