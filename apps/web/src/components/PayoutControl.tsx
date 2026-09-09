import { useState, type FormEvent } from 'react';
import type { PayoutResult } from '@streets/shared';
import { actionsApi } from '../api/actions.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { useSession } from '../stores/session.js';
import { Panel } from './Panel.js';

const MIN = 1;
const MAX = 99;

/**
 * Section 31. Costs no turns, and whore happiness moves the instant it lands.
 *
 * Squeezing the cut raises your share of a pot that shrinks with their
 * happiness, so the useful range is somewhere in the middle - which the player
 * has to find rather than be told.
 */
export function PayoutControl() {
  const me = useSession((s) => s.me);
  const action = useGameAction<PayoutResult>();

  const [percent, setPercent] = useState<number | null>(null);

  if (!me) return null;

  const current = me.payoutPercent;
  const draft = percent ?? current;
  const dirty = draft !== current;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!dirty || action.busy) return;

    await action.run((actionId) => actionsApi.setPayout({ percent: draft, actionId }));
    setPercent(null);
  }

  return (
    <Panel title="Whore Payout">
      <form onSubmit={onSubmit}>
        <div className="se-payout__split">
          <div>
            <div className="se-stat__label">They keep</div>
            <div className="se-payout__value se-num">{draft}%</div>
          </div>
          <div className="se-payout__you">
            <div className="se-stat__label">You keep</div>
            <div className="se-payout__value se-num">{100 - draft}%</div>
          </div>
        </div>

        <input
          className="se-range"
          type="range"
          min={MIN}
          max={MAX}
          value={draft}
          disabled={action.busy}
          aria-label="Whore payout percentage"
          onChange={(e) => setPercent(Number(e.target.value))}
        />

        <div className="se-payout__scale se-num">
          <span>{MIN}%</span>
          <span>{MAX}%</span>
        </div>

        {action.error ? <p className="se-error">{action.error}</p> : null}

        <button
          className="se-btn se-btn--block"
          disabled={!dirty || action.busy}
          style={{ marginTop: 10 }}
        >
          {action.busy
            ? 'Updating...'
            : dirty
              ? `Update payout to ${draft}%`
              : `Payout is ${current}%`}
        </button>

        {action.result ? (
          <p className="se-action-confirm" role="status">
            Payout updated: {action.result.result.before}% &rarr; {action.result.result.after}%.
          </p>
        ) : null}
      </form>
    </Panel>
  );
}
