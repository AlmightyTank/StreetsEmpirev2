import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { TwoFactorStep } from '../components/TwoFactorStep.js';
import { Shell } from '../layouts/Shell.js';
import { landingPath, useSession } from '../stores/session.js';

export function LoginPage() {
  const login = useSession((s) => s.login);
  const completeTwoFactor = useSession((s) => s.completeTwoFactor);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const authError = searchParams.get('authError');
  // rc.3: Discord and recovery links land here with ?twoFactor=1 when a code is still needed.
  const [needsCode, setNeedsCode] = useState(searchParams.get('twoFactor') === '1');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  // rc.4: "Keep me signed in" (on by default, as on most games). Off: ends with the browser.
  const [remember, setRemember] = useState(true);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setFields({});

    try {
      const { twoFactorRequired } = await login({ identifier, password, remember });
      if (twoFactorRequired) {
        setNeedsCode(true);
        return;
      }
      const session = useSession.getState();
      navigate(landingPath(session.profileSettings.defaultLanding, Boolean(session.me)));
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

  async function submitCode(code: string, trustDevice: boolean) {
    const { recoveryCodesLeft } = await completeTwoFactor(code, trustDevice);
    const session = useSession.getState();
    // Running low on recovery codes: send them where new ones are made.
    if (recoveryCodesLeft !== null && recoveryCodesLeft <= 3) {
      navigate('/account?twoFactor=codes');
      return;
    }
    navigate(landingPath(session.profileSettings.defaultLanding, Boolean(session.me)));
  }

  if (needsCode) {
    return (
      <Shell>
        <div className="se-authpage">
          <p className="se-eyebrow">One more step</p>
          <h1 className="se-title se-mb">Log in</h1>
          <TwoFactorStep
            onSubmit={submitCode}
            onCancel={() => {
              setNeedsCode(false);
              setPassword('');
              setSearchParams({}, { replace: true });
            }}
          />
        </div>
      </Shell>
    );
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
                autoComplete="username"
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

              <label className="se-checkrow se-checkrow--inline">
                <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                <span>
                  <strong>Keep me signed in</strong>
                  <small>Stay signed in on this device for up to 30 days between visits. Untick on a shared computer.</small>
                </span>
              </label>

              <p className="se-auth-help">
                <Link to="/forgot-password">Forgot your password?</Link>
              </p>

              <Button className="se-btn se-btn--primary se-btn--block" disabledReason={busy ? 'Checking those details with the server.' : null}>
                {busy ? 'Working...' : 'Log in'}
              </Button>
            </form>
          </Panel>

          <Panel title="Discord login">
            <p>
              Use Discord to get back in without typing your password. Discord uses your verified email to find or create your StreetsEmpire account.
            </p>
            <a className="se-btn se-btn--discord se-btn--block" href={remember ? '/api/auth/discord' : '/api/auth/discord?remember=0'}>
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
