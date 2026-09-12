import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { Shell } from '../layouts/Shell.js';
import { useSession } from '../stores/session.js';

export function RegisterPage() {
  const register = useSession((s) => s.register);
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
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
      await register({ username, email, password });
      navigate('/join');
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
        <p className="se-eyebrow">New pimp</p>
        <h1 className="se-title se-mb">Claim your name</h1>

        <div className="se-authgrid">
          <Panel title="Register with email">
            <form onSubmit={onSubmit} noValidate>
              {message ? <Alert>{message}</Alert> : null}

              <Field
                label="Pimp name"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                error={fields.username}
                hint={`${USERNAME_MIN}-${USERNAME_MAX} characters. Letters, numbers, _ and -.`}
              />

              <Field
                label="Email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                error={fields.email}
                hint="Used for login and account recovery. It is never shown to other players."
              />

              <Field
                label="Password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                error={fields.password}
                hint={`At least ${PASSWORD_MIN} characters.`}
              />

              <button className="se-btn se-btn--primary se-btn--block" disabled={busy}>
                {busy ? 'Working...' : 'Create account'}
              </button>
            </form>
          </Panel>

          <Panel title="Register with Discord">
            <p>
              Discord creates your account from your verified email, then sends you straight to join the round.
            </p>
            <a className="se-btn se-btn--discord se-btn--block" href="/api/auth/discord">
              Continue with Discord
            </a>
            <p className="se-hint">
              You can still add password recovery and change email from account settings after your account exists.
            </p>
          </Panel>
        </div>

        <p className="se-hint se-center">
          Already running the streets? <Link to="/login">Log in</Link>
        </p>
      </div>
    </Shell>
  );
}
