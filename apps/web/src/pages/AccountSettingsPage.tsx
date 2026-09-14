import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { authApi } from '../api/auth.js';
import { Alert } from '../components/Alert.js';
import { Field } from '../components/Field.js';
import { ForumLinkPanel } from '../components/ForumLinkPanel.js';
import { Panel, Row } from '../components/Panel.js';
import { Shell } from '../layouts/Shell.js';
import { useSession } from '../stores/session.js';

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}

export function AccountSettingsPage() {
  const account = useSession((s) => s.account)!;
  const me = useSession((s) => s.me);
  const [searchParams] = useSearchParams();
  const accountMessage = searchParams.get('accountMessage');

  const [newEmail, setNewEmail] = useState('');
  const [message, setMessage] = useState<string | null>(accountMessage);
  const [tone, setTone] = useState<'error' | 'info'>('info');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'recovery' | 'verify' | 'email' | null>(null);

  async function sendRecovery() {
    setBusy('recovery');
    setMessage(null);
    setFields({});

    try {
      const response = await authApi.forgotPassword({ email: account.email });
      setTone('info');
      setMessage(response.message);
    } catch (error) {
      setTone('error');
      setMessage(error instanceof ApiError ? error.message : 'Something went wrong. Try that again.');
    } finally {
      setBusy(null);
    }
  }

  async function verifyCurrentEmail() {
    setBusy('verify');
    setMessage(null);
    setFields({});

    try {
      const response = await authApi.requestEmailVerification();
      setTone('info');
      setMessage(response.message);
    } catch (error) {
      setTone('error');
      setMessage(error instanceof ApiError ? error.message : 'Something went wrong. Try that again.');
    } finally {
      setBusy(null);
    }
  }

  async function requestEmailChange(event: FormEvent) {
    event.preventDefault();
    setBusy('email');
    setMessage(null);
    setFields({});

    try {
      const response = await authApi.requestEmailChange({ email: newEmail });
      setTone('info');
      setMessage(response.message);
      setNewEmail('');
    } catch (error) {
      setTone('error');
      if (error instanceof ApiError) {
        setMessage(error.message);
        setFields(error.fields ?? {});
      } else {
        setMessage('Something went wrong. Try that again.');
      }
    } finally {
      setBusy(null);
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

      {message ? <Alert tone={tone}>{message}</Alert> : null}

      <div className="se-account-columns">
        <div className="se-account-column">
          <Panel title="Login identity" flush>
            <div className="se-rows">
              <Row label="Pimp name" value={account.username} strong />
              <Row label="Email" value={account.email} />
              <Row label="Email status" value={account.emailVerifiedAt ? 'Verified' : 'Unverified'} />
              <Row label="Discord" value={account.discordLinked ? account.discordUsername ?? 'Linked' : 'Not linked'} />
            </div>
          </Panel>

          <Panel title="Recovery">
            <p>
              Password recovery sends a one-hour reset link to your private account email.
              The address is used for login and recovery only.
            </p>
            <button type="button" className="se-btn se-btn--primary se-btn--block" onClick={sendRecovery} disabled={busy !== null}>
              {busy === 'recovery' ? 'Sending...' : 'Send recovery email'}
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
        </div>

        <div className="se-account-column">
          <Panel title="Discord login">
            <p>
              Link Discord so you can log in without typing your password. Discord stays private and is only used for authentication.
            </p>
            {account.discordLinked ? (
              <p className="se-good se-account-status">Discord is linked.</p>
            ) : (
              <a className="se-btn se-btn--discord se-btn--block" href="/api/auth/discord?link=1">
                Link Discord
              </a>
            )}
          </Panel>

          <ForumLinkPanel />

          <Panel title="Current email verification">
            <p>
              Verify your current email before changing it. This proves you control the recovery address already on the account.
            </p>
            <button
              type="button"
              className="se-btn se-btn--primary se-btn--block"
              onClick={verifyCurrentEmail}
              disabled={busy !== null || Boolean(account.emailVerifiedAt)}
            >
              {account.emailVerifiedAt ? 'Email verified' : busy === 'verify' ? 'Sending...' : 'Verify current email'}
            </button>
          </Panel>

          <Panel title="Change email">
            <form onSubmit={requestEmailChange} noValidate>
              <Field
                label="New email"
                name="email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                autoComplete="email"
                required
                error={fields.email}
                hint="A confirmation link will be sent to the new email address."
              />
              <button className="se-btn se-btn--primary se-btn--block" disabled={busy !== null}>
                {busy === 'email' ? 'Sending...' : 'Send change confirmation'}
              </button>
            </form>
          </Panel>

          <Panel title="Profile shortcuts">
            <p>Your game profile is where other players see your public record, awards and achievements.</p>
            <div className="se-actions-row">
              {me ? <Link className="se-btn se-btn--primary" to="/game/profile">Open public profile</Link> : <Link className="se-btn se-btn--primary" to="/join">Join the round</Link>}
              <Link className="se-btn se-btn--ghost" to="/game">Back to game</Link>
            </div>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}
