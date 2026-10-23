import { useState } from 'react';
import { formatCents, formatNumber, type HideoutGeneratorDto } from '@streets/shared';
import { hideoutApi } from '../api/hideout.js';
import { Button } from './Button.js';

export function GeneratorPanel({ generator, onChanged }: { generator: HideoutGeneratorDto; onChanged: (value: HideoutGeneratorDto) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function update(input: { powered?: boolean; refuelCans?: number; upgrade?: 'CAPACITY' | 'EFFICIENCY' }) {
    setBusy(true);
    setError(null);
    try { onChanged(await hideoutApi.updateGenerator(input)); }
    catch { setError('The generator could not be updated. Refresh and try again.'); }
    finally { setBusy(false); }
  }
  return <section className="se-hideout-section">
    <div className="se-hideout-sectionhead"><span className="se-eyebrow">Hideout power</span><div><h2>Generator</h2><p>Power is spent in game turns, not real time. Leaving it on without fuel switches it off automatically.</p></div></div>
    <div className="se-panel">
      <div className="se-stash__summary"><strong>{generator.powered ? 'Powered on' : 'Powered off'}</strong><span>{formatNumber(generator.fuel)} / {formatNumber(generator.capacity)} fuel charges · about {formatNumber(generator.estimatedPoweredTurns)} powered turns</span></div>
      <p className="se-muted">Uses {formatNumber(generator.fuelPerTurn)} charge per powered turn. Fuel cans add 10 charges each.</p>
      <div className="se-stash__actions">
        <Button className="se-btn se-btn--primary se-btn--sm" disabled={busy || (!generator.powered && generator.fuel <= 0)} onClick={() => void update({ powered: !generator.powered })}>{generator.powered ? 'Switch off' : 'Switch on'}</Button>
        <Button className="se-btn se-btn--ghost se-btn--sm" disabled={busy || generator.fuel >= generator.capacity} onClick={() => void update({ refuelCans: 1 })}>Load 1 fuel can</Button>
      </div>
      <div className="se-grid se-grid--2">
        {generator.upgrades.map((upgrade) => <article className="se-panel" key={upgrade.key}><strong>{upgrade.key === 'CAPACITY' ? 'Capacity upgrade' : 'Efficiency upgrade'}</strong><p>{upgrade.benefit}</p><small>{formatCents(upgrade.costCents)} · {upgrade.components.map((item) => `${item.quantity} ${item.key.toLowerCase().replaceAll('_', ' ')}`).join(', ')}</small><Button className="se-btn se-btn--ghost se-btn--sm" disabled={busy} onClick={() => void update({ upgrade: upgrade.key })}>Install level {formatNumber(upgrade.nextLevel)}</Button></article>)}
      </div>
      {error ? <p className="se-error" role="alert">{error}</p> : null}
    </div>
  </section>;
}
