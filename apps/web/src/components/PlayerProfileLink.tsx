import { useEffect, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { PublicPlayerProfileDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { communityApi } from '../api/community.js';
import '../styles/profile-hover.css';

const profileRequests = new Map<number, Promise<PublicPlayerProfileDto>>();

function loadProfile(publicPimpId: number): Promise<PublicPlayerProfileDto> {
  let request = profileRequests.get(publicPimpId);
  if (!request) {
    request = communityApi.profile(publicPimpId).then(({ player }) => player).catch((error: unknown) => {
      profileRequests.delete(publicPimpId);
      throw error;
    });
    profileRequests.set(publicPimpId, request);
  }
  return request;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1
    ? `${parts[0]![0]}${parts.at(-1)![0]}`.toUpperCase()
    : (parts[0]?.slice(0, 2) ?? 'SE').toUpperCase();
}

export function PlayerProfileLink({
  publicPimpId,
  displayName,
  to,
  className = 'se-playerlink',
  children,
}: {
  publicPimpId: number;
  displayName: string;
  to?: string;
  className?: string;
  children?: ReactNode;
}) {
  const profileHref = to ?? `/game/players/${publicPimpId}`;
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<PublicPlayerProfileDto | null>(null);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open || profile || failed) return;
    let active = true;
    void loadProfile(publicPimpId).then((next) => {
      if (active) setProfile(next);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [failed, open, profile, publicPimpId]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!open && window.matchMedia('(hover: none)').matches) {
      event.preventDefault();
      setOpen(true);
    }
  }

  function handleBlur(event: FocusEvent<HTMLSpanElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }

  function closeOnMouseLeave() {
    if (window.matchMedia('(hover: hover)').matches
      && !rootRef.current?.contains(document.activeElement)) {
      setOpen(false);
    }
  }

  return (
    <span
      ref={rootRef}
      className="se-profile-hover"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={closeOnMouseLeave}
      onFocus={() => setOpen(true)}
      onBlur={handleBlur}
      onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
    >
      <Link
        to={profileHref}
        className={className}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={handleClick}
      >
        {children ?? displayName}
      </Link>
      {open ? (
        <span
          className="se-profile-hover__card"
          data-accent={profile?.cosmetics.accent ?? 'default'}
          data-framed={profile?.cosmetics.frame ? 'true' : 'false'}
          role="region"
          aria-label={`${displayName} profile preview`}
        >
          <span className="se-profile-hover__banner" aria-hidden="true">
            <span className="se-profile-hover__banner-mark">STREET EMPIRE</span>
          </span>
          <span className="se-profile-hover__identity">
            <span className="se-profile-hover__avatar" aria-hidden="true">
              {initials(profile?.displayName ?? displayName)}
            </span>
            <span className="se-profile-hover__online" aria-hidden="true" />
            <span className="se-profile-hover__identity-copy">
              {profile?.cosmetics.title ? <span className="se-profile-hover__title">{profile.cosmetics.title}</span> : null}
              <strong>{profile?.displayName ?? displayName}</strong>
              <span className="se-profile-hover__id">PLAYER #{formatNumber(publicPimpId)}</span>
            </span>
          </span>
          {profile ? (
            <>
              <span className="se-profile-hover__crew">
                {profile.crewName ? <strong>{profile.crewName}</strong> : null}
                {profile.alliance ? <span>[{profile.alliance.tag}] {profile.alliance.name}</span> : null}
                <span>{profile.city.name} · {profile.seasonName}</span>
              </span>
              <span className="se-profile-hover__stats">
                <span><small>National rank</small><strong>#{formatNumber(profile.rank.national)}</strong></span>
                <span><small>Net worth</small><strong>{formatCents(profile.netWorthCents)}</strong></span>
              </span>
              {profile.badges.length ? (
                <span className="se-profile-hover__badges" aria-label="Profile badges">
                  {profile.badges.slice(0, 3).map((badge) => (
                    <span className="se-profile-hover__badge" key={badge.key}>{badge.title}</span>
                  ))}
                </span>
              ) : null}
              {profile.cosmetics.frame || profile.cosmetics.accent !== 'default' ? (
                <span className="se-profile-hover__effects">
                  <span>Profile effects</span>
                  {profile.cosmetics.frame ? <strong>{profile.cosmetics.frame.replaceAll('-', ' ')}</strong> : null}
                  {profile.cosmetics.accent !== 'default' ? <strong>{profile.cosmetics.accent.replaceAll('-', ' ')} accent</strong> : null}
                </span>
              ) : null}
            </>
          ) : (
            <span className="se-profile-hover__loading" role="status">
              {failed ? 'Profile preview unavailable.' : 'Loading profile…'}
            </span>
          )}
          <span className="se-profile-hover__footer">
            <Link to={profileHref} className="se-profile-hover__view">View full profile <span aria-hidden="true">→</span></Link>
            <button type="button" className="se-profile-hover__close" onClick={() => setOpen(false)} aria-label="Close profile preview">×</button>
          </span>
        </span>
      ) : null}
    </span>
  );
}
