import { useEffect, useState } from 'react';
import type { ForumLinkStatusDto } from '@streets/shared';
import { forumApi } from '../api/forum.js';
import { ApiError } from '../api/client.js';
import { Alert } from './Alert.js';
import { Panel } from './Panel.js';

export function ForumLinkPanel() {
  const [status, setStatus] = useState<ForumLinkStatusDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  async function refresh() {
    setError(null);
    try { setStatus(await forumApi.status()); }
    catch { setError('Could not load the forum connection. Try again.'); }
  }
  useEffect(() => { void refresh(); }, []);
  async function change(unlink: boolean) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (unlink) {
        await forumApi.unlink();
        setConfirmUnlink(false);
        setStatus((current) => current && { ...current, link: null });
        setNotice('Forum account unlinked.');
      } else {
        const result = await forumApi.start();
        window.location.assign(result.url);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update the connection. Try again.');
    } finally { setBusy(false); }
  }
  return <Panel title="Forum account">
    {error ? <Alert>{error}</Alert> : null}
    {notice ? <p role="status" className="se-good">{notice}</p> : null}
    {!status ? <button type="button" className="se-btn se-btn--ghost" onClick={refresh}>{error ? 'Retry' : 'Loading connection...'}</button> : status.link ? <>
      <p>Linked to <strong>{status.link.username}</strong>. Your profiles now link to each other, across every round.</p>
      <div className="se-actions-row">
        <a className="se-btn se-btn--primary" href={status.link.profileUrl}>Forum Profile</a>
        <button type="button" className="se-btn se-btn--ghost" disabled={busy} onClick={() => setConfirmUnlink(true)}>Unlink forum account</button>
      </div>
      {confirmUnlink ? <div>
        <p>Remove the public connection between these profiles? Both accounts and their posts stay intact.</p>
        <div className="se-actions-row">
          <button type="button" className="se-btn se-btn--ghost" disabled={busy} onClick={() => change(true)}>{busy ? 'Unlinking...' : 'Yes, unlink'}</button>
          <button type="button" className="se-btn se-btn--ghost" disabled={busy} onClick={() => setConfirmUnlink(false)}>Cancel</button>
        </div>
      </div> : null}
    </> : status.enabled ? <>
      <p>Connect your forum account to show a public link on both profiles. You’ll sign into the forum and confirm which account to connect.</p>
      <button type="button" className="se-btn se-btn--primary se-btn--block" disabled={busy} onClick={() => change(false)}>{busy ? 'Opening forum...' : 'Link Forum Account'}</button>
      <p className="se-hint">Your email and Discord details stay private. You can unlink at any time.</p>
    </> : <p className="se-muted">Forum account linking is coming soon.</p>}
  </Panel>;
}
