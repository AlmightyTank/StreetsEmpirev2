import { useState } from 'react';
import type { OpenScavengeCacheResult, ScavengePageDto } from '@streets/shared';
import { hideoutApi } from '../api/hideout.js';
import { ItemTile } from './ItemTile.js';
import { Button } from './Button.js';
import { type ItemArtKey } from '../items/itemArt.js';
import { GameDialog } from './GameUI.js';

export function ScavengingPanel({ page, onChanged }: { page: ScavengePageDto; onChanged: (page: ScavengePageDto) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<OpenScavengeCacheResult | null>(null);
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
      onChanged({ ...page, caches: page.caches.filter((cache) => cache.id !== id), components });
      setReveal(result);
    } catch {
      setError('That cache could not be opened. Refresh and try again.');
    } finally { setBusy(null); }
  }
  return <>
    <section className="se-hideout-section se-scavenge-section">
      <div className="se-hideout-sectionhead"><span className="se-eyebrow">Scouting supplies</span><div><h2>Caches and components</h2><p>Districts hint at what is likely nearby. Cache odds are shown before opening; no rarity is guaranteed.</p></div></div>
      <div className="se-grid se-grid--3">
        {page.components.map((item) => <article className="se-panel se-scavenge-component" key={item.key}><ItemTile item={item.key as ItemArtKey} quantity={item.quantity} label={false} /><div className="se-scavenge-component__copy"><strong>{item.name} · {item.quantity}</strong><small>{item.purpose} · {item.footprint.width}×{item.footprint.height} cell</small></div></article>)}
        {page.components.length === 0 ? <p className="se-muted">Scout districts to bring useful components home.</p> : null}
      </div>
      {error ? <p className="se-error" role="alert">{error}</p> : null}
       <div className="se-grid se-grid--2 se-scavenge__caches">
         {page.caches.map((cache) => <article className={`se-panel se-scavenge-cache se-scavenge-cache--${cache.quality.toLowerCase()}`} key={cache.id}><div className="se-scavenge-cache__head"><div><span className="se-eyebrow">Supply cache</span><strong>{cache.label}</strong></div><span className="se-scavenge-cache__badge">{cache.eligiblePool.length} possible items</span></div><small className="se-scavenge-cache__district">{cache.districtName}</small><p className="se-scavenge-cache__odds"><span>Common {cache.odds.COMMON}%</span><span>Uncommon {cache.odds.UNCOMMON}%</span><span>Rare {cache.odds.RARE}%</span><span>Epic {cache.odds.EPIC}%</span><span>Legendary {cache.odds.LEGENDARY}%</span></p><div className="se-scavenge-cache__action"><Button className="se-btn se-btn--primary se-btn--sm" disabled={busy !== null} onClick={() => void open(cache.id)}>{busy === cache.id ? 'Opening…' : 'Open cache'}</Button><small>Rewards go straight to your stash</small></div></article>)}
        {page.caches.length === 0 ? <p className="se-muted">Caches earned while scouting will wait here.</p> : null}
      </div>
    </section>
    <GameDialog
      open={reveal !== null}
      title="Cache opened"
      description={reveal ? `${reveal.cache.label} · ${reveal.cache.districtName}` : undefined}
      onClose={() => setReveal(null)}
      actions={<Button className="se-btn se-btn--primary" onClick={() => setReveal(null)}>Done</Button>}
    >
      <div className="se-cache-reveal" aria-live="polite">
        <span className="se-eyebrow">Loot secured</span>
        <div className="se-cache-reveal__items">
          {reveal?.rewards.map((item) => <div className={`se-cache-reveal__item se-cache-reveal__item--${item.rarity.toLowerCase()}`} key={item.key}>
            <ItemTile item={item.key as ItemArtKey} quantity={item.quantity} label={false} zoomable={false} />
            <strong>{item.name}</strong>
            <small>{item.rarity} · ×{item.quantity}</small>
          </div>)}
        </div>
        <p className="se-muted">The reward was added to your stash. This cache has been consumed.</p>
      </div>
    </GameDialog>
  </>;
}
