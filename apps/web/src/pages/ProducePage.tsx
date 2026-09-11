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
  const hasFitThugs = me.resources.fitThugs > 0;
  const canProduce =
    !action.busy &&
    hasFitThugs &&
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
          <p className="se-eyebrow">Turns and money in, product out</p>
        </div>
      </div>

      {action.error ? <Alert>{action.error}</Alert> : null}
      {!hasFitThugs ? (
        <Alert tone="info">
          You need at least one fit thug to cook. Scout for more, pick some up at
          Tek9 Tommy&rsquo;s, or let the wounded recover.
        </Alert>
      ) : null}

      <div className="se-grid se-grid--sidebar">
        <Panel title="Produce">
          <form onSubmit={onSubmit}>
            <TurnSpend
              value={turns}
              onChange={setTurns}
              available={available}
              disabled={action.busy || !hasFitThugs}
            />

            <button className="se-btn se-btn--primary se-btn--block" disabled={!canProduce}>
              {action.busy ? 'Cooking...' : 'Produce'}
            </button>
          </form>

          <p className="se-hint">
            Thugs do the cooking, so a batch is only as good as their happiness
            &mdash; and the girls still work while they cook, just for a
            fraction of a scouted night. What you get for that lost income is
            crack at $5 a rock, against the $10 Pip&rsquo;s charges for a
            finished one.
          </p>
        </Panel>

        {/*
          Manual 3.2 sends the girls out too, so a cook is not a thugs-only
          screen: the same crew, cut and shelf apply as on a scouting trip.
          This mirrors the scouting sidebar for that reason.
        */}
        <aside className="se-grid">
          <Panel title="The crew" flush>
            <div className="se-rows">
              <Row
                label="Turns"
                value={`${formatNumber(me.turns.turns)} / ${formatNumber(me.turns.turnCap)}`}
                strong
              />
              <Row label="Whores" value={formatNumber(me.resources.whores)} strong />
              <Row label="Thugs" value={formatNumber(me.resources.thugs)} strong />
              {me.resources.woundedThugs > 0 ? <Row label="Fit / wounded" value={`${formatNumber(me.resources.fitThugs)} / ${formatNumber(me.resources.woundedThugs)}`} /> : null}
              <Row label="They keep" value={`${me.payoutPercent}%`} />
              <Row label="You keep" value={`${100 - me.payoutPercent}%`} />
              <Row label="Whore happiness" value={`${me.happiness.whore}%`} />
              <Row label="Thug happiness" value={`${me.happiness.thug}%`} />
            </div>
          </Panel>

          {/* A cook burns the shelf the same way a trip does. */}
          <Panel title="Supplies for the cook" flush>
            <div className="se-rows">
              <Row label="Condoms" value={formatNumber(me.resources.condoms)} />
              <Row label="Medicine" value={formatNumber(me.resources.medicine)} />
              <Row label="Crack" value={formatNumber(me.resources.crack)} />
              <Row label="Beer" value={formatNumber(me.resources.beer)} />
              <Row label="Cash" value={formatCents(me.resources.cashCents)} strong />
            </div>
          </Panel>
        </aside>
      </div>

      {action.result ? (
        <div className="se-mt">
          {/*
            Cash moves twice on this receipt - ingredients out, then the
            girls' takings in - so each money line carries the balance at
            that point rather than the final total repeated twice.
          */}
          <ActionResult
            title="Production Results"
            onDismiss={action.clear}
            result={action.result}
            lines={[
              { label: 'Turns used', value: formatNumber(action.result.result.turnsUsed) },

              // The cook itself.
              {
                label: 'Crack produced',
                delta: action.result.result.crackProduced,
                remaining: action.result.after.resources.crack,
              },
              {
                label: 'Ingredients',
                delta: -action.result.result.ingredientCents,
                money: true,
                remaining:
                  action.result.before.cashCents - action.result.result.ingredientCents,
              },
              ...(action.result.result.limitedByCash
                ? [{ label: 'Short on cash', value: 'batch cut down', muted: true }]
                : []),

              // Manual 3.2: the girls are still out while the thugs cook.
              {
                label: 'Brought in',
                value: formatCents(action.result.result.grossEarnedCents),
              },
              {
                label: `Their cut (${action.result.result.payoutPercent}%)`,
                delta: -action.result.result.crewTakeCents,
                money: true,
                muted: true,
              },
              {
                label: 'Your cut',
                delta: action.result.result.cashEarnedCents,
                money: true,
                remaining:
                  action.result.before.cashCents -
                  action.result.result.ingredientCents +
                  action.result.result.cashEarnedCents,
              },
              ...(action.result.result.crackFound > 0
                ? [
                    {
                      label: 'Product found',
                      delta: action.result.result.crackFound,
                      remaining: action.result.after.resources.crack,
                    },
                  ]
                : []),

              // What the shift cost the shelf.
              {
                label: 'Condoms used',
                delta: -action.result.result.condomsUsed,
                remaining: action.result.after.resources.condoms,
                muted: true,
              },
              ...(action.result.result.condomsMissing > 0
                ? [
                    {
                      label: 'Worked without condoms',
                      value: `${formatNumber(action.result.result.condomsMissing)} short`,
                    },
                  ]
                : []),
              {
                label: 'Crack used',
                delta: -action.result.result.crackUsed,
                remaining: action.result.after.resources.crack,
                muted: true,
              },
              {
                label: 'Beer used',
                delta: -action.result.result.beerUsed,
                remaining: action.result.after.resources.beer,
                muted: true,
              },

              ...(action.result.result.infected > 0
                ? [
                    {
                      label: 'Caught something',
                      delta: -action.result.result.infected,
                    },
                    ...(action.result.result.treated > 0
                      ? [
                          {
                            label: 'Treated with medicine',
                            delta: -action.result.result.medicineUsed,
                            remaining: action.result.after.resources.medicine,
                            muted: true,
                          },
                        ]
                      : []),
                    ...(action.result.result.lostToInfection > 0
                      ? [
                          {
                            label: 'Lost, no medicine',
                            delta: -action.result.result.lostToInfection,
                            remaining: action.result.after.resources.whores,
                          },
                        ]
                      : []),
                  ]
                : []),
              ...(action.result.result.whoresLeft > 0
                ? [
                    {
                      label: 'Whores walked out',
                      delta: -action.result.result.whoresLeft,
                      remaining: action.result.after.resources.whores,
                    },
                  ]
                : []),
              ...(action.result.result.thugsLeft > 0
                ? [
                    {
                      label: 'Thugs walked out',
                      delta: -action.result.result.thugsLeft,
                      remaining: action.result.after.resources.thugs,
                    },
                  ]
                : []),

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
