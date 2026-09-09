import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../stores/session.js';

/** Section 47. How often an open dashboard checks back in. */
const POLL_INTERVAL_MS = 60_000;

export interface LiveDashboard {
  refreshing: boolean;
  offline: boolean;
  error: string | null;
  /** Pull now. Pass true for anything the player did not personally trigger. */
  refresh: (background?: boolean) => Promise<void>;
}

/**
 * Section 47 / 0.1.0-F reconnect hardening.
 *
 * Refreshes on mount, tab visibility, focus, every sixty seconds, and the
 * browser's `online` event. Going offline stops pointless polls and shows a
 * useful message; reconnecting immediately pulls authoritative state.
 */
export function useLiveDashboard(): LiveDashboard {
  const refreshSnapshot = useSession((s) => s.refreshSnapshot);

  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [error, setError] = useState<string | null>(
    navigator.onLine ? null : 'You are offline. Changes will sync when the connection returns.',
  );

  // One refresh at a time; a focus event landing mid-poll is dropped.
  const inFlight = useRef(false);

  const refresh = useCallback(
    async (background = false) => {
      if (inFlight.current || document.hidden) return;
      if (!navigator.onLine) {
        setOffline(true);
        setError('You are offline. Changes will sync when the connection returns.');
        return;
      }

      inFlight.current = true;
      if (!background) setRefreshing(true);

      try {
        await refreshSnapshot({ background });
        setOffline(false);
        setError(null);
      } catch (err) {
        const isOffline = !navigator.onLine;
        setOffline(isOffline);
        setError(
          isOffline
            ? 'Connection lost. Current numbers may be stale until you reconnect.'
            : err instanceof Error
              ? err.message
              : 'Could not refresh.',
        );
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
    const onOnline = () => {
      setOffline(false);
      void refresh(false);
    };
    const onOffline = () => {
      setOffline(true);
      setError('Connection lost. Current numbers may be stale until you reconnect.');
    };
    const timer = window.setInterval(() => void refresh(true), POLL_INTERVAL_MS);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refresh]);

  return { refreshing, offline, error, refresh };
}
