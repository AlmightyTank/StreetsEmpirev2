import { Panel } from './Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

/**
 * rc.2/rc.3. Shown on admin pages to an admin whose sign-in had no second factor while
 * admin tools require one: a Discord sign-in or an authenticator code opens them.
 */
export function AdminDiscordGate() {
  const logout = useSession((s) => s.logout);
  const discordLinked = useSession((s) => s.account?.discordLinked ?? false);
  const twoFactorEnabled = useSession((s) => s.account?.twoFactorEnabled ?? false);

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Admin sign-in</h1>
          <p className="se-eyebrow">Admin tools need a second factor</p>
        </div>
      </div>
      <Panel title="Sign in again with a second factor">
        <p>
          This sign-in used only a password. Admin tools open only for a sign-in with Discord or with an
          authenticator code, so a stolen password cannot reach them.
        </p>
        {twoFactorEnabled ? (
          <p className="se-muted">Your authenticator is set up: log out and sign in again, and enter its code when asked.</p>
        ) : discordLinked ? (
          <p className="se-muted">Your Discord is linked: log out, then choose <strong>Sign in with Discord</strong> (turn on two-factor in Discord too).</p>
        ) : (
          <p className="se-muted">
            You have neither yet. Log out and choose <strong>Sign in with Discord</strong> with a Discord account on this
            account's email; it links itself. Then you can also set up an authenticator app in Account settings.
            If that is not possible, ask the server operator (see the admin runbook).
          </p>
        )}
        <div className="se-cta">
          <button type="button" className="se-btn se-btn--primary" onClick={() => void logout()}>Log out</button>
        </div>
      </Panel>
    </GameLayout>
  );
}
