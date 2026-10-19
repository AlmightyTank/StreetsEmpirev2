import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ItemCosmeticStyleKey, QuestRewardDto, StreetPassClaimResult, StreetPassDto, StreetPassTierDto } from '@streets/shared';
import { formatNumber, formatProfileName, profileNameParts } from '@streets/shared';
import { streetPassApi } from '../api/streetPass.js';
import { Alert } from '../components/Alert.js';
import { RoundRollCallPanel } from '../components/RoundRollCall.js';
import { Button } from '../components/Button.js';
import { CareerGuidance, CareerMetricStrip, CareerNavigation } from '../components/CareerExperience.js';
import { ItemTile } from '../components/ItemTile.js';
import { rewardText } from '../components/RewardChip.js';
import { AvatarPortrait, BuiltAvatar } from '../components/BuiltAvatar.js';
import { avatarFrameSpec } from '../components/avatarFrameOpenings.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { ITEM_ART, itemArtUrl, rewardArtKey } from '../items/itemArt.js';
import { itemCosmeticArtUrl } from '../items/itemCosmeticArt.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useDropAvailable } from '../layouts/gameNav.js';
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

type CosmeticPreviewKind = 'theme' | 'frame' | 'badge' | 'title' | 'item';

const COSMETIC_PREVIEW_ITEMS = ['PISTOL', 'SHOTGUN', 'TEK9', 'AK47', 'LOW_RIDER', 'SEDAN', 'VAN'] as const;
type CosmeticPreviewItemKey = typeof COSMETIC_PREVIEW_ITEMS[number];
/** Collections the Street Pass pays out; Midnight Chrome is a supporter reward, not a pass reward. */
type CosmeticCollectionStyleKey = Exclude<ItemCosmeticStyleKey, 'classic' | 'midnight-chrome'>;

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
  const previews = pass.tiers.flatMap((tier) => (
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
  return previews.sort((left, right) => (
    Number(right.kind === 'frame') - Number(left.kind === 'frame')
    || left.tier - right.tier
    || left.label.localeCompare(right.label)
  ));
}

function CosmeticRewardPreviewCarousel({ previews }: { previews: CosmeticPreview[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const displayName = useSession((state) => state.me?.displayName ?? state.account?.username ?? 'AMIGHTYTANK');
  const profileImageUrl = useSession((state) => state.profileSettings.profileImageUrl);
  const profileAvatar = useSession((state) => state.profileSettings.profileAvatar);
  const active = previews[Math.min(activeIndex, Math.max(0, previews.length - 1))];
  const [collectionPreviewItems] = useState<Partial<Record<CosmeticCollectionStyleKey, CosmeticPreviewItemKey>>>(() => ({
    'urban-ghost': randomCosmeticPreviewItem(),
    'midnight-ops': randomCosmeticPreviewItem(),
    'cartel-gold': randomCosmeticPreviewItem(),
  }));
  const activeCollectionStyle = active ? cosmeticCollectionStyle(active.key) : null;
  const activeWeapon = activeCollectionStyle ? collectionPreviewItems[activeCollectionStyle] : null;
  const activeFrame = active?.kind === 'frame' ? avatarFrameSpec(active.key) : undefined;

  useEffect(() => {
    if (activeIndex < previews.length) return;
    setActiveIndex(0);
  }, [activeIndex, previews.length]);

  if (!active) return null;

  const eyebrow = active.kind === 'theme' ? 'Theme preview' : active.kind === 'title' ? 'Name preview' : active.kind === 'frame' ? 'Avatar frame preview' : 'Cosmetic preview';
  const description = active.kind === 'theme'
    ? `Unlocks at tier ${formatNumber(active.tier)} and can be selected from account settings after you claim it.`
    : active.kind === 'title'
      ? `Unlocks at tier ${formatNumber(active.tier)} and shows how this title appears with your player name.`
      : active.kind === 'item'
        ? `Unlocks at tier ${formatNumber(active.tier)} and gives this look to every eligible item.`
        : `Unlocks at tier ${formatNumber(active.tier)} and stays on your account after the season.`;

  return (
    <section className="se-pass-theme-previews" aria-label="Street Pass cosmetic previews">
      <article
        className={`se-pass-theme-preview se-pass-theme-preview--${active.kind} se-pass-theme-preview--${active.key}`}
        aria-label={`${active.label} preview`}
        data-no-tab-swipe
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          swipeStart.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = swipeStart.current;
          swipeStart.current = null;
          if (!start || previews.length < 2) return;
          const deltaX = event.clientX - start.x;
          const deltaY = event.clientY - start.y;
          if (Math.abs(deltaX) < 44 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
          setActiveIndex((current) => (current + (deltaX < 0 ? 1 : -1) + previews.length) % previews.length);
        }}
        onPointerCancel={() => { swipeStart.current = null; }}
      >
        <div className="se-pass-theme-preview__copy">
          <span className="se-eyebrow">{eyebrow}</span>
          <h3>{active.label}</h3>
          <p>{description}</p>
        </div>
        {active.kind === 'theme' ? (
          <div className="se-pass-theme-preview__mock" aria-hidden="true">
            <div className="se-pass-theme-preview__mock-topbar">
              <strong>STREETS<span>EMPIRE</span></strong>
              <small>{active.label}</small>
            </div>
            <div className="se-pass-theme-preview__mock-stats">
              <span><small>CASH</small><strong>$19K</strong></span>
              <span><small>TURNS</small><strong>144</strong></span>
              <span><small>HEAT</small><strong>0</strong></span>
            </div>
            <div className="se-pass-theme-preview__mock-panel">
              <small>HOME BASE</small>
              <strong>{active.label}</strong>
              <i />
            </div>
            <div className="se-pass-theme-preview__mock-nav"><i /><i /><i /><i /><i /></div>
          </div>
        ) : active.kind === 'frame' ? (
          <div
            className={`se-pass-theme-preview__frame-stage se-pass-theme-preview__frame-stage--${active.key}`}
            role="img"
            aria-label={`${displayName}'s avatar shown with ${active.label}`}
          >
            {activeFrame ? (
              <AvatarPortrait
                imageUrl={profileImageUrl}
                avatar={profileAvatar}
                fallback={playerInitials(displayName)}
                frameKey={activeFrame.profileKey}
              />
            ) : (
              <>
                {profileImageUrl ? (
                  <img className="se-pass-theme-preview__frame-avatar" src={profileImageUrl} alt="" />
                ) : profileAvatar ? (
                  <span className="se-pass-theme-preview__frame-avatar" aria-hidden="true">
                    <BuiltAvatar parts={profileAvatar} />
                  </span>
                ) : (
                  <span className="se-pass-theme-preview__frame-avatar se-pass-theme-preview__frame-avatar--initials" aria-hidden="true">
                    {playerInitials(displayName)}
                  </span>
                )}
                {active.art ? <img className="se-pass-theme-preview__frame-art" src={itemArtUrl(active.art)} alt="" /> : null}
              </>
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
              <div className="se-pass-theme-preview__title-name" aria-label={formatProfileName(displayName, active.label)}>
                {profileNameParts(displayName, active.label).map((part, index) => (
                  <span className={`se-pass-theme-preview__title-part se-pass-theme-preview__title-part--${part.kind}`} key={index}>
                    {part.text}
                  </span>
                ))}
              </div>
            ) : (
              <div className="se-pass-theme-preview__cosmetic-profile">
                <i />
                <strong>AMIGHTYTANK</strong>
                <small>Featured badge preview</small>
              </div>
            )}
          </div>
        )}
      </article>
      {previews.length > 1 ? (
        <nav className="se-pass-theme-preview__nav" aria-label="Cosmetic previews">
          <button
            type="button"
            className="se-pass-theme-preview__nav-arrow"
            aria-label="Previous cosmetic preview"
            onClick={() => setActiveIndex((current) => (current - 1 + previews.length) % previews.length)}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <span className="se-pass-theme-preview__nav-current" role="status" aria-live="polite" aria-atomic="true">
            <strong>{formatNumber(activeIndex + 1)} / {formatNumber(previews.length)}</strong>
            <span>{active.label}</span>
          </span>
          <button
            type="button"
            className="se-pass-theme-preview__nav-arrow"
            aria-label="Next cosmetic preview"
            onClick={() => setActiveIndex((current) => (current + 1) % previews.length)}
          >
            <span aria-hidden="true">›</span>
          </button>
        </nav>
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
  const dropOpen = useDropAvailable();

  return (
    <GameLayout>
      <div className="se-pass">
        <CareerNavigation active="pass" />
        <header className="se-pass-hero">
          <div className="se-pass-hero__copy">
            <span className="se-eyebrow">Free · resets every round</span>
            <h1>{pass?.name ?? 'Street Pass'}</h1>
            <p>Earn Street Cred through contracts, jobs, and the turns you spend, then claim rewards along this round's track.</p>
          </div>
          {pass ? (
            <div className="se-pass-hero__side">
              <CareerMetricStrip
                label="Street Pass summary"
                className="se-pass-hero__readout"
                items={[
                  { label: 'Tier', value: `${formatNumber(pass.tier)} / ${formatNumber(pass.tierCount)}`, tone: 'accent' },
                  { label: 'Ready', value: formatNumber(pass.claimable.length), tone: pass.claimable.length ? 'good' : undefined },
                  { label: 'Street Cred', value: formatNumber(pass.cred) },
                ]}
              />
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
                {dropOpen && pass.nextTierCred !== null ? <Link className="se-pass-hero__skip" to="/game/drop/pass">Skip tiers with Crowns</Link> : null}
              </div>
            </div>
          ) : null}
        </header>

        <RoundRollCallPanel />

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
                <ol className="se-pass-track" ref={trackRef} tabIndex={0} aria-label="Street Pass reward tiers">
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
                <CareerMetricStrip
                  label="Round progress"
                  className="se-pass-metricgrid"
                  scrollable
                  items={[
                    { label: 'Street Cred', value: formatNumber(pass.cred), detail: 'earned this round', tone: 'accent' },
                    { label: 'Tiers claimed', value: `${formatNumber(claimedCount)} / ${formatNumber(pass.tierCount)}`, detail: `${formatNumber(pass.tier)} reached` },
                    { label: 'Ready now', value: formatNumber(pass.claimable.length), detail: 'claimable rewards', tone: pass.claimable.length ? 'good' : undefined },
                    { label: 'Late join', value: pass.lateJoinBonusPercent > 0 ? `+${formatNumber(pass.lateJoinBonusPercent)}%` : 'None', detail: 'Cred bonus', tone: pass.lateJoinBonusPercent > 0 ? 'good' : undefined },
                  ]}
                />
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

              <CareerGuidance title="Free track, round reset, and permanent cosmetics" summary="Street Pass rules">
                <p>Street Pass progress comes from normal play in the current round. Claim tier rewards before reset; unclaimed rewards expire when the round ends.</p>
                <p>Permanent cosmetics you reach are granted automatically and stay on your account.</p>
              </CareerGuidance>
            </aside>
          </div>
        ) : null}
      </div>
    </GameLayout>
  );
}
