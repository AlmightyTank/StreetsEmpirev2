import { useEffect } from 'react';
import { gameApi } from '../api/game.js';
import { useSession } from '../stores/session.js';

const HEARTBEAT_INTERVAL_MS = 60_000;
const RECENT_INTERACTION_MS = 3 * 60_000;

/**
 * Lightweight, optically online presence for a player actively using the game.
 *
 * Background snapshot polling intentionally does not mark activity (away bonuses
 * depend on actual visits). This heartbeat is independent of those snapshots and
 * stops when the tab is hidden or the player has not interacted for three minutes.
 */
export function useGamePresence(): void {
  const playerId = useSession((state) => state.me?.id);

  useEffect(() => {
    if (!playerId) return;

    let mounted = true;
    let inFlight = false;
    let lastSentAt = 0;
    let lastInteractionAt = Date.now();

    const heartbeat = async () => {
      const now = Date.now();
      if (
        !mounted
        || inFlight
        || document.hidden
        || !navigator.onLine
        || now - lastInteractionAt > RECENT_INTERACTION_MS
        || now - lastSentAt < HEARTBEAT_INTERVAL_MS
      ) return;

      inFlight = true;
      lastSentAt = now;
      try {
        await gameApi.presenceHeartbeat();
      } catch {
        // Presence is best-effort and must not interrupt gameplay.
      } finally {
        inFlight = false;
      }
    };

    const onInteraction = () => {
      lastInteractionAt = Date.now();
      void heartbeat();
    };
    const onVisibility = () => {
      if (!document.hidden) onInteraction();
    };

    // Page arrival, real user input, and returning to the game count as use.
    // A foreground tab left untouched does NOT send keep-alives forever.
    void heartbeat();
    window.addEventListener('pointerdown', onInteraction, { passive: true });
    window.addEventListener('keydown', onInteraction);
    window.addEventListener('wheel', onInteraction, { passive: true });
    window.addEventListener('focus', onInteraction);
    window.addEventListener('online', onInteraction);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(() => void heartbeat(), HEARTBEAT_INTERVAL_MS);

    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', onInteraction);
      window.removeEventListener('keydown', onInteraction);
      window.removeEventListener('wheel', onInteraction);
      window.removeEventListener('focus', onInteraction);
      window.removeEventListener('online', onInteraction);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [playerId]);
}
