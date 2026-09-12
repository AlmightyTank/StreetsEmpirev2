import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { authApi } from '../api/auth.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row } from '../components/Panel.js';
import { Shell } from '../layouts/Shell.js';
import { useSession } from '../stores/session.js';

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}

export function AccountSettingsPage() {
  const account = useSession((s) => s.account)!;
  const me = useSession((s) => s.me);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'error' | 'info'>('info');
  const [busy, setBusy] = useState(false);

  async function sendRecovery() {
    setBusy(true);
    setMessage(null);

    try {
      const response = await authApi.forgotPassword({ email: account.email });
      setTone('info');
      setMessage(response.message);
    } catch (error) {
      setTone('error');
      setMessage(error instanceof ApiError ? error.message : 'Something went wrong. Try that again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="se-pagehead">
        <div>
          <p className="se-eyebrow">Private account</p>
          <h1 className="se-title">Login & settings</h1>
        </div>
        {me ? <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/profile">Public profile</Link> : null}
      </div>

      <div className="se-grid se-grid--2 se-account-grid">
        <Panel title="Login identity" flush>
          <div className="se-rows">
            <Row label="Pimp name" value={account.username} strong />
            <Row label="Email" value={account.email} />
            <Row label="Email status" value={account.emailVerifiedAt ? 'Verified' : 'Unverified'} />
            <Row label="Discord" value={account.discordLinked ? account.discordUsername ?? 'Linked' : 'Not linked'} />
          </div>
        </Panel>

        <Panel title="Recovery">
          {message ? <Alert tone={tone}>{message}</Alert> : null}
          <p>
            Password recovery sends a one-hour reset link to your private account email.
            The address is used for login and recovery only.
          </p>
          <button type="button" className="se-btn se-btn--primary se-btn--block" onClick={sendRecovery} disabled={busy}>
            {busy ? 'Sending...' : 'Send recovery email'}
          </button>
          <p className="se-hint">
            Check your inbox after sending. Recovery links expire after one hour.
          </p>
        </Panel>

        <Panel title="Account record" flush>
          <div className="se-rows">
            <Row label="Created" value={formatDate(account.createdAt)} />
            <Row label="Last login" value={formatDate(account.lastLoginAt)} />
          </div>
        </Panel>

        <Panel title="Profile shortcuts">
          <p>Your game profile is where other players see your public record, awards and achievements.</p>
          <div className="se-actions-row">
            {me ? <Link className="se-btn se-btn--primary" to="/game/profile">Open public profile</Link> : <Link className="se-btn se-btn--primary" to="/join">Join the round</Link>}
            <Link className="se-btn se-btn--ghost" to="/game">Back to game</Link>
          </div>
        </Panel>
      </div>
    </Shell>
  );
}
