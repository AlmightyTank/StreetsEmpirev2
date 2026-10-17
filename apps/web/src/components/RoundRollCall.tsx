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
import { ItemTile } from './ItemTile.js';
import { useSession } from '../stores/session.js';
import { newActionId } from '../utils/actionId.js';
import { rollCallWindowStart, todayRewardTier } from '../utils/roundRollCallView.js';

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

function RollCallFinalePreview({ target, completed, owned }: { target: number; completed: boolean; owned: boolean }) {
  return (
    <aside className="se-rollcall-finale" aria-label="Final login reward collection preview">
      <div className="se-rollcall-finale__copy">
        <span className="se-eyebrow">Grand prize · final reward only</span>
        <h3>Wear the round. Own the streets.</h3>
        <p>
          Complete all {target} attendance stamps to qualify for an exclusive, matching
          game-shell theme and crew cosmetic collection. The pair stays with your account
          across rounds after completion. Equip both looks from Account Settings.
        </p>
        <small>
          {owned
            ? 'Unlocked permanently · Obsidian Signal is now in your Collection and outfit settings.'
            : completed
              ? 'Attendance complete. Your permanent Obsidian Signal set will appear after the account unlock confirms.'
              : 'Obsidian Signal is locked until you complete your entire attendance track.'}
        </small>
      </div>
      <div className="se-rollcall-finale__art" aria-label="Obsidian Signal shell and two matching crew outfits">
        <div className="se-rollcall-finale__shell se-site-theme--obsidian-signal">
          <div className="se-rollcall-finale__chrome"><span>STREETS EMPIRE</span><i /><i /></div>
          <div className="se-rollcall-finale__shellbody">
            <strong>YOUR EMPIRE</strong>
            <span>UNLOCKED LOOK</span>
            <div className="se-rollcall-finale__lines"><i /><i /><i /></div>
          </div>
        </div>
        <div className="se-rollcall-finale__crew">
          <span>OBSIDIAN SIGNAL CREW</span>
          <div className="se-rollcall-finale__crew-previews">
            <ItemTile item="THUG" size="sm" cosmeticStyle="obsidian-signal-crew" />
            <ItemTile item="HOE" size="sm" cosmeticStyle="obsidian-signal-crew" />
          </div>
          <small>{owned ? 'PERMANENTLY OWNED' : 'FINAL REWARD ONLY'}</small>
        </div>
      </div>
    </aside>
  );
}

function RollCallDay({ tier, finale, today, claimingTier, onClaim }: {
  tier: RoundRollCallTier;
  finale: boolean;
  today: boolean;
  claimingTier: number | null;
  onClaim: (tier: number) => void;
}) {
  const status = roundRollCallStatus(tier);
  return (
    <li
      className={'se-rollcall-day se-rollcall-day--' + tier.rarity + ' se-rollcall-day--' + status + (today ? ' se-rollcall-day--today' : '')}
      data-tier={tier.tier}
      aria-current={today ? 'date' : undefined}
    >
      <div className="se-rollcall-day__top">
        <span className="se-rollcall-day__number">{today ? 'Today · reward ' + tier.tier : 'Reward ' + tier.tier}</span>
        <span className="se-rollcall-day__rarity">{RARITY_LABELS[tier.rarity]}</span>
      </div>
      <div className="se-rollcall-day__mark" aria-hidden="true">
        {status === 'claimed' ? '✓' : finale ? '★' : status === 'locked' ? '◇' : '✦'}
      </div>
      <div className="se-rollcall-day__prize">
        {tier.rewards.map((reward, index) => (
          <RewardChip reward={reward} key={reward.kind + ':' + (reward.key ?? '') + ':' + index} />
        ))}
        {finale ? <span className="se-rollcall-day__future">Exclusive Obsidian Signal shell + crew outfit set</span> : null}
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
  const [recovering, setRecovering] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [showAllRewards, setShowAllRewards] = useState(false);
  const [claimingTier, setClaimingTier] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const inFlight = useRef(false);
  const pendingIds = useRef(new Map<number, string>());
  const pendingRecoveryId = useRef<string | null>(null);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    if (!playerId) {
      setBoard(null);
      setLoading(false);
      return;
    }
    // A round id can flicker while a snapshot refreshes. Keep the stamps on
    // screen until the next board arrives so an update does not look like a reset.
    if (!roundId) {
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

  async function recoverMissedDay() {
    if (!board?.recovery.eligible || inFlight.current) return;
    inFlight.current = true;
    setRecovering(true);
    setRecoveryError(null);
    setRecoveryResult(null);
    const actionId = pendingRecoveryId.current ?? newActionId();
    pendingRecoveryId.current = actionId;
    try {
      const result = await roundRollCallApi.recover(actionId);
      pendingRecoveryId.current = null;
      setRecoveryResult(result.replayed
        ? 'Your previously recovered day ' + result.dayIndex + ' is saved.'
        : 'Round day ' + result.dayIndex + ' recovered. This counts as a stamp toward your final reward.');
      try { await useSession.getState().refreshSnapshot({ background: true }); } catch { /* Stamp is already saved. */ }
    } catch (error: unknown) {
      if (error instanceof ApiError && !error.isUncertain) pendingRecoveryId.current = null;
      setRecoveryError(error instanceof Error ? error.message : 'Catch-up not confirmed. Refresh your progress before trying again.');
    } finally {
      inFlight.current = false;
      setRecovering(false);
      refresh();
    }
  }

  const readyCount = board?.rewardTrack.filter((step) => step.claimable).length ?? 0;
  const nextReady = board?.rewardTrack.find((step) => step.claimable);
  const progress = board && board.requiredStamps > 0
    ? Math.min(100, Math.round(board.stamps / board.requiredStamps * 100))
    : 0;

  // Keep the Street Pass page compact. The six-card window stays on today's
  // reward. Claimed stamps stay on the track; players can expand the rest.
  const todayTier = board ? todayRewardTier(board) : null;
  const focusIndex = board?.rewardTrack.findIndex((step) => !step.claimed) ?? -1;
  const nearbyStart = board
    ? rollCallWindowStart(board.rewardTrack.length, focusIndex, todayTier)
    : 0;
  const visibleTiers = board
    ? showAllRewards ? board.rewardTrack : board.rewardTrack.slice(nearbyStart, nearbyStart + 6)
    : [];


  return (
    <section className="se-rollcall" id="round-roll-call" aria-label="Round Roll Call login rewards" tabIndex={-1}>
      <header className="se-rollcall__heading">
        <div>
          <span className="se-eyebrow">Free round attendance · no consecutive streak</span>
          <h2>Round Roll Call</h2>
          <p>Show up, earn one stamp for each eligible round day, and claim your rewards. Missed days and game updates never erase stamps you already earned.</p>
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
          <aside className="se-rollcall__catchup" aria-label="Missed-day recovery">
            <div className="se-rollcall__catchup-content">
              <strong>Missed-day recovery</strong>
              <p>
                {board.recovery.used} of {board.recovery.limit} recovery passes used this round.
                Your seven free missed days are always included and never reset your progress.
              </p>
              <small>
                {board.recovery.eligible
                  ? 'Your seven-day allowance is exhausted. ' + board.recovery.availableNow + (board.recovery.availableNow === 1 ? ' recovery is' : ' recoveries are') + ' available now, starting with past round day ' + board.recovery.nextDayIndex + '. Claim each separately.'
                  : board.recovery.reason === 'limit'
                    ? 'You have used both recovery passes for this round.'
                    : board.recovery.reason === 'allowance'
                      ? 'No catch-up needed. You still have the built-in missed-day allowance.'
                      : board.recovery.reason === 'genuine_stamp'
                        ? 'Earn at least one real login stamp before using recovery.'
                        : board.recovery.reason === 'complete'
                          ? 'Your Round Roll Call is complete.'
                          : board.recovery.reason === 'no_eligible_day'
                            ? 'No missed round day after your first real check-in is eligible for recovery.'
                            : 'Recovery is available only in an active, unpaused round.'}
              </small>
              {board.recovery.history.length > 0 ? (
                <small>Recovered round days: {board.recovery.history.map((day) => day.dayIndex).join(', ')}.</small>
              ) : null}
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={!board.recovery.eligible || recovering || claimingTier !== null}
              loading={recovering}
              onClick={() => void recoverMissedDay()}
            >Recover missed day</Button>
          </aside>
          {recoveryResult ? <p className="se-rollcall__recovery-result" role="status">{recoveryResult}</p> : null}
          {recoveryError ? <Alert title="Could not confirm recovery">{recoveryError} Check the updated calendar before retrying.</Alert> : null}
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
          <div className="se-rollcall__shelfhead">
            <strong>Reward calendar</strong>
            <span>{showAllRewards
              ? 'All ' + board.requiredStamps + ' rewards'
              : 'Rewards ' + (nearbyStart + 1) + '–' + (nearbyStart + visibleTiers.length) + ' of ' + board.requiredStamps}</span>
          </div>
          <ol className="se-rollcall__grid" id="round-roll-call-calendar" aria-label="Login reward track">
            {visibleTiers.map((tier) => (
              <RollCallDay
                key={tier.key}
                tier={tier}
                finale={tier.tier === board.requiredStamps}
                today={tier.tier === todayTier}
                claimingTier={claimingTier}
                onClaim={(step) => void claim(step)}
              />
            ))}
          </ol>
          {board.rewardTrack.length > 6 ? (
            <div className="se-rollcall__more">
              <Button
                variant="ghost"
                onClick={() => setShowAllRewards((current) => !current)}
                aria-expanded={showAllRewards}
                aria-controls="round-roll-call-calendar"
              >{showAllRewards ? 'Show rewards near my progress' : 'Show full ' + board.requiredStamps + '-reward calendar'}</Button>
            </div>
          ) : null}
          <RollCallFinalePreview target={board.requiredStamps} completed={board.completed} owned={board.grandPrize.unlocked} />
          {board.grandPrize.unlocked ? (
            <p className="se-rollcall__equipped" role="status">
              Permanent Obsidian Signal collection earned. <Link to="/account">Equip the theme and crew outfits</Link> or <Link to="/game/collection">view your collection</Link>.
            </p>
          ) : null}
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
