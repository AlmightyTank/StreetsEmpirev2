import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import type { DistrictDto, ScoutResult } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { actionsApi } from '../api/actions.js';
import { ActionResult } from '../components/ActionResult.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row } from '../components/Panel.js';
import { TurnSpend } from '../components/TurnSpend.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

const BAND_LABEL: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

function DistrictOption({
  district,
  checked,
  onSelect,
  disabled,
}: {
  district: DistrictDto;
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <label className={`se-choice${checked ? ' se-choice--on' : ''}`}>
      <input
        type="radio"
        name="district"
        className="se-choice__input"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <span className="se-choice__body">
        <span className="se-choice__name">{district.name}</span>
        <span className="se-choice__meta">
          <span title={`Recruiting: ${BAND_LABEL[district.recruiting]}`}>
            <b className="se-num se-dim">{district.expectedWhoresPerTurn}</b> whores
            {' / '}
            <b className="se-num se-dim">{district.expectedThugsPerTurn}</b> thugs per turn
          </span>
          <span>
            Money <b className="se-dim">{BAND_LABEL[district.money]}</b>
          </span>
        </span>
      </span>
    </label>
  );
}

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
          <p className="se-eyebrow">Put the girls on a block and see who you pick up</p>
        </div>
      </div>

      {loadError ? <Alert>{loadError}</Alert> : null}
      {action.error ? <Alert>{action.error}</Alert> : null}

      <div className="se-grid se-grid--sidebar">
        <Panel title="Scout">
          <form onSubmit={onSubmit}>
            <p className="se-label">District</p>
            <div className="se-choices">
              {districts.map((option) => (
                <DistrictOption
                  key={option.key}
                  district={option}
                  checked={district === option.key}
                  disabled={action.busy}
                  onSelect={() => setDistrict(option.key)}
                />
              ))}
            </div>

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
              <Row label="Condoms" value={formatNumber(me.resources.condoms)} />
              <Row label="Cash" value={formatCents(me.resources.cashCents)} />
              <Row label="Whore happiness" value={`${me.happiness.whore}%`} />
            </div>
          </Panel>

          <p className="se-hint">
            Working a district puts your girls on that block for the night and
            you out there with them. Rich districts pay well and turn up few new
            faces; poor ones are full of women with nowhere else to go.
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
