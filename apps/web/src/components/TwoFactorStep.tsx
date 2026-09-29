import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Field } from './Field.js';
import { Panel } from './Panel.js';

/**
 * rc.3. The second half of a sign-in with two-step on: the 6-digit code from the
 * authenticator app, or a recovery code when the phone is gone.
 */
export function TwoFactorStep({
  onSubmit,
  onCancel,
}: {
  onSubmit: (code: string, trustDevice: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  // rc.4: most players sign in from their own phone or computer.
  const [trustDevice, setTrustDevice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setFieldError(undefined);
    try {
      await onSubmit(code.trim(), trustDevice);
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(error.message);
        setFieldError(error.fields?.code);
        // The sign-in timed out or ran out of tries: start again.
        if (error.status === 401 || error.code === 'TWO_FACTOR_ATTEMPTS') setCode('');
      } else {
        setMessage('Something went wrong. Try that again.');
      }
      setBusy(false);
    }
  }

  return (
    <Panel title="Two-step sign-in">
      <form onSubmit={submit} noValidate>
        <p>{recovery ? 'Enter one of the recovery codes you saved when you set this up. Each works once.' : 'Open your authenticator app and enter the 6-digit code for StreetsEmpire.'}</p>
        {message ? <Alert>{message}</Alert> : null}
        <Field
          key={recovery ? 'recovery' : 'totp'}
          label={recovery ? 'Recovery code' : 'Authenticator code'}
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="one-time-code"
          inputMode={recovery ? 'text' : 'numeric'}
          pattern={recovery ? undefined : '[0-9]*'}
          maxLength={recovery ? 12 : 6}
          autoFocus
          required
          error={fieldError}
        />
        <label className="se-checkrow se-checkrow--inline">
          <input type="checkbox" checked={trustDevice} onChange={(event) => setTrustDevice(event.target.checked)} />
          <span>
            <strong>Trust this browser for 30 days</strong>
            <small>Skip the code here next time; you still need your password. Leave this off on a shared computer.</small>
          </span>
        </label>
        <Button className="se-btn se-btn--primary se-btn--block" disabledReason={busy ? 'Checking the code.' : code.trim().length < 6 ? 'Enter the code first.' : null}>
          {busy ? 'Checking...' : 'Sign in'}
        </Button>
        <p className="se-auth-help">
          <button type="button" className="se-linkbtn" onClick={() => { setRecovery((value) => !value); setCode(''); setMessage(null); }}>
            {recovery ? 'Use the authenticator app instead' : 'Lost your phone? Use a recovery code'}
          </button>
          {' · '}
          <button type="button" className="se-linkbtn" onClick={onCancel}>Start over</button>
        </p>
        <p className="se-hint">No phone and no recovery codes? Ask staff on Discord; they can turn two-step sign-in off once they know it is you.</p>
      </form>
    </Panel>
  );
}
