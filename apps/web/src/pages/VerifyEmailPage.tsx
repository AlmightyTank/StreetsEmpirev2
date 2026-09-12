import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel } from '../components/Panel.js';
import { Shell } from '../layouts/Shell.js';
import { useSession } from '../stores/session.js';

export function VerifyEmailPage() {
  const verifyEmailToken = useSession((s) => s.verifyEmailToken);
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [message, setMessage] = useState(token ? 'Checking that email link...' : 'Open the full email verification link.');
  const [tone, setTone] = useState<'error' | 'info'>(token ? 'info' : 'error');

  useEffect(() => {
    if (!token) return;

    let active = true;
    verifyEmailToken({ token })
      .then((result) => {
        if (!active) return;
        setTone('info');
        setMessage(result);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setTone('error');
        setMessage(error instanceof ApiError ? error.message : 'Something went wrong. Try that again.');
      });

    return () => { active = false; };
  }, [token, verifyEmailToken]);

  return (
    <Shell narrow>
      <p className="se-eyebrow">Account email</p>
      <h1 className="se-title se-mb">Verify email</h1>

      <Panel title="Email verification">
        <Alert tone={tone}>{message}</Alert>
        <div className="se-actions-row">
          <Link className="se-btn se-btn--primary" to="/account">Account settings</Link>
          <Link className="se-btn se-btn--ghost" to="/game">Back to game</Link>
        </div>
      </Panel>
    </Shell>
  );
}
