import { useEffect, useState } from 'react';
import '../styles/admin.css';
import { Link } from 'react-router-dom';
import type { EmpireInsightsDto, EmpireInsightsRoundDto, InsightMetricDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { insightsApi } from '../api/insights.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { formatDate } from '../utils/time.js';

const LABELS: Record<string, string> = { turnsWorked: 'Turns worked', streetEarningsCents: 'Street earnings', recruitsFound: 'Recruits found', peakCrew: 'Peak crew', raidsWon: 'Raids won', raidsLost: 'Raids lost', defensesHeld: 'Defenses held', defensesLost: 'Defenses lost', driveBysLanded: 'Drive-bys landed', thugsDefeated: 'Thugs defeated', cashStolenCents: 'Cash stolen', biggestRaidCents: 'Biggest raid', blocksCaptured: 'Blocks captured', blocksLost: 'Blocks lost', blockHours: 'Block hours', citiesControlled: 'Cities controlled', runsCompleted: 'Runs completed', driveHours: 'Drive hours', cargoMoved: 'Cargo moved', convoyAttacksWon: 'Convoy attacks won', productProduced: 'Product produced', productSold: 'Product sold', largestTransactionCents: 'Largest transaction', traderReputation: 'Trader reputation', businessBuilds: 'Business builds', businessIncomeCents: 'Business income', racketsStarted: 'Rackets started', launderedHeat: 'Heat laundered', businessesTorched: 'Businesses torched', blockWarsDeclared: 'Block wars declared', blockWarAttackWins: 'Block war attack wins', blockWarDefenseWins: 'Block war defense wins', blockWarTakes: 'Block war takes', blockWarSacks: 'Block war sacks', casinoRatedWagers: 'Rated wagers', casinoTheoCents: 'Casino theo', casinoCitiesPlayed: 'Casino cities', casinoVipWagers: 'VIP wagers', casinoCompsCents: 'Comps', casinoJackpots: 'Jackpots', casinoBiggestWinCents: 'Biggest win', lawSeason: 'Law activity', lawPeakStage: 'Peak wanted stage', lawWarrantsServed: 'Warrants served', factionsConnected: 'Factions connected', factionsInnerCircle: 'Inner Circle factions' };
const MONEY = new Set(['streetEarningsCents', 'cashStolenCents', 'biggestRaidCents', 'largestTransactionCents', 'businessIncomeCents', 'casinoTheoCents', 'casinoCompsCents', 'casinoBiggestWinCents']);
function display(key: string, metric: InsightMetricDto): string { return metric.value === null ? 'Not recorded' : MONEY.has(key) ? formatCents(metric.value) : formatNumber(metric.value); }
const TREND_METRICS = [
  ['streetEarningsCents', 'Street earnings'],
  ['peakCrew', 'Peak crew'],
  ['blocksCaptured', 'Blocks captured'],
  ['casinoTheoCents', 'Casino theo'],
] as const;
function RecordedTrends({ rounds }: { rounds: EmpireInsightsRoundDto[] }) {
  return <Panel title="Recorded trends" subtitle="Actual round snapshots only; unavailable rounds are not estimated.">
    <div className="se-grid-2 se-insights-trends">{TREND_METRICS.map(([key, label]) => {
      const points = rounds.map((round) => ({ round, metric: Object.values(round.metrics).flatMap((group) => Object.entries(group)).find(([name]) => name === key)?.[1] as InsightMetricDto | undefined })).filter((point) => point.metric?.value !== null && point.metric !== undefined);
      const maximum = Math.max(...points.map((point) => point.metric!.value!), 0);
      return <section key={key}><h3>{label}</h3>{points.length === 0 ? <p className="se-muted">Not recorded</p> : <div className="se-insights-bars">{points.map(({ round, metric }) => <div className="se-insights-bar" key={`${key}-${round.id}`}><span className="se-insights-bar__label">{round.name}</span><span className="se-insights-bar__track" role="img" aria-label={`${round.name}: ${display(key, metric!)}`}><span style={{ width: `${maximum > 0 ? Math.max(3, metric!.value! / maximum * 100) : 3}%` }} /></span><strong>{display(key, metric!)}</strong></div>)}</div>}</section>;
    })}</div>
  </Panel>;
}
function RoundInsights({ round }: { round: EmpireInsightsRoundDto }) {
  return <Panel title={round.name} subtitle={`${formatDate(round.startsAt)} – ${formatDate(round.endsAt)} · ${round.status === 'ENDED' || round.status === 'ARCHIVED' ? 'Past round' : 'Current round'}`}>
    <div className="se-grid-2">{Object.entries(round.metrics).map(([group, values]) => <section key={group}><h3>{group[0]!.toUpperCase() + group.slice(1)}</h3>{Object.entries(values).map(([key, value]) => <Row key={key} label={LABELS[key] ?? key} value={<span className={value.status === 'NOT_RECORDED' ? 'se-muted' : undefined}>{display(key, value)}</span>} />)}</section>)}</div>
  </Panel>;
}
export function EmpireInsightsPage() {
  const [data, setData] = useState<EmpireInsightsDto | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { let live = true; void insightsApi.get().then((value) => { if (live) setData(value); }).catch((e: unknown) => { if (live) setError(e instanceof ApiError ? e.message : 'Could not load insights.'); }); return () => { live = false; }; }, []);
  function exportCsv() { if (!data) return; const rows = ['round,group,metric,value,status']; for (const round of data.rounds) for (const [group, values] of Object.entries(round.metrics)) for (const [key, value] of Object.entries(values)) rows.push([round.name, group, LABELS[key] ?? key, value.value ?? '', value.status].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')); const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'my-empire-insights.csv'; a.click(); URL.revokeObjectURL(url); }
  return <GameLayout><div className="se-page"><div className="se-pagehead"><div><span className="se-eyebrow">Private supporter dashboard</span><h1>My Empire Insights</h1><p className="se-muted">Your trusted round history, grouped for quick reference. This page never includes another player’s telemetry or changes gameplay.</p></div><button type="button" className="se-btn se-btn--ghost" onClick={exportCsv} disabled={!data}>Export CSV</button></div>{error ? <Alert tone="error">{error} <Link to="/game/supporter">Manage support</Link></Alert> : null}{!data && !error ? <Panel title="Loading insights" loading><span /></Panel> : null}{data?.rounds.length === 0 ? <Panel title="No round history"><p>No round data is recorded for this account yet.</p></Panel> : null}{data && data.rounds.length > 0 ? <RecordedTrends rounds={data.rounds} /> : null}{data?.rounds.map((round) => <RoundInsights key={round.id} round={round} />)}</div></GameLayout>;
}
