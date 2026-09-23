import { useEffect, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { formatCents, formatCentsCompact } from '@streets/shared';
import { rulesets } from '@streets/rulesets';
import { GameEventToasts } from '../components/GameEventToasts.js';
import { NotificationBell } from '../components/NotificationBell.js';
import { InstallBanner } from '../components/InstallBanner.js';
import { SiteBanner } from '../components/SiteBanner.js';
import { useSession } from '../stores/session.js';

const TURN_ACTION_PAGES = ['/game/scout', '/game/produce', '/game/combat'] as const;
const LAST_TURN_ACTION_KEY = 'streets.lastTurnActionPage';
const LATEST_RULESET_VERSION = Object.values(rulesets).at(-1)?.meta.version ?? '0.1.0';

function Brand() {
  const version = useSession((s) => s.round?.rulesetVersion ?? LATEST_RULESET_VERSION);

  return (
    <Link className="se-brand" to="/">
      <span className="se-brand__mark">
        Streets<span className="se-accent">Empire</span>
      </span>
      <span className="se-brand__ver">{version}</span>
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

/**
 * Top bar. Section 23: cash, turns and net worth stay visible on every
 * authenticated page, and collapse to short form on a phone. Each number is
 * also the way to the page that acts on it.
 */
function StatusBar() {
  const me = useSession((s) => s.me);
  const moneyFormat = useSession((s) => s.profileSettings.moneyFormat);
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
        heat.lockedUntil ? `locked up until ${new Date(heat.lockedUntil).toLocaleString()}` : null,
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="se-statusbar">
      <Link className="se-statusbar__item" to="/game" title="Cash: open the dashboard">
        <span className="se-statusbar__k">Cash</span>
        <span className="se-num se-statusbar__v se-statusbar__v--wide">
          {money(me.resources.cashCents)}
        </span>
        <span className="se-num se-statusbar__v se-statusbar__v--narrow">
          {formatCentsCompact(me.resources.cashCents)}
        </span>
      </Link>
      <Link className="se-statusbar__item" to={turnActionPath} title="Turns: cycle Scout, Produce and Raids">
        <span className="se-statusbar__k">Turns</span>
        <span className="se-num se-statusbar__v">
          {me.turns.turns}
          <span className="se-muted">/{me.turns.turnCap}</span>
        </span>
      </Link>
      {heat ? (
        <Link className="se-statusbar__item" to="/game#heat" title={heatTitle}>
          <span className="se-statusbar__k se-statusbar__k--keep">
            {heat.lockedUntil ? 'Locked' : arresting ? 'Arrest' : busting ? 'Bust' : 'Heat'}
          </span>
          <span className={`se-num se-statusbar__v${busting || arresting || heat.lockedUntil ? ' se-bad' : dragging ? ' se-warn' : ''}`}>
            {heat.heat}
          </span>
        </Link>
      ) : null}
      <Link className="se-statusbar__item se-statusbar__item--worth" to="/game/rankings" title="Net worth: see where it ranks">
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

function Footer() {
  const account = useSession((s) => s.account);
  const me = useSession((s) => s.me);

  return (
    <footer className="se-footer">
      <div className="se-footer__inner">
        <div className="se-footer__brand">
          <Brand />
          <p>
            Free browser crime strategy with turn clocks, crew management,
            raids, rankings and fair seasonal resets.
          </p>
        </div>

        <nav className="se-footer__links" aria-label="Footer">
          <Link to="/game/rules">Rules</Link>
          <Link to="/game/news">News</Link>
          <Link to="/game/hall-of-fame">Hall of Fame</Link>
          <a href="https://forum.streetsempire.dev">Forum</a>
          {account ? (
            <>
              <Link to={me ? '/game' : '/join'}>{me ? 'Dashboard' : 'Join a season'}</Link>
              <Link to="/account">Account</Link>
            </>
          ) : (
            <>
              <Link to="/register">Register</Link>
              <Link to="/login">Log in</Link>
            </>
          )}
        </nav>
      </div>
    </footer>
  );
}

export function Shell({ children, narrow, tabbar }: {
  children: ReactNode;
  narrow?: boolean;
  /** Phone game navigation, fixed to the bottom of the screen. */
  tabbar?: ReactNode;
}) {
  const account = useSession((s) => s.account);
  const me = useSession((s) => s.me);
  const settings = useSession((s) => s.profileSettings);
  const logout = useSession((s) => s.logout);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className={`se-app se-site-accent--${settings.profileAccent} se-density--${settings.uiDensity}${settings.reducedMotion ? ' se-reduced-motion' : ''}${tabbar ? ' se-app--tabbar' : ''}`}>
      <InstallBanner />

      <header className="se-topbar">
        <Brand />

        <StatusBar />

        <div className="se-topbar__right">
          {account ? (
            <>
              <Link className="se-eyebrow se-topbar__who se-topbar__account" to="/account">
                {me?.alliance ? <span className="se-alliance-tag" title={me.alliance.name}>[{me.alliance.tag}]</span> : null}
                {account.username}
              </Link>
              {me ? <NotificationBell /> : null}
              <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={handleLogout}>
                Log out
              </button>
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
      <GameEventToasts />

      <main className={narrow ? 'se-authshell' : 'se-shell'}>{children}</main>

      <Footer />
      {tabbar}
    </div>
  );
}
