import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import type { DistrictDto, WorkResult } from '@streets/shared';
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

export function WorkPage() {
  const me = useSession((s) => s.me);
  const action = useGameAction<WorkResult>();

  const [districts, setDistricts] = useState<DistrictDto[]>([]);
  const [district, setDistrict] = useState('');
  const [turns, setTurns] = useState<number | ''>(10);
  const [loadError, setLoadError] = useState<string | null>(null);

  const crewSize = me ? me.resources.whores + me.resources.thugs : 0;

  useEffect(() => {
    actionsApi
      .districts()
      .then((response) => {
        setDistricts(response.districts);
        setDistrict((current) => current || response.districts[0]?.key || '');
      })
      .catch(() => setLoadError('Could not load the districts. Try again in a moment.'));
  }, [crewSize]);

  if (!me) return <Navigate to="/join" replace />;

  const available = me.turns.turns;
  const hasWhores = me.resources.whores > 0;
  const canWork =
    !action.busy &&
    hasWhores &&
    district !== '' &&
    typeof turns === 'number' &&
    turns >= 1 &&
    turns <= available;

  const chosen = districts.find((d) => d.key === district);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canWork || typeof turns !== 'number') return;

    await action.run((actionId) => actionsApi.work({ district, turns, actionId }));
  }

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Work the Streets</h1>
          <p className="se-eyebrow">Put the crew on a block and take your cut</p>
        </div>
      </div>

      {loadError ? <Alert>{loadError}</Alert> : null}
      {action.error ? <Alert>{action.error}</Alert> : null}
      {!hasWhores ? (
        <Alert tone="info">
          You have nobody to put to work. Scout a district first.
        </Alert>
      ) : null}

      <div className="se-grid se-grid--sidebar">
        <Panel title="Work">
          <form onSubmit={onSubmit}>
            <p className="se-label">District</p>
            <DistrictPicker
              districts={districts}
              value={district}
              onChange={setDistrict}
              mode="work"
              disabled={action.busy}
            />

            <hr className="se-hr" />

            <TurnSpend
              value={turns}
              onChange={setTurns}
              available={available}
              disabled={action.busy || !hasWhores}
            />

            <button className="se-btn se-btn--primary se-btn--block" disabled={!canWork}>
              {action.busy ? 'Out on the block...' : 'Work the streets'}
            </button>
          </form>
        </Panel>

        <aside>
          <Panel title="The split" flush>
            <div className="se-rows">
              <Row label="They keep" value={`${me.payoutPercent}%`} strong />
              <Row label="You keep" value={`${100 - me.payoutPercent}%`} strong />
              <Row label="Whore happiness" value={`${me.happiness.whore}%`} />
              <Row label="Whore wear" value={me.happiness.whoreFatigue} />
              <Row label="Thug wear" value={me.happiness.thugFatigue} />
            </div>
          </Panel>

          <p className="se-hint">
            Each run uses condoms and beer, rounded up to whole items. Missing
            condoms hurt whore happiness; missing beer hurts thug happiness.
            Shortages add wear even when the crew gets a generous cut.
          </p>

          <p className="se-hint">
            A night out wears the crew down. Their share of the take pays some
            of it back &mdash; and what matters is the money that reaches them,
            not the percentage. A thin cut of a rich block beats a fat cut of a
            poor one.
          </p>

          {chosen && chosen.exposedFraction > 0 ? (
            <p className="se-hint se-bad">
              You can only cover {formatNumber(chosen.coveredWhores)} of your{' '}
              {formatNumber(me.resources.whores)} girls here. The rest work alone:
              they earn less and the night hits harder. Bring more thugs, or work
              somewhere nobody is watching.
            </p>
          ) : null}
        </aside>
      </div>

      {action.result ? (
        <div className="se-mt">
          <ActionResult
            title="Night's Work"
            subtitle={action.result.result.district.name}
            onDismiss={action.clear}
            result={action.result}
            lines={[
              { label: 'Turns used', value: formatNumber(action.result.result.turnsUsed) },
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
              { label: 'Your cut', delta: action.result.result.cashEarnedCents, money: true },
              ...(action.result.result.crackFound > 0
                ? [{ label: 'Product found', delta: action.result.result.crackFound }]
                : []),
              {
                label: 'Whore wear',
                invert: true,
                delta: action.result.result.whoreFatigueChange,
                muted: true,
              },
              {
                label: 'Thug wear',
                invert: true,
                delta: action.result.result.thugFatigueChange,
                muted: true,
              },
              { label: 'Condoms used', delta: -action.result.result.condomsUsed, muted: true },
              { label: 'Crack used', delta: -action.result.result.crackUsed, muted: true },
              { label: 'Beer used', delta: -action.result.result.beerUsed, muted: true },
              ...(action.result.result.condomsMissing > 0
                ? [{ label: 'Condoms missing', value: formatNumber(action.result.result.condomsMissing) }]
                : []),
              ...(action.result.result.beerMissing > 0
                ? [{ label: 'Beer missing', value: formatNumber(action.result.result.beerMissing) }]
                : []),
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
