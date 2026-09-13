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
  const [district, setDistrict] = useState<string>('');
  const [turns, setTurns] = useState<number | ''>(13);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Refetched whenever the crew changes, because the rates on offer depend on
  // how many people you already run.
  const crewSize = me ? me.resources.whores + me.resources.fitThugs : 0;

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
          <h1 className="se-title">Scout</h1>
          <p className="se-eyebrow">Find clients, and pick up whoever else you find</p>
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

          <p className="se-hint">
            One trip, both jobs: the girls work the block while you work the
            room. In 0.2.0-G, only armed fit thugs count as street protection. Rich blocks have the money; poor ones have the people. What
            counts for their cut is the money that reaches them, not the
            percentage. Nothing else is posted &mdash; what a block is worth
            changes by the hour, and you find out by going.
          </p>
        </Panel>

        <aside className="se-grid">
          <Panel title="The crew" flush>
            <div className="se-rows">
              <Row
                label="Turns"
                value={`${formatNumber(me.turns.turns)} / ${formatNumber(me.turns.turnCap)}`}
                strong
              />
              <Row label="Whores" value={formatNumber(me.resources.whores)} strong tooltip="Girls working the block. Uncovered whores earn less and face more risk when supplies run short." />
              <Row label="Thugs" value={formatNumber(me.resources.thugs)} strong tooltip="In 0.2.0-G, a thug needs a weapon to count as street cover while scouting." />
              {me.resources.woundedThugs > 0 ? <Row label="Fit / wounded" value={`${formatNumber(me.resources.fitThugs)} / ${formatNumber(me.resources.woundedThugs)}`} tooltip="Wounded thugs cannot cover the street, scout, cook, attack or defend." /> : null}
              <Row label="Armed / unarmed" value={`${formatNumber(me.resources.armedThugs)} / ${formatNumber(me.resources.unarmedThugs)}`} tooltip="Only armed fit thugs count as protection in F public raid rounds." />
              <Row label="They keep" value={`${me.payoutPercent}%`} />
              <Row label="You keep" value={`${100 - me.payoutPercent}%`} />
              <Row label="Whore happiness" value={`${me.happiness.whore}%`} tooltip="Affects street earnings. Supplies, protection and payout all matter." />
              <Row label="Thug happiness" value={`${me.happiness.thug}%`} tooltip="Beer and weapons keep thugs happy. In E, missing weapons sting harder." />
            </div>
          </Panel>

          {/* A trip burns the shelf. Nothing else on the page shows it. */}
          <Panel title="Supplies for the trip" flush>
            <div className="se-rows">
              <Row label="Condoms" value={formatNumber(me.resources.condoms)} />
              <Row label="Medicine" value={formatNumber(me.resources.medicine)} />
              <Row label="Crack" value={formatNumber(me.resources.crack)} />
              <Row label="Beer" value={formatNumber(me.resources.beer)} tooltip="Thugs expect beer while they work. Missing beer lowers thug happiness." />
              <Row label="Cash" value={formatCents(me.resources.cashCents)} strong />
            </div>
          </Panel>

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
              // Manual 3.1: this is where you make money for yourself.
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
                remaining: action.result.after.cashCents,
              },

              {
                label: 'Whores recruited',
                delta: action.result.result.whoresRecruited,
                remaining: action.result.after.resources.whores,
              },
              {
                label: 'Thugs recruited',
                delta: action.result.result.thugsRecruited,
                remaining: action.result.after.resources.thugs,
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
                label: 'Armed street cover',
                value: `${formatNumber(action.result.result.armedThugs)} armed / ${formatNumber(action.result.result.unarmedThugs)} unarmed`,
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
