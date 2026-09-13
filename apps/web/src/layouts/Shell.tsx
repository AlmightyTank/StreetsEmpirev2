import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatCents, formatCentsCompact } from '@streets/shared';
import { useSession } from '../stores/session.js';

/**
 * Top bar. Section 23: cash, turns and net worth stay visible on every
 * authenticated page, and collapse to short form on a phone.
 */
function StatusBar() {
  const me = useSession((s) => s.me);
  if (!me) return null;

  return (
    <div className="se-statusbar">
      <span className="se-statusbar__item">
        <span className="se-statusbar__k">Cash</span>
        <span className="se-num se-statusbar__v se-statusbar__v--wide">
          {formatCents(me.resources.cashCents)}
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
          {formatCents(me.netWorthCents)}
        </span>
        <span className="se-num se-statusbar__v se-statusbar__v--narrow">
          {formatCentsCompact(me.netWorthCents)}
        </span>
      </span>
    </div>
  );
}

export function Shell({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  const account = useSession((s) => s.account);
  const logout = useSession((s) => s.logout);
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <>
      <header className="se-topbar">
        <Link className="se-brand" to="/">
          <span className="se-brand__mark">
            Street<span className="se-accent">Empire</span>
          </span>
          <span className="se-brand__ver">0.2.0-H</span>
        </Link>

        <StatusBar />

        <div className="se-topbar__right">
          {account ? (
            <>
              <Link className="se-eyebrow se-topbar__who se-topbar__account" to="/account">
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

      <main className={narrow ? 'se-authshell' : 'se-shell'}>{children}</main>
    </>
  );
}
