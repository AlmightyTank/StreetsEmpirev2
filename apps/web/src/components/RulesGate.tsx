import { useEffect, useRef, useState } from 'react';
import { RULES_AGREEMENT, RULES_VERSION, type AccountDto } from '@streets/shared';
import { api, ApiError } from '../api/client.js';
import { Shell } from '../layouts/Shell.js';
import { useSession } from '../stores/session.js';
import { Alert } from './Alert.js';

/**
 * The rules every player accepts before playing: shown on first sign-in, and again
 * whenever the rules change (RULES_VERSION). It cannot be closed; the only ways out
 * are accepting, reading the full rules, or signing out.
 */
export function RulesGate() {
  const logout = useSession((s) => s.logout);
  const refreshRound = useSession((s) => s.refreshRound);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => { dialog.current?.focus(); }, []);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const { account } = await api.post<{ account: AccountDto }>('/auth/rules/accept', { version: RULES_VERSION });
      useSession.setState({ account });
      await refreshRound();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that. Try again.');
      // The rules changed underneath them: show the new ones.
      if (caught instanceof ApiError && caught.code === 'RULES_CHANGED') window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell narrow>
      <div className="se-intro-backdrop se-rules-backdrop">
        <div ref={dialog} className="se-intro se-rules" role="dialog" aria-modal="true" aria-labelledby="se-rules-title" tabIndex={-1}>
          <p className="se-eyebrow">Before you play</p>
          <h2 id="se-rules-title">The rules of the street</h2>
          <p className="se-muted">Short version below. Everyone plays by these, and staff enforce them.</p>
          <ol className="se-rules__list">
            {RULES_AGREEMENT.map((rule) => (
              <li key={rule.title}><strong>{rule.title}.</strong> {rule.body}</li>
            ))}
          </ol>
          <p className="se-hint">
            The full <a href="/game/rules" target="_blank" rel="noreferrer">game rules</a> and the{' '}
            <a href="https://streetsempire.dev/terms" target="_blank" rel="noreferrer">terms</a> say more.
          </p>
          {error ? <Alert>{error}</Alert> : null}
          <label className="se-rules__agree">
            <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
            <span>I have read the rules and I will play by them.</span>
          </label>
          <div className="se-rules__actions">
            <button type="button" className="se-btn se-btn--ghost" onClick={() => void logout()}>Log out</button>
            <button type="button" className="se-btn se-btn--primary" disabled={!agreed || busy} onClick={() => void accept()}>
              {busy ? 'Saving...' : 'Accept and play'}
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
