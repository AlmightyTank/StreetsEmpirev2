import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import {
  ROUND_ROLL_CALL_CHECKED_IN_EVENT,
  consumeRoundRollCallStamp,
  roundRollCallApi,
  type RoundRollCallBoard,
  type RoundRollCallClaimResult,
  type RoundRollCallRarity,
  type RoundRollCallTier,
} from '../api/roundRollCall.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { RewardChip, rewardText } from './RewardChip.js';
import { useSession } from '../stores/session.js';
import { newActionId } from '../utils/actionId.js';

const RARITY_LABELS: Record<RoundRollCallRarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  legendary: 'Legendary',
};

export function roundRollCallStatus(tier: RoundRollCallTier): 'claimed' | 'ready' | 'reached' | 'locked' {
  if (tier.claimed) return 'claimed';
  if (tier.claimable) return 'ready';
  return tier.reached ? 'reached' : 'locked';
}

function timeLabel(iso: string | null): string | null {
  if (!iso) return null;
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return null;
  return when.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function RollCallFinalePreview({ target, completed }: { target: number; completed: boolean }) {
  return (
    <aside className="se-rollcall-finale" aria-label="Final login reward collection preview">
      <div className="se-rollcall-finale__copy">
        <span className="se-eyebrow">Grand prize · final reward only</span>
        <h3>Wear the round. Own the streets.</h3>
        <p>
          Complete all {target} attendance stamps to qualify for an exclusive, matching
          game-shell theme and crew cosmetic collection. The pair stays with your account
          across rounds once the cosmetic unlock launches in Slice D.
        </p>
        <small>
          {completed
            ? 'Attendance requirement met. The permanent cosmetic grant is coming in Slice D; no cosmetic has been issued yet.'
            : 'Collection concept preview · the actual exclusive designs and unlock are coming in Slice D.'}
        </small>
      </div>
      <div className="se-rollcall-finale__art" aria-hidden="true">
        <div className="se-rollcall-finale__shell">
          <div className="se-rollcall-finale__chrome"><span>STREETS EMPIRE</span><i /><i /></div>
          <div className="se-rollcall-finale__shellbody">
            <strong>YOUR EMPIRE</strong>
            <span>UNLOCKED LOOK</span>
            <div className="se-rollcall-finale__lines"><i /><i /><i /></div>
          </div>
        </div>
        <div className="se-rollcall-finale__crew">
          <span>CREW IDENTITY</span>
          <strong>✦</strong>
          <small>FINAL DAY</small>
        </div>
      </div>
    </aside>
  );
}

function RollCallDay({ tier, finale, claimingTier, onClaim }: {
  tier: RoundRollCallTier;
  finale: boolean;
  claimingTier: number | null;
  onClaim: (tier: number) => void;
}) {
  const status = roundRollCallStatus(tier);
  return (
    <li
      className={'se-rollcall-day se-rollcall-day--' + tier.rarity + ' se-rollcall-day--' + status}
      data-tier={tier.tier}
    >
      <div className="se-rollcall-day__top">
        <span className="se-rollcall-day__number">Reward {tier.tier}</span>
        <span className="se-rollcall-day__rarity">{RARITY_LABELS[tier.rarity]}</span>
      </div>
      <div className="se-rollcall-day__mark" aria-hidden="true">
        {status === 'claimed' ? '✓' : finale ? '★' : status === 'locked' ? '◇' : '✦'}
      </div>
      <div className="se-rollcall-day__prize">
        {tier.rewards.map((reward, index) => (
          <RewardChip reward={reward} key={reward.kind + ':' + (reward.key ?? '') + ':' + index} />
        ))}
        {finale ? <span className="se-rollcall-day__future">Exclusive shell + crew look · Slice D</span> : null}
      </div>
      <div className="se-rollcall-day__footer">
        {status === 'ready' ? (
          <Button
            variant="primary"
            size="sm"
            block
            loading={claimingTier === tier.tier}
            disabled={claimingTier !== null}
            onClick={() => onClaim(tier.tier)}
            aria-label={'Claim ' + RARITY_LABELS[tier.rarity] + ' reward ' + tier.tier}
          >{claimingTier === tier.tier ? 'Claiming…' : 'Claim reward'}</Button>
        ) : (
          <span className="se-rollcall-day__state">
            {status === 'claimed' ? '✓ Collected' : status === 'reached' ? 'Earned · claiming unavailable' : 'Not yet earned'}
          </span>
        )}
      </div>
    </li>
  );
}

export function RoundRollCallPanel() {
  const playerId = useSession((s) => s.me?.id ?? null);
  const roundId = useSession((s) => s.round?.id ?? null);
  const [board, setBoard] = useState<RoundRollCallBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<RoundRollCallClaimResult | null>(null);
  const [claimingTier, setClaimingTier] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const inFlight = useRef(false);
  const pendingIds = useRef(new Map<number, string>());

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    if (!playerId || !roundId) {
      setBoard(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    roundRollCallApi.board()
      .then((next) => {
        if (!alive) return;
        setBoard(next);
        setLoadError(null);
        // If the payout committed but its response was lost, don't retry it.
        for (const step of next.rewardTrack) {
          if (step.claimed) pendingIds.current.delete(step.tier);
        }
      })
      .catch((error: unknown) => {
        if (alive) setLoadError(error instanceof Error ? error.message : 'The reward calendar is unavailable.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [playerId, roundId, reload]);

  useEffect(() => {
    const onVisible = () => { if (!document.hidden) refresh(); };
    const onFocus = () => { if (!document.hidden) refresh(); };
    const onOnline = () => refresh();
    window.addEventListener(ROUND_ROLL_CALL_CHECKED_IN_EVENT, refresh);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener(ROUND_ROLL_CALL_CHECKED_IN_EVENT, refresh);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  async function claim(tier: number) {
    if (!board || inFlight.current || !board.rewardTrack.some((entry) => entry.tier === tier && entry.claimable)) return;
    inFlight.current = true;
    setClaimingTier(tier);
    setClaimError(null);
    setClaimResult(null);
    const actionId = pendingIds.current.get(tier) ?? newActionId();
    pendingIds.current.set(tier, actionId);
    try {
      const response = await roundRollCallApi.claim(tier, actionId);
      pendingIds.current.delete(tier);
      // The backend confirmed payment: close this tile immediately to prevent
      // an accidental second click before the authoritative board round-trip.
      setBoard((current) => current ? {
        ...current,
        rewardTrack: current.rewardTrack.map((step) => step.tier === tier
          ? { ...step, claimed: true, claimable: false, claimedAt: new Date().toISOString() }
          : step),
      } : current);
      setClaimResult(response.result);
      // Refresh the in-game resource balances without starting another attendance check-in.
      try { await useSession.getState().refreshSnapshot({ background: true }); } catch { /* Claim already committed. */ }
    } catch (error: unknown) {
      if (error instanceof ApiError && !error.isUncertain) pendingIds.current.delete(tier);
      setClaimError(error instanceof Error ? error.message : 'Reward claim failed. Check the track and retry.');
    } finally {
      inFlight.current = false;
      setClaimingTier(null);
      refresh();
    }
  }

  const readyCount = board?.rewardTrack.filter((step) => step.claimable).length ?? 0;
  const nextReady = board?.rewardTrack.find((step) => step.claimable);
  const progress = board && board.requiredStamps > 0
    ? Math.min(100, Math.round(board.stamps / board.requiredStamps * 100))
    : 0;

  return (
    <section className="se-rollcall" id="round-roll-call" aria-label="Round Roll Call login rewards" tabIndex={-1}>
      <header className="se-rollcall__heading">
        <div>
          <span className="se-eyebrow">Free round attendance · no consecutive streak</span>
          <h2>Round Roll Call</h2>
          <p>Show up, earn one stamp for each eligible round day, and claim your rewards. Missed days never erase progress.</p>
        </div>
        {board && board.requiredStamps > 0 ? (
          <strong className="se-rollcall__counter" aria-label={board.stamps + ' of ' + board.requiredStamps + ' login stamps'}>
            {board.stamps}<span> / {board.requiredStamps}</span>
          </strong>
        ) : null}
      </header>

      {loadError ? (
        <Alert title="Could not refresh the Roll Call">
          {loadError} <Button size="sm" onClick={refresh}>Retry</Button>
        </Alert>
      ) : null}
      {claimError ? <Alert title="Claim not confirmed">{claimError} Check the claim status below before retrying.</Alert> : null}
      {claimResult ? (
        <div className={'se-rollcall__receipt se-rollcall__receipt--' + claimResult.rarity} role="status" aria-live="polite">
          <strong>Reward {claimResult.tier} collected · {RARITY_LABELS[claimResult.rarity]}</strong>
          <span>{claimResult.rewards.map(rewardText).join(' · ')}</span>
        </div>
      ) : null}

      {loading && !board ? <p className="se-rollcall__loading" role="status">Loading your round rewards…</p> : null}
      {!loading && !board && !loadError ? <p className="se-muted">Join an active round to start earning login rewards.</p> : null}

      {board && board.requiredStamps === 0 ? (
        <p className="se-rollcall__empty">This round is too short for the seven-day allowance. Roll Call rewards will be available in a longer round.</p>
      ) : null}

      {board && board.requiredStamps > 0 ? (
        <>
          <div className="se-rollcall__summary" aria-label="Roll Call progress">
            <div><small>Stamps earned</small><strong>{board.stamps} / {board.requiredStamps}</strong></div>
            <div><small>Allowance left</small><strong>{board.allowanceRemaining} days</strong></div>
            <div><small>Rewards ready</small><strong>{readyCount}</strong></div>
            <div><small>Round day</small><strong>{board.roundDay} / {board.roundDays}</strong></div>
          </div>
          <div className="se-rollcall__progress" role="progressbar" aria-label="Round login rewards completed" aria-valuemin={0} aria-valuemax={board.requiredStamps} aria-valuenow={board.stamps}>
            <span style={{ width: progress + '%' }} />
          </div>
          <p className="se-rollcall__guidance">
            {board.completed
              ? 'You reached the final reward day. Claim any remaining prizes below.'
              : board.ended
                ? 'This round has ended. Unclaimed gameplay rewards are no longer available.'
                : !board.canStillFinish
                  ? 'There are not enough eligible days remaining to finish this track, but reached rewards are still yours to claim.'
                  : !board.active
                    ? 'Attendance is paused or not open right now. Earned stamps stay safe.'
                    : board.alreadyCheckedInToday
                      ? 'Today’s stamp is saved.' + (board.nextDayAt ? ' Next check-in: ' + timeLabel(board.nextDayAt) + '.' : '')
                      : 'Play in the foreground to record today’s stamp.'}
          </p>
          {nextReady ? (
            <div className="se-rollcall__ready">
              <div>
                <strong>{readyCount} {readyCount === 1 ? 'reward is' : 'rewards are'} ready</strong>
                <small>Claim each prize independently. Refreshing or switching pages will not lose it.</small>
              </div>
              <Button
                variant="primary"
                loading={claimingTier === nextReady.tier}
                disabled={claimingTier !== null}
                onClick={() => void claim(nextReady.tier)}
              >Claim reward {nextReady.tier}</Button>
            </div>
          ) : null}
          <ol className="se-rollcall__grid" aria-label="Login reward track">
            {board.rewardTrack.map((tier, index) => (
              <RollCallDay
                key={tier.key}
                tier={tier}
                finale={index === board.rewardTrack.length - 1}
                claimingTier={claimingTier}
                onClaim={(step) => void claim(step)}
              />
            ))}
          </ol>
          <RollCallFinalePreview target={board.requiredStamps} completed={board.completed} />
          <p className="se-rollcall__footnote">
            Seven missed days are already built into the round schedule. Earn one stamp per eligible day;
            completing all stamps is required for the exclusive cosmetic collection.
            Gameplay rewards are capped and never include weapons or permanent power.
            <Link to="/game/collection"> View your existing cosmetics.</Link>
          </p>
        </>
      ) : null}
    </section>
  );
}

export function RoundRollCallNotice() {
  const [notice, setNotice] = useState<{ stamps: number; requiredStamps: number } | null>(() => consumeRoundRollCallStamp());

  useEffect(() => {
    const onCheckIn = (event: Event) => {
      const result = consumeRoundRollCallStamp() ?? (event as CustomEvent<{ stamps: number; requiredStamps: number }>).detail;
      if (result && result.requiredStamps > 0) {
        setNotice({ stamps: result.stamps, requiredStamps: result.requiredStamps });
      }
    };
    window.addEventListener(ROUND_ROLL_CALL_CHECKED_IN_EVENT, onCheckIn);
    return () => window.removeEventListener(ROUND_ROLL_CALL_CHECKED_IN_EVENT, onCheckIn);
  }, []);

  if (!notice) return null;
  return (
    <div className="se-rollcall-notice" role="status">
      <span className="se-rollcall-notice__icon" aria-hidden="true">✦</span>
      <div>
        <strong>Roll Call checked in · {notice.stamps} / {notice.requiredStamps}</strong>
        <span>Today’s attendance is recorded. Your rewards are on Street Pass.</span>
      </div>
      <Link to="/game/street-pass#round-roll-call" onClick={() => setNotice(null)}>View rewards</Link>
      <button type="button" className="se-rollcall-notice__close" onClick={() => setNotice(null)} aria-label="Dismiss Roll Call notification">×</button>
    </div>
  );
}
