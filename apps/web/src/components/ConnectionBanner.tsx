import { useOnlineStatus } from '../hooks/useOnlineStatus.js';

/** 0.1.0-H. Make an offline tab obvious before a player submits an action. */
export function ConnectionBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className="se-offline" role="status" aria-live="polite">
      <strong>Offline.</strong> Your displayed numbers may be stale. Actions will be available again after the connection returns and the game refreshes.
    </div>
  );
}
