import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LawPageDto, WarrantDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { lawApi } from '../api/law.js';
import { useSession } from '../stores/session.js';
import { wantedStageName, wantedStageTone, warrantTargetName } from '../utils/law.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { Button } from './Button.js';
import { InformantSection, PayrollSection } from './LawPayroll.js';
import { formatWhen } from '../utils/time.js';
import { Alert } from './Alert.js';
import { Panel } from './Panel.js';

function warrantStatus(warrant: WarrantDto): { text: string; tone: 'good' | 'warn' | 'bad' } {
  switch (warrant.status) {
    case 'OPEN': return { text: 'Pending', tone: 'bad' };
    case 'WAITING': return { text: 'Waiting for you to return', tone: 'warn' };
    case 'SERVED': return { text: 'Served', tone: 'bad' };
    case 'LAWYERED': return { text: 'Answered by a lawyer', tone: 'good' };
    case 'QUASHED': return { text: 'Quashed by your DA', tone: 'good' };
  }
}

/** A private overview of current police attention and ways to respond. */
export function CasePanel() {
  const me = useSession((s) => s.me);
  const [page, setPage] = useState<LawPageDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lawyerUp = useGameAction<{ warrantId: string; feeCents: number; cityName: string }>();
  const retain = useGameAction<{ feeCents: number; retainedUntil: string }>();
  const quash = useGameAction<{ warrantId: string; cityName: string; quashReadyAt: string }>();
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

  return (
    <Panel title="Case" id="case" aside={wantedStageName(summary.stage)}>
      <p className={`se-heat__status se-${tone}`}>
        {summary.cityName
          ? `${summary.cityName}: police attention is ${wantedStageName(summary.stage).toLowerCase()}.`
          : 'Police attention is low across your cities.'}
      </p>
      <p className="se-hint">
        Risky activity can draw police attention. Keep a low profile, get legal help, or pay an informant for details.
        Only you can see this Case, and it lasts for the round.
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
                  {wantedStageName(row.stage)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {page?.contact ? (
        <div className="se-case__contact">
          <span className="se-eyebrow">{page.contact.role}</span>
          <strong>{page.contact.name}</strong>
          <p className="se-hint">{page.contact.description}</p>
          <Link className="se-btn se-btn--ghost" to="/game/quests">See {page.contact.shortName}&rsquo;s jobs</Link>
        </div>
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
                  {answerable
                    ? <span className="se-hint">This warrant could cost product, money, or time in custody.</span>
                    : !answerable && warrant.outcome
                      ? <span className="se-hint">{warrant.status === 'LAWYERED' ? 'A lawyer handled this warrant.' : warrant.status === 'QUASHED' ? 'Nothing was taken.' : 'This warrant was served.'}</span>
                      : null}
                  {answerable && warrant.quashable ? (
                    <Button
                      type="button"
                      className="se-btn se-btn--primary se-btn--sm"
                      disabledReason={quash.busy ? 'Calling the DA...' : null}
                      onClick={() => void quash.run((actionId) => lawApi.quash(warrant.id, actionId))}
                    >
                      Have the DA quash it
                    </Button>
                  ) : null}
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
          {quash.error ? <Alert>{quash.error}</Alert> : null}
        </>
      ) : null}

      {page?.lawyer ? (
        <div className="se-case__lawyer se-mt">
          <span className="se-hint">
            {page.lawyer.retainedUntil
              ? `A lawyer is on retainer until ${formatWhen(page.lawyer.retainedUntil)} and can soften the penalties from a served warrant.`
              : 'No lawyer on retainer. A lawyer can soften the penalties from a served warrant.'}
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

      {page?.payroll ? <PayrollSection payroll={page.payroll} cashCents={me.resources.cashCents} /> : null}
      {page?.informants ? (
        <InformantSection informants={page.informants} cities={(page.payroll?.cities ?? []).filter((row) => row.slug !== me.city.slug)} cashCents={me.resources.cashCents} />
      ) : null}

    </Panel>
  );
}
