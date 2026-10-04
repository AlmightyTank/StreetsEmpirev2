import { useEffect, useState } from 'react';
import type { LawPageDto, WarrantDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { lawApi } from '../api/law.js';
import { useSession } from '../stores/session.js';
import { caseSourceName, formatCase, formatCaseDelta, wantedStageBlurb, wantedStageName, wantedStageTone, warrantTargetName } from '../utils/law.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { Button } from './Button.js';
import { formatWhen } from '../utils/time.js';
import { Alert } from './Alert.js';
import { Panel } from './Panel.js';

/** "Cooling 0.5 an hour", or when it will start if the player stays quiet. */
function coolingText(cooling: { startsAt: string; perHour: number }): string {
  return new Date(cooling.startsAt).getTime() <= Date.now()
    ? `Cooling ${formatNumber(cooling.perHour)} an hour`
    : `Cools from ${formatWhen(cooling.startsAt)} if you stay quiet`;
}

/** What a warrant takes, or took: "120 product, $4,500 fine, racket shut 12h". */
function takeText(take: { seized?: unknown; fineCents?: unknown; registerFineCents?: unknown; shutHours?: unknown; shutUntil?: unknown; lockMinutes?: unknown; lockedUntil?: unknown; capped?: unknown }): string {
  const units = Object.values((take.seized ?? {}) as Record<string, number>).reduce((sum, value) => sum + value, 0);
  const parts = [
    units > 0 ? `${formatNumber(units)} product` : '',
    Number(take.fineCents ?? 0) > 0 ? `${formatCents(Number(take.fineCents))} fine` : '',
    Number(take.registerFineCents ?? 0) > 0 ? `${formatCents(Number(take.registerFineCents))} off the register` : '',
    Number(take.shutHours ?? 0) > 0 ? `racket shut ${formatNumber(Number(take.shutHours))}h` : '',
    typeof take.shutUntil === 'string' ? `racket shut until ${formatWhen(take.shutUntil)}` : '',
    Number(take.lockMinutes ?? 0) > 0 ? `locked up ${formatNumber(Math.round(Number(take.lockMinutes) / 6) / 10)}h` : '',
    typeof take.lockedUntil === 'string' ? `locked up until ${formatWhen(take.lockedUntil)}` : '',
    take.capped ? 'held to the daily cap' : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'nothing exposed right now';
}

function warrantStatus(warrant: WarrantDto): { text: string; tone: 'good' | 'warn' | 'bad' } {
  switch (warrant.status) {
    case 'OPEN': return { text: `Serves ${formatWhen(warrant.servesAt)}`, tone: 'bad' };
    case 'WAITING': return { text: 'Waiting for the boss to come to town', tone: 'warn' };
    case 'SERVED': return { text: `Served ${formatWhen(warrant.resolvedAt ?? warrant.servesAt)}`, tone: 'bad' };
    case 'LAWYERED': return { text: 'Answered by a lawyer', tone: 'good' };
  }
}

/** How many receipts show before "Show all". */
const RECEIPTS_SHOWN = 6;

/**
 * 1.3.0-A. "What they have on you": the player's Case in every city they have drawn Heat in,
 * read as a Wanted stage, with the receipts that built it. Private and read-only; nothing in
 * the game acts on the Case yet, and Heat works exactly as before.
 */
export function CasePanel() {
  const me = useSession((s) => s.me);
  const [page, setPage] = useState<LawPageDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const lawyerUp = useGameAction<{ warrantId: string; feeCents: number; cityName: string }>();
  const retain = useGameAction<{ feeCents: number; retainedUntil: string }>();
  const summary = me?.law;
  // Any action, settle or new Case can change the page; refetch when the player moves.
  const refreshKey = summary ? `${summary.case}|${me?.heat?.heat ?? 0}|${me?.lastActiveAt ?? ''}` : null;

  useEffect(() => {
    if (!refreshKey) return;
    let cancelled = false;
    lawApi.page()
      .then((next) => { if (!cancelled) { setPage(next); setError(null); } })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : 'Could not load your Case.');
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (!me || !summary) return null;

  const tone = wantedStageTone(summary.stage);
  const receipts = page ? (showAll ? page.receipts : page.receipts.slice(0, RECEIPTS_SHOWN)) : [];

  return (
    <Panel title="Case" id="case" aside={wantedStageName(summary.stage)}>
      <p className={`se-heat__status se-${tone}`}>
        {summary.cityName
          ? `${summary.cityName}: ${wantedStageName(summary.stage)}. ${wantedStageBlurb(summary.stage)}`
          : 'Quiet everywhere. No city has a file on you.'}
      </p>
      <p className="se-hint">
        {page
          ? `A ${Math.round(page.heatToCase * 100)}% share of the Heat you draw in a city builds a Case there. `
          : ''}
        {page?.evidence
          ? `Busts, arrests, road stops, torches, sacks and hits on runs add evidence of their own. `
          : ''}
        {page?.currencyReport
          ? `Every ${formatCents(page.currencyReport.thresholdCents)} you move in a city in a day files a currency report. `
          : ''}
        {page?.cooling
          ? `A Case cools ${formatNumber(page.cooling.decayPerHour)} an hour once you have done nothing there for ${formatNumber(page.cooling.quietHours)} hours. `
          : ''}
        {page?.laundering ? 'Laundering washes the Case in its own city. ' : ''}
        Only you can see this. It lasts the round and stays in the city it was built in.
      </p>

      {error ? <Alert>{error}</Alert> : null}

      {page && page.cases.length ? (
        <ul className="se-case__cities">
          {page.cases.map((row) => (
            <li key={row.citySlug} className="se-case__city">
              <div className="se-case__cityhead">
                <span>
                  <strong>{row.cityName}</strong>
                  {row.isHome ? <span className="se-muted"> · home</span> : null}
                </span>
                <span className={`se-${wantedStageTone(row.stage)}`}>
                  {wantedStageName(row.stage)} · {formatCase(row.case)}
                </span>
              </div>
              <div className="se-meter se-heat__meter" aria-hidden="true">
                <div
                  className={`se-meter__fill${wantedStageTone(row.stage) === 'bad' ? ' se-meter__fill--bad' : wantedStageTone(row.stage) === 'warn' ? ' se-meter__fill--warn' : ''}`}
                  style={{ width: `${Math.min(100, (row.case / page.caseMax) * 100)}%` }}
                />
              </div>
              <span className="se-hint">
                {row.next
                  ? `${formatCase(Math.max(0, row.next.startsAt - row.case))} more to ${wantedStageName(row.next.stage)}`
                  : 'The top of the ladder'}
                {row.cooling ? ` · ${coolingText(row.cooling)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {page ? (
        <p className="se-hint">
          Ladder: {page.stages.filter((stage) => stage.stage !== 'QUIET').map((stage) => `${wantedStageName(stage.stage)} ${formatNumber(stage.startsAt)}`).join(' · ')}, out of {formatNumber(page.caseMax)}.
        </p>
      ) : null}

      {page && page.warrants.length ? (
        <>
          <p className="se-eyebrow se-mt">Warrants</p>
          <ul className="se-case__cities">
            {page.warrants.map((warrant) => {
              const status = warrantStatus(warrant);
              const answerable = warrant.status === 'OPEN' || warrant.status === 'WAITING';
              const fee = warrant.lawyerUpCents ?? 0;
              return (
                <li key={warrant.id} className="se-case__city">
                  <div className="se-case__cityhead">
                    <span>
                      <strong>{warrantTargetName(warrant.target)}</strong>
                      <span className="se-muted"> · {warrant.cityName}{warrant.businessName ? ` · ${warrant.businessName}` : ''}</span>
                    </span>
                    <span className={`se-${status.tone}`}>{status.text}</span>
                  </div>
                  <span className="se-hint">
                    {answerable && warrant.atRisk ? `At risk: ${takeText(warrant.atRisk)}.` : null}
                    {!answerable && warrant.outcome ? (warrant.status === 'LAWYERED' ? `Fee ${formatCents(Number(warrant.outcome.feeCents ?? 0))}.` : `Took ${takeText(warrant.outcome)}.`) : null}
                  </span>
                  {answerable && warrant.lawyerUpCents !== null ? (
                    <Button
                      type="button"
                      className="se-btn se-btn--ghost se-btn--sm"
                      disabledReason={lawyerUp.busy ? 'Calling the lawyer...' : fee > me.resources.cashCents ? 'You cannot cover the lawyer.' : null}
                      onClick={() => void lawyerUp.run((actionId) => lawApi.lawyerUp(warrant.id, actionId))}
                    >
                      Lawyer up {formatCents(fee)}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {lawyerUp.error ? <Alert>{lawyerUp.error}</Alert> : null}
        </>
      ) : null}

      {page?.lawyer ? (
        <div className="se-case__lawyer se-mt">
          <span className="se-hint">
            {page.lawyer.retainedUntil
              ? `A lawyer is on retainer until ${formatWhen(page.lawyer.retainedUntil)}: seizures and fines ${Math.round(page.lawyer.seizureCut * 100)}% lighter, lock-ups ${Math.round(page.lawyer.downtimeCut * 100)}% shorter. `
              : `No lawyer on retainer. One makes a served warrant's seizures and fines ${Math.round(page.lawyer.seizureCut * 100)}% lighter and its lock-up ${Math.round(page.lawyer.downtimeCut * 100)}% shorter. `}
            {page.dailyLoss ? `Police have taken ${formatCents(page.dailyLoss.lostTodayCents)} of today's ${formatCents(page.dailyLoss.capCents)} cap.` : ''}
          </span>
          <Button
            type="button"
            className="se-btn se-btn--ghost se-btn--sm"
            disabledReason={retain.busy ? 'Hiring...' : page.lawyer.retainerCents > me.resources.cashCents ? 'You cannot cover the retainer.' : null}
            onClick={() => void retain.run((actionId) => lawApi.retain(actionId))}
          >
            {page.lawyer.retainedUntil ? 'Extend' : 'Retain'} {formatNumber(page.lawyer.days)} days · {formatCents(page.lawyer.retainerCents)}
          </Button>
          {retain.error ? <Alert>{retain.error}</Alert> : null}
        </div>
      ) : null}

      {receipts.length ? (
        <>
          <p className="se-eyebrow se-mt">What they have on you</p>
          <div className="se-rows">
            {receipts.map((receipt) => (
              <div className="se-row" key={receipt.id}>
                <span className="se-row__label">
                  {caseSourceName(receipt.source)}
                  <span className="se-muted"> · {receipt.cityName} · {formatWhen(receipt.at)}</span>
                </span>
                <span className={`se-row__value${receipt.added < 0 ? ' se-good' : ''}`}>{formatCaseDelta(receipt.added)}</span>
              </div>
            ))}
          </div>
          {page && page.receipts.length > RECEIPTS_SHOWN ? (
            <button type="button" className="se-btn se-btn--ghost se-btn--sm se-mt" onClick={() => setShowAll((value) => !value)}>
              {showAll ? 'Show fewer' : `Show the last ${formatNumber(page.receipts.length)}`}
            </button>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}
