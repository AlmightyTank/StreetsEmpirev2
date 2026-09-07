import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import type { DistrictDto, ScoutResult } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { actionsApi } from '../api/actions.js';
import { ActionResult } from '../components/ActionResult.js';
import { Alert } from '../components/Alert.js';
import { DistrictPicker } from '../components/DistrictPicker.js';
import { Panel, Row } from '../components/Panel.js';
import { TurnSpend } from '../components/TurnSpend.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

export function ScoutPage() {
  const me = useSession((s) => s.me);
  const action = useGameAction<ScoutResult>();

  const [districts, setDistricts] = useState<DistrictDto[]>([]);
  const [reach, setReach] = useState<{ whores: number; thugs: number } | null>(null);
  const [district, setDistrict] = useState<string>('');
  const [turns, setTurns] = useState<number | ''>(10);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Refetched whenever the crew changes, because the rates on offer depend on
  // how many people you already run.
  const crewSize = me ? me.resources.whores + me.resources.thugs : 0;

  useEffect(() => {
    actionsApi
      .districts()
      .then((response) => {
        setDistricts(response.districts);
        setReach(response.recruitment);
        setDistrict((current) => current || response.districts[0]?.key || '');
      })
      .catch(() => setLoadError('Could not load the districts. Try again in a moment.'));
  }, [crewSize]);

  if (!me) return <Navigate to="/join" replace />;

  const available = me.turns.turns;
  const canScout =
    !action.busy &&
    district !== '' &&
    typeof turns === 'number' &&
    turns >= 1 &&
    turns <= available;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canScout || typeof turns !== 'number') return;

    await action.run((actionId) => actionsApi.scout({ district, turns, actionId }));
  }

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Scout for Whores</h1>
          <p className="se-eyebrow">Turns spent looking for new faces</p>
        </div>
      </div>

      {loadError ? <Alert>{loadError}</Alert> : null}
      {action.error ? <Alert>{action.error}</Alert> : null}

      <div className="se-grid se-grid--sidebar">
        <Panel title="Scout">
          <form onSubmit={onSubmit}>
            <p className="se-label">District</p>
            <DistrictPicker
              districts={districts}
              value={district}
              onChange={setDistrict}
              mode="scout"
              disabled={action.busy}
            />

            <hr className="se-hr" />

            <TurnSpend
              value={turns}
              onChange={setTurns}
              available={available}
              disabled={action.busy}
            />

            <button className="se-btn se-btn--primary se-btn--block" disabled={!canScout}>
              {action.busy ? 'Working the block...' : 'Scout'}
            </button>
          </form>
        </Panel>

        <aside>
          <Panel title="On hand" flush>
            <div className="se-rows">
              <Row
                label="Turns"
                value={`${formatNumber(me.turns.turns)} / ${formatNumber(me.turns.turnCap)}`}
                strong
              />
              <Row label="Whores" value={formatNumber(me.resources.whores)} />
              <Row label="Thugs" value={formatNumber(me.resources.thugs)} />
              <Row label="Cash" value={formatCents(me.resources.cashCents)} />
            </div>
          </Panel>

          <p className="se-hint">
            Scouting is looking, not working. Nobody earns, nothing is used up
            and nobody comes home tired. Poor districts are full of people with
            nowhere else to go; rich ones barely have anyone to find.
          </p>

          {reach && reach.whores < 0.95 ? (
            <p className="se-hint se-mt">
              You already run most of the people worth running. New faces come
              at <b className="se-num se-dim">{Math.round(reach.whores * 100)}%</b>{' '}
              of the headline rate for whores and{' '}
              <b className="se-num se-dim">{Math.round(reach.thugs * 100)}%</b> for
              thugs. Past a certain size the money is worth more than the
              recruiting.
            </p>
          ) : null}
        </aside>
      </div>

      {action.result ? (
        <div className="se-mt">
          <ActionResult
            title="Scouting Results"
            subtitle={action.result.result.district.name}
            onDismiss={action.clear}
            result={action.result}
            lines={[
              { label: 'Turns used', value: formatNumber(action.result.result.turnsUsed) },
              { label: 'Whores recruited', delta: action.result.result.whoresRecruited },
              { label: 'Thugs recruited', delta: action.result.result.thugsRecruited },
              {
                label: 'Recruiting reach',
                value: `${Math.round(action.result.result.recruitmentMultipliers.whores * 100)}%`,
                muted: true,
              },
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
