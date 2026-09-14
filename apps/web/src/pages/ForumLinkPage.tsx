import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { forumApi } from '../api/forum.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel } from '../components/Panel.js';
import { Shell } from '../layouts/Shell.js';
import { useSession } from '../stores/session.js';

export function ForumLinkPage() {
  const account = useSession((s) => s.account);
  const [proof] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('proof') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<string | null>(null);
  useEffect(() => { window.history.replaceState(window.history.state, '', window.location.pathname); }, []);
  async function finish() {
    setBusy(true);
    setError(null);
    try { const result = await forumApi.finish(proof); setLinked(result.link.username); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not finish linking. Check your account settings before trying again.'); }
    finally { setBusy(false); }
  }
  return <Shell><Panel title="Connect forum profile">
    {error ? <Alert>{error}</Alert> : null}
    {linked ? <p role="status">Your game account is now linked to <strong>{linked}</strong> on the forum.</p> : !account ? <>
      <p>Your game session ended. Sign in and start linking again from Account settings.</p>
      <Link className="se-btn se-btn--primary" to="/login">Sign in</Link>
    </> : proof ? <>
      <p>Finish connecting the forum account you just confirmed to <strong>{account.username}</strong>? Both profiles will show a public link to each other.</p>
      <button type="button" className="se-btn se-btn--primary" disabled={busy} onClick={finish}>{busy ? 'Linking...' : 'Finish linking'}</button>
    </> : <p>This linking request is missing. Start again from your account settings.</p>}
    <p><Link to="/account">{linked ? 'Back to account settings' : 'Cancel / account settings'}</Link></p>
  </Panel></Shell>;
}
