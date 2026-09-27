import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { authApi } from '../api/auth.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { Turnstile, useTurnstileSiteKey } from '../components/Turnstile.js';
import { Shell } from '../layouts/Shell.js';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'error' | 'info'>('info');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const captchaOn = Boolean(useTurnstileSiteKey());

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFields({});
    setMessage(null);

    try {
      const response = await authApi.forgotPassword({ email, ...(captchaToken ? { captchaToken } : {}) });
      setTone('info');
      setMessage(response.message);
    } catch (error) {
      setTone('error');
      if (error instanceof ApiError) {
        setMessage(error.message);
        setFields(error.fields ?? {});
      } else {
        setMessage('Something went wrong. Try that again.');
      }
    } finally {
      setBusy(false);
      setCaptchaToken(null);
      setCaptchaKey((value) => value + 1);
    }
  }

  return (
    <Shell narrow>
      <p className="se-eyebrow">Account recovery</p>
      <h1 className="se-title se-mb">Recover your login</h1>

      <Panel title="Email recovery">
        <form onSubmit={onSubmit} noValidate>
          {message ? <Alert tone={tone}>{message}</Alert> : null}

          <Field
            label="Account email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            required
            error={fields.email}
            hint="We will send a one-hour password reset link if the email is on an account."
          />

          <Turnstile key={captchaKey} onToken={setCaptchaToken} />

          <Button className="se-btn se-btn--primary se-btn--block" disabledReason={busy ? 'Sending that email now.' : captchaOn && !captchaToken ? 'Finish the "are you human" check.' : null}>
            {busy ? 'Sending...' : 'Send recovery email'}
          </Button>
        </form>
      </Panel>

      <p className="se-hint se-center">
        Remembered it? <Link to="/login">Log in</Link>
      </p>
    </Shell>
  );
}
