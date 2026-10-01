import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MINIMUM_AGE, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { Turnstile, useTurnstileSiteKey } from '../components/Turnstile.js';
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
  // rc.5: 13+ only, and a bot check when the server has one switched on.
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const captchaOn = Boolean(useTurnstileSiteKey());

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setFields({});

    try {
      const approvalMessage = await register({ username, email, password, ageConfirmed, ...(captchaToken ? { captchaToken } : {}) });
      if (approvalMessage) {
        setMessage(approvalMessage);
        setPassword('');
        return;
      }
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
      // A bot-check token works once: fetch a fresh one for another try.
      setCaptchaToken(null);
      setCaptchaKey((value) => value + 1);
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

              <label className="se-checkrow se-checkrow--inline">
                <input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} required />
                <span>
                  <strong>I am {MINIMUM_AGE} or older</strong>
                  <small>StreetsEmpire is a crime strategy game for players aged {MINIMUM_AGE} and over.</small>
                </span>
              </label>

              <Turnstile key={captchaKey} onToken={setCaptchaToken} />

              <p className="se-hint">We will email you a link. Confirm your address and you can start playing.</p>
              <p className="se-hint">By registering you agree to the <a href="https://streetsempire.dev/terms">terms</a> and the <a href="https://streetsempire.dev/privacy">privacy policy</a>.</p>
              <Button
                className="se-btn se-btn--primary se-btn--block"
                disabledReason={busy ? 'Setting up your account now.'
                  : !ageConfirmed ? `Confirm you are ${MINIMUM_AGE} or older.`
                    : captchaOn && !captchaToken ? 'Finish the "are you human" check.' : null}
              >
                {busy ? 'Working...' : 'Create account'}
              </Button>
            </form>
          </Panel>

          <Panel title="Register with Discord">
            <p>
              Discord creates your account from the email Discord has already verified, so there is no email link to wait for: you go straight to join the round.
            </p>
            <a className="se-btn se-btn--discord se-btn--block" href="/api/auth/discord">
              Continue with Discord
            </a>
            <p className="se-hint">
              You can still add password recovery and change email from account settings after your account exists.
              You must be {MINIMUM_AGE} or older to play.
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
