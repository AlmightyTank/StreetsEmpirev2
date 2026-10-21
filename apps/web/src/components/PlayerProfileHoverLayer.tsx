import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import type { PublicPlayerProfileDto } from '@streets/shared';
import { CREW_COSMETIC_KEYS, formatCents, formatNumber, SIGNATURE_CARD_FRAME_KEY } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { ItemTile } from './ItemTile.js';
import { hasProfileLook } from './ProfileLook.js';
import { SupporterMark } from './SupporterMark.js';
import { LevelChip } from './LevelChip.js';
import { BirthdayCake } from './BirthdayCake.js';
import { AvatarPortrait } from './BuiltAvatar.js';
import { StreetSignDisplay } from './StreetSignBuilder.js';

type Target = { id: number; anchor: HTMLAnchorElement; hoverRoot: HTMLElement; label: string };
type Position = { top: number; left: number; width: number };
const cache = new Map<number, Promise<PublicPlayerProfileDto>>();
const CARD_WIDTH = 330;
const CARD_FALLBACK_HEIGHT = 370;
const VIEWPORT_GUTTER = 12;
const ANCHOR_GAP = 10;
/** Slice F: the hover card's look strip, a gun and the ride (plus both crew) in the owner's art. */
const HOVER_LOOK_ITEMS = ['AK47', 'LOW_RIDER'] as const;

/** Chip text for the equipped avatar frame; the Signature card reads as a card, not a frame key. */
function frameChip(key: string): string {
  if (key === SIGNATURE_CARD_FRAME_KEY) return 'Midnight Chrome card';
  return `${key.replaceAll('-', ' ')} avatar frame`;
}

function getProfile(id: number): Promise<PublicPlayerProfileDto> {
  let request = cache.get(id);
  if (!request) {
    request = communityApi.profile(id).then(({ player }) => player).catch((error: unknown) => {
      cache.delete(id);
      throw error;
    });
    cache.set(id, request);
  }
  return request;
}

function profileLink(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest<HTMLAnchorElement>('a[href]');
  if (!anchor || anchor.dataset.profileHoverIgnore !== undefined) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  const match = url.pathname.match(/^\/game\/players\/(\d+)\/?$/);
  return match ? anchor : null;
}

function profileTrigger(target: EventTarget | null): { anchor: HTMLAnchorElement; hoverRoot: HTMLElement } | null {
  if (!(target instanceof Element)) return null;
  const hoverRoot = target.closest<HTMLElement>('[data-profile-hover-trigger]');
  const anchor = profileLink(target)
    ?? (hoverRoot ? Array.from(hoverRoot.querySelectorAll<HTMLAnchorElement>('a[href]')).find((candidate) => profileLink(candidate) === candidate) ?? null : null);
  if (!anchor) return null;
  return { anchor, hoverRoot: hoverRoot ?? anchor };
}

function playerId(anchor: HTMLAnchorElement): number | null {
  const match = new URL(anchor.href, window.location.href).pathname.match(/^\/game\/players\/(\d+)\/?$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length > 1
    ? `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase()
    : (words[0]?.slice(0, 2) ?? 'SE').toUpperCase();
}

export function PlayerProfileHoverLayer() {
  const [target, setTarget] = useState<Target | null>(null);
  const [profile, setProfile] = useState<PublicPlayerProfileDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0, width: CARD_WIDTH });
  const [touch, setTouch] = useState(false);
  const targetRef = useRef<Target | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<number | null>(null);
  const suppressFocus = useRef(false);
  const lastTap = useRef<HTMLAnchorElement | null>(null);
  const navigatedAt = useRef(0);
  const lastPointerMove = useRef(0);
  const location = useLocation();
  const locationKey = `${location.pathname}${location.search}`;

  function clearCloseTimer() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function close() {
    clearCloseTimer();
    targetRef.current?.anchor.removeAttribute('aria-expanded');
    targetRef.current?.anchor.removeAttribute('aria-controls');
    targetRef.current = null;
    lastTap.current = null;
    setTarget(null);
    setProfile(null);
    setFailed(false);
  }

  function activate(anchor: HTMLAnchorElement, hoverRoot: HTMLElement = anchor) {
    const id = playerId(anchor);
    if (!id) return;
    clearCloseTimer();
    if (targetRef.current?.anchor === anchor) return;
    const next = { id, anchor, hoverRoot, label: anchor.textContent?.trim() || `Player #${id}` };
    targetRef.current?.anchor.removeAttribute('aria-expanded');
    targetRef.current?.anchor.removeAttribute('aria-controls');
    anchor.setAttribute('aria-expanded', 'true');
    anchor.setAttribute('aria-controls', 'se-player-profile-hover-card');
    targetRef.current = next;
    setTarget(next);
    setProfile(null);
    setFailed(false);
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      const active = document.activeElement;
      if (targetRef.current && !targetRef.current.anchor.contains(active)
        && !cardRef.current?.contains(active)) close();
    }, 180);
  }

  useEffect(() => {
    const media = window.matchMedia('(hover: none), (pointer: coarse)');
    const update = () => setTouch(media.matches);
    update();
    media.addEventListener('change', update);

    function onPointerOver(event: PointerEvent) {
      if (media.matches || !(event.target instanceof Element)) return;
      if (cardRef.current?.contains(event.target)) clearCloseTimer();
      // After a page swap the browser re-fires pointerover for whatever
      // renders under a stationary cursor. Ignore it until the pointer
      // really moves so a card doesn't open uninvited.
      if (lastPointerMove.current < navigatedAt.current) return;
      const trigger = profileTrigger(event.target);
      if (trigger && !trigger.hoverRoot.contains(event.relatedTarget as Node | null)) activate(trigger.anchor, trigger.hoverRoot);
    }
    function onPointerOut(event: PointerEvent) {
      if (media.matches || !(event.target instanceof Element)) return;
      const trigger = profileTrigger(event.target);
      if (trigger && !trigger.hoverRoot.contains(event.relatedTarget as Node | null)
        && !cardRef.current?.contains(event.relatedTarget as Node | null)) scheduleClose();
      if (cardRef.current?.contains(event.target) && !cardRef.current.contains(event.relatedTarget as Node | null)) scheduleClose();
    }
    function onFocusIn(event: FocusEvent) {
      if (suppressFocus.current) return;
      const trigger = profileTrigger(event.target);
      if (trigger) activate(trigger.anchor, trigger.hoverRoot);
      if (cardRef.current?.contains(event.target as Node)) clearCloseTimer();
    }
    function onFocusOut(event: FocusEvent) {
      const next = event.relatedTarget as Node | null;
      if (targetRef.current?.anchor.contains(next) || cardRef.current?.contains(next)) return;
      scheduleClose();
    }
    function onPointerMove() {
      lastPointerMove.current = Date.now();
    }
    function onClick(event: MouseEvent) {
      if (!media.matches || !(event.target instanceof Element)) return;
      const anchor = profileLink(event.target);
      if (!anchor) return;
      const id = playerId(anchor);
      if (!id) return;
      if (lastTap.current === anchor) {
        lastTap.current = null;
        return;
      }
      event.preventDefault();
      lastTap.current = anchor;
      activate(anchor, anchor.closest<HTMLElement>('[data-profile-hover-trigger]') ?? anchor);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && targetRef.current) {
        const anchor = targetRef.current.anchor;
        const restoreFocus = Boolean(cardRef.current?.contains(document.activeElement));
        close();
        if (restoreFocus) {
          suppressFocus.current = true;
          anchor.focus();
          window.setTimeout(() => { suppressFocus.current = false; }, 0);
        }
      }
    }

    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      media.removeEventListener('change', update);
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown);
      clearCloseTimer();
    };
  }, []);

  useEffect(() => {
    if (!target) return;
    let active = true;
    const request = window.setTimeout(() => {
      void getProfile(target.id).then((next) => {
        if (active) setProfile(next);
      }).catch(() => {
        if (active) setFailed(true);
      });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(request);
    };
  }, [target]);

  useLayoutEffect(() => {
    if (!target || touch) return;
    const hoverRoot = target.hoverRoot;
    const anchor = target.anchor;
    let animationFrame = 0;
    function updatePosition() {
      if (!hoverRoot.isConnected || !anchor.isConnected) {
        close();
        return;
      }
      const rect = hoverRoot.getBoundingClientRect();
      const width = Math.min(CARD_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2);
      const left = Math.max(VIEWPORT_GUTTER, Math.min(rect.left, window.innerWidth - width - VIEWPORT_GUTTER));
      const measuredHeight = cardRef.current?.getBoundingClientRect().height ?? CARD_FALLBACK_HEIGHT;
      const height = Math.min(measuredHeight, window.innerHeight - VIEWPORT_GUTTER * 2);
      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_GUTTER;
      const spaceAbove = rect.top - VIEWPORT_GUTTER;
      const placeBelow = spaceBelow >= height + ANCHOR_GAP || spaceBelow >= spaceAbove;
      const preferredTop = placeBelow ? rect.bottom + ANCHOR_GAP : rect.top - height - ANCHOR_GAP;
      const top = Math.max(VIEWPORT_GUTTER, Math.min(preferredTop, window.innerHeight - height - VIEWPORT_GUTTER));
      setPosition({ top, left, width });
    }
    function queuePositionUpdate() {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updatePosition);
    }
    updatePosition();
    const observer = new ResizeObserver(queuePositionUpdate);
    if (cardRef.current) observer.observe(cardRef.current);
    window.addEventListener('resize', queuePositionUpdate);
    window.addEventListener('scroll', queuePositionUpdate, true);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', queuePositionUpdate);
      window.removeEventListener('scroll', queuePositionUpdate, true);
    };
  }, [target, touch]);

  useEffect(() => () => clearCloseTimer(), []);

  // The layer lives beside <Outlet/> so it survives page swaps. The old
  // anchor unmounts but the portal card would stay stuck open.
  useEffect(() => {
    navigatedAt.current = Date.now();
    close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationKey]);

  if (!target) return null;
  const to = `/game/players/${target.id}`;
  const avatarFrame = profile?.cosmetics.avatarFrame === undefined
    ? profile?.cosmetics.frame ?? null
    : profile.cosmetics.avatarFrame ?? null;
  // The Signature card comes with its avatar frame: equipping the frame restyles the whole card and adds the chrome ring.
  const signature = avatarFrame === SIGNATURE_CARD_FRAME_KEY;
  const surface = profile?.cosmetics.surface ?? 'brushed';
  return createPortal(
    <aside
      ref={cardRef}
      id="se-player-profile-hover-card"
      className={`se-profile-hover-card${profile ? ` se-profile-effect se-profile-effect--${profile.cosmetics.effect}` : ''}${profile?.cosmetics.siteTheme ? ` se-site-theme--${profile.cosmetics.siteTheme}` : ''}${signature ? ' se-signature-card' : ''}`}
      data-theme={profile?.cosmetics.siteTheme ?? 'none'}
      data-accent={profile?.cosmetics.accent ?? 'default'}
      data-frame="none"
      data-avatar-frame={avatarFrame ?? 'none'}
      data-surface={signature ? surface : undefined}
      data-touch={touch ? 'true' : 'false'}
      style={touch ? undefined : { top: position.top, left: position.left, width: position.width }}
      aria-label={`${profile?.displayName ?? target.label} profile preview`}
      onPointerEnter={clearCloseTimer}
      onPointerLeave={scheduleClose}
      onFocusCapture={clearCloseTimer}
      onBlurCapture={(event) => {
        const next = event.relatedTarget as Node | null;
        if (!event.currentTarget.contains(next) && !target.anchor.contains(next)) scheduleClose();
      }}
    >
      <div
        className="se-profile-hover-card__banner"
        data-crew-banner={profile?.look?.crewBanner ?? undefined}
        aria-hidden="true"
        style={profile?.cosmetics.bannerUrl ? { backgroundImage: `linear-gradient(90deg, rgba(5, 8, 8, 0.36), rgba(5, 8, 8, 0.82)), url("${profile.cosmetics.bannerUrl}")` } : undefined}
      >
        <span>STREET EMPIRE</span>
        <i className="se-profile-hover-card__spark se-profile-hover-card__spark--one" />
        <i className="se-profile-hover-card__spark se-profile-hover-card__spark--two" />
      </div>
      <div className="se-profile-hover-card__identity">
        <span className="se-profile-hover-card__avatar" aria-hidden="true">
          <AvatarPortrait
            imageUrl={profile?.cosmetics.imageUrl}
            avatar={profile?.cosmetics.avatar}
            fallback={initials(profile?.displayName ?? target.label)}
            frameKey={avatarFrame}
          />
        </span>
        <span className="se-profile-hover-card__identity-copy">
          {profile?.cosmetics.title ? <span className="se-profile-hover-card__title">{profile.cosmetics.title}</span> : null}
          <strong><span>{profile?.displayName ?? target.label}</span>{profile?.isSupporter ? <SupporterMark /> : null}{profile?.birthdayToday ? <BirthdayCake /> : null}<LevelChip level={profile?.experience?.level} /></strong>
          <small>PLAYER #{formatNumber(target.id)}{profile?.isSupporter ? ' · SUPPORTER' : ''}</small>
        </span>
      </div>
      {profile ? (
        <>
          <div className="se-profile-hover-card__crew">
            {profile.crewName ? <strong>{profile.crewName}</strong> : null}
            {profile.alliance ? <span>[{profile.alliance.tag}] {profile.alliance.name}</span> : null}
            <span>{profile.city.name} · {profile.seasonName}</span>
          </div>
          <StreetSignDisplay design={profile.streetSign} compact />
          {profile.profileBio ? <p className="se-profile-hover-card__bio">{profile.profileBio}</p> : null}
          <div className="se-profile-hover-card__stats">
            <div><small>National rank</small><strong>#{formatNumber(profile.rank.national)}</strong></div>
            <div><small>Net worth</small><strong>{formatCents(profile.netWorthCents)}</strong></div>
          </div>
          {profile.experience ? (
            <div className="se-profile-hover-card__xp">
              <div><span>LEVEL {formatNumber(profile.experience.level)}</span><strong>{formatNumber(profile.experience.progressPercent)}%</strong></div>
              <div
                className="se-profile-hover-card__xp-track"
                role="progressbar"
                aria-label="Progress to next player level"
                aria-valuenow={profile.experience.progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${profile.experience.progressPercent}%` }} />
              </div>
              <small>{formatNumber(profile.experience.xpToNextLevel)} XP to next level</small>
            </div>
          ) : null}
          {profile.badges.length ? (
            <div className="se-profile-hover-card__badges" aria-label="Profile badges">
              {profile.badges.slice(0, 3).map((badge) => (
                <span key={badge.key} title={badge.description}>{badge.title}</span>
              ))}
            </div>
          ) : null}
          {hasProfileLook(profile.look) ? (
            <div className="se-profile-hover-card__look" aria-label="Item and crew look">
              {HOVER_LOOK_ITEMS.map((key) => (
                <ItemTile key={key} item={key} size="sm" label={false} cosmeticStyle={profile.look!.items[key] ?? 'classic'} />
              ))}
              {CREW_COSMETIC_KEYS.map((key) => (
                <ItemTile key={key} item={key} size="sm" label={false} cosmeticStyle={profile.look!.crew[key]} />
              ))}
            </div>
          ) : null}
          {avatarFrame || profile.cosmetics.accent !== 'default' || profile.cosmetics.effect !== 'none' || profile.cosmetics.siteThemeLabel ? (
            <div className="se-profile-hover-card__effects">
              <small>PROFILE LOOK</small>
              {profile.cosmetics.siteThemeLabel ? <span>{profile.cosmetics.siteThemeLabel} theme</span> : null}
              {avatarFrame ? <span>{frameChip(avatarFrame)}</span> : null}
              {signature ? <span>{surface.replace('-', ' ')} surface</span> : null}
              {profile.cosmetics.accent !== 'default' ? <span>{profile.cosmetics.accent.replaceAll('-', ' ')} accent</span> : null}
              {profile.cosmetics.effect !== 'none' ? <span>{profile.cosmetics.effect === 'midnight-chrome' ? 'chrome glint' : `${profile.cosmetics.effect.replaceAll('-', ' ')} animation`}</span> : null}
            </div>
          ) : null}
        </>
      ) : (
        <div className="se-profile-hover-card__loading" role="status">
          {failed ? 'Profile preview unavailable.' : 'Loading profile…'}
        </div>
      )}
      <div className="se-profile-hover-card__footer">
        <Link to={to} data-profile-hover-ignore="" className="se-profile-hover-card__view">
          View full profile <span aria-hidden="true">→</span>
        </Link>
        <button type="button" onClick={close} aria-label="Close profile preview">×</button>
      </div>
      <button
        type="button"
        className="se-profile-hover-card__dismiss"
        onClick={close}
        aria-label="Close profile preview"
      >
        Close
      </button>
    </aside>,
    document.body,
  );
}
