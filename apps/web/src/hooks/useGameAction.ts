import { useCallback, useRef, useState } from 'react';
import type { GameActionResult } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { useSession } from '../stores/session.js';
import { newActionId } from '../utils/actionId.js';

export interface GameActionRunOptions {
  /** Reuse an id recovered from a pre-reload pending action. */
  actionId?: string;
  /** Called before the network request so a page can persist the exact id. */
  onActionId?: (actionId: string) => void;
}

export interface GameAction<T> {
  busy: boolean;
  error: string | null;
  result: GameActionResult<T> | null;
  run: (
    call: (actionId: string) => Promise<GameActionResult<T>>,
    options?: GameActionRunOptions,
  ) => Promise<void>;
  clear: () => void;
}

/**
 * Section 48/52. Submit, take the result, update state, show the panel.
 *
 * An uncertain network failure keeps the same action id. A definite 4xx
 * rejection clears it, because the next changed form is a new intent. F also
 * accepts a recovered id so pending store orders survive a page reload.
 */
export function useGameAction<T>(): GameAction<T> {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GameActionResult<T> | null>(null);

  const actionId = useRef<string | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    async (
      call: (actionId: string) => Promise<GameActionResult<T>>,
      options: GameActionRunOptions = {},
    ) => {
      if (inFlight.current) return;
      inFlight.current = true;

      setBusy(true);
      setError(null);

      actionId.current = options.actionId ?? actionId.current ?? newActionId();
      const currentActionId = actionId.current;
      options.onActionId?.(currentActionId);

      try {
        const outcome = await call(currentActionId);
        actionId.current = null;

        // Refresh before publishing the receipt. Result rows use the session's
        // multi-product balances for "remaining", so rendering first can show
        // the pre-action stock until this request finishes.
        try {
          await useSession.getState().refreshSnapshot();
        } catch (refreshError) {
          setError(
            refreshError instanceof Error
              ? `${refreshError.message} The action itself was confirmed.`
              : 'The action completed, but the dashboard could not refresh.',
          );
        }

        // Any confirmed gameplay action can advance a quest objective. The
        // tracked-jobs bar owns its own quest request, so tell it to refresh
        // instead of making every action page know which objectives changed.
        window.dispatchEvent(new Event('streets:quests-changed'));

        // Even when the follow-up refresh fails, the confirmed action receipt
        // is still useful and must remain visible.
        setResult(outcome);
      } catch (err) {
        if (err instanceof ApiError && !err.isUncertain) actionId.current = null;
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
