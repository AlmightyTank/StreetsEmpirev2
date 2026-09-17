import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatCents, formatCentsCompact } from '@streets/shared';
import { InstallBanner } from '../components/InstallBanner.js';
import { SiteBanner } from '../components/SiteBanner.js';
import { useSession } from '../stores/session.js';

/**
 * Top bar. Section 23: cash, turns and net worth stay visible on every
 * authenticated page, and collapse to short form on a phone.
 */
function StatusBar() {
  const me = useSession((s) => s.me);
  const moneyFormat = useSession((s) => s.profileSettings.moneyFormat);
  if (!me) return null;
  const money = moneyFormat === 'compact' ? formatCentsCompact : formatCents;

  return (
    <div className="se-statusbar">
      <span className="se-statusbar__item">
        <span className="se-statusbar__k">Cash</span>
        <span className="se-num se-statusbar__v se-statusbar__v--wide">
          {money(me.resources.cashCents)}
        </span>
        <span className="se-num se-statusbar__v se-statusbar__v--narrow">
          {formatCentsCompact(me.resources.cashCents)}
        </span>
      </span>
      <span className="se-statusbar__item">
        <span className="se-statusbar__k">Turns</span>
        <span className="se-num se-statusbar__v">
          {me.turns.turns}
          <span className="se-muted">/{me.turns.turnCap}</span>
        </span>
      </span>
      <span className="se-statusbar__item">
        <span className="se-statusbar__k">Net Worth</span>
        <span className="se-num se-statusbar__v se-statusbar__v--wide">
          {money(me.netWorthCents)}
        </span>
        <span className="se-num se-statusbar__v se-statusbar__v--narrow">
          {formatCentsCompact(me.netWorthCents)}
        </span>
      </span>
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
          <Link className="se-brand" to="/">
            <span className="se-brand__mark">
              Streets<span className="se-accent">Empire</span>
            </span>
            <span className="se-brand__ver">0.3.0-D</span>
          </Link>
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

export function Shell({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
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
    <div className={`se-app se-density--${settings.uiDensity}${settings.reducedMotion ? ' se-reduced-motion' : ''}`}>
      <InstallBanner />

      <header className="se-topbar">
        <Link className="se-brand" to="/">
          <span className="se-brand__mark">
            Streets<span className="se-accent">Empire</span>
          </span>
          <span className="se-brand__ver">0.3.0-D</span>
        </Link>

        <StatusBar />

        <div className="se-topbar__right">
          {account ? (
            <>
              <Link className="se-eyebrow se-topbar__who se-topbar__account" to="/account">
                {me?.alliance ? <span className="se-alliance-tag" title={me.alliance.name}>[{me.alliance.tag}]</span> : null}
                {account.username}
              </Link>
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

      <main className={narrow ? 'se-authshell' : 'se-shell'}>{children}</main>

      <Footer />
    </div>
  );
}
