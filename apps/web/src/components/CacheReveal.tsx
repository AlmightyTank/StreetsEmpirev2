import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { OpenScavengeCacheResult } from '@streets/shared';
import { ItemTile } from './ItemTile.js';
import { type ItemArtKey } from '../items/itemArt.js';
import '../styles/hideout.css';

export function CacheReveal({ reveal }: { reveal: OpenScavengeCacheResult }) {
  const [revealPhase, setRevealPhase] = useState<'spinning' | 'settled'>('spinning');
  const reelViewportRef = useRef<HTMLDivElement>(null);
  const [revealDistance, setRevealDistance] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setRevealPhase('settled'), 2600);
    return () => window.clearTimeout(timer);
  }, []);

  const reel = useMemo(() => {
    const pool = reveal.cache.eligiblePool;
    const rewards = reveal.rewards;
    const items = Array.from({ length: Math.max(24, rewards.length * 5 + 12) }, (_, index) => {
      const reward = rewards.length && index >= 17 && index < 17 + rewards.length ? rewards[index - 17] : null;
      const decoy = pool[index % Math.max(1, pool.length)];
      return reward ?? decoy;
    }).filter((item): item is NonNullable<typeof item> => item !== undefined && item !== null);
    return { items, stop: Math.min(17, Math.max(0, items.length - 1)) };
  }, [reveal]);

  useLayoutEffect(() => {
    const updateDistance = () => {
      const viewportWidth = reelViewportRef.current?.clientWidth ?? 0;
      setRevealDistance(viewportWidth / 2 - 48 - reel.stop * 104);
    };
    updateDistance();
    window.addEventListener('resize', updateDistance);
    return () => window.removeEventListener('resize', updateDistance);
  }, [reel.stop]);

  return (
    <div className="se-cache-reveal" aria-live="polite">
      <span className="se-eyebrow">{revealPhase === 'spinning' ? 'Sorting the drop' : 'Loot secured'}</span>
      <div ref={reelViewportRef} className={`se-cache-reveal__reel se-cache-reveal__reel--${revealPhase}`} aria-label={revealPhase === 'spinning' ? 'Cache rewards are being revealed' : 'Cache reward reveal complete'}>
        <span className="se-cache-reveal__marker" aria-hidden="true" />
        <div className="se-cache-reveal__track" style={{ '--reveal-stop': reel.stop, '--reveal-distance': `${revealDistance}px` } as CSSProperties}>
          {reel.items.map((item, index) => <div className={`se-cache-reveal__reel-item se-cache-reveal__reel-item--${item.rarity.toLowerCase()}${index === reel.stop ? ' is-stop' : ''}`} key={`${item.key}-${index}`}>
            <ItemTile item={item.key as ItemArtKey} label={false} size="sm" zoomable={false} />
            <small>{item.rarity}</small>
          </div>)}
        </div>
      </div>
      {revealPhase === 'settled' ? <>
        <div className="se-cache-reveal__items">
          {reveal.rewards.map((item) => <div className={`se-cache-reveal__item se-cache-reveal__item--${item.rarity.toLowerCase()}`} key={item.key}>
            <div className="se-cache-reveal__item-backer"><ItemTile item={item.key as ItemArtKey} quantity={item.quantity} label={false} zoomable={false} /></div>
            <strong>{item.name}</strong>
            <small>{item.rarity} · ×{item.quantity}</small>
          </div>)}
        </div>
        <p className="se-muted">The reward was added to your stash. This cache has been consumed.</p>
      </> : null}
    </div>
  );
}
