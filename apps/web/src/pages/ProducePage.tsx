import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import type { ProduceCrackResult } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { actionsApi } from '../api/actions.js';
import { ActionResult } from '../components/ActionResult.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row } from '../components/Panel.js';
import { TurnSpend } from '../components/TurnSpend.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

export function ProducePage() {
  const me = useSession((s) => s.me);
  const action = useGameAction<ProduceCrackResult>();

  const [turns, setTurns] = useState<number | ''>(10);

  if (!me) return <Navigate to="/join" replace />;

  const available = me.turns.turns;
  const hasThugs = me.resources.thugs > 0;
  const canProduce =
    !action.busy &&
    hasThugs &&
    typeof turns === 'number' &&
    turns >= 1 &&
    turns <= available;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canProduce || typeof turns !== 'number') return;

    await action.run((actionId) => actionsApi.produceCrack({ turns, actionId }));
  }

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Produce Crack</h1>
          <p className="se-eyebrow">Stay in and cook</p>
        </div>
      </div>

      {action.error ? <Alert>{action.error}</Alert> : null}
      {!hasThugs ? (
        <Alert tone="info">
          You need at least one thug to cook. Scout for them, or pick some up at
          Tek9 Tommy&rsquo;s once the stores open.
        </Alert>
      ) : null}

      <div className="se-grid se-grid--sidebar">
        <Panel title="Produce">
          <form onSubmit={onSubmit}>
            <TurnSpend
              value={turns}
              onChange={setTurns}
              available={available}
              disabled={action.busy || !hasThugs}
            />

            <button className="se-btn se-btn--primary se-btn--block" disabled={!canProduce}>
              {action.busy ? 'Cooking...' : 'Produce'}
            </button>
          </form>

          <p className="se-hint">
            Thugs do the cooking, so a batch is only as good as their happiness.
            The girls still work, but nobody is out there running them, so the
            shift earns a quarter of what a district pays. What you save is the
            crack you would have bought from Pip&rsquo;s.
          </p>
        </Panel>

        <aside>
          <Panel title="On hand" flush>
            <div className="se-rows">
              <Row
                label="Turns"
                value={`${formatNumber(me.turns.turns)} / ${formatNumber(me.turns.turnCap)}`}
                strong
              />
              <Row label="Thugs" value={formatNumber(me.resources.thugs)} strong />
              <Row label="Thug happiness" value={`${me.happiness.thug}%`} />
              <Row label="Crack" value={formatNumber(me.resources.crack)} />
              <Row label="Beer" value={formatNumber(me.resources.beer)} />
              <Row label="Cash" value={formatCents(me.resources.cashCents)} />
            </div>
          </Panel>
        </aside>
      </div>

      {action.result ? (
        <div className="se-mt">
          <ActionResult
            title="Production Results"
            onDismiss={action.clear}
            result={action.result}
            lines={[
              { label: 'Turns used', value: formatNumber(action.result.result.turnsUsed) },
              { label: 'Crack produced', delta: action.result.result.crackProduced },
              { label: 'Cash earned', delta: action.result.result.cashEarnedCents, money: true },
              { label: 'Condoms used', delta: -action.result.result.condomsUsed, muted: true },
              { label: 'Crack used', delta: -action.result.result.crackUsed, muted: true },
              { label: 'Beer used', delta: -action.result.result.beerUsed, muted: true },
              { label: 'Whores left', delta: -action.result.result.whoresLeft, muted: true },
              { label: 'Thugs left', delta: -action.result.result.thugsLeft, muted: true },
              {
                label: 'Turns remaining',
                value: formatNumber(action.result.result.turnsRemaining),
              },
            ]}
          />
        </div>
      ) : null}
    </GameLayout>
  );
}
