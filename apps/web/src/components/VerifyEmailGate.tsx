import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { Shell } from '../layouts/Shell.js';
import { useSession } from '../stores/session.js';
import { Alert } from './Alert.js';
import { Panel } from './Panel.js';

/**
 * Shown instead of the game until the account may play: the player verifies the email
 * we sent at sign-up, or signs in with Discord. Everything else about the account
 * (settings, changing the email, signing out) keeps working.
 */
export function VerifyEmailGate() {
  const account = useSession((s) => s.account);
  const refreshAccount = useSession((s) => s.refreshAccount);
  const logout = useSession((s) => s.logout);
  const [notice, setNotice] = useState<{ tone: 'info' | 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Verified in another tab or on the phone: let them straight in when they come back.
  useEffect(() => {
    const check = () => { if (!document.hidden) void refreshAccount(); };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [refreshAccount]);

  if (!account) return null;

  async function resend() {
    setBusy(true);
    try {
      const response = await authApi.requestEmailVerification();
      setNotice({ tone: 'success', text: response.message });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof ApiError ? error.message : 'Could not send it just now. Try again in a moment.' });
    } finally {
      setBusy(false);
    }
  }

  async function checkAgain() {
    setBusy(true);
    await refreshAccount();
    setBusy(false);
    if (useSession.getState().account?.verificationRequired) {
      setNotice({ tone: 'info', text: 'Not verified yet. Open the link in the email, then press this again.' });
    }
  }

  return (
    <Shell narrow>
      <p className="se-eyebrow">One more step</p>
      <h1 className="se-title se-mb">Verify your email to play</h1>
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}

      <Panel title="Check your inbox">
        <p>
          We sent a link to <strong>{account.email}</strong>. Open it to confirm the address, and you are in.
          It can take a minute; check spam too.
        </p>
        <div className="se-verify-gate__actions">
          <button type="button" className="se-btn se-btn--primary" onClick={() => void checkAgain()} disabled={busy}>
            I have verified it
          </button>
          <button type="button" className="se-btn se-btn--ghost" onClick={() => void resend()} disabled={busy}>
            Send the link again
          </button>
        </div>
        <p className="se-hint">
          Wrong address? Change it in <Link to="/account">account settings</Link>; we send a link to the new one.
        </p>
      </Panel>

      <Panel title="Or use Discord">
        <p>Link your Discord account instead: Discord has already confirmed your email, so there is nothing else to click.</p>
        <a className="se-btn se-btn--discord se-btn--block" href="/api/auth/discord?link=1">Continue with Discord</a>
      </Panel>

      <p className="se-hint">
        Not you? <button type="button" className="se-linkbtn" onClick={() => void logout()}>Log out</button>
      </p>
    </Shell>
  );
}
