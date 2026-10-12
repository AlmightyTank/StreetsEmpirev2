import { useCallback, useEffect, useState } from 'react';
import type { AdminNpcTelemetryDto, AdminNpcTelemetryWindow } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel, Row } from './Panel.js';

const WINDOWS: Array<{ key: AdminNpcTelemetryWindow; label: string }> = [
  { key: '24h', label: '24 hours' },
  { key: '7d', label: '7 days' },
  { key: 'season', label: 'Season' },
];

const percent = (value: number | null) => (value === null ? '-' : `${Math.round(value * 1000) / 10}%`);
const words = (key: string) => key.toLowerCase().replace(/_/g, ' ');

function Counts({ title, counts }: { title: string; counts: Record<string, number> }) {
  const rows = Object.entries(counts).sort((left, right) => right[1] - left[1]);
  if (!rows.length) return null;
  return (
    <>
      <h3 className="se-mt">{title}</h3>
      <p className="se-hint">{rows.map(([key, value]) => `${words(key)} ${formatNumber(value)}`).join(' · ')}</p>
    </>
  );
}

/**
 * Phase P. Measured NPC balance over 24 hours, 7 days or the season: attack rate per
 * active human, win rates, what moved between humans and NPC crews, bounties, and the
 * scheduler's blocked reasons and dogpile skips.
 */
export function AdminNpcTelemetryPanel() {
  const [window, setWindow] = useState<AdminNpcTelemetryWindow>('7d');
  const [data, setData] = useState<AdminNpcTelemetryDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (next: AdminNpcTelemetryWindow) => {
    setError(null);
    try {
      setData(await adminApi.npcTelemetry(next));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load NPC balance.');
    }
  }, []);

  useEffect(() => {
    void load(window);
  }, [load, window]);

  return (
    <Panel title="NPC balance" aside={data?.roundName ?? undefined} className="se-mt">
      <div className="se-admin-moderation">
        {WINDOWS.map((option) => (
          <Button key={option.key} type="button" className={`se-btn se-btn--sm${option.key === window ? '' : ' se-btn--ghost'}`}
            onClick={() => setWindow(option.key)}>{option.label}</Button>
        ))}
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {!data ? <p className="se-muted se-mt">Loading…</p> : (
        <>
          <div className="se-rows se-mt">
            <Row label="Gangs · active humans" value={`${formatNumber(data.gangs)} · ${formatNumber(data.activeHumans)}`} />
            <Row label="NPC hits on humans" value={`${formatNumber(data.hits.total)} · ${percent(data.hits.winRate)} won`} strong />
            <Row label="Hits per active human per day" value={data.hits.perActiveHumanPerDay === null ? '-' : String(data.hits.perActiveHumanPerDay)} strong
              tooltip="NPC hits on human crews divided by humans active in the window and by its days." />
            <Row label="Human hits on NPCs" value={`${formatNumber(data.humanHits.total)} · ${percent(data.humanHits.winRate)} won by humans`} />
            <Row label="Taken from humans" value={`${formatCents(data.drain.cashFromHumansCents)} · ${formatNumber(data.drain.productFromHumans)} product`} />
            <Row label="Taken from NPCs" value={`${formatCents(data.drain.cashFromNpcsCents)} · ${formatNumber(data.drain.productFromNpcs)} product`} />
            <Row label="Bounties paid" value={`${formatNumber(data.drain.bounties)} · ${formatCents(data.drain.bountiesCents)}`} />
            <Row label="Encounters" value={`${formatNumber(data.encounters.total)} · ${formatNumber(data.encounters.pending)} pending`} strong
              tooltip="Action-triggered random encounters in this window." />
            <Row label="Encounters per active human per day" value={data.encounters.perActiveHumanPerDay === null ? '-' : String(data.encounters.perActiveHumanPerDay)} />
            <Row label="Encounter cash · heat" value={`${formatCents(data.encounters.impact.cashCents)} · ${formatNumber(data.encounters.impact.heat)}`} />
            <Row label="Encounter supplies" value={`${formatNumber(data.encounters.impact.crack)} product · ${formatNumber(data.encounters.impact.condoms)} condoms · ${formatNumber(data.encounters.impact.beer)} beer`} />
            <Row label="Blocked · lay low" value={`${percent(data.rates.blocked)} · ${percent(data.rates.layLow)} of moves`} strong={(data.rates.blocked ?? 0) > 0.2}
              tooltip="A high blocked share means the scheduler keeps trying moves the world will not allow." />
            <Row label="Dogpile skips" value={`${formatNumber(data.skips.DOGPILE ?? 0)} · ${percent(data.rates.dogpileSkips)} of attempts`}
              tooltip="Targets passed over because another NPC crew hit them inside the window." />
          </div>
          {data.byCity.length ? (
            <ol className="se-admin-list">
              {data.byCity.map((row) => (
                <li key={row.city}><strong>{row.city}</strong> · {formatNumber(row.hits)} hits · {percent(row.winRate)} won · {formatCents(row.cashFromHumansCents)} taken</li>
              ))}
            </ol>
          ) : null}
          {data.byTier.length ? <p className="se-hint se-mt">By tier: {data.byTier.map((row) => `${row.tier} ${formatNumber(row.hits)} (${percent(row.winRate)})`).join(' · ')}</p> : null}
          {data.byPersonality.length ? <p className="se-hint">By style: {data.byPersonality.map((row) => `${row.personality} ${formatNumber(row.hits)} (${percent(row.winRate)})`).join(' · ')}</p> : null}
          <Counts title="Encounters by trigger" counts={data.encounters.byTrigger} />
          <Counts title="Hits by kind" counts={data.hits.byKind} />
          <Counts title="Moves" counts={data.outcomes} />
          <Counts title="Blocked by reason" counts={data.blocked} />
          <Counts title="Targets passed over" counts={data.skips} />
        </>
      )}
    </Panel>
  );
}
