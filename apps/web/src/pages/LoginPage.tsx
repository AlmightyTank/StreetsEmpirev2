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
    <Shell>
      <div className="se-authpage">
        <p className="se-eyebrow">Back on the block</p>
        <h1 className="se-title se-mb">Log in</h1>

        <div className="se-authgrid">
          <Panel title="Password login">
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

              <p className="se-auth-help">
                <Link to="/forgot-password">Forgot your password?</Link>
              </p>

              <button className="se-btn se-btn--primary se-btn--block" disabled={busy}>
                {busy ? 'Working...' : 'Log in'}
              </button>
            </form>
          </Panel>

          <Panel title="Discord login">
            <p>
              Use Discord to get back in without typing your password. Discord uses your verified email to find or create your Street Empire account.
            </p>
            <a className="se-btn se-btn--discord se-btn--block" href="/api/auth/discord">
              Log in with Discord
            </a>
            <p className="se-hint">
              If you already have an account, use the same verified email on Discord or link Discord from account settings after logging in.
            </p>
          </Panel>
        </div>

        <p className="se-hint se-center">
          No name yet? <Link to="/register">Register</Link>
        </p>
      </div>
    </Shell>
  );
}
