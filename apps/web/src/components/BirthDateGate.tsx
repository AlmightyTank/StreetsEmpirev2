import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MINIMUM_AGE, latestEligibleBirthDate } from '@streets/shared';
import { authApi } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { Shell } from '../layouts/Shell.js';
import { useSession } from '../stores/session.js';
import { Alert } from './Alert.js';
import { Field } from './Field.js';

/**
 * Existing accounts (including Discord sign-ins) must provide a private birthday
 * once. Account state from the server closes this gate as soon as it is saved.
 */
export function BirthDateGate() {
  const [birthDate, setBirthDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const logout = useSession((state) => state.logout);
  const refreshRound = useSession((state) => state.refreshRound);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => { dialog.current?.focus(); }, []);

  const maxBirthDate = latestEligibleBirthDate();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldError(undefined);
    try {
      const { account } = await authApi.saveBirthday({ birthDate });
      useSession.setState({ account });
      await refreshRound();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldError(caught.fields?.birthDate);
      } else {
        setError('Could not save your birthday. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell narrow>
      <div className="se-intro-backdrop se-rules-backdrop">
        <div ref={dialog} className="se-intro se-rules-dialog" role="dialog" aria-modal="true" aria-labelledby="se-birthday-title" tabIndex={-1}>
          <p className="se-eyebrow">One-time account update</p>
          <h2 id="se-birthday-title">What is your date of birth?</h2>
          <p>StreetsEmpire is now for players aged <strong>{MINIMUM_AGE} or older</strong>. Please add your birthday to continue playing.</p>
          <p className="se-hint">Your full birthday stays private. Other players only see your public profile, never your date of birth.</p>
          {error ? <Alert tone="error">{error}</Alert> : null}
          <form onSubmit={(event) => void save(event)}>
            <Field
              label="Date of birth"
              name="birthDate"
              type="date"
              autoComplete="bday"
              min="1896-01-01"
              max={maxBirthDate}
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
              required
              error={fieldError}
              hint="Enter your actual birthday. Once saved, contact support to correct it."
            />
            <div className="se-rules__actions">
              <button type="button" className="se-btn se-btn--ghost" onClick={() => void logout()} disabled={busy}>Log out</button>
              <button type="submit" className="se-btn se-btn--primary" disabled={busy || !birthDate}>
                {busy ? 'Saving...' : 'Save birthday and continue'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Shell>
  );
}
