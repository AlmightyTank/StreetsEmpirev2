import { useEffect, useState } from 'react';
import type { AllianceBalanceCellDto, AllianceBalanceDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { ApiError, api } from '../api/client.js';
import { Alert } from './Alert.js';
import { Panel, Row } from './Panel.js';

function rate(cell: AllianceBalanceCellDto): string {
  return cell.attackerWinPercent === null ? 'no battles' : `${cell.attackerWinPercent}% of ${formatNumber(cell.battles)}`;
}

/** 0.3.0-E. The live balance numbers for an alliance round: who wins raids, and who holds the top. */
export function AdminAllianceBalancePanel({ roundId }: { roundId: string }) {
  const [report, setReport] = useState<AllianceBalanceDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<AllianceBalanceDto>(`/admin/rounds/${encodeURIComponent(roundId)}/alliance-balance`).then(setReport).catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Could not load the alliance balance report.');
    });
  }, [roundId]);

  if (report && !report.alliancesEnabled) return null;
  const battles = report?.battles;

  return (
    <Panel title="Alliance balance" aside="Attacker win rates" className="se-mt">
      {error ? <Alert>{error}</Alert> : null}
      {!report ? <p className="se-muted">Crunching battles...</p> : null}
      {report && battles ? (
        <div className="se-grid se-grid--2">
          <div className="se-rows">
            <Row label="Solo into solo" value={rate(battles.soloIntoSolo)} />
            <Row label="Solo into alliance member" value={rate(battles.soloIntoAlliance)} strong />
            <Row label="Alliance member into solo" value={rate(battles.allianceIntoSolo)} strong />
            <Row label="Alliance into alliance" value={rate(battles.allianceIntoAlliance)} />
            <Row label="Revenge hits" value={rate(battles.revenge)} />
            <Row label="With own / ally / no recon" value={`${rate(battles.withOwnIntel)} · ${rate(battles.withAllyIntel)} · ${rate(battles.withoutIntel)}`}
              tooltip="Battles from before 0.3.0-E did not record intel or the attacker's alliance, so they count as solo attackers without recon." />
          </div>
          <div className="se-rows">
            <Row label="Players in alliances" value={`${formatNumber(report.players.inAlliances)} / ${formatNumber(report.players.total)}`} />
            <Row label={`Top ${report.standings.topCount} in alliances`} value={formatNumber(report.standings.topInAlliances)} strong />
            <Row label="Median net worth: solo / member" value={`${formatCents(report.standings.medianSoloNetWorthCents)} / ${formatCents(report.standings.medianMemberNetWorthCents)}`} />
            {report.standings.alliances.slice(0, 5).map((row) => (
              <Row key={row.tag} label={`[${row.tag}] ${row.name}`} value={`${row.netWorthSharePercent}% of all worth · ${row.inTopCount} in top`} />
            ))}
          </div>
        </div>
      ) : null}
      <p className="se-hint se-mt">Full report from a terminal: <code>npm run qa:alliance-balance -- --round {'<slug>'}</code></p>
    </Panel>
  );
}
