import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { useSession } from '../stores/session.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Field } from './Field.js';
import { Panel } from './Panel.js';

/** rc.2. The player closes their own account, confirmed with the password and the word CLOSE. */
export function CloseAccountPanel() {
  const isAdmin = useSession((s) => s.account?.isAdmin ?? false);
  const logout = useSession((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function close(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await authApi.closeAccount({ ...(password ? { currentPassword: password } : {}), confirm: 'CLOSE' });
      await logout();
      navigate('/login', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields ?? {});
      } else {
        setError('Could not close the account. Try again.');
      }
      setBusy(false);
    }
  }

  return (
    <Panel title="Close account">
      <p className="se-muted">
        Closing signs you out everywhere and stops the account signing in. Your finished seasons stay in the
        public history under your name. Staff can reopen it if you ask on Discord.
      </p>
      {isAdmin ? (
        <p className="se-hint">Admin accounts cannot be closed here. Have the admin role removed first.</p>
      ) : !open ? (
        <button type="button" className="se-btn se-btn--ghost" onClick={() => setOpen(true)}>Close my account...</button>
      ) : (
        <form onSubmit={close} noValidate>
          <Field
            label="Password"
            name="closePassword"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            error={fields.currentPassword}
            hint="Signed in with Discord this time? You can leave this empty."
          />
          <Field
            label="Type CLOSE to confirm"
            name="closeConfirm"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="off"
            error={fields.confirm}
          />
          {error ? <Alert>{error}</Alert> : null}
          <div className="se-cta">
            <button type="button" className="se-btn se-btn--ghost" onClick={() => { setOpen(false); setConfirm(''); setPassword(''); }}>Keep my account</button>
            <Button className="se-btn se-btn--danger" disabledReason={busy ? 'Closing...' : confirm !== 'CLOSE' ? 'Type CLOSE first.' : null}>
              {busy ? 'Closing...' : 'Close my account'}
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}
