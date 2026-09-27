import { useEffect, useRef, useState } from 'react';
import { formatCountdown } from '../utils/time.js';

/**
 * Section 14. A display-only countdown.
 *
 * The server stays authoritative: this ticks a local clock towards `targetIso`
 * and, when it lands, calls `onElapsed` so the page can ask the server what
 * actually happened rather than incrementing anything itself.
 */
export function useCountdown(
  targetIso: string | null,
  onElapsed?: () => void,
): { msRemaining: number; label: string } {
  const [msRemaining, setMsRemaining] = useState(() => remaining(targetIso));

  // Kept in a ref so a new callback identity each render does not restart the
  // interval, and so a target that has already passed only fires once.
  const elapsedRef = useRef(onElapsed);
  elapsedRef.current = onElapsed;
  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    setMsRemaining(remaining(targetIso));
    if (!targetIso) return;

    const timer = window.setInterval(() => {
      const left = remaining(targetIso);
      setMsRemaining(left);

      if (left <= 0 && firedFor.current !== targetIso) {
        firedFor.current = targetIso;
        elapsedRef.current?.();
      }
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [targetIso]);

  return { msRemaining, label: formatCountdown(msRemaining) };
}

function remaining(targetIso: string | null): number {
  if (!targetIso) return 0;
  return Math.max(0, new Date(targetIso).getTime() - Date.now());
}
