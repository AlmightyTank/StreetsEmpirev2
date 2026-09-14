import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { GameLayout } from './GameLayout.js';
import { Shell } from './Shell.js';
import { useSession } from '../stores/session.js';

/**
 * News and rules are public. Players in the round keep the game menu; everyone
 * else gets the plain shell and a way in, because every other page in that
 * menu needs a player.
 */
export function InfoLayout({ children }: { children: ReactNode }) {
  const account = useSession((s) => s.account);
  const round = useSession((s) => s.round);
  const me = useSession((s) => s.me);

  if (me) return <GameLayout>{children}</GameLayout>;

  const cta = account
    ? { to: '/join', label: `Enter ${round?.name ?? 'the game'}` }
    : { to: '/register', label: 'Claim your name' };

  return (
    <Shell>
      <div className="se-cta">
        <Link className="se-btn se-btn--primary" to={cta.to}>
          {cta.label}
        </Link>
        <Link className="se-btn" to="/game/news">
          News
        </Link>
        <Link className="se-btn" to="/game/rules">
          Rules
        </Link>
      </div>
      <hr className="se-hr" />
      {children}
    </Shell>
  );
}
