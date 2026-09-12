import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { Shell } from '../layouts/Shell.js';
import { useSession } from '../stores/session.js';

export function LoginPage() {
  const login = useSession((s) => s.login);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const authError = searchParams.get('authError');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setFields({});

    try {
      await login({ identifier, password });
      // Where you land depends on whether you are already in the round.
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
      <p className="se-eyebrow">Back on the block</p>
      <h1 className="se-title se-mb">Log in</h1>

      <Panel title="Log in">
        <form onSubmit={onSubmit} noValidate>
          {authError ? <Alert>{authError}</Alert> : null}
          {message ? <Alert>{message}</Alert> : null}

          <Field
            label="Email or pimp name"
            name="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username email"
            autoFocus
            required
            error={fields.identifier}
          />

          <Field
            label="Password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            error={fields.password}
          />

          <button className="se-btn se-btn--primary se-btn--block" disabled={busy}>
            {busy ? 'Working...' : 'Log in'}
          </button>
        </form>

        <div className="se-auth-divider">or</div>
        <a className="se-btn se-btn--discord se-btn--block" href="/api/auth/discord">
          Log in with Discord
        </a>
        <p className="se-hint">
          Discord uses your verified Discord email to create or link your account.
        </p>
      </Panel>

      <p className="se-hint se-center">
        No name yet? <Link to="/register">Register</Link>
      </p>
    </Shell>
  );
}
