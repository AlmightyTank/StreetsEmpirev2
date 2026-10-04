import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AdminLawPlayerDto } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';
import { caseSourceName, formatCase, formatCaseDelta, officialTitle, wantedStageName, warrantTargetName } from '../utils/law.js';

/**
 * 1.3.0-G. One player's Case as they see it, and an audited correction to one city's Case.
 * A correction is written as a receipt the player can see, and never drafts a warrant.
 */
export function AdminLawPlayerPage() {
  const { roundPlayerId = '' } = useParams();
  const [data, setData] = useState<AdminLawPlayerDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [citySlug, setCitySlug] = useState('');
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    adminApi.playerLaw(roundPlayerId)
      .then(setData)
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load this player’s Case.'));
  }, [roundPlayerId]);

  const page = data?.page ?? null;
  const cities = data?.cities ?? [];
  const value = Number(points);
  const valueReady = points.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= (page?.caseMax ?? 100);
  const block = busy ? 'Saving…'
    : !citySlug ? 'Choose a city.'
      : !valueReady ? `Enter a Case from 0 to ${page?.caseMax ?? 100}.`
        : reason.trim().length < 5 ? 'Write a reason of at least 5 characters.'
          : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (block) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const updated = await adminApi.adjustPlayerCase(roundPlayerId, { citySlug, points: value, reason: reason.trim() });
      setData(updated);
      setSaved(`Case in ${cities.find((city) => city.slug === citySlug)?.name ?? citySlug} set to ${formatCase(value)}.`);
      setPoints('');
      setReason('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not correct the Case.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">{data ? `${data.displayName} · Case` : 'Player Case'}</h1>
          <p className="se-eyebrow">Admin · private to the player and staff{data ? ` · ${data.roundName}` : ''}</p>
        </div>
        <Link className="se-btn se-btn--ghost" to={`/game/admin/players/${roundPlayerId}`}>Back to player</Link>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {!data ? <p className="se-muted">Reading the file…</p> : !page ? (
        <Panel title="No Case in this round"><p className="se-muted">This round keeps no Case.</p></Panel>
      ) : (
        <>
          <Panel title="Cases by city" flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>City</th><th className="se-table__number">Case</th><th>Stage</th><th>Cooling</th></tr></thead>
                <tbody>{page.cases.length ? page.cases.map((row) => (
                  <tr key={row.citySlug}>
                    <td className="se-td--title">{row.cityName}{row.isHome ? ' (home)' : ''}</td>
                    <td data-label="Case" className="se-table__number se-num">{formatCase(row.case)}</td>
                    <td data-label="Stage">{wantedStageName(row.stage)}</td>
                    <td data-label="Cooling">{row.cooling ? `${formatCase(row.cooling.perHour)}/h from ${adminWhen(row.cooling.startsAt)}` : '—'}</td>
                  </tr>
                )) : <tr><td colSpan={4} className="se-muted">No Case anywhere.</td></tr>}</tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Correct a Case" className="se-mb">
            <form className="se-form" onSubmit={onSubmit}>
              <label className="se-label" htmlFor="admin-case-city">City</label>
              <select id="admin-case-city" className="se-input" value={citySlug} onChange={(event) => setCitySlug(event.target.value)}>
                <option value="">Choose a city</option>
                {cities.map((city) => <option key={city.slug} value={city.slug}>{city.name}</option>)}
              </select>
              <label className="se-label" htmlFor="admin-case-points">New Case (0–{page.caseMax})</label>
              <input id="admin-case-points" className="se-input" inputMode="decimal" type="number" min={0} max={page.caseMax} step={0.5} value={points} onChange={(event) => setPoints(event.target.value)} />
              <label className="se-label" htmlFor="admin-case-reason">Reason</label>
              <textarea id="admin-case-reason" className="se-input se-admin-reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
              <p className="se-hint">Sets the Case exactly. The player sees a “Corrected by staff” receipt. A correction never drafts a warrant, sends a stage alert or counts toward a Job, and it is written to the audit log.</p>
              <Button className="se-btn se-btn--primary" disabledReason={block}>{busy ? 'Saving…' : 'Set Case'}</Button>
              {saved ? <p className="se-hint se-good">{saved}</p> : null}
            </form>
          </Panel>

          <Panel title="Warrants" className="se-mb">
            {page.warrants.length ? <ul className="se-admin-list">{page.warrants.map((warrant) => (
              <li key={warrant.id}>
                {warrant.cityName} · {warrantTargetName(warrant.target)} · {warrant.status.toLowerCase()} · {warrant.resolvedAt ? `resolved ${adminWhen(warrant.resolvedAt)}` : `serves ${adminWhen(warrant.servesAt)}`}
              </li>
            ))}</ul> : <p className="se-muted">No warrants.</p>}
          </Panel>

          {page.payroll ? (
            <Panel title="Payroll" className="se-mb">
              {page.payroll.officials.length ? <ul className="se-admin-list">{page.payroll.officials.map((official) => (
                <li key={official.id}>
                  {official.cityName} · {officialTitle(official.role)} · {official.status.toLowerCase()}{official.iaOpenedAt ? ' · under Internal Affairs' : ''}
                </li>
              ))}</ul> : <p className="se-muted">No officials.</p>}
            </Panel>
          ) : null}

          <Panel title="Latest receipts" flush>
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>When</th><th>City</th><th>Source</th><th className="se-table__number">Change</th><th className="se-table__number">After</th></tr></thead>
                <tbody>{page.receipts.length ? page.receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td data-label="When">{adminWhen(receipt.at)}</td>
                    <td data-label="City">{receipt.cityName}</td>
                    <td className="se-td--title">{caseSourceName(receipt.source)}</td>
                    <td data-label="Change" className="se-table__number se-num">{formatCaseDelta(receipt.added)}</td>
                    <td data-label="After" className="se-table__number se-num">{formatCase(receipt.caseAfter)}</td>
                  </tr>
                )) : <tr><td colSpan={5} className="se-muted">No receipts.</td></tr>}</tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </GameLayout>
  );
}
