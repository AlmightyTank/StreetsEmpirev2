import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { useSession } from '../stores/session.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Field } from './Field.js';
import { Panel } from './Panel.js';

/** rc.5. Download everything kept about the account, or delete it for good. */
export function YourDataPanel() {
  const isAdmin = useSession((s) => s.account?.isAdmin ?? false);
  const logout = useSession((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function remove(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await authApi.deleteAccount({ ...(password ? { currentPassword: password } : {}), confirm: 'DELETE' });
      await logout();
      navigate('/', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields ?? {});
      } else {
        setError('Could not delete the account. Try again.');
      }
      setBusy(false);
    }
  }

  return (
    <Panel title="Your data">
      <p>Download a copy of everything StreetsEmpire keeps about your account: settings, sign-ins, seasons, messages and reports.</p>
      <a className="se-btn se-btn--ghost" href="/api/auth/account/export" download>Download my data</a>

      <div className="se-panel-section">
        <h3 className="se-label">Delete account</h3>
        <p className="se-muted">
          Deleting is permanent. Your email, sign-in details, profile and settings are erased. If you played a season,
          your results stay in the history as "Deleted Player"; if you never played, the account is removed entirely.
          To stop playing but keep the account, use Close account below instead.
        </p>
        {isAdmin ? (
          <p className="se-hint">Admin accounts cannot be deleted here. Have the admin role removed first.</p>
        ) : !open ? (
          <button type="button" className="se-btn se-btn--ghost" onClick={() => setOpen(true)}>Delete my account...</button>
        ) : (
          <form onSubmit={remove} noValidate>
            <Field
              label="Password"
              name="deletePassword"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              error={fields.currentPassword}
              hint="Signed in with Discord this time? You can leave this empty."
            />
            <Field
              label="Type DELETE to confirm"
              name="deleteConfirm"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="off"
              error={fields.confirm}
            />
            {error ? <Alert>{error}</Alert> : null}
            <div className="se-cta">
              <button type="button" className="se-btn se-btn--ghost" onClick={() => { setOpen(false); setConfirm(''); setPassword(''); }}>Keep my account</button>
              <Button className="se-btn se-btn--danger" disabledReason={busy ? 'Deleting...' : confirm !== 'DELETE' ? 'Type DELETE first.' : null}>
                {busy ? 'Deleting...' : 'Delete my account'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Panel>
  );
}
