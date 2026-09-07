import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../stores/session.js';

/** Section 47. How often an open dashboard checks back in. */
const POLL_INTERVAL_MS = 60_000;

export interface LiveDashboard {
  refreshing: boolean;
  error: string | null;
  /** Pull now. Pass true for anything the player did not personally trigger. */
  refresh: (background?: boolean) => Promise<void>;
}

/**
 * Section 47. Keeps the dashboard authoritative.
 *
 * Refreshes on mount, whenever the tab is brought back to the front, on window
 * focus, and every sixty seconds while it is open. Periodic polls are flagged
 * as background so they do not count as the player being at the keyboard.
 *
 * Never renders stale initial data: a tab that has been sitting for an hour
 * repaints from the server before the player can act on what it shows.
 */
export function useLiveDashboard(): LiveDashboard {
  const refreshSnapshot = useSession((s) => s.refreshSnapshot);

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One refresh at a time; a focus event landing mid-poll is dropped.
  const inFlight = useRef(false);

  const refresh = useCallback(
    async (background = false) => {
      if (inFlight.current || document.hidden) return;
      inFlight.current = true;
      if (!background) setRefreshing(true);

      try {
        await refreshSnapshot({ background });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not refresh.');
      } finally {
        inFlight.current = false;
        setRefreshing(false);
      }
    },
    [refreshSnapshot],
  );

  useEffect(() => {
    void refresh(false);

    const onVisibility = () => {
      if (!document.hidden) void refresh(false);
    };
    const onFocus = () => void refresh(false);
    const timer = window.setInterval(() => void refresh(true), POLL_INTERVAL_MS);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return { refreshing, error, refresh };
}
