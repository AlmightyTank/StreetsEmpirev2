import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MINIMUM_AGE, latestEligibleBirthDate, PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { authApi } from '../api/auth.js';
import { Alert } from '../components/Alert.js';
import { AuthWelcome } from '../components/AuthWelcome.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { Turnstile, useTurnstileSiteKey } from '../components/Turnstile.js';
import { Shell } from '../layouts/Shell.js';
import { useSession } from '../stores/session.js';

export function RegisterPage() {
  const register = useSession((s) => s.register);
  const playGames = useSession((s) => s.playGames);
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 16+ age declaration and a bot check when the server has one switched on.
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const captchaOn = Boolean(useTurnstileSiteKey());
  const [nativePlayGames, setNativePlayGames] = useState(false);
  const [playGamesBusy, setPlayGamesBusy] = useState(false);
  const [playGamesError, setPlayGamesError] = useState<string | null>(null);
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
        .then(() => navigate('/join', { replace: true }))
        .catch((caught) => setPlayGamesError(caught instanceof ApiError ? caught.message : 'Could not create your account with Google Play Games.'))
        .finally(() => setPlayGamesBusy(false));
    };
    const onError = (event: Event) => {
      setPlayGamesError((event as CustomEvent<string>).detail || 'Could not create your account with Google Play Games.');
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
      const approvalMessage = await register({ username, email, password, birthDate, ageConfirmed, ...(captchaToken ? { captchaToken } : {}) });
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
        <AuthWelcome mode="register" />

        <div className="se-authgrid">
          <Panel title="Create your account">
            <form onSubmit={onSubmit} noValidate>
              {message ? <Alert>{message}</Alert> : null}

              <Field
                label="Pimp name"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
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

              <Field
                label="Date of birth"
                name="birthDate"
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
                autoComplete="bday"
                max={latestEligibleBirthDate()}
                required
                error={fields.birthDate}
                hint="Private — used only to confirm you meet the minimum age requirement."
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
                  : !birthDate ? 'Enter your date of birth.'
                    : !ageConfirmed ? `Confirm you are ${MINIMUM_AGE} or older.`
                    : captchaOn && !captchaToken ? 'Finish the "are you human" check.' : null}
              >
                {busy ? 'Working...' : 'Create account'}
              </Button>
              <p className="se-hint">After signup, link Discord or Google Play Games in Account settings to add another way to sign in.</p>
            </form>
          </Panel>

          <div className="se-auth-providers">
            <Panel title="Create an account with Discord">
              <p>
                Discord creates your account from the email Discord has already verified, so there is no email link to wait for: you go straight to join the round.
              </p>
              <a className="se-btn se-btn--discord se-btn--block" href="/api/auth/discord">
                Continue with Discord
              </a>
              <p className="se-hint">
                You can link Discord to an existing account in Account settings. You must be {MINIMUM_AGE} or older to play.
              </p>
            </Panel>

            {googleEnabled ? (
              <Panel title="Create an account with Google">
                <p>Use your Google account to create or access your StreetsEmpire account.</p>
                <a className="se-btn se-btn--block se-auth-google" href="/api/auth/google">Continue with Google</a>
              </Panel>
            ) : null}
            {facebookEnabled ? (
              <Panel title="Create an account with Facebook">
                <p>Use Facebook to create or access your StreetsEmpire account.</p>
                <a className="se-btn se-btn--block se-auth-facebook" href="/api/auth/facebook">Continue with Facebook</a>
              </Panel>
            ) : null}
          </div>

          {nativePlayGames ? (
            <Panel title="Create an account with Google Play Games">
              {playGamesError ? <Alert>{playGamesError}</Alert> : null}
              <p>Use the Google Play Games account on this Android device. You can also link it to an existing StreetsEmpire account later in Account settings.</p>
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
            </Panel>
          ) : null}
          {appleEnabled ? (
            <Panel title="Create an account with Apple">
              <p>Use your Apple ID to create an account or sign in to an existing StreetsEmpire account.</p>
              <a className="se-btn se-btn--block se-auth-apple" href="/api/auth/apple">Continue with Apple</a>
            </Panel>
          ) : null}
        </div>

        <p className="se-hint se-center">
          Already running the streets? <Link to="/login">Log in</Link>
        </p>
      </div>
    </Shell>
  );
}
