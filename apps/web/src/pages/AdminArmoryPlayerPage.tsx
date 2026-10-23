import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AdminArmoryPlayerDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

export function AdminArmoryPlayerPage() {
  const { roundPlayerId = '' } = useParams();
  const [data, setData] = useState<AdminArmoryPlayerDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!roundPlayerId) return;
    setData(null); setError(null);
    adminApi.armory(roundPlayerId).then(setData).catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load this armory.'));
  }, [roundPlayerId]);
  return <GameLayout>
    <div className="se-pagehead se-admin-pagehead"><div><h1 className="se-title">Armory inspector</h1><p className="se-eyebrow">Admin · item records and audit history</p></div></div>
    {error ? <Alert>{error}</Alert> : null}
    {!data ? <p className="se-muted">Loading equipment records…</p> : <>
      <p className="se-muted se-mb"><Link to={`/game/admin/players/${data.player.roundPlayerId}`}>{data.player.displayName} (#{data.player.publicPimpId})</Link> · {data.round.name} · {data.round.rulesetId} {data.round.rulesetVersion}</p>
      <Panel title="Inventory" className="se-mb"><div className="se-stats"><Stat label="Guns" value={formatNumber(data.summary.guns)} /><Stat label="Vehicles" value={formatNumber(data.summary.vehicles)} /><Stat label="Rows inspected" value={formatNumber(data.items.length)} /></div>{data.truncated ? <p className="se-hint">The row limit was reached; inspect recent equipment only.</p> : null}</Panel>
      <Panel title="Items" flush className="se-mb"><div className="se-tablewrap"><table className="se-table se-table--cards"><thead><tr><th>Item</th><th>State</th><th>Mods</th><th>Origin</th><th>Last changed</th></tr></thead><tbody>{data.items.map((item) => <tr key={`${item.kind}:${item.id}`}>
        <td className="se-td--title">{item.name ?? item.model} <span className="se-muted">{item.kind.toLowerCase()} · ×{item.quantity}</span><br /><span className="se-muted">{item.id}</span></td>
        <td>{item.status} · {item.condition}%</td><td>{Array.isArray(item.mods) ? item.mods.map((mod) => typeof mod === 'object' && mod && 'key' in mod ? `${String(mod.key)} T${String('tier' in mod ? mod.tier : '')}` : '').filter(Boolean).join(', ') || '—' : '—'}</td>
        <td>{JSON.stringify(item.origin)}</td><td>{adminWhen(item.updatedAt)}</td>
      </tr>)}</tbody></table></div></Panel>
      <Panel title="Item audit trail" flush><div className="se-tablewrap"><table className="se-table se-table--cards"><thead><tr><th>When</th><th>Event</th><th>Item</th><th>Details</th></tr></thead><tbody>{data.audit.map((event, index) => <tr key={`${event.itemId}:${event.at}:${index}`}><td>{adminWhen(event.at)}</td><td>{event.type}</td><td>{event.name ?? event.model} · {event.kind.toLowerCase()}</td><td>{event.summary}{event.city ? ` · ${event.city}` : ''}{event.otherPlayer ? ` · ${event.otherPlayer}` : ''}</td></tr>)}{data.audit.length === 0 ? <tr><td colSpan={4} className="se-muted">No item events recorded.</td></tr> : null}</tbody></table></div></Panel>
    </>}
  </GameLayout>;
}
