import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ItemCosmeticStyleKey, QuestRewardDto, StreetPassClaimResult, StreetPassDto, StreetPassTierDto } from '@streets/shared';
import { formatNumber, formatProfileName } from '@streets/shared';
import { streetPassApi } from '../api/streetPass.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { ItemTile } from '../components/ItemTile.js';
import { rewardText } from '../components/RewardChip.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { ITEM_ART, itemArtUrl, rewardArtKey } from '../items/itemArt.js';
import { itemCosmeticArtUrl } from '../items/itemCosmeticArt.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

/** "$10K", "$2.5K", "$100K": cash counts on a tile. */
function compactDollars(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${+(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${+(dollars / 1_000).toFixed(1)}K`;
  return `$${formatNumber(dollars)}`;
}

/** One reward on the track: its stash tile, or a ★ stand-in for a cosmetic that has no art yet. */
function PassReward({ reward }: { reward: QuestRewardDto }) {
  const art = rewardArtKey(reward);
  if (!art) {
    // "Permanent cosmetic · Kingpin · Season 1" reads "Kingpin" on the tile; the tooltip keeps the rest.
    const name = reward.label.replace(/^Permanent cosmetic · /, '').replace(/ · Season \d+$/, '');
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
      // Cosmetics carry their name in the corner; everything else is read from its count.
      label={reward.kind === 'COSMETIC_UNLOCK'}
      title={rewardText(reward)}
      quantityText={reward.kind === 'CASH' && amount !== undefined ? compactDollars(amount) : undefined}
      quantity={reward.kind === 'CASH' ? undefined : amount}
    />
  );
}

function tierState(tier: StreetPassTierDto): 'claimed' | 'ready' | 'locked' {
  if (tier.claimed) return 'claimed';
  return tier.reached ? 'ready' : 'locked';
}

function PassMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'good' | 'warn' | 'accent';
}) {
  return (
    <div className={`se-pass-metric${tone ? ` se-pass-metric--${tone}` : ''}`}>
      <span className="se-pass-metric__label">{label}</span>
      <strong className="se-pass-metric__value">{value}</strong>
      {detail ? <span className="se-pass-metric__detail">{detail}</span> : null}
    </div>
  );
}

type CosmeticPreviewKind = 'theme' | 'frame' | 'badge' | 'title' | 'item';

const COSMETIC_PREVIEW_ITEMS = ['PISTOL', 'SHOTGUN', 'TEK9', 'AK47', 'LOW_RIDER', 'SEDAN', 'VAN'] as const;
type CosmeticPreviewItemKey = typeof COSMETIC_PREVIEW_ITEMS[number];
type CosmeticCollectionStyleKey = Exclude<ItemCosmeticStyleKey, 'classic'>;

function cosmeticCollectionStyle(key: string): CosmeticCollectionStyleKey | null {
  if (key === 'street-pass-s1-urban-ghost') return 'urban-ghost';
  if (key === 'street-pass-s1-midnight-ops') return 'midnight-ops';
  if (key === 'street-pass-s1-cartel-gold') return 'cartel-gold';
  return null;
}

function playerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length > 1
    ? `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase()
    : (words[0]?.slice(0, 2) ?? 'SE').toUpperCase();
}

function randomCosmeticPreviewItem(): CosmeticPreviewItemKey {
  return COSMETIC_PREVIEW_ITEMS[Math.floor(Math.random() * COSMETIC_PREVIEW_ITEMS.length)]!;
}

type CosmeticPreview = {
  key: string;
  label: string;
  tier: number;
  art: keyof typeof ITEM_ART | null;
  kind: CosmeticPreviewKind;
};

function cosmeticPreviewLabel(reward: QuestRewardDto): string {
  const art = rewardArtKey(reward);
  if (art) return ITEM_ART[art].shortName;
  return reward.label.replace(/^Permanent cosmetic · /, '').replace(/ · Season \d+$/, '');
}

function cosmeticPreviewKind(key: string): CosmeticPreviewKind {
  if (cosmeticCollectionStyle(key)) return 'item';
  if (key.endsWith('-theme')) return 'theme';
  if (key.includes('frame') || key.includes('chrome-halo')) return 'frame';
  if (key.includes('badge')) return 'badge';
  return 'title';
}

function streetPassCosmeticPreviews(pass: StreetPassDto): CosmeticPreview[] {
  return pass.tiers.flatMap((tier) => (
    tier.rewards
      .filter((reward) => reward.kind === 'COSMETIC_UNLOCK' && reward.key)
      .map((reward) => ({
        key: reward.key!,
        label: cosmeticPreviewLabel(reward),
        tier: tier.tier,
        art: rewardArtKey(reward),
        kind: cosmeticPreviewKind(reward.key!),
      }))
  ));
}

function CosmeticRewardPreviewCarousel({ previews }: { previews: CosmeticPreview[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const displayName = useSession((state) => state.me?.displayName ?? state.account?.username ?? 'AMIGHTYTANK');
  const profileImageUrl = useSession((state) => state.profileSettings.profileImageUrl);
  const titlePlacement = useSession((state) => state.profileSettings.titlePlacement);
  const active = previews[Math.min(activeIndex, Math.max(0, previews.length - 1))];
  const [collectionPreviewItems] = useState<Record<CosmeticCollectionStyleKey, CosmeticPreviewItemKey>>(() => ({
    'urban-ghost': randomCosmeticPreviewItem(),
    'midnight-ops': randomCosmeticPreviewItem(),
    'cartel-gold': randomCosmeticPreviewItem(),
  }));
  const activeCollectionStyle = active ? cosmeticCollectionStyle(active.key) : null;
  const activeWeapon = activeCollectionStyle ? collectionPreviewItems[activeCollectionStyle] : null;

  useEffect(() => {
    if (activeIndex < previews.length) return;
    setActiveIndex(0);
  }, [activeIndex, previews.length]);

  useEffect(() => {
    if (previews.length <= 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % previews.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [previews.length]);

  if (!active) return null;

  const eyebrow = active.kind === 'theme' ? 'Theme preview' : active.kind === 'title' ? 'Name preview' : 'Cosmetic preview';
  const description = active.kind === 'theme'
    ? `Unlocks at tier ${formatNumber(active.tier)} and can be selected from account settings after you claim it.`
    : active.kind === 'title'
      ? `Unlocks at tier ${formatNumber(active.tier)} and shows how this title appears with your player name.`
      : active.kind === 'item'
        ? `Unlocks at tier ${formatNumber(active.tier)} and gives this look to every eligible item.`
        : `Unlocks at tier ${formatNumber(active.tier)} and stays on your account after the season.`;

  return (
    <section className="se-pass-theme-previews" aria-label="Street Pass cosmetic previews">
      <article className={`se-pass-theme-preview se-pass-theme-preview--${active.kind} se-pass-theme-preview--${active.key}`}>
        <div className="se-pass-theme-preview__copy">
          <span className="se-eyebrow">{eyebrow}</span>
          <h3>{active.label}</h3>
          <p>{description}</p>
        </div>
        {active.kind === 'theme' ? (
          <div className="se-pass-theme-preview__mock" aria-hidden="true">
            <span className="se-pass-theme-preview__topbar" />
            <span className="se-pass-theme-preview__rail">
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="se-pass-theme-preview__stats">
              <i />
              <i />
              <i />
            </span>
            <span className="se-pass-theme-preview__panel">
              <i />
              <i />
              <i />
            </span>
            <span className="se-pass-theme-preview__profile">
              <i />
              <strong>AMIGHTYTANK</strong>
              <small>Night Drive shell</small>
            </span>
            <span className="se-pass-theme-preview__badges">
              <i />
              <i />
              <i />
            </span>
            <span className="se-pass-theme-preview__road" />
            <span className="se-pass-theme-preview__glow" />
          </div>
        ) : active.kind === 'frame' && active.art ? (
          <div
            className={`se-pass-theme-preview__frame-stage se-pass-theme-preview__frame-stage--${active.key}`}
            role="img"
            aria-label={`${displayName}'s avatar shown with ${active.label}`}
          >
            <img className="se-pass-theme-preview__frame-art" src={itemArtUrl(active.art)} alt="" />
            {profileImageUrl ? (
              <img className="se-pass-theme-preview__frame-avatar" src={profileImageUrl} alt="" />
            ) : (
              <span className="se-pass-theme-preview__frame-avatar se-pass-theme-preview__frame-avatar--initials" aria-hidden="true">
                {playerInitials(displayName)}
              </span>
            )}
          </div>
        ) : active.kind === 'item' && activeCollectionStyle && activeWeapon ? (
          <div className="se-pass-theme-preview__weapon-stage">
            <img
              className="se-pass-theme-preview__weapon-art"
              src={itemCosmeticArtUrl(activeWeapon, activeCollectionStyle)}
              alt={`${active.label} ${ITEM_ART[activeWeapon].shortName}`}
            />
          </div>
        ) : (
          <div className="se-pass-theme-preview__cosmetic-stage">
            <span className="se-pass-theme-preview__cosmetic-glow" aria-hidden="true" />
            {active.art ? (
              <img className="se-pass-theme-preview__item-art" src={itemArtUrl(active.art)} alt={`${active.label} cosmetic artwork`} />
            ) : null}
            {active.kind === 'title' ? (
              <div className="se-pass-theme-preview__title-name">
                <strong>{formatProfileName(displayName, active.label, titlePlacement)}</strong>
              </div>
            ) : (
              <div className="se-pass-theme-preview__cosmetic-profile">
                <i />
                <strong>AMIGHTYTANK</strong>
                <small>{active.kind === 'frame' ? 'Profile frame preview' : 'Featured badge preview'}</small>
              </div>
            )}
          </div>
        )}
      </article>
      {previews.length > 1 ? (
        <div className="se-pass-theme-preview__dots" role="tablist" aria-label="Cosmetic previews">
          {previews.map((preview, index) => (
            <button
              key={preview.key}
              type="button"
              className={index === activeIndex ? 'is-active' : undefined}
              aria-label={`Show ${preview.label}`}
              aria-selected={index === activeIndex}
              role="tab"
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
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
    ? Math.max(0, Math.min(100, Math.round(((pass.cred - floor) / Math.max(1, pass.nextTierCred - floor)) * 100)))
    : 100;
  const claimedCount = pass ? pass.tiers.filter((tier) => tier.claimed).length : 0;
  const nextTier = pass ? pass.tiers.find((tier) => tier.tier === pass.tier + 1) ?? null : null;
  const cosmeticPreviews = pass ? streetPassCosmeticPreviews(pass) : [];

  return (
    <GameLayout>
      <div className="se-pass">
        <header className="se-pass-hero">
          <div className="se-pass-hero__copy">
            <span className="se-eyebrow">Free · resets every round</span>
            <h1>{pass?.name ?? 'Street Pass'}</h1>
            <p>Earn Street Cred by playing: contracts, jobs and the turns you spend. Every tier pays out, and the profile cosmetics you earn are yours to keep.</p>
          </div>
          {pass ? (
            <div className="se-pass-hero__side">
              <div className="se-pass-hero__readout">
                <span>
                  <small>Tier</small>
                  <strong>{formatNumber(pass.tier)} / {formatNumber(pass.tierCount)}</strong>
                </span>
                <span className={pass.claimable.length ? 'se-pass-hero__good' : undefined}>
                  <small>Ready</small>
                  <strong>{formatNumber(pass.claimable.length)}</strong>
                </span>
                <span>
                  <small>Cred</small>
                  <strong>{formatNumber(pass.cred)}</strong>
                </span>
              </div>
              <div className="se-pass-hero__progress">
                <div>
                  <span>Next tier</span>
                  <strong>{pass.nextTierCred === null ? 'Complete' : `${formatNumber(progress)}%`}</strong>
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
            Claimed tier {claimed.tier}: {claimed.rewards.map(rewardText).join(' · ')}.
          </Alert>
        ) : null}

        {pass === undefined && !loadError ? (
          <section className="se-pass-empty" role="status">
            <span className="se-eyebrow">Street Cred</span>
            <h2>Checking your Cred...</h2>
          </section>
        ) : null}

        {pass === null ? (
          <section className="se-pass-empty">
            <span className="se-eyebrow">Round status</span>
            <h2>No Street Pass this round</h2>
            <p className="se-muted">This round doesn't run a Street Pass. It returns with a later round.</p>
          </section>
        ) : null}

        {pass ? (
          <div className="se-pass-workbench">
            <section className="se-pass-trackpanel">
              <div className="se-pass-sectionhead">
                <div>
                  <span className="se-eyebrow">Reward track</span>
                  <h2>Tier rewards</h2>
                </div>
                <p>
                  Scroll the season track, claim reached tiers, and keep an eye on the next Cred gate.
                </p>
              </div>

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

              {cosmeticPreviews.length ? <CosmeticRewardPreviewCarousel previews={cosmeticPreviews} /> : null}
            </section>

            <aside className="se-pass-rail">
              <div className="se-pass-railcard se-pass-railcard--season">
                <div className="se-pass-sectionhead">
                  <div>
                    <span className="se-eyebrow">Your season</span>
                    <h2>Progress</h2>
                  </div>
                </div>
                <div className="se-pass-metricgrid">
                  <PassMetric label="Street Cred" value={formatNumber(pass.cred)} detail="earned this round" tone="accent" />
                  <PassMetric label="Tiers claimed" value={`${formatNumber(claimedCount)} / ${formatNumber(pass.tierCount)}`} detail={`${formatNumber(pass.tier)} reached`} />
                  <PassMetric label="Ready now" value={formatNumber(pass.claimable.length)} detail="claimable rewards" tone={pass.claimable.length ? 'good' : undefined} />
                  <PassMetric
                    label="Late join"
                    value={pass.lateJoinBonusPercent > 0 ? `+${formatNumber(pass.lateJoinBonusPercent)}%` : 'None'}
                    detail="Cred bonus"
                    tone={pass.lateJoinBonusPercent > 0 ? 'good' : undefined}
                  />
                </div>
                <p className="se-hint se-mt">
                  {nextTier
                    ? `Next reward unlocks at ${formatNumber(nextTier.credToReach)} Cred.`
                    : 'The reward track is complete.'}
                </p>
              </div>

              <div className="se-pass-railcard">
                <span className="se-eyebrow">Earning Cred</span>
                <h2>Sources</h2>
                <div className="se-pass-source-list">
                  <div><span>Daily contract</span><strong>{formatNumber(pass.sources.dailyContract)} Cred</strong></div>
                  <div><span>Weekly contract</span><strong>{formatNumber(pass.sources.weeklyContract)} Cred</strong></div>
                  <div><span>Story, side or secret job</span><strong>{formatNumber(pass.sources.oneTimeJob)} Cred</strong></div>
                  <div><span>Event, city or alliance contract</span><strong>{formatNumber(pass.sources.eventContract)} Cred</strong></div>
                  <div className={pass.turnCredToday >= pass.turnCredCap ? 'se-pass-source-list__capped' : undefined}>
                    <span>Turns spent</span>
                    <strong>{formatNumber(pass.sources.perTurnSpent)} a turn</strong>
                    <small>{formatNumber(pass.turnCredToday)} / {formatNumber(pass.turnCredCap)} today</small>
                  </div>
                </div>
                <p className="se-hint se-mt">
                  Pick up contracts on the <Link to="/game/quests">Quests</Link> page. Turn Cred resets with the daily contracts.
                </p>
              </div>

              <div className="se-pass-railcard">
                <span className="se-eyebrow">Season rules</span>
                <div className="se-pass-rules">
                  <div>
                    <strong>Free track</strong>
                    <span>Street Pass progress comes from normal play in the current round.</span>
                  </div>
                  <div>
                    <strong>Claim before reset</strong>
                    <span>When the round ends, unclaimed rewards expire.</span>
                  </div>
                  <div>
                    <strong>Cosmetics persist</strong>
                    <span>A season badge or frame you reached is granted automatically.</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </GameLayout>
  );
}
