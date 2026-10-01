import { useEffect, useState } from 'react';
import { watchForUpdate } from '../utils/app-update.js';

/**
 * 1.0.0-G. "A new version is out" for tabs and installed apps that stay open. Reloading
 * is the player's call: they may be half way through a form.
 */
export function UpdateBanner() {
  const [ready, setReady] = useState(false);
  useEffect(() => watchForUpdate(() => setReady(true)), []);
  if (!ready) return null;
  return (
    <div className="se-update" role="status" aria-live="polite">
      <span><strong>A new version of StreetsEmpire is out.</strong> Reload to get it; your game is saved on the server.</span>
      <span className="se-update__actions">
        <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={() => window.location.reload()}>Reload</button>
        <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setReady(false)}>Later</button>
      </span>
    </div>
  );
}
