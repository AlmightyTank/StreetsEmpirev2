import { useCallback, useRef, useState } from 'react';
import type { GameActionResult } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { useSession } from '../stores/session.js';
import { newActionId } from '../utils/actionId.js';

export interface GameAction<T> {
  busy: boolean;
  error: string | null;
  result: GameActionResult<T> | null;
  run: (call: (actionId: string) => Promise<GameActionResult<T>>) => Promise<void>;
  clear: () => void;
}

/**
 * Section 48. Submit, take the result, update state, show the panel. No
 * navigation, no reload.
 *
 * The action id is minted once per submission and only cleared when the server
 * has answered. A retry after a failure therefore carries the same id, which
 * is what makes a dropped response safe to retry (section 52).
 */
export function useGameAction<T>(): GameAction<T> {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GameActionResult<T> | null>(null);

  const actionId = useRef<string | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    async (call: (actionId: string) => Promise<GameActionResult<T>>) => {
      if (inFlight.current) return;
      inFlight.current = true;

      setBusy(true);
      setError(null);

      actionId.current ??= newActionId();

      try {
        const outcome = await call(actionId.current);
        actionId.current = null;
        setResult(outcome);

        // The result carries before/after, but the dashboard's turns, ranks
        // and activity come from the server as one authoritative payload.
        await useSession.getState().refreshSnapshot();
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Something went wrong. Try that again.',
        );
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [],
  );

  const clear = useCallback(() => setResult(null), []);

  return { busy, error, result, run, clear };
}
