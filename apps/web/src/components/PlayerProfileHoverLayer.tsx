import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { PublicPlayerProfileDto } from '@streets/shared';
import { CREW_COSMETIC_KEYS, formatCents, formatNumber } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { ItemTile } from './ItemTile.js';
import { hasProfileLook } from './ProfileLook.js';

type Target = { id: number; anchor: HTMLAnchorElement; label: string };
type Position = { top: number; left: number; width: number };
const cache = new Map<number, Promise<PublicPlayerProfileDto>>();
const CARD_WIDTH = 330;
const CARD_HEIGHT = 370;
/** Slice F: the hover card's look strip, a gun and the ride (plus both crew) in the owner's art. */
const HOVER_LOOK_ITEMS = ['AK47', 'LOW_RIDER'] as const;
const PROFILE_EFFECT_FRAME_ART = {
  snowstorm: {
    popup: '/profile-frames/snowstorm-popup.webp',
    avatar: '/profile-frames/snowstorm-avatar.webp',
  },
  inferno: {
    popup: '/profile-frames/inferno-popup.webp',
    avatar: '/profile-frames/inferno-avatar.webp',
  },
} as const;

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

  function activate(anchor: HTMLAnchorElement) {
    const id = playerId(anchor);
    if (!id) return;
    clearCloseTimer();
    if (targetRef.current?.anchor === anchor) return;
    const next = { id, anchor, label: anchor.textContent?.trim() || `Player #${id}` };
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
      const anchor = profileLink(event.target);
      if (anchor && !anchor.contains(event.relatedTarget as Node | null)) activate(anchor);
      if (cardRef.current?.contains(event.target)) clearCloseTimer();
    }
    function onPointerOut(event: PointerEvent) {
      if (media.matches || !(event.target instanceof Element)) return;
      const anchor = profileLink(event.target);
      if (anchor && !anchor.contains(event.relatedTarget as Node | null)
        && !cardRef.current?.contains(event.relatedTarget as Node | null)) scheduleClose();
      if (cardRef.current?.contains(event.target) && !cardRef.current.contains(event.relatedTarget as Node | null)) scheduleClose();
    }
    function onFocusIn(event: FocusEvent) {
      if (suppressFocus.current) return;
      const anchor = profileLink(event.target);
      if (anchor) activate(anchor);
      if (cardRef.current?.contains(event.target as Node)) clearCloseTimer();
    }
    function onFocusOut(event: FocusEvent) {
      const next = event.relatedTarget as Node | null;
      if (targetRef.current?.anchor.contains(next) || cardRef.current?.contains(next)) return;
      scheduleClose();
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
      activate(anchor);
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
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      media.removeEventListener('change', update);
      document.removeEventListener('pointerover', onPointerOver);
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
    const anchor = target.anchor;
    function updatePosition() {
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(CARD_WIDTH, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const below = rect.bottom + 10;
      const top = below + CARD_HEIGHT < window.innerHeight - 12
        ? below
        : Math.max(12, rect.top - CARD_HEIGHT - 10);
      setPosition({ top, left, width });
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [target, touch]);

  useEffect(() => () => clearCloseTimer(), []);

  if (!target) return null;
  const to = `/game/players/${target.id}`;
  const frameArt = profile ? PROFILE_EFFECT_FRAME_ART[profile.cosmetics.effect as keyof typeof PROFILE_EFFECT_FRAME_ART] : null;
  return createPortal(
    <aside
      ref={cardRef}
      id="se-player-profile-hover-card"
      className={`se-profile-hover-card${profile ? ` se-profile-effect se-profile-effect--${profile.cosmetics.effect}` : ''}${profile?.cosmetics.siteTheme ? ` se-site-theme--${profile.cosmetics.siteTheme}` : ''}`}
      data-theme={profile?.cosmetics.siteTheme ?? 'none'}
      data-accent={profile?.cosmetics.accent ?? 'default'}
      data-frame={profile?.cosmetics.frame ?? 'none'}
      data-avatar-frame={profile?.cosmetics.avatarFrame === undefined ? profile?.cosmetics.frame ?? 'none' : profile.cosmetics.avatarFrame ?? 'none'}
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
      {frameArt ? <img className="se-profile-hover-card__frame-art" src={frameArt.popup} alt="" aria-hidden="true" /> : null}
      <div
        className="se-profile-hover-card__banner"
        aria-hidden="true"
        style={profile?.cosmetics.bannerUrl ? { backgroundImage: `linear-gradient(90deg, rgba(5, 8, 8, 0.36), rgba(5, 8, 8, 0.82)), url("${profile.cosmetics.bannerUrl}")` } : undefined}
      >
        <span>STREET EMPIRE</span>
        <i className="se-profile-hover-card__spark se-profile-hover-card__spark--one" />
        <i className="se-profile-hover-card__spark se-profile-hover-card__spark--two" />
      </div>
      <div className="se-profile-hover-card__identity">
        <span className="se-profile-hover-card__avatar" aria-hidden="true">
          {profile?.cosmetics.imageUrl ? <img src={profile.cosmetics.imageUrl} alt="" /> : initials(profile?.displayName ?? target.label)}
        </span>
        {frameArt ? <img className="se-profile-hover-card__avatar-art" src={frameArt.avatar} alt="" aria-hidden="true" /> : null}
        <span className="se-profile-hover-card__identity-copy">
          {profile?.cosmetics.title ? <span className="se-profile-hover-card__title">{profile.cosmetics.title}</span> : null}
          <strong>{profile?.displayName ?? target.label}</strong>
          <small>PLAYER #{formatNumber(target.id)}</small>
        </span>
      </div>
      {profile ? (
        <>
          <div className="se-profile-hover-card__crew">
            {profile.crewName ? <strong>{profile.crewName}</strong> : null}
            {profile.alliance ? <span>[{profile.alliance.tag}] {profile.alliance.name}</span> : null}
            <span>{profile.city.name} · {profile.seasonName}</span>
          </div>
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
          {profile.cosmetics.frame || profile.cosmetics.avatarFrame || profile.cosmetics.accent !== 'default' || profile.cosmetics.effect !== 'none' || profile.cosmetics.siteThemeLabel ? (
            <div className="se-profile-hover-card__effects">
              <small>PROFILE LOOK</small>
              {profile.cosmetics.siteThemeLabel ? <span>{profile.cosmetics.siteThemeLabel} theme</span> : null}
              {profile.cosmetics.frame ? <span>{profile.cosmetics.frame.replaceAll('-', ' ')} popup frame</span> : null}
              {profile.cosmetics.avatarFrame ? <span>{profile.cosmetics.avatarFrame.replaceAll('-', ' ')} avatar frame</span> : null}
              {profile.cosmetics.accent !== 'default' ? <span>{profile.cosmetics.accent.replaceAll('-', ' ')} accent</span> : null}
              {profile.cosmetics.effect !== 'none' ? <span>{profile.cosmetics.effect.replaceAll('-', ' ')} animation</span> : null}
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
