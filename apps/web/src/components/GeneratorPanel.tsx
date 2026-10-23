import { useState } from 'react';
import { formatCents, formatNumber, type HideoutGeneratorDto } from '@streets/shared';
import { hideoutApi } from '../api/hideout.js';
import { Button } from './Button.js';
import { GameTabs } from './GameUI.js';

export function GeneratorPanel({ generator, onChanged }: { generator: HideoutGeneratorDto; onChanged: (value: HideoutGeneratorDto) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeTab, setUpgradeTab] = useState<'CAPACITY' | 'EFFICIENCY'>('CAPACITY');
  async function update(input: { powered?: boolean; refuelCans?: number; upgrade?: 'CAPACITY' | 'EFFICIENCY' }) {
    setBusy(true);
    setError(null);
    try { onChanged(await hideoutApi.updateGenerator(input)); }
    catch { setError('The generator could not be updated. Refresh and try again.'); }
    finally { setBusy(false); }
  }
  function available(key: string): number {
    return generator.availableComponents.find((item) => item.key === key)?.quantity ?? 0;
  }
  return <section className="se-hideout-section se-generator-section">
    <div className="se-hideout-sectionhead"><span className="se-eyebrow">Hideout power</span><div><h2>Generator</h2><p>Power is spent in game turns, not real time. Leaving it on without fuel switches it off automatically.</p></div></div>
    <div className="se-panel se-generator">
      <div className="se-generator__topline">
        <div className="se-stash__summary se-generator__summary">
          <strong><span className={`se-generator__status${generator.powered ? ' is-on' : ''}`} aria-hidden="true" />{generator.powered ? 'Powered on' : 'Powered off'}</strong>
          <span>{formatNumber(generator.fuel)} / {formatNumber(generator.capacity)} fuel charges <b>·</b> about {formatNumber(generator.estimatedPoweredTurns)} powered turns</span>
        </div>
        <div className="se-generator__fuel"><span className="se-eyebrow">Fuel burn</span><strong>{formatNumber(generator.fuelPerTurn)} <small>charge / turn</small></strong></div>
      </div>
      <p className="se-generator__hint">Fuel cans add 10 charges each. Power stays on until you switch it off or run dry.</p>
      <div className="se-stash__actions se-generator__actions">
        <Button className="se-btn se-btn--primary se-btn--sm" disabled={busy || (!generator.powered && generator.fuel <= 0)} onClick={() => void update({ powered: !generator.powered })}>{generator.powered ? 'Switch off' : 'Switch on'}</Button>
        <Button className="se-btn se-btn--ghost se-btn--sm" disabled={busy || generator.fuel >= generator.capacity} onClick={() => void update({ refuelCans: 1 })}>Load 1 fuel can</Button>
      </div>
      <div className="se-generator__upgrades">
        <div className="se-generator__upgrades-head"><span className="se-eyebrow">Generator upgrades</span><span>Improve the power ceiling or reduce the burn rate.</span></div>
        <GameTabs
          label="Generator upgrade types"
          activeId={upgradeTab}
          onChange={(id) => setUpgradeTab(id as 'CAPACITY' | 'EFFICIENCY')}
          items={[
            { id: 'CAPACITY', label: 'Capacity upgrades' },
            { id: 'EFFICIENCY', label: 'Efficiency upgrades' },
          ]}
        />
        <div className="se-generator__upgrade-grid" role="tabpanel" aria-label={`${upgradeTab.toLowerCase()} generator upgrades`}>
           {generator.upgrades.filter((upgrade) => upgrade.key === upgradeTab).map((upgrade) => {
             const missing = upgrade.components.some((item) => available(item.key) < item.quantity);
             const canInstall = !missing;
             return <article className="se-generator__upgrade" key={upgrade.key}>
               <div><span className="se-eyebrow">Level {formatNumber(upgrade.nextLevel)}</span><strong>{upgrade.key === 'CAPACITY' ? 'Fuel capacity' : 'Fuel efficiency'}</strong></div>
               <p>{upgrade.benefit}</p>
               <div className="se-generator__requirements" aria-label="Upgrade requirements">
                 <span className="se-generator__cost">{formatCents(upgrade.costCents)}</span>
                 {upgrade.components.map((item) => <span className={available(item.key) >= item.quantity ? 'is-met' : 'is-missing'} key={item.key}>{item.key.toLowerCase().replaceAll('_', ' ')} <b>{available(item.key)} / {item.quantity}</b></span>)}
               </div>
               <Button className="se-btn se-btn--ghost se-btn--sm" disabled={busy || !canInstall} onClick={() => void update({ upgrade: upgrade.key })}>{canInstall ? `Install level ${formatNumber(upgrade.nextLevel)}` : 'Need components'}</Button>
             </article>;
           })}
        </div>
      </div>
      {error ? <p className="se-error" role="alert">{error}</p> : null}
    </div>
  </section>;
}
