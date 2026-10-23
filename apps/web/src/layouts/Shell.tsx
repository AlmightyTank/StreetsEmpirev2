import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { APP_VERSION, formatCents, formatCentsCompact, formatNumber } from '@streets/shared';
import { rulesets } from '@streets/rulesets';
import { GameEventToasts } from '../components/GameEventToasts.js';
import { CinematicEncounterAlerts } from '../components/CinematicEncounterAlerts.js';
import { NotificationBell } from '../components/NotificationBell.js';
import { InstallBanner } from '../components/InstallBanner.js';
import { EnvironmentRibbon, environmentLabel } from '../components/EnvironmentRibbon.js';
import { SiteBanner } from '../components/SiteBanner.js';
import { MaintenanceBanner } from '../components/MaintenanceBanner.js';
import { UpdateBanner } from '../components/UpdateBanner.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { useScrollableRegions } from '../hooks/useScrollableRegions.js';
import { SiteThemeDecor } from '../components/SiteThemeDecor.js';
import { AvatarPortrait } from '../components/BuiltAvatar.js';
import { usePageTheme } from '../stores/pageTheme.js';
import { useSession } from '../stores/session.js';
import { formatWhen } from '../utils/time.js';
import { resolveThemePresentation } from '../utils/themeResolution.js';

export function routeIdentity(pathname: string): string {
  const path = pathname.split('?')[0] ?? pathname;

  if (path === '/') return 'landing';
  if (path === '/login') return 'auth-login';
  if (path === '/register') return 'auth-register';
  if (path === '/forgot-password' || path === '/reset-password' || path === '/verify-email') return 'auth-recovery';
  if (path === '/join') return 'join';
  if (path.startsWith('/account')) return 'account';
  if (path.startsWith('/game/admin')) return 'admin';
  if (path === '/game') return 'dashboard';
  if (path === '/game/combat') return 'combat';
  if (path === '/game/scout') return 'scout';
  if (path === '/game/quests') return 'quests';
  if (path === '/game/events') return 'events';
  if (path === '/game/xp-progress') return 'xp-progress';
  if (path === '/game/hideout') return 'hideout';
  if (path === '/game/produce') return 'produce';
  if (path === '/game/street-pass') return 'street-pass';
  if (path === '/game/roll-call') return 'roll-call';
  if (path === '/game/supporter') return 'supporter';
  if (path.startsWith('/game/stores/')) return 'store-detail';
  if (path === '/game/stores') return 'stores';
  if (path === '/game/supply') return 'supply';
  if (path === '/game/holdings') return 'holdings';
  if (path === '/game/loans') return 'loans';
  if (path === '/game/dealers') return 'dealers';
  if (path === '/game/crew') return 'crew';
  if (path === '/game/casino' || path.startsWith('/game/casino/')) return 'casino';
  if (path === '/game/travel') return 'travel';
  if (path === '/game/turf') return 'turf';
  if (path === '/game/operations') return 'operations';
  if (path === '/game/black-book') return 'black-book';
  if (path === '/game/rankings') return 'rankings';
  if (path === '/game/alliance') return 'alliance';
  if (path === '/game/alliances') return 'alliances';
  if (path.startsWith('/game/alliances/')) return 'alliance-detail';
  if (path === '/game/contacts') return 'contacts';
  if (path === '/game/console') return 'console';
  if (path === '/game/players') return 'players';
  if (path === '/game/profile' || path.startsWith('/game/forum/') || path.startsWith('/game/players/')) return 'profile';
  if (path === '/game/activity') return 'activity';
  if (path === '/game/reputation') return 'reputation';
  if (path === '/game/news') return 'news';
  if (path === '/game/rules') return 'rules';
  if (path === '/game/hall-of-fame') return 'hall-of-fame';
  if (path === '/game/status') return 'status';
  if (path === '/game/report-bug') return 'report-bug';
  if (path === '/game/round-archive' || path.includes('/aftermath')) return 'aftermath';
  if (path === '/dev/ui') return 'dev-gallery';
  return 'game';
}

const TURN_ACTION_PAGES = ['/game/scout', '/game/produce', '/game/combat'] as const;
const LAST_TURN_ACTION_KEY = 'streets.lastTurnActionPage';
const LATEST_RULESET_VERSION = Object.values(rulesets).at(-1)?.meta.version ?? '0.1.0';
const PUBLIC_SITE_ORIGIN = 'https://streetsempire.dev';
const BETA_GAME_ORIGIN = 'https://beta.streetsempire.dev';
const FORUM_ORIGIN = 'https://forum.streetsempire.dev';

/** 1.0.0-A. App version, ruleset, environment and season in one line. */
function buildLine(platform: ReturnType<typeof useSession.getState>['platform'], rulesetVersion: string): string {
  const app = platform?.app.version ?? APP_VERSION;
  const commit = platform?.app.commit ? ` (${platform.app.commit})` : '';
  const ruleset = platform ? `${platform.ruleset.id} ${platform.ruleset.version}` : rulesetVersion;
  const environment = platform ? platform.environment[0]!.toUpperCase() + platform.environment.slice(1) : null;
  return [`StreetsEmpire ${app}${commit}`, `ruleset ${ruleset}`, environment, platform?.season?.name ?? null]
    .filter(Boolean)
    .join(' · ');
}

function Brand() {
  const rulesetVersion = useSession((s) => s.round?.rulesetVersion ?? LATEST_RULESET_VERSION);
  const platform = useSession((s) => s.platform);
  const label = environmentLabel(platform?.environment);

  return (
    <Link className="se-brand" to="/" title={buildLine(platform, rulesetVersion)}>
      <svg className="se-brand__crown" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M3 7.5 7.5 11 12 4l4.5 7L21 7.5 19.2 18H4.8zM5 19.5h14V21H5z" />
      </svg>
      <span className="se-brand__mark">
        Streets<span className="se-accent">Empire</span>
      </span>
      <span className="se-brand__ver">v{platform?.app.version ?? APP_VERSION}</span>
      {label ? <span className={`se-env-badge se-env-badge--${platform!.environment}`}>{label}</span> : null}
    </Link>
  );
}

function FooterLogo() {
  return (
    <Link className="se-footer-brand" to="/" aria-label="StreetsEmpire home">
      <span className="se-footer-brand__mark" aria-hidden="true">
        <img src="/icons/icon-maskable-512.png" alt="" />
      </span>
      <span>STREETSEMPIRE</span>
    </Link>
  );
}

function turnActionIndex(pathname: string) {
  return TURN_ACTION_PAGES.findIndex((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function storedTurnActionIndex() {
  if (typeof window === 'undefined') return -1;

  try {
    const stored = window.localStorage.getItem(LAST_TURN_ACTION_KEY);
    return TURN_ACTION_PAGES.indexOf(stored as (typeof TURN_ACTION_PAGES)[number]);
  } catch {
    return -1;
  }
}

function nextTurnActionPath(pathname: string) {
  const current = turnActionIndex(pathname);
  if (current >= 0) {
    return TURN_ACTION_PAGES[(current + 1) % TURN_ACTION_PAGES.length] ?? TURN_ACTION_PAGES[0];
  }

  const last = storedTurnActionIndex();
  if (last >= 0) {
    const lastPath = TURN_ACTION_PAGES[last];
    if (lastPath) return lastPath;
  }

  return TURN_ACTION_PAGES[0];
}

/** Preserve the original compact, accent-aware icons in the desktop HUD. */
const LEGACY_HUD_PATHS = {
  cash: 'M2 6h20v12H2zM12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM5 9v6M19 9v6',
  turns: 'M13 2 4 14h7l-1 8 9-12h-7z',
  heat: 'M12 22a7 7 0 0 0 7-7c0-4-3-6.5-4-10-2 1.5-3 3.5-3 5.5C11 9 10 8 9.5 6.5 7 9 5 11.7 5 15a7 7 0 0 0 7 7z',
} as const;

function LegacyHudIcon({ name }: { name: keyof typeof LEGACY_HUD_PATHS }) {
  const solid = name !== 'cash';
  return (
    <svg className={`se-statusbar__icon se-statusbar__icon--${name} se-statusbar__icon--legacy`}
      viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"
      fill={solid ? 'currentColor' : 'none'} stroke={solid ? 'none' : 'currentColor'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={LEGACY_HUD_PATHS[name]} />
    </svg>
  );
}

/**
 * Colorful but lightweight vector HUD art. These are inline SVGs rather than
 * externally loaded images so the sticky HUD renders immediately offline.
 * The controls themselves retain their existing links and real game values.
 */
function HudIcon({ name }: { name: 'cash' | 'turns' | 'heat' | 'worth' | 'ammo' | 'parts' }) {
  if (name === 'cash') {
    return (
      <>
      <LegacyHudIcon name="cash" />
      <svg className="se-statusbar__icon se-statusbar__icon--cash se-statusbar__icon--illustrated" viewBox="0 0 40 40" width="24" height="24" aria-hidden="true" focusable="false">
        <path d="M4 20 25 11 37 18 16 27Z" fill="#0d7043"/>
        <path d="M4 15 25 6 37 13 16 22Z" fill="#42d98a"/>
        <path d="M4 15v7l12 7v-7Z" fill="#0b9456"/>
        <path d="M16 22v7l21-9v-7Z" fill="#146940"/>
        <path d="M9 15.5 25 9l7 4-16 6.5Z" fill="#8cf8b9"/>
        <path d="M20.5 11 26 8.7l6 3.5-5.5 2.3Z" fill="#128654"/>
        <path d="M11 12l4 2.4v10.5l-4-2.3Z" fill="#f8d574"/>
        <path d="M15 14.4 25 10l4 2.3-14 6.1Z" fill="#ffe6a1"/>
        <path d="M5 23 16 29 36 20" fill="none" stroke="#58e49a" strokeWidth="1.25"/>
      </svg>
      </>
    );
  }
  if (name === 'turns') {
    return (
      <>
      <LegacyHudIcon name="turns" />
      <svg className="se-statusbar__icon se-statusbar__icon--turns se-statusbar__icon--illustrated" viewBox="0 0 40 40" width="24" height="24" aria-hidden="true" focusable="false">
        <path d="M23 2 8 22h11l-3 16 17-24H22Z" fill="#2797ff"/>
        <path d="M23 2 12 21h10l-5 16 16-23H22Z" fill="#75d6ff"/>
        <path d="M23 4 15 20h8l-4 12 11-17H21Z" fill="#c8f4ff" opacity=".72"/>
      </svg>
      </>
    );
  }
  if (name === 'heat') {
    return (
      <>
      <LegacyHudIcon name="heat" />
      <svg className="se-statusbar__icon se-statusbar__icon--heat se-statusbar__icon--illustrated" viewBox="0 0 40 40" width="24" height="24" aria-hidden="true" focusable="false">
        <path d="M21 2C23 11 33 13 33 25a13 13 0 0 1-26 0c0-8 5-13 10-18-1 7 0 10 4 12 2-5 2-11 0-17Z" fill="#ff6133"/>
        <path d="M20 14c2 6 8 7 8 14a8.2 8.2 0 0 1-16.4 0c0-5 2.5-8 5.2-11-.3 4 1.2 6 3.2 7 1.4-2 1.8-6 0-10Z" fill="#ffa42c"/>
        <path d="M20 25c2 3.5 4 4.5 4 8a4 4 0 0 1-8 0c0-3 2-5 4-8Z" fill="#ffe57b"/>
      </svg>
      </>
    );
  }
  if (name === 'ammo') {
    return (
      <svg className="se-statusbar__icon se-statusbar__icon--ammo" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m7 3 4 4-4 4-4-4 4-4Z"/><path d="m17 13 4 4-4 4-4-4 4-4Z"/><path d="m7 11 4 4-4 4-4-4 4-4Z"/>
      </svg>
    );
  }
  if (name === 'parts') {
    return (
      <svg className="se-statusbar__icon se-statusbar__icon--parts" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 6.5a5 5 0 0 0-6.4 6.4L3 18l3 3 5.1-5.1a5 5 0 0 0 6.4-6.4L14 13l-3-3 3.5-3.5Z"/>
      </svg>
    );
  }
  return (
    <svg className="se-statusbar__icon se-statusbar__icon--worth" viewBox="0 0 24 24" width="18" height="18"
      aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>
    </svg>
  );
}

/** A live outline showing the time remaining until the next turn batch. */
function TurnRechargeRing({ nextTurnAt, intervalMinutes, onElapsed }: { nextTurnAt: string; intervalMinutes: number; onElapsed: () => void }) {
  const intervalMs = Math.max(1, intervalMinutes * 60_000);
  const [progress, setProgress] = useState(() => rechargeProgress(nextTurnAt, intervalMs));
  const elapsedRef = useRef(onElapsed);
  const firedFor = useRef<string | null>(null);
  elapsedRef.current = onElapsed;

  useEffect(() => {
    const update = () => {
      const remaining = new Date(nextTurnAt).getTime() - Date.now();
      setProgress(Math.max(0, Math.min(1, 1 - remaining / intervalMs)));
      if (remaining <= 0 && firedFor.current !== nextTurnAt) {
        firedFor.current = nextTurnAt;
        elapsedRef.current();
      }
    };
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [nextTurnAt, intervalMs]);

  const dashOffset = 396 * (1 - progress);
  return (
    <svg className="se-statusbar__recharge" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect className="se-statusbar__recharge-track" x="1" y="1" width="98" height="98" rx="10" pathLength="396" />
      <rect className="se-statusbar__recharge-fill" x="1" y="1" width="98" height="98" rx="10" pathLength="396" strokeDasharray="396" strokeDashoffset={dashOffset} transform="rotate(180 50 50) scale(-1 1)" />
    </svg>
  );
}

function rechargeProgress(nextTurnAt: string, intervalMs: number): number {
  const remaining = new Date(nextTurnAt).getTime() - Date.now();
  return Math.max(0, Math.min(1, 1 - remaining / intervalMs));
}

/**
 * Top bar. Section 23: cash, turns and net worth stay visible on every
 * authenticated page, and collapse to short form on a phone. Each number is
 * also the way to the page that acts on it.
 */
function StatusBar() {
  const me = useSession((s) => s.me);
  const moneyFormat = useSession((s) => s.profileSettings.moneyFormat);
  const platform = useSession((s) => s.platform);
  const refreshSnapshot = useSession((s) => s.refreshSnapshot);
  const location = useLocation();
  const currentTurnAction = turnActionIndex(location.pathname);

  useEffect(() => {
    if (currentTurnAction < 0 || typeof window === 'undefined') return;
    const currentPath = TURN_ACTION_PAGES[currentTurnAction];
    if (!currentPath) return;

    try {
      window.localStorage.setItem(LAST_TURN_ACTION_KEY, currentPath);
    } catch {
      // Private browsing or locked-down storage should not break navigation.
    }
  }, [currentTurnAction]);

  if (!me) return null;
  const money = moneyFormat === 'compact' ? formatCentsCompact : formatCents;
  const turnActionPath = nextTurnActionPath(location.pathname);
  const ruleset = platform ? rulesets[platform.ruleset.id] : undefined;
  const ammoPartsEnabled = ruleset?.ammoParts?.enabled === true;
  const turnIntervalMinutes = ruleset?.turns.intervalMinutes ?? 5;

  const heat = me.heat;
  const arresting = Boolean(heat?.arrest && heat.heat >= heat.arrest.startsAt);
  const busting = Boolean(heat && heat.heat >= heat.bustStartsAt);
  const dragging = Boolean(heat && heat.heat >= heat.dragStartsAt);
  const heatTitle = heat
    ? [
        `Heat ${heat.heat} of ${heat.max}`,
        `take drag from ${heat.dragStartsAt}`,
        `busts from ${heat.bustStartsAt}`,
        heat.arrest ? `arrests from ${heat.arrest.startsAt}` : null,
        heat.lockedUntil ? `locked up until ${formatWhen(heat.lockedUntil)}` : null,
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <div className={`se-statusbar${heat ? ' se-statusbar--has-heat' : ''}`}>
      <Link className="se-statusbar__item" to="/game" title="Cash: open the dashboard">
        <HudIcon name="cash" />
        <span className="se-statusbar__k">Cash</span>
        <span className="se-num se-statusbar__v se-statusbar__v--wide">
          {money(me.resources.cashCents)}
        </span>
        <span className="se-num se-statusbar__v se-statusbar__v--narrow">
          {formatCentsCompact(me.resources.cashCents)}
        </span>
      </Link>
      <Link className="se-statusbar__item se-statusbar__item--turns" to={turnActionPath} title="Turns: cycle Scout, Produce and Raids">
        <HudIcon name="turns" />
        <span className="se-statusbar__k">Turns</span>
        <span className="se-num se-statusbar__v">
          {me.turns.turns}
          <span className="se-muted">/{me.turns.turnCap}</span>
        </span>
        {me.turns.turnsGeneratedNextTick > 0 ? (
          <TurnRechargeRing
            nextTurnAt={me.turns.nextTurnAt}
            intervalMinutes={turnIntervalMinutes}
            onElapsed={() => void refreshSnapshot({ background: true })}
          />
        ) : null}
        <span className={`se-statusbar__meter${me.turns.turns >= me.turns.turnCap ? ' se-statusbar__meter--full' : ''}`} aria-hidden="true">
          <span style={{ width: `${me.turns.turnCap > 0 ? Math.min(100, (me.turns.turns / me.turns.turnCap) * 100) : 0}%` }} />
        </span>
      </Link>
      {ammoPartsEnabled ? (
        <>
          <Link className="se-statusbar__item se-statusbar__item--inventory" to="/game/stores/tommy" title="Ammunition: shop at Tommy’s">
            <HudIcon name="ammo" />
            <span className="se-statusbar__k">Ammo</span>
            <span className="se-num se-statusbar__v">{formatNumber(me.resources.ammo ?? 0)}</span>
          </Link>
          <Link className="se-statusbar__item se-statusbar__item--inventory" to="/game/stores/charlie" title="Vehicle parts: shop at Charlie’s">
            <HudIcon name="parts" />
            <span className="se-statusbar__k">Parts</span>
            <span className="se-num se-statusbar__v">{formatNumber(me.resources.vehicleParts ?? 0)}</span>
          </Link>
        </>
      ) : null}
      {heat ? (
        <Link className="se-statusbar__item" to="/game#heat" title={heatTitle}>
          <HudIcon name="heat" />
          <span className="se-statusbar__k se-statusbar__k--keep">
            {heat.lockedUntil ? 'Locked' : arresting ? 'Arrest' : busting ? 'Bust' : 'Heat'}
          </span>
          <span className={`se-num se-statusbar__v${busting || arresting || heat.lockedUntil ? ' se-bad' : dragging ? ' se-warn' : ''}`}>
            {heat.heat}
          </span>
        </Link>
      ) : null}
      <Link className="se-statusbar__item se-statusbar__item--worth" to="/game/rankings" title="Net worth: see where it ranks">
        <HudIcon name="worth" />
        <span className="se-statusbar__k">Net Worth</span>
        <span className="se-num se-statusbar__v se-statusbar__v--wide">
          {money(me.netWorthCents)}
        </span>
        <span className="se-num se-statusbar__v se-statusbar__v--narrow">
          {formatCentsCompact(me.netWorthCents)}
        </span>
      </Link>
    </div>
  );
}

function initialsOf(name: string): string {
  const parts = name.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_.-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : name.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * Who is signed in, as an avatar chip. Opens a short menu for the profile,
 * account settings and signing out, so the bar no longer carries a bare Log out button.
 */
function AccountMenu({ onLogout }: { onLogout: () => void }) {
  const account = useSession((s) => s.account);
  const me = useSession((s) => s.me);
  const profile = useSession((s) => s.profileSettings);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!account) return null;

  return (
    <div ref={root} className={`se-account${open ? ' se-account--open' : ''}`}>
      <button ref={button} type="button" className="se-account__button"
        aria-label={`Account menu, ${account.username}`}
        aria-expanded={open} aria-controls="se-account-menu" onClick={() => setOpen((value) => !value)}>
        <span className={`se-account__avatar${profile.activeAvatarFrameKey ? ' se-account__avatar--framed' : ''}`} aria-hidden="true">
          <AvatarPortrait
            imageUrl={profile.profileImageUrl}
            avatar={profile.profileAvatar}
            fallback={initialsOf(account.username)}
            frameKey={profile.activeAvatarFrameKey}
          />
        </span>
        <span className="se-account__name">
          {me?.alliance ? <span className="se-alliance-tag" title={me.alliance.name}>[{me.alliance.tag}]</span> : null}
          {account.username}
        </span>
        <svg className="se-account__chevron" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"
          fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div id="se-account-menu" className="se-account__menu">
          <div className="se-account__head">
            <strong>{account.username}</strong>
            {me ? <span className="se-muted">{me.city?.name ?? 'In the game'}</span> : <span className="se-muted">Not in a season</span>}
          </div>
          {me ? <Link className="se-account__item" to="/game/profile">Your profile</Link> : null}
          <Link className="se-account__item" to="/account">Account settings</Link>
          <button type="button" className="se-account__item se-account__item--out" onClick={onLogout}>Log out</button>
        </div>
      ) : null}
    </div>
  );
}

function Footer() {
  const account = useSession((s) => s.account);
  const me = useSession((s) => s.me);
  const platform = useSession((s) => s.platform);
  const rulesetVersion = useSession((s) => s.round?.rulesetVersion ?? LATEST_RULESET_VERSION);

  return (
    <footer className="se-footer">
      <div className="se-footer__inner">
        <div className="se-footer__brand">
          <FooterLogo />
          <p>
            Build a crew, control turf and compete through seasons that reset
            power but preserve history.
          </p>
        </div>

        <div className="se-footer__group">
          <h2>Explore</h2>
          <nav aria-label="Explore StreetsEmpire">
            <Link to="/game/hall-of-fame">Hall of Fame</Link>
            <Link to="/game/alliance#alliance-rankings">Alliances</Link>
            <a href={`${PUBLIC_SITE_ORIGIN}/stats`}>Statistics</a>
            <Link to="/game/news">News</Link>
            <a href={`${PUBLIC_SITE_ORIGIN}/roadmap`}>Roadmap</a>
          </nav>
        </div>

        <div className="se-footer__group">
          <h2>Project</h2>
          <nav aria-label="Project links">
            <a href={`${PUBLIC_SITE_ORIGIN}/about`}>About</a>
            <a href={`${PUBLIC_SITE_ORIGIN}/community`}>Community</a>
            <a href={`${PUBLIC_SITE_ORIGIN}/beta`}>Beta</a>
            <Link to="/game/status">Status</Link>
            <a href={`${PUBLIC_SITE_ORIGIN}/support`}>Support</a>
            <a href={`${PUBLIC_SITE_ORIGIN}/privacy`}>Privacy</a>
            <a href={`${PUBLIC_SITE_ORIGIN}/terms`}>Terms</a>
          </nav>
        </div>

        <div className="se-footer__group">
          <h2>Play</h2>
          <nav aria-label="Game destinations">
            <Link to={me ? '/game' : account ? '/join' : '/login'}>{me ? 'Live Game' : account ? 'Join a Season' : 'Live Game'}</Link>
            <a href={BETA_GAME_ORIGIN}>Beta Game</a>
            <a href={FORUM_ORIGIN}>Forum</a>
          </nav>
        </div>

        <div className="se-footer__group">
          <h2>Social</h2>
          <nav aria-label="Social links">
            <a href="https://discord.gg/V3HYNcMv5H">Discord</a>
            <a href="https://www.facebook.com/StreetsEmpireHQ">Facebook</a>
            <a href="https://x.com/StreetsEmpireHQ">X</a>
          </nav>
        </div>
      </div>

      <div className="se-footer__bottom">
        <span>StreetsEmpire</span>
        <span className="se-footer__build" title={buildLine(platform, rulesetVersion)}>
          {buildLine(platform, rulesetVersion)}
        </span>
      </div>
    </footer>
  );
}

const RAIL_STORAGE_KEY = 'streets.sidebar.rail.v1';

function readRail(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(RAIL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

const SidebarRailContext = createContext(false);

/** True while the desktop sidebar is collapsed to icons, so nav links can carry tooltips. */
export function useSidebarRail(): boolean {
  return useContext(SidebarRailContext);
}

/**
 * Desktop game frame: the sidebar and the content column. The player can fold
 * the sidebar to an icon rail; that choice is per browser, like the phone tabs.
 */
function SidebarFrame({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const [rail, setRail] = useState(readRail);

  function toggle() {
    const next = !rail;
    setRail(next);
    try {
      window.localStorage.setItem(RAIL_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Private browsing: the rail still folds, it just forgets on reload.
    }
  }

  return (
    <SidebarRailContext.Provider value={rail}>
      <div className={`se-frame${rail ? ' se-frame--rail' : ''}`}>
        <aside id="se-sidebar" className="se-sidebar" aria-label="Game menu">
          <div className="se-sidebar__brand">
            <Brand />
            <button
              type="button"
              className="se-sidebar__toggle"
              onClick={toggle}
              aria-controls="se-sidebar"
              aria-expanded={!rail}
              aria-label={rail ? 'Expand menu' : 'Collapse menu to icons'}
              title={rail ? 'Expand menu' : 'Collapse menu to icons'}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"
                fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={rail ? 'M10 7l5 5-5 5M4 4v16' : 'M14 7l-5 5 5 5M20 4v16'} />
              </svg>
            </button>
          </div>
          {sidebar}
        </aside>
        <div className="se-frame__main">{children}</div>
      </div>
    </SidebarRailContext.Provider>
  );
}

export function Shell({ children, narrow, tabbar, sidebar }: {
  children: ReactNode;
  narrow?: boolean;
  /** Phone game navigation, fixed to the bottom of the screen. */
  tabbar?: ReactNode;
  /** Desktop game menu. Turns the page into a full-height sidebar and content frame. */
  sidebar?: ReactNode;
}) {
  useScrollableRegions();
  const account = useSession((s) => s.account);
  const me = useSession((s) => s.me);
  const settings = useSession((s) => s.profileSettings);
  const pageTheme = usePageTheme((s) => s.themeKey);
  const takeShell = usePageTheme((s) => s.takeShell);
  // Popup animation and the viewer's full-shell theme are independent loadout choices.
  // A public profile can preview its owner's theme in the content area without
  // replacing the viewer's own shell theme. A page that opts into a takeover
  // (the Collection theme viewer) previews across the whole shell instead.
  const { shellTheme, decorTheme } = resolveThemePresentation({
    selectedTheme: settings.activeSiteThemeKey,
    pageTheme,
    takeShell,
  });
  const logout = useSession((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const identity = routeIdentity(location.pathname);
  const hasGameTabs = Boolean(tabbar);

  // Match the :has()-based mobile overscroll protection on older WebViews.
  // Scope it to mounted game tab navigation; sign-in and other pages retain
  // their normal scrolling/refresh behavior.
  useEffect(() => {
    if (!hasGameTabs) return;
    document.documentElement.classList.add('se-mobile-game');
    document.body.classList.add('se-mobile-game');
    return () => {
      document.documentElement.classList.remove('se-mobile-game');
      document.body.classList.remove('se-mobile-game');
    };
  }, [hasGameTabs]);

  // A mobile HUD can grow with width, accessibility text settings and earned
  // avatar frames. Keep native anchor/scrollIntoView offsets in sync with the
  // measured sticky header instead of a fixed value that hides target headings.
  useEffect(() => {
    if (!hasGameTabs) return;
    const app = document.querySelector<HTMLElement>('.se-app--tabbar');
    const header = app?.querySelector<HTMLElement>('.se-topbar');
    if (!app || !header) return;

    const syncOffset = () => {
      app.style.setProperty('--se-mobile-header-offset', `${Math.ceil(header.getBoundingClientRect().height) + 12}px`);
    };
    syncOffset();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncOffset) : null;
    observer?.observe(header);
    return () => {
      observer?.disconnect();
      app.style.removeProperty('--se-mobile-header-offset');
    };
  }, [hasGameTabs]);

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  const page = (
    <>
      <header className="se-topbar">
        <Brand />

        <StatusBar />

        <div className="se-topbar__right">
          {account ? (
            <>
              {me ? <NotificationBell /> : null}
              <AccountMenu onLogout={handleLogout} />
            </>
          ) : (
            <>
              <Link className="se-btn se-btn--ghost se-btn--sm" to="/login">
                Log in
              </Link>
              <Link className="se-btn se-btn--primary se-btn--sm" to="/register">
                Register
              </Link>
            </>
          )}
        </div>
      </header>

      <SiteBanner />
      <MaintenanceBanner />
      <UpdateBanner />
      <GameEventToasts />
      <CinematicEncounterAlerts />

      <main id="main-content" tabIndex={-1} className={narrow ? 'se-authshell' : 'se-shell'}>{children}</main>

      <Footer />
    </>
  );

  return (
    <div className={`se-app se-route--${identity} se-site-accent--${settings.profileAccent} se-site-theme--${shellTheme ?? 'none'} se-density--${settings.uiDensity}${settings.reducedMotion ? ' se-reduced-motion' : ''}${tabbar ? ' se-app--tabbar' : ''}${sidebar ? ' se-app--sidebar' : ''}`}>
      {/* 1.0.0-G: the first Tab stop jumps past the header and navigation. */}
      <a
        className="se-skiplink"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          const main = document.getElementById('main-content');
          main?.focus({ preventScroll: true });
          main?.scrollIntoView({ block: 'start' });
        }}
      >
        Skip to content
      </a>
      <EnvironmentRibbon />
      <InstallBanner />
      <SiteThemeDecor themeKey={decorTheme} />

      {sidebar ? <SidebarFrame sidebar={sidebar}>{page}</SidebarFrame> : page}
      <ConfirmDialog />
      {tabbar}
    </div>
  );
}
