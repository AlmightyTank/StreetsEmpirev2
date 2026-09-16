import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { authApi } from '../api/auth.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { Shell } from '../layouts/Shell.js';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'error' | 'info'>('info');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFields({});
    setMessage(null);

    try {
      const response = await authApi.forgotPassword({ email });
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

          <Button className="se-btn se-btn--primary se-btn--block" disabledReason={busy ? 'Sending that email now.' : null}>
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
