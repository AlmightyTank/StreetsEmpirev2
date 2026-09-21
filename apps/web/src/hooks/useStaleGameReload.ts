import { useEffect, useRef } from 'react';

const STALE_AFTER_MS = 5 * 60_000;
const SEEN_TICK_MS = 30_000;

/**
 * A game tab that has been asleep for a while should come back from the
 * server, not from whatever page-level state happened to be in memory.
 */
export function useStaleGameReload(): void {
  const lastSeenAt = useRef(Date.now());
  const hiddenAt = useRef<number | null>(document.hidden ? Date.now() : null);
  const reloadStarted = useRef(false);

  useEffect(() => {
    const markSeen = () => {
      if (!document.hidden) lastSeenAt.current = Date.now();
    };

    const reloadIfStale = () => {
      if (reloadStarted.current || document.hidden) return;

      const now = Date.now();
      const staleSince = hiddenAt.current ?? lastSeenAt.current;
      hiddenAt.current = null;
      lastSeenAt.current = now;

      if (now - staleSince < STALE_AFTER_MS) return;
      reloadStarted.current = true;
      window.location.reload();
    };

    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now();
        return;
      }
      reloadIfStale();
    };
    const onPageHide = () => {
      hiddenAt.current = Date.now();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reloadIfStale();
      else markSeen();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', reloadIfStale);
    window.addEventListener('online', reloadIfStale);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pointerdown', reloadIfStale, { capture: true });
    window.addEventListener('keydown', reloadIfStale, { capture: true });
    const tick = window.setInterval(markSeen, SEEN_TICK_MS);

    return () => {
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', reloadIfStale);
      window.removeEventListener('online', reloadIfStale);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pointerdown', reloadIfStale, { capture: true });
      window.removeEventListener('keydown', reloadIfStale, { capture: true });
    };
  }, []);
}
