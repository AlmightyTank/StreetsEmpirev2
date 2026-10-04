import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminLawDto, WantedStageDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AdminRoundPicker, useAdminRound } from '../components/AdminRoundPicker.js';
import { Alert } from '../components/Alert.js';
import { Panel, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';
import { caseSourceName, formatCase, formatCaseDelta, officialTitle, wantedStageName } from '../utils/law.js';

const STAGES: WantedStageDto[] = ['QUIET', 'NOTICED', 'INVESTIGATION', 'WARRANT', 'FEDERAL'];

/** 1.3.0-G. Law health for a round: where Cases sit, recent police activity, and integrity. */
export function AdminLawPage() {
  const { rounds, roundId, setRoundId, error: roundsError } = useAdminRound();
  const [data, setData] = useState<AdminLawDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roundId) return;
    setData(null);
    setError(null);
    adminApi.law(roundId)
      .then(setData)
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load law telemetry.'));
  }, [roundId]);

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Law Operations</h1>
          <p className="se-eyebrow">Admin · Cases, warrants and payroll · private to staff</p>
        </div>
        <AdminRoundPicker rounds={rounds} roundId={roundId} onChange={setRoundId} />
      </div>
      {roundsError || error ? <Alert>{roundsError ?? error}</Alert> : null}
      {!data ? <p className="se-muted">Reading the police files…</p> : !data.enabled ? (
        <Panel title="No Case in this round">
          <p className="se-muted">This round runs {data.rulesetId}, which keeps no Case.</p>
        </Panel>
      ) : (
        <>
          <Panel title="Warrants and payroll" aside={`updated ${adminWhen(data.generatedAt)}`} className="se-mb">
            <div className="se-stats">
              <Stat label="Open warrants" value={formatNumber(data.warrants.open)} />
              <Stat label="Waiting (personal)" value={formatNumber(data.warrants.waiting)} />
              <Stat label="Served · 24h" value={formatNumber(data.warrants.served24h)} />
              <Stat label="Lawyered · quashed · 24h" value={`${formatNumber(data.warrants.lawyered24h)} · ${formatNumber(data.warrants.quashed24h)}`} />
              <Stat label="Officials working" value={formatNumber(Object.values(data.payroll.working).reduce((sum, count) => sum + count, 0))} />
              <Stat label="Under IA · stung 24h" value={`${formatNumber(data.payroll.underInvestigation)} · ${formatNumber(data.payroll.stung24h)}`} />
              <Stat label="Informant tips · 24h" value={formatNumber(data.tips24h)} />
              <Stat label="Staff corrections · 7d" value={formatNumber(data.adjustments7d)} />
            </div>
            {Object.keys(data.payroll.working).length ? (
              <p className="se-hint se-mt">
                On the payroll: {Object.entries(data.payroll.working).map(([role, count]) => `${formatNumber(count)} ${officialTitle(role)}`).join(' · ')}
              </p>
            ) : null}
          </Panel>

          <Panel title="Wanted stages by city" flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>City</th>{STAGES.map((stage) => <th key={stage} className="se-table__number">{wantedStageName(stage)}</th>)}</tr></thead>
                <tbody>{data.stages.length ? data.stages.map((row) => (
                  <tr key={row.citySlug}>
                    <td className="se-td--title">{row.cityName}</td>
                    {STAGES.map((stage) => <td key={stage} data-label={wantedStageName(stage)} className="se-table__number se-num">{formatNumber(row.counts[stage])}</td>)}
                  </tr>
                )) : <tr><td colSpan={STAGES.length + 1} className="se-muted">Nobody has a Case yet.</td></tr>}</tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Highest Cases" className="se-mb">
            {data.highest.length ? <ul className="se-admin-list">{data.highest.map((row) => (
              <li key={`${row.playerId}:${row.cityName}`}>
                <Link className="se-admin-law__link" to={`/game/admin/players/${row.playerId}/law`}>{row.displayName}</Link> · {row.cityName} · {formatCase(row.case)} ({wantedStageName(row.stage)})
              </li>
            ))}</ul> : <p className="se-muted">No open Cases.</p>}
          </Panel>

          <Panel title="Case changes · last 24 hours" flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>Source</th><th className="se-table__number">Receipts</th><th className="se-table__number">Case change</th></tr></thead>
                <tbody>{data.receipts24h.length ? data.receipts24h.map((row) => (
                  <tr key={row.source}>
                    <td className="se-td--title">{caseSourceName(row.source)}</td>
                    <td data-label="Receipts" className="se-table__number se-num">{formatNumber(row.entries)}</td>
                    <td data-label="Case change" className="se-table__number se-num">{formatCaseDelta(row.caseChange)}</td>
                  </tr>
                )) : <tr><td colSpan={3} className="se-muted">No Case changes in this window.</td></tr>}</tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Receipt integrity" flush>
            <p className="se-admin-pad se-hint">
              Every stored Case should equal the sum of its receipts. {formatNumber(data.integrity.checked)} Case{data.integrity.checked === 1 ? '' : 's'} checked.
            </p>
            {data.integrity.mismatches.length ? <ul className="se-admin-list se-admin-pad">{data.integrity.mismatches.map((row) => (
              <li key={`${row.playerId}:${row.cityName}`}>
                <Link className="se-admin-law__link" to={`/game/admin/players/${row.playerId}/law`}>{row.displayName}</Link> · {row.cityName} · stored {formatCase(row.stored)}, receipts {formatCase(row.receipts)}
              </li>
            ))}</ul> : <p className="se-admin-pad se-muted">Every Case adds up.</p>}
          </Panel>
        </>
      )}
    </GameLayout>
  );
}
