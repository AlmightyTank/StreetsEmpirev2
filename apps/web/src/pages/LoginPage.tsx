import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { authApi } from '../api/auth.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { TwoFactorStep } from '../components/TwoFactorStep.js';
import { AuthWelcome } from '../components/AuthWelcome.js';
import { Turnstile, useTurnstileSiteKey } from '../components/Turnstile.js';
import { Shell } from '../layouts/Shell.js';
import { landingPath, useSession } from '../stores/session.js';

export function LoginPage() {
  const login = useSession((s) => s.login);
  const completeTwoFactor = useSession((s) => s.completeTwoFactor);
  const playGames = useSession((s) => s.playGames);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const authError = searchParams.get('authError');
  // rc.3: Discord and recovery links land here with ?twoFactor=1 when a code is still needed.
  const [needsCode, setNeedsCode] = useState(searchParams.get('twoFactor') === '1');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  // rc.4: "Keep me signed in" (on by default, as on most games). Off: ends with the browser.
  const [remember, setRemember] = useState(true);
  // rc.6: the bot check, when the server has it on. Tokens work once.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const captchaOn = Boolean(useTurnstileSiteKey());
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playGamesBusy, setPlayGamesBusy] = useState(false);
  const [playGamesError, setPlayGamesError] = useState<string | null>(null);
  const [nativePlayGames, setNativePlayGames] = useState(false);
  const [appleEnabled, setAppleEnabled] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [facebookEnabled, setFacebookEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    void authApi.providers().then((providers) => {
      if (active) setAppleEnabled(providers.apple);
      if (active) setGoogleEnabled(providers.google);
      if (active) setFacebookEnabled(providers.facebook);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const bridge = (window as Window & { StreetsEmpireAndroid?: { isNative?: () => boolean; signInWithPlayGames?: () => void } }).StreetsEmpireAndroid;
    if (!bridge?.isNative || !bridge.signInWithPlayGames) return;
    setNativePlayGames(true);
    const onAuth = (event: Event) => {
      const code = (event as CustomEvent<string>).detail;
      if (!code) return;
      setPlayGamesBusy(true);
      setPlayGamesError(null);
      void playGames(code)
        .then(() => {
          const session = useSession.getState();
          navigate(landingPath(session.profileSettings.defaultLanding, Boolean(session.me)));
        })
        .catch((error) => setPlayGamesError(error instanceof ApiError ? error.message : 'Could not sign in with Google Play Games.'))
        .finally(() => setPlayGamesBusy(false));
    };
    const onError = (event: Event) => {
      setPlayGamesError((event as CustomEvent<string>).detail || 'Could not sign in with Google Play Games.');
      setPlayGamesBusy(false);
    };
    window.addEventListener('streets:play-games-auth', onAuth);
    window.addEventListener('streets:play-games-error', onError);
    return () => {
      window.removeEventListener('streets:play-games-auth', onAuth);
      window.removeEventListener('streets:play-games-error', onError);
    };
  }, [navigate, playGames]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setFields({});

    try {
      const { twoFactorRequired } = await login({ identifier, password, remember, ...(captchaToken ? { captchaToken } : {}) });
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
      // A used (or failed) token cannot be sent again: fetch a fresh one for the next try.
      setCaptchaToken(null);
      setCaptchaKey((value) => value + 1);
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
        <AuthWelcome mode="login" />

        <div className="se-authgrid">
          <Panel title="Continue with email">
            <form onSubmit={onSubmit} noValidate>
              {authError ? <Alert>{authError}</Alert> : null}
              {message ? <Alert>{message}</Alert> : null}

              <Field
                label="Email or pimp name"
                name="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
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

              <Turnstile key={captchaKey} onToken={setCaptchaToken} />

              <Button
                className="se-btn se-btn--primary se-btn--block"
                disabledReason={busy ? 'Checking those details with the server.' : captchaOn && !captchaToken ? 'Finish the "are you human" check.' : null}
              >
                {busy ? 'Working...' : 'Sign in'}
              </Button>
            </form>
          </Panel>

          <Panel title="Continue with Discord">
            <p>
              Use Discord to get back in without typing your password. Discord uses your verified email to find or create your StreetsEmpire account.
            </p>
            <a className="se-btn se-btn--discord se-btn--block" href={remember ? '/api/auth/discord' : '/api/auth/discord?remember=0'}>
              Continue with Discord
            </a>
            <p className="se-hint">
              If you already have an account, use the same verified email on Discord or link Discord from account settings after logging in.
            </p>
          </Panel>

          {appleEnabled ? (
            <Panel title="Continue with Apple">
              <p>Sign in or create a StreetsEmpire account using your Apple ID.</p>
              <a className="se-btn se-btn--block se-auth-apple" href="/api/auth/apple">Continue with Apple</a>
            </Panel>
          ) : null}

          {googleEnabled ? (
            <Panel title="Continue with Google">
              <p>Sign in or create a StreetsEmpire account using your Google account.</p>
              <a className="se-btn se-btn--block se-auth-google" href="/api/auth/google">Continue with Google</a>
            </Panel>
          ) : null}
          {facebookEnabled ? (
            <Panel title="Continue with Facebook">
              <p>Sign in or create a StreetsEmpire account using Facebook.</p>
              <a className="se-btn se-btn--block se-auth-facebook" href="/api/auth/facebook">Continue with Facebook</a>
            </Panel>
          ) : null}

          {nativePlayGames ? (
          <Panel title="Google Play Games">
              <p>Use your Google Play Games account. A new Play Games identity creates its own StreetsEmpire account; it will not merge with an account that uses the same email.</p>
              {playGamesError ? <Alert>{playGamesError}</Alert> : null}
              <Button
                type="button"
                className="se-btn se-btn--primary se-btn--block"
                onClick={() => {
                  setPlayGamesError(null);
                  setPlayGamesBusy(true);
                  (window as Window & { StreetsEmpireAndroid?: { signInWithPlayGames?: () => void } }).StreetsEmpireAndroid?.signInWithPlayGames?.();
                }}
                disabledReason={playGamesBusy ? 'Waiting for Google Play Games.' : null}
              >
                {playGamesBusy ? 'Working...' : 'Continue with Google Play Games'}
              </Button>
              <p className="se-hint">Already have a StreetsEmpire account? Sign in first, then link Play Games from Account settings.</p>
            </Panel>
          ) : null}
        </div>

        <p className="se-hint se-center se-auth-legal">
          By continuing, you agree to the <a href="https://streetsempire.dev/terms">terms</a> and <a href="https://streetsempire.dev/privacy">privacy policy</a>.
        </p>
      </div>
    </Shell>
  );
}
