import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { QuestRewardDto, StreetPassClaimResult, StreetPassDto, StreetPassTierDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { streetPassApi } from '../api/streetPass.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { ItemTile } from '../components/ItemTile.js';
import { Panel, Row } from '../components/Panel.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { rewardArtKey } from '../items/itemArt.js';
import { GameLayout } from '../layouts/GameLayout.js';

/** "$10K", "$2.5K", "$100K": cash counts on a tile. */
function compactDollars(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${+(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${+(dollars / 1_000).toFixed(1)}K`;
  return `$${formatNumber(dollars)}`;
}

/** One reward on the track: its stash tile, or a stand-in for season cosmetics (art comes in step 4). */
function PassReward({ reward }: { reward: QuestRewardDto }) {
  const art = rewardArtKey(reward);
  if (!art) {
    const name = reward.label.replace(/^Permanent cosmetic · /, '');
    return (
      <figure className="se-pass-cosmetic" title={reward.label}>
        <span aria-hidden="true">★</span>
        <figcaption>{name}</figcaption>
      </figure>
    );
  }
  const amount = reward.amount ?? undefined;
  return (
    <ItemTile
      item={art}
      label={false}
      title={reward.label}
      quantityText={reward.kind === 'CASH' && amount !== undefined ? compactDollars(amount) : undefined}
      quantity={reward.kind === 'CASH' ? undefined : amount}
    />
  );
}

function tierState(tier: StreetPassTierDto): 'claimed' | 'ready' | 'locked' {
  if (tier.claimed) return 'claimed';
  return tier.reached ? 'ready' : 'locked';
}

function PassTier({ tier, isNext, busy, onClaim }: {
  tier: StreetPassTierDto;
  isNext: boolean;
  busy: boolean;
  onClaim: (tier: number) => void;
}) {
  const state = tierState(tier);
  return (
    <li
      className={`se-pass-tier se-pass-tier--${state}${isNext ? ' se-pass-tier--next' : ''}`}
      data-tier={tier.tier}
      aria-label={`Tier ${tier.tier}: ${tier.rewards.map((reward) => reward.label).join(', ')}. ${
        state === 'claimed' ? 'Claimed.' : state === 'ready' ? 'Ready to claim.' : `Needs ${formatNumber(tier.credToReach)} Cred.`
      }`}
    >
      <span className="se-pass-tier__number">{tier.tier}</span>
      <div className="se-pass-tier__rewards">
        {tier.rewards.map((reward, index) => <PassReward key={`${reward.kind}:${reward.key ?? index}`} reward={reward} />)}
      </div>
      <div className="se-pass-tier__foot">
        {state === 'claimed' ? <span className="se-pass-tier__done">✓ Claimed</span> : null}
        {state === 'ready' ? (
          <Button className="se-btn se-btn--primary se-btn--sm" disabledReason={busy ? 'Another claim is going through.' : null} onClick={() => onClaim(tier.tier)}>
            Claim
          </Button>
        ) : null}
        {state === 'locked' ? <span className="se-pass-tier__cred">{isNext ? 'Next · ' : ''}{formatNumber(tier.credToReach)} Cred</span> : null}
      </div>
    </li>
  );
}

export function StreetPassPage() {
  const [pass, setPass] = useState<StreetPassDto | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const action = useGameAction<StreetPassClaimResult>();
  const trackRef = useRef<HTMLOListElement | null>(null);
  const scrolled = useRef(false);

  useEffect(() => {
    let live = true;
    streetPassApi.get()
      .then((data) => { if (live) { setPass(data.pass); setLoadError(null); } })
      .catch((err: unknown) => { if (live) setLoadError(err instanceof Error ? err.message : 'Could not load the Street Pass.'); });
    return () => { live = false; };
  }, [reload]);

  // Open the track where the player is: the first tier to claim, else the next one to reach.
  useEffect(() => {
    if (!pass || scrolled.current || !trackRef.current) return;
    const focus = pass.claimable[0] ?? Math.min(pass.tier + 1, pass.tierCount);
    const el = trackRef.current.querySelector<HTMLElement>(`[data-tier="${focus}"]`);
    if (el) trackRef.current.scrollLeft = Math.max(0, el.offsetLeft - trackRef.current.clientWidth / 3);
    scrolled.current = true;
  }, [pass]);

  async function claim(tier: number) {
    await action.run((actionId) => streetPassApi.claim(tier, actionId));
    setReload((n) => n + 1);
  }

  const claimed = action.result?.result;
  const floor = pass ? (pass.tier > 0 ? pass.tiers[pass.tier - 1]!.credToReach : 0) : 0;
  const progress = pass && pass.nextTierCred !== null
    ? Math.round(((pass.cred - floor) / (pass.nextTierCred - floor)) * 100)
    : 100;

  return (
    <GameLayout>
      <div className="se-pass">
        <header className="se-pass-hero">
          <div className="se-pass-hero__copy">
            <span className="se-eyebrow">Free · resets every round</span>
            <h1>{pass?.name ?? 'Street Pass'}</h1>
            <p>Earn Street Cred by playing: contracts, jobs and the turns you spend. Every tier pays out, and the last one is yours to keep.</p>
          </div>
          {pass ? (
            <div className="se-pass-hero__progress">
              <div>
                <span>Tier</span>
                <strong>{formatNumber(pass.tier)} <small>/ {formatNumber(pass.tierCount)}</small></strong>
              </div>
              <div className="se-pass-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Cred toward the next tier">
                <span style={{ width: `${progress}%` }} />
              </div>
              <small>
                {pass.nextTierCred === null
                  ? `Track finished · ${formatNumber(pass.cred)} Cred`
                  : `${formatNumber(pass.cred)} / ${formatNumber(pass.nextTierCred)} Cred · ${formatNumber(pass.nextTierCred - pass.cred)} to tier ${pass.tier + 1}`}
              </small>
            </div>
          ) : null}
        </header>

        {loadError ? (
          <Alert>
            {loadError}{' '}
            <button type="button" className="se-btn se-btn--sm" onClick={() => setReload((n) => n + 1)}>Retry</button>
          </Alert>
        ) : null}
        {action.error ? <Alert>{action.error}</Alert> : null}
        {claimed ? (
          <Alert tone="success">
            Claimed tier {claimed.tier}: {claimed.rewards.map((reward) => reward.label).join(' · ')}.
          </Alert>
        ) : null}

        {pass === undefined && !loadError ? <Panel title="Loading"><p className="se-muted">Checking your Cred...</p></Panel> : null}

        {pass === null ? (
          <Panel title="No Street Pass this round">
            <p className="se-muted">This round doesn't run a Street Pass. It returns with a later round.</p>
          </Panel>
        ) : null}

        {pass ? (
          <>
            {pass.claimable.length ? (
              <div className="se-pass-ready">
                <strong>{pass.claimable.length === 1 ? '1 tier ready to claim' : `${formatNumber(pass.claimable.length)} tiers ready to claim`}</strong>
                <Button
                  className="se-btn se-btn--primary se-btn--sm"
                  disabledReason={action.busy ? 'Another claim is going through.' : null}
                  onClick={() => void claim(pass.claimable[0]!)}
                >
                  Claim tier {pass.claimable[0]}
                </Button>
              </div>
            ) : null}

            <section className="se-pass-trackwrap" aria-label="Street Pass tiers">
              <ol className="se-pass-track" ref={trackRef}>
                {pass.tiers.map((tier) => (
                  <PassTier
                    key={tier.tier}
                    tier={tier}
                    isNext={tier.tier === pass.tier + 1}
                    busy={action.busy}
                    onClaim={(n) => void claim(n)}
                  />
                ))}
              </ol>
            </section>

            <div className="se-pass-info">
              <Panel title="Earning Cred" className="se-pass-panel">
                <div className="se-rows">
                  <Row label="Daily contract" value={`${formatNumber(pass.sources.dailyContract)} Cred`} />
                  <Row label="Weekly contract" value={`${formatNumber(pass.sources.weeklyContract)} Cred`} />
                  <Row label="Story, side or secret job" value={`${formatNumber(pass.sources.oneTimeJob)} Cred`} />
                  <Row label="Event, city or alliance contract" value={`${formatNumber(pass.sources.eventContract)} Cred`} />
                  <Row
                    label="Turns spent"
                    value={`${formatNumber(pass.sources.perTurnSpent)} a turn · ${formatNumber(pass.turnCredToday)} / ${formatNumber(pass.turnCredCap)} today`}
                    strong={pass.turnCredToday >= pass.turnCredCap}
                  />
                </div>
                <p className="se-hint se-mt">
                  Pick up contracts on the <Link to="/game/quests">Quests</Link> page. Turn Cred resets with the daily contracts.
                </p>
              </Panel>
              <Panel title="Your season" className="se-pass-panel">
                <div className="se-rows">
                  <Row label="Street Cred" value={formatNumber(pass.cred)} strong />
                  <Row label="Tiers claimed" value={`${formatNumber(pass.tiers.filter((tier) => tier.claimed).length)} / ${formatNumber(pass.tierCount)}`} />
                  <Row
                    label="Late-join bonus"
                    value={pass.lateJoinBonusPercent > 0 ? `+${formatNumber(pass.lateJoinBonusPercent)}% Cred` : 'None'}
                    tooltip="Players who join after the round starts earn a little extra Cred for each full week they missed."
                  />
                </div>
                <p className="se-hint se-mt">
                  When the round ends, unclaimed rewards expire. A season badge or frame you reached is granted automatically.
                </p>
              </Panel>
            </div>
          </>
        ) : null}
      </div>
    </GameLayout>
  );
}
