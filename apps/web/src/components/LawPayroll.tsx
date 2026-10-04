import { useState } from 'react';
import type { LawPageDto, OfficialDto, TipDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { lawApi } from '../api/law.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { officialHelp, officialTitle } from '../utils/law.js';
import { formatWhen } from '../utils/time.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';

function officialStatus(official: OfficialDto): { text: string; tone: 'good' | 'warn' | 'bad' } {
  if (official.status === 'STUNG') return { text: 'Stung by Internal Affairs', tone: 'bad' };
  if (official.status === 'CUT') return { text: 'Cut loose', tone: 'warn' };
  if (official.stingAt) return { text: 'Internal Affairs is closing in', tone: 'bad' };
  if (official.status === 'LAPSED') return { text: 'Unpaid: doing nothing', tone: 'warn' };
  return { text: `Paid until ${formatWhen(official.paidUntil)}`, tone: 'good' };
}

/**
 * 1.3.0-D. Corrupt officials: who is on the payroll in which city, how exposed each is, and
 * hiring, paying and cutting them loose. Internal Affairs is shown, never hidden.
 */
export function PayrollSection({ payroll, cashCents }: { payroll: NonNullable<LawPageDto['payroll']>; cashCents: number }) {
  const hire = useGameAction<{ officialId: string; weekCents: number; paidUntil: string }>();
  const pay = useGameAction<{ officialId: string; weekCents: number; paidUntil: string }>();
  const cut = useGameAction<{ officialId: string }>();
  const [city, setCity] = useState(payroll.cities[0]?.slug ?? '');
  const [role, setRole] = useState(payroll.roles[0]?.role ?? 'CAPTAIN');
  const price = payroll.roles.find((row) => row.role === role)?.weekCents ?? 0;
  const busy = hire.busy || pay.busy || cut.busy;
  const error = hire.error ?? pay.error ?? cut.error;

  return (
    <>
      <p className="se-eyebrow se-mt">Payroll</p>
      {payroll.officials.length ? (
        <ul className="se-case__cities">
          {payroll.officials.map((official) => {
            const status = officialStatus(official);
            const onBooks = official.status === 'ACTIVE' || official.status === 'LAPSED';
            return (
              <li key={official.id} className="se-case__city">
                <div className="se-case__cityhead">
                  <span>
                    <strong>{officialTitle(official.role)}</strong>
                    <span className="se-muted"> · {official.cityName}</span>
                  </span>
                  <span className={`se-${status.tone}`}>{status.text}</span>
                </div>
                {onBooks ? (
                  <>
                    <span className="se-hint">
                      Favors can draw attention from Internal Affairs.
                    </span>
                    <div className="se-case__actions">
                      <Button
                        type="button"
                        className="se-btn se-btn--ghost se-btn--sm"
                        disabledReason={busy ? 'Working...' : official.weekCents > cashCents ? 'You cannot cover another week.' : null}
                        onClick={() => void pay.run((actionId) => lawApi.payWeek(official.id, actionId))}
                      >
                        Pay a week · {formatCents(official.weekCents)}
                      </Button>
                      <Button
                        type="button"
                        className={`se-btn se-btn--sm ${official.stingAt ? 'se-btn--primary' : 'se-btn--ghost'}`}
                        disabledReason={busy ? 'Working...' : null}
                        onClick={() => void cut.run((actionId) => lawApi.cut(official.id, actionId))}
                      >
                        Cut loose
                      </Button>
                    </div>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="se-hint">Nobody is on the payroll. Hiring an official can draw attention from Internal Affairs.</p>
      )}
      <div className="se-case__hire">
        <select className="se-input" aria-label="City" value={city} onChange={(event) => setCity(event.target.value)}>
          {payroll.cities.map((row) => <option key={row.slug} value={row.slug}>{row.name}</option>)}
        </select>
        <select className="se-input" aria-label="Official" value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
          {payroll.roles.map((row) => <option key={row.role} value={row.role}>{officialTitle(row.role)}</option>)}
        </select>
        <Button
          type="button"
          className="se-btn se-btn--ghost se-btn--sm"
          disabledReason={busy ? 'Working...' : !city ? 'Pick a city.' : price > cashCents ? 'You cannot cover a week of them.' : null}
          onClick={() => void hire.run((actionId) => lawApi.hire(city, role, actionId))}
        >
          Hire · {formatCents(price)} a week
        </Button>
      </div>
      <p className="se-hint">{officialHelp(role)}</p>
      {error ? <Alert>{error}</Alert> : null}
    </>
  );
}

function tipText(tip: TipDto): string {
  const p = tip.payload;
  if (tip.kind === 'SWEEP') return `The Feds sweep ${String(p.cityName ?? 'a city')} ${formatWhen(String(p.sweepAt))}. It goes public ${formatWhen(String(p.publicAt))}.`;
  const law = p.law as { blurb?: string; caseSpeed?: number; coolingSpeed?: number; warningHoursMultiplier?: number } | undefined;
  const pace = law ? ` ${law.blurb ?? ''} Cases build ${formatNumber(law.caseSpeed ?? 1)}×, cool ${formatNumber(law.coolingSpeed ?? 1)}×, warrants warn ${formatNumber(law.warningHoursMultiplier ?? 1)}× as long.` : '';
  return `${String(p.cityName ?? 'That city')}: take drag from ${formatNumber(Number(p.dragStartsAt))} Heat, busts from ${formatNumber(Number(p.bustStartsAt))}, arrests from ${formatNumber(Number(p.arrestStartsAt))}; busts hit ${formatNumber(Number(p.bustSeverity))}× as hard; police pressure ${formatNumber(Number(p.policePressure))}×.${pace}`;
}

/** 1.3.0-D. Informants: information for cash, never protection. */
export function InformantSection({ informants, cities, cashCents }: { informants: NonNullable<LawPageDto['informants']>; cities: Array<{ slug: string; name: string }>; cashCents: number }) {
  const tip = useGameAction<TipDto>();
  const [city, setCity] = useState(cities[0]?.slug ?? '');

  return (
    <>
      <p className="se-eyebrow se-mt">Informants</p>
      <div className="se-case__hire">
        <Button
          type="button"
          className="se-btn se-btn--ghost se-btn--sm"
          disabledReason={tip.busy ? 'Asking around...' : informants.sweepCents > cashCents ? 'You cannot pay the informant.' : null}
          onClick={() => void tip.run((actionId) => lawApi.tip('SWEEP', undefined, actionId))}
        >
          The federal sweep · {formatCents(informants.sweepCents)}
        </Button>
      </div>
      <div className="se-case__hire">
        <select className="se-input" aria-label="City to ask about" value={city} onChange={(event) => setCity(event.target.value)}>
          {cities.map((row) => <option key={row.slug} value={row.slug}>{row.name}</option>)}
        </select>
        <Button
          type="button"
          className="se-btn se-btn--ghost se-btn--sm"
          disabledReason={tip.busy ? 'Asking around...' : !city ? 'Pick a city.' : informants.cityCents > cashCents ? 'You cannot pay the informant.' : null}
          onClick={() => void tip.run((actionId) => lawApi.tip('CITY', city, actionId))}
        >
          How their police work · {formatCents(informants.cityCents)}
        </Button>
      </div>
      {tip.error ? <Alert>{tip.error}</Alert> : null}
      {informants.tips.length ? (
        <ul className="se-case__tips">
          {informants.tips.map((row) => <li key={row.id} className="se-hint">{tipText(row)}</li>)}
        </ul>
      ) : <p className="se-hint">A tip is information, never protection: it changes nobody’s Case.</p>}
    </>
  );
}
