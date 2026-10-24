import { useState } from 'react';
import { formatCents, type OpenScavengeCacheResult, type ScavengeDealerOfferDto, type ScavengePageDto } from '@streets/shared';
import { hideoutApi } from '../api/hideout.js';
import { ApiError } from '../api/client.js';
import { useSession } from '../stores/session.js';
import { ItemTile } from './ItemTile.js';
import { Button } from './Button.js';
import { type ItemArtKey } from '../items/itemArt.js';
import { GameDialog } from './GameUI.js';

export function ScavengingPanel({ page, onChanged }: { page: ScavengePageDto; onChanged: (page: ScavengePageDto) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<OpenScavengeCacheResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cashCents = useSession((s) => s.me?.resources.cashCents ?? null);
  const owned = (key: string) => page.components.find((item) => item.key === key)?.quantity ?? 0;
  async function buy(offer: ScavengeDealerOfferDto, quantity: number) {
    setBusy(`buy:${offer.key}`);
    setError(null);
    setNotice(null);
    try {
      const result = await hideoutApi.buyComponent({ key: offer.key, quantity });
      onChanged(result.page);
      setNotice(`Bought ${result.bought.quantity} × ${result.bought.name} for ${formatCents(result.spentCents)}.`);
      // Cash moved, so refresh the session; the hideout re-reads its upgrade gates from it.
      void useSession.getState().refreshSnapshot({ background: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The dealer could not fill that order. Refresh and try again.');
    } finally { setBusy(null); }
  }
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
      {notice ? <p className="se-muted" role="status">{notice}</p> : null}
       <div className="se-grid se-grid--2 se-scavenge__caches">
         {page.caches.map((cache) => <article className={`se-panel se-scavenge-cache se-scavenge-cache--${cache.quality.toLowerCase()}`} key={cache.id}><div className="se-scavenge-cache__head"><div><span className="se-eyebrow">Supply cache</span><strong>{cache.label}</strong></div><span className="se-scavenge-cache__badge">{cache.eligiblePool.length} possible items</span></div><small className="se-scavenge-cache__district">{cache.districtName}</small><p className="se-scavenge-cache__odds"><span>Common {cache.odds.COMMON}%</span><span>Uncommon {cache.odds.UNCOMMON}%</span><span>Rare {cache.odds.RARE}%</span><span>Epic {cache.odds.EPIC}%</span><span>Legendary {cache.odds.LEGENDARY}%</span></p><div className="se-scavenge-cache__action"><Button className="se-btn se-btn--primary se-btn--sm" disabled={busy !== null} onClick={() => void open(cache.id)}>{busy === cache.id ? 'Opening…' : 'Open cache'}</Button><small>Rewards go straight to your stash</small></div></article>)}
        {page.caches.length === 0 ? <p className="se-muted">Caches earned while scouting will wait here.</p> : null}
      </div>
    </section>
    {page.dealer?.length ? <section className="se-hideout-section se-scavenge-section se-scavenge-dealer">
      <div className="se-hideout-sectionhead"><span className="se-eyebrow">Salvage dealer</span><div><h2>Buy building materials</h2><p>Short on parts for an upgrade? The dealer sells every component for cash. Scouting is cheaper, the dealer is faster.</p></div></div>
      <div className="se-grid se-grid--3">
        {page.dealer.map((offer) => {
          const affordable = (quantity: number) => cashCents === null || cashCents >= offer.priceCents * quantity;
          return <article className="se-panel se-scavenge-component" key={offer.key}>
            <ItemTile item={offer.key as ItemArtKey} quantity={owned(offer.key)} label={false} />
            <div className="se-scavenge-component__copy">
              <strong>{offer.name} · {formatCents(offer.priceCents)}</strong>
              <small>{offer.rarity.toLowerCase()} · {offer.purpose} · You have {owned(offer.key)}</small>
              <div className="se-scavenge-cache__action">
                <Button className="se-btn se-btn--primary se-btn--sm" disabled={busy !== null || !affordable(1)} onClick={() => void buy(offer, 1)}>{busy === `buy:${offer.key}` ? 'Buying…' : 'Buy 1'}</Button>
                <Button className="se-btn se-btn--sm" disabled={busy !== null || !affordable(5)} onClick={() => void buy(offer, 5)}>Buy 5</Button>
              </div>
            </div>
          </article>;
        })}
      </div>
    </section> : null}
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
