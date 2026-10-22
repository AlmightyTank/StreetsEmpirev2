import { useState } from 'react';
import { formatNumber, type ScavengePageDto } from '@streets/shared';
import { hideoutApi } from '../api/hideout.js';
import { ItemTile } from './ItemTile.js';
import { Button } from './Button.js';

export function ScavengingPanel({ page, onChanged }: { page: ScavengePageDto; onChanged: (page: ScavengePageDto) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function open(id: string) {
    setBusy(id);
    setError(null);
    try {
      const result = await hideoutApi.openCache(id);
      const components = [...page.components];
      for (const reward of result.rewards) {
        const existing = components.find((item) => item.key === reward.key);
        if (existing) existing.quantity += reward.quantity;
        else components.push(reward);
      }
      onChanged({ ...page, caches: page.caches.map((cache) => cache.id === id ? result.cache : cache), components });
    } catch {
      setError('That cache could not be opened. Refresh and try again.');
    } finally { setBusy(null); }
  }
  return <section className="se-hideout-section">
    <div className="se-hideout-sectionhead"><span className="se-eyebrow">Scouting supplies</span><div><h2>Caches and components</h2><p>Districts hint at what is likely nearby. Cache odds are shown before opening; no rarity is guaranteed.</p></div></div>
    <div className="se-grid se-grid--3">
      {page.components.map((item) => <article className="se-panel" key={item.key}><ItemTile item={item.key as never} quantity={item.quantity} /><strong>{item.name}</strong><small>{item.purpose}</small></article>)}
      {page.components.length === 0 ? <p className="se-muted">Scout districts to bring useful components home.</p> : null}
    </div>
    {error ? <p className="se-error" role="alert">{error}</p> : null}
    <div className="se-grid se-grid--2">
      {page.caches.map((cache) => <article className="se-panel" key={cache.id}><strong>{cache.label}</strong><small>{cache.districtName} · {cache.eligiblePool.length} possible items</small><p className="se-muted">Common {cache.odds.COMMON}% · Uncommon {cache.odds.UNCOMMON}% · Rare {cache.odds.RARE}% · Epic {cache.odds.EPIC}% · Legendary {cache.odds.LEGENDARY}%</p>{cache.opened ? <p>Found: {cache.rewards?.map((item) => `${item.name} ×${formatNumber(item.quantity)}`).join(', ')}</p> : <Button className="se-btn se-btn--primary se-btn--sm" disabled={busy !== null} onClick={() => void open(cache.id)}>{busy === cache.id ? 'Opening…' : 'Open cache'}</Button>}</article>)}
      {page.caches.length === 0 ? <p className="se-muted">Caches earned while scouting will wait here.</p> : null}
    </div>
  </section>;
}
