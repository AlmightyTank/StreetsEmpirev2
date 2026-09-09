import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useSession } from '../stores/session.js';

/**
 * 0.1.0-G. Non-dashboard game pages refresh their authoritative player state
 * whenever the player navigates to them, returns to the tab/window, or the
 * browser comes back online. The dashboard already owns its 60-second live
 * poll, so it is deliberately excluded here to avoid duplicate requests.
 */
export function usePageFreshness(): void {
  const location = useLocation();
  const me = useSession((s) => s.me);
  const refreshSnapshot = useSession((s) => s.refreshSnapshot);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!me || inFlight.current || document.hidden) return;
    inFlight.current = true;
    try {
      await refreshSnapshot({ background: false });
    } catch {
      // Page-specific requests and action controls already surface errors.
      // Freshness is best-effort and must never blank a usable page.
    } finally {
      inFlight.current = false;
    }
  }, [me?.id, refreshSnapshot]);

  useEffect(() => {
    if (location.pathname === '/game') return;
    void refresh();
  }, [location.pathname, refresh]);

  useEffect(() => {
    if (location.pathname === '/game') return;

    const onVisibility = () => {
      if (!document.hidden) void refresh();
    };
    const onFocus = () => void refresh();
    const onOnline = () => void refresh();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) void refresh();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [location.pathname, refresh]);
}
