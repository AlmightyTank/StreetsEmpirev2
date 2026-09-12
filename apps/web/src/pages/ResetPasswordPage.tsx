import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PASSWORD_MIN } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { Shell } from '../layouts/Shell.js';
import { useSession } from '../stores/session.js';

export function ResetPasswordPage() {
  const resetPassword = useSession((s) => s.resetPassword);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFields({});
    setMessage(null);

    if (password !== confirm) {
      setFields({ confirm: 'Passwords do not match.' });
      setBusy(false);
      return;
    }

    try {
      await resetPassword({ token, password });
      navigate(useSession.getState().me ? '/game' : '/join');
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(error.message);
        setFields(error.fields ?? {});
      } else {
        setMessage('Something went wrong. Try that again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell narrow>
      <p className="se-eyebrow">Account recovery</p>
      <h1 className="se-title se-mb">Set a new password</h1>

      <Panel title="New password">
        {!token ? <Alert>Open the full recovery link from your email.</Alert> : null}
        <form onSubmit={onSubmit} noValidate>
          {message ? <Alert>{message}</Alert> : null}

          <Field
            label="New password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
            required
            error={fields.password}
            hint={`At least ${PASSWORD_MIN} characters.`}
          />

          <Field
            label="Confirm password"
            name="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            error={fields.confirm}
          />

          <button className="se-btn se-btn--primary se-btn--block" disabled={busy || !token}>
            {busy ? 'Saving...' : 'Reset password'}
          </button>
        </form>
      </Panel>

      <p className="se-hint se-center">
        Need a new link? <Link to="/forgot-password">Send recovery email</Link>
      </p>
    </Shell>
  );
}
