import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { DistrictDto, ScoutResult } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { actionsApi } from '../api/actions.js';
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

  const [districts, setDistricts] = useState<DistrictDto[]>([]);
  const [district, setDistrict] = useState<string>('');
  const [turns, setTurns] = useState<number | ''>(13);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Refetched whenever the crew changes, because the visible coverage on offer
  // depends on how many people and armed fit thugs the player has available.
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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canScout || typeof turns !== 'number') return;

    await action.run((actionId) => actionsApi.scout({ district, turns, actionId }));
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

          <div className="se-scout-hero__readout">
            <span>
              <small>Turns ready</small>
              <strong>{formatNumber(me.turns.turns)}</strong>
            </span>
            <span>
              <small>Street crew</small>
              <strong>{formatNumber(me.resources.whores)}</strong>
            </span>
            <span>
              <small>Fit muscle</small>
              <strong>{formatNumber(me.resources.fitThugs)}</strong>
            </span>
          </div>
        </header>

        {loadError ? <Alert>{loadError}</Alert> : null}
        {action.error ? <Alert>{action.error}</Alert> : null}

        {action.result ? (
          <section className="se-scout-result" aria-label="Latest scouting result">
            <div className="se-scout-sectionhead">
              <div>
                <span className="se-eyebrow">Trip complete</span>
                <h2>Latest street receipt</h2>
              </div>
              <span className="se-scout-sectionhead__meta">{action.result.result.district.name}</span>
            </div>
            <ActionResult
              title="Scouting Results"
              subtitle={action.result.result.district.name}
              onDismiss={action.clear}
              result={action.result}
              lines={scoutReceiptLines(action.result, me)}
            />
          </section>
        ) : null}

        <form className="se-scout-plan" onSubmit={onSubmit}>
          <section className="se-scout-plan__main">
            <div className="se-scout-sectionhead">
              <div>
                <span className="se-eyebrow">Step 1</span>
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

            <div className="se-scout-turns">
              <div className="se-scout-sectionhead">
                <div>
                  <span className="se-eyebrow">Step 2</span>
                  <h2>Set the shift</h2>
                </div>
                <span className="se-scout-sectionhead__meta">
                  {chosenTurns > 0 ? `${formatNumber(chosenTurns)} turns` : 'Choose turns'}
                </span>
              </div>

              <TurnSpend
                value={turns}
                onChange={setTurns}
                available={available}
                disabled={action.busy}
                disabledReason={action.busy ? 'Your crew is still out on the last job.' : null}
              />
            </div>

            <div className="se-scout-launch">
              <div className="se-scout-launch__summary">
                <span className="se-scout-launch__label">Ready to move</span>
                <strong>
                  {selectedDistrict
                    ? `${selectedDistrict.name} · ${formatNumber(chosenTurns)} turn${chosenTurns === 1 ? '' : 's'}`
                    : 'Choose a district'}
                </strong>
                <span>
                  {chosenTurns > 0
                    ? `${formatNumber(remainingTurns)} turns remain after this trip.`
                    : `${formatNumber(available)} turns available.`}
                </span>
              </div>
              <Button className="se-btn se-btn--primary se-scout-launch__button" disabledReason={scoutBlock}>
                {action.busy ? 'Working the block...' : 'Send crew scouting'}
              </Button>
            </div>
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
                  <div className="se-scout-intel__bar" aria-label={`${coveredPercent}% of the street crew covered`}>
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
        </form>

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
                <div className="se-scout-metricgrid">
                  <ScoutMetric label="Condoms" value={formatNumber(me.resources.condoms)} />
                  <ScoutMetric label="Beer" value={formatNumber(me.resources.beer)} />
                  <ScoutMetric label="Medicine" value={formatNumber(me.resources.medicine)} />
                  <ScoutMetric label="Cash" value={formatCents(me.resources.cashCents)} tone="accent" />
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
      </div>
    </GameLayout>
  );
}
