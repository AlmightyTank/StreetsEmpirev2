import { Panel } from './Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

/**
 * rc.2. Shown on admin pages to an admin who signed in with a password while admin tools
 * require Discord. Discord's own sign-in (and its two-factor check) guards the panel.
 */
export function AdminDiscordGate() {
  const logout = useSession((s) => s.logout);
  const discordLinked = useSession((s) => s.account?.discordLinked ?? false);

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Admin sign-in</h1>
          <p className="se-eyebrow">Admin tools need a Discord sign-in</p>
        </div>
      </div>
      <Panel title="Sign in with Discord to use admin tools">
        <p>
          You signed in with your password. Admin tools only open for a session that signed in with Discord,
          so a stolen password cannot reach them. Turn on two-factor authentication in Discord to get the full benefit.
        </p>
        {discordLinked ? (
          <p className="se-muted">Your Discord is linked: log out, then choose <strong>Sign in with Discord</strong>.</p>
        ) : (
          <p className="se-muted">
            No Discord is linked yet. Log out and choose <strong>Sign in with Discord</strong> with a Discord account on this
            account's email; it links itself. If your Discord uses another email, ask the server operator (see the admin runbook).
          </p>
        )}
        <div className="se-cta">
          <button type="button" className="se-btn se-btn--primary" onClick={() => void logout()}>Log out</button>
        </div>
      </Panel>
    </GameLayout>
  );
}
