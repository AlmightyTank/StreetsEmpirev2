import { useEffect, useState, type FormEvent } from 'react';
import { isString, isTurns, rememberedKey, useRememberedState } from '../utils/remembered.js';
import { Link, Navigate } from 'react-router-dom';
import type { DistrictDto, RandomEncounterChoiceResult, ScoutResult } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { actionsApi } from '../api/actions.js';
import { ActionDock, resultChips } from '../components/ActionDock.js';
import { ActionResult } from '../components/ActionResult.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { DistrictPicker } from '../components/DistrictPicker.js';
import { Panel, Row } from '../components/Panel.js';
import { TurnSpend } from '../components/TurnSpend.js';
import { WorkSupplyPanel, WorkSupplyStockRows } from '../components/WorkSupplyPanel.js';
import { HeatNotice } from '../components/HeatPanel.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { scoutReceiptLines } from '../receipts/actionReceipts.js';
import { useSession } from '../stores/session.js';

function ScoutMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'good' | 'warn' | 'bad' | 'accent';
}) {
  return (
    <div className={`se-scout-metric${tone ? ` se-scout-metric--${tone}` : ''}`}>
      <span className="se-scout-metric__label">{label}</span>
      <strong className="se-scout-metric__value">{value}</strong>
      {detail ? <span className="se-scout-metric__detail">{detail}</span> : null}
    </div>
  );
}

function coverageTone(district: DistrictDto | undefined): 'good' | 'warn' | 'bad' {
  if (!district || district.exposedFraction <= 0) return 'good';
  return district.exposedFraction < 0.35 ? 'warn' : 'bad';
}

export function ScoutPage() {
  const me = useSession((s) => s.me);
  const action = useGameAction<ScoutResult>();
  const encounterAction = useGameAction<RandomEncounterChoiceResult>();

  const [districts, setDistricts] = useState<DistrictDto[]>([]);
  // The block and the turns come back next time; a block that is gone falls back below.
  const [district, setDistrict] = useRememberedState<string>(rememberedKey('scout.district', me?.id), '', { accept: isString });
  const [turns, setTurns] = useRememberedState<number | ''>(rememberedKey('scout.turns', me?.id), 13, { accept: isTurns });
  const [loadError, setLoadError] = useState<string | null>(null);

  // Refetched whenever the crew changes, because the visible coverage on offer
  // depends on how many people and armed fit thugs the player has available.
  const crewSize = me ? me.resources.whores + me.resources.fitThugs : 0;

  useEffect(() => {
    actionsApi
      .districts()
      .then((response) => {
        setDistricts(response.districts);
        setDistrict((current) => (current && response.districts.some((row) => row.key === current) ? current : response.districts[0]?.key || ''));
      })
      .catch(() => setLoadError('Could not load the districts. Try again in a moment.'));
  }, [crewSize]);

  if (!me) return <Navigate to="/join" replace />;

  const available = me.turns.turns;
  const selectedDistrict = districts.find((row) => row.key === district);
  const exposurePercent = selectedDistrict ? Math.round(selectedDistrict.exposedFraction * 100) : 0;
  const coveredPercent = 100 - exposurePercent;
  const districtTone = coverageTone(selectedDistrict);
  const chosenTurns = typeof turns === 'number' ? turns : 0;
  const remainingTurns = Math.max(0, available - chosenTurns);
  const supplyJobs = district
    ? [{ job: district, label: selectedDistrict?.name ?? 'This district' }]
    : [];

  const canScout =
    !action.busy &&
    district !== '' &&
    typeof turns === 'number' &&
    turns >= 1 &&
    turns <= available;

  const scoutBlock = action.busy
    ? 'Your crew is still out on the last job.'
    : district === ''
      ? 'Pick a district to work first.'
      : typeof turns !== 'number' || turns < 1
        ? 'Say how many turns to spend - at least one.'
        : turns > available
          ? `You only have ${formatNumber(available)} turns.`
          : null;

  const receiptLines = action.result ? scoutReceiptLines(action.result, me) : null;
  const pendingEncounter = action.result?.result.encounter?.status === 'PENDING' && action.result.result.encounter.id && action.result.result.encounter.choices?.length
    ? action.result.result.encounter
    : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canScout || typeof turns !== 'number') return;

    await action.run((actionId) => actionsApi.scout({ district, turns, actionId }));
  }

  async function resolveEncounter(choice: string) {
    if (!pendingEncounter?.id) return;
    await encounterAction.run((actionId) => actionsApi.resolveEncounter(pendingEncounter.id!, { choice, actionId }));
  }

  return (
    <GameLayout>
      <div className="se-scout">
        <header className="se-scout-hero">
          <div className="se-scout-hero__copy">
            <span className="se-eyebrow">Street operation · {me.city.name}</span>
            <h1>Scout the streets</h1>
            <p>
              Pick the block, choose how long to work it, and make sure the crew has enough cover and supply before you burn the turns.
            </p>
          </div>
        </header>

        {loadError ? <Alert>{loadError}</Alert> : null}
        {action.error ? <Alert>{action.error}</Alert> : null}

        <div className="se-scout-plan">
          <section className="se-scout-plan__main">
            <div className="se-scout-sectionhead">
              <div>
                <span className="se-eyebrow">Where to work</span>
                <h2>Pick a district</h2>
              </div>
              <span className="se-scout-sectionhead__meta">
                {selectedDistrict ? selectedDistrict.name : 'No block selected'}
              </span>
            </div>

            <p className="se-scout-copy">
              Client money and recruitment move with the streets and your crew size, so the game does not post fake rates. Choose from the protection picture you can actually see.
            </p>

            <DistrictPicker
              districts={districts}
              value={district}
              onChange={setDistrict}
              disabled={action.busy}
            />
          </section>

          <aside className="se-scout-plan__intel">
            <div className="se-scout-sectionhead">
              <div>
                <span className="se-eyebrow">Street read</span>
                <h2>{selectedDistrict?.name ?? 'Pick a block'}</h2>
              </div>
              {selectedDistrict ? (
                <span className={`se-scout-risk se-scout-risk--${districtTone}`}>
                  {exposurePercent === 0 ? 'Covered' : `${exposurePercent}% exposed`}
                </span>
              ) : null}
            </div>

            <p className="se-scout-intel__blurb">
              {selectedDistrict?.blurb ?? 'Choose a district to see the protection situation for your current crew.'}
            </p>

            {selectedDistrict ? (
              <>
                <div className="se-scout-intel__coverage">
                  <div className="se-scout-intel__bar" role="img" aria-label={`${coveredPercent}% of the street crew covered`}>
                    <span style={{ width: `${coveredPercent}%` }} />
                  </div>
                  <div className="se-scout-intel__coverage-labels">
                    <span>{coveredPercent}% covered</span>
                    <span>{exposurePercent}% working alone</span>
                  </div>
                </div>

                <div className="se-scout-intel__metrics">
                  <ScoutMetric
                    label="Covered"
                    value={formatNumber(selectedDistrict.coveredWhores)}
                    detail="whores with muscle"
                    tone={districtTone === 'bad' ? 'warn' : 'good'}
                  />
                  <ScoutMetric
                    label="Armed cover"
                    value={formatNumber(selectedDistrict.armedThugs)}
                    detail="fit thugs counting here"
                    tone="accent"
                  />
                  <ScoutMetric
                    label="Unarmed"
                    value={formatNumber(selectedDistrict.unarmedThugs)}
                    detail={selectedDistrict.requiresArmedThugs ? 'not covering' : 'still visible'}
                    tone={selectedDistrict.unarmedThugs > 0 && selectedDistrict.requiresArmedThugs ? 'warn' : undefined}
                  />
                  <ScoutMetric
                    label="Coverage rule"
                    value={`1 : ${formatNumber(selectedDistrict.protectionWhoresPerThug)}`}
                    detail={selectedDistrict.requiresArmedThugs ? 'armed thug per whores' : 'thug per whores'}
                  />
                </div>

                <div className={`se-scout-intel__note se-scout-intel__note--${districtTone}`}>
                  <strong>
                    {exposurePercent === 0
                      ? 'The whole working crew has protection.'
                      : exposurePercent < 35
                        ? 'Some of the crew will be working without cover.'
                        : 'A large share of the crew will be exposed.'}
                  </strong>
                  <span>
                    Scouting still has unknown street outcomes. The receipt after the trip is where you learn what this block actually paid and who you found.
                  </span>
                </div>
              </>
            ) : (
              <div className="se-scout-intel__empty">District intelligence appears here.</div>
            )}
          </aside>
        </div>

        <HeatNotice />

        <section className="se-scout-section">
          <div className="se-scout-sectionhead">
            <div>
              <span className="se-eyebrow">Before you leave</span>
              <h2>Crew & supply check</h2>
            </div>
            <p>What is available now and what this selected trip is configured to burn.</p>
          </div>

          <div className="se-scout-readygrid">
            <div className="se-scout-stack">
              <Panel title="The crew" flush className="se-scout-panel">
                <div className="se-scout-metricgrid">
                  <ScoutMetric label="Whores" value={formatNumber(me.resources.whores)} detail="working the block" />
                  <ScoutMetric label="Fit thugs" value={formatNumber(me.resources.fitThugs)} detail="available at home" />
                  <ScoutMetric
                    label="Armed"
                    value={formatNumber(me.resources.armedThugs)}
                    detail="available cover"
                    tone={me.resources.unarmedThugs > 0 ? 'warn' : 'good'}
                  />
                  <ScoutMetric
                    label="Wounded"
                    value={formatNumber(me.resources.woundedThugs)}
                    detail="cannot work"
                    tone={me.resources.woundedThugs > 0 ? 'warn' : 'good'}
                  />
                </div>
                <div className="se-rows">
                  {me.resources.postedThugs > 0 ? (
                    <Row
                      label="Holding turf"
                      value={formatNumber(me.resources.postedThugs)}
                      tooltip="Posted thugs are holding your corners and are not available for this trip."
                    />
                  ) : null}
                  <Row label="They keep" value={`${me.payoutPercent}%`} />
                  <Row label="You keep" value={`${100 - me.payoutPercent}%`} strong />
                  <Row
                    label="Whore happiness"
                    value={`${me.happiness.whore}%`}
                    tooltip="Supplies, protection and payout affect street earnings."
                  />
                  <Row
                    label="Thug happiness"
                    value={`${me.happiness.thug}%`}
                    tooltip="Beer and weapons affect thug happiness."
                  />
                </div>
              </Panel>

              <Panel
                title="Stock on hand"
                aside={<Link to="/game/stores/corner">Corner Store</Link>}
                flush
                className="se-scout-panel"
              >
                <div className="se-scout-metricgrid se-scout-metricgrid--three">
                  <ScoutMetric label="Condoms" value={formatNumber(me.resources.condoms)} />
                  <ScoutMetric label="Beer" value={formatNumber(me.resources.beer)} />
                  <ScoutMetric label="Medicine" value={formatNumber(me.resources.medicine)} />
                </div>
                <div className="se-rows">
                  {me.products ? null : <Row label="Product" value={formatNumber(me.resources.product)} />}
                  <WorkSupplyStockRows jobs={supplyJobs} refreshKey={action.result} />
                </div>
              </Panel>
            </div>

            <div className="se-scout-stack">
              <WorkSupplyPanel
                jobs={supplyJobs}
                turns={turns}
                refreshKey={action.result}
                title="Trip product plan"
              />

              <Panel title="How scouting works" className="se-scout-panel">
                <div className="se-scout-rules">
                  <div>
                    <strong>One trip, two jobs</strong>
                    <span>The girls work the block while you look for new people and whatever else turns up.</span>
                  </div>
                  <div>
                    <strong>Protection matters</strong>
                    <span>Only the muscle that qualifies for this district counts toward street coverage.</span>
                  </div>
                  <div>
                    <strong>The street stays uncertain</strong>
                    <span>Pay and recruits are not posted in advance. Current conditions are revealed by the result.</span>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        </section>

        <ActionDock
          label="Send the crew"
          onSubmit={onSubmit}
          outcome={action.result ? {
            id: action.result,
            title: `${action.result.result.district.name} · ${formatNumber(action.result.result.turnsUsed)} turns`,
            chips: resultChips(action.result, receiptLines!),
            receipt: (
              <>
                <ActionResult
                  title="Scouting Results"
                  subtitle={action.result.result.district.name}
                  result={action.result}
                  lines={receiptLines!}
                />
                {pendingEncounter ? (
                  <Panel title={pendingEncounter.title} className="se-scout-panel">
                    <p className="se-scout-copy">{pendingEncounter.text}</p>
                    {encounterAction.error ? <Alert>{encounterAction.error}</Alert> : null}
                    {encounterAction.result ? (
                      <div className="se-scout-intel__note se-scout-intel__note--good">
                        <strong>{encounterAction.result.result.choiceLabel}</strong>
                        <span>{encounterAction.result.result.text}</span>
                      </div>
                    ) : (
                      <div className="se-actions">
                        {pendingEncounter.choices!.map((choice) => (
                          <Button
                            key={choice.key}
                            type="button"
                            className="se-btn se-btn--secondary"
                            onClick={() => void resolveEncounter(choice.key)}
                            disabledReason={encounterAction.busy ? 'Working that response...' : null}
                          >
                            {choice.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </Panel>
                ) : null}
              </>
            ),
            onDismiss: action.clear,
          } : null}
        >
          <div>
            <span className="se-dock__label">Ready to move</span>
            <strong>
              {selectedDistrict ? selectedDistrict.name : 'Choose a district'}
            </strong>
            <span>
              {chosenTurns > 0 && chosenTurns <= available
                ? `${formatNumber(remainingTurns)} turns left after`
                : `${formatNumber(available)} turns available`}
            </span>
          </div>
          <TurnSpend
            value={turns}
            onChange={setTurns}
            available={available}
            disabled={action.busy}
            disabledReason={action.busy ? 'Your crew is still out on the last job.' : null}
          />
          <Button className="se-btn se-btn--primary" disabledReason={scoutBlock}>
            {action.busy ? 'Working the block...' : action.result ? 'Send again' : 'Send crew scouting'}
          </Button>
        </ActionDock>
      </div>
    </GameLayout>
  );
}
