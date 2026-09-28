import { useState, type FormEvent } from 'react';
import { authApi } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Field } from './Field.js';
import { Panel } from './Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

/**
 * rc.2-rc.4. Shown on admin pages while the session has no recent second factor. An admin
 * with an authenticator re-confirms right here; otherwise they sign in again with Discord.
 */
export function AdminDiscordGate() {
  const logout = useSession((s) => s.logout);
  const discordLinked = useSession((s) => s.account?.discordLinked ?? false);
  const twoFactorEnabled = useSession((s) => s.account?.twoFactorEnabled ?? false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { account } = await authApi.stepUpTwoFactor(code.trim());
      useSession.setState({ account });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        // Too many wrong codes: the session is gone.
        await logout();
        return;
      }
      setError(caught instanceof ApiError ? caught.message : 'Could not check that code. Try again.');
      setBusy(false);
    }
  }

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Admin sign-in</h1>
          <p className="se-eyebrow">Confirm it is you</p>
        </div>
      </div>
      {twoFactorEnabled ? (
        <Panel title="Enter your authenticator code">
          <form onSubmit={confirm} noValidate>
            <p>Admin tools ask for a code at least every 12 hours, even on a trusted browser. You stay signed in.</p>
            {error ? <Alert>{error}</Alert> : null}
            <Field
              label="Authenticator code"
              name="stepUpCode"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={12}
              autoFocus
              required
              hint="Or one of your recovery codes."
            />
            <Button className="se-btn se-btn--primary" disabledReason={busy ? 'Checking the code.' : code.trim().length < 6 ? 'Enter the code first.' : null}>
              {busy ? 'Checking...' : 'Confirm'}
            </Button>
          </form>
        </Panel>
      ) : (
        <Panel title="Sign in again with a second factor">
          <p>
            Admin tools open only for a sign-in with Discord or with an authenticator code from the last 12 hours,
            so a stolen password or an old session cannot reach them.
          </p>
          {discordLinked ? (
            <p className="se-muted">Log out, then choose <strong>Sign in with Discord</strong> (turn on two-factor in Discord too). Or set up an authenticator app in Account settings to confirm here without signing out.</p>
          ) : (
            <p className="se-muted">
              You have neither yet. Log out and choose <strong>Sign in with Discord</strong> with a Discord account on this
              account's email; it links itself. Then set up an authenticator app in Account settings.
              If that is not possible, ask the server operator (see the admin runbook).
            </p>
          )}
          <div className="se-cta">
            <button type="button" className="se-btn se-btn--primary" onClick={() => void logout()}>Log out</button>
          </div>
        </Panel>
      )}
    </GameLayout>
  );
}
