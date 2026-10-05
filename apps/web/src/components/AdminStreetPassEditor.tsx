import { useEffect, useState } from 'react';
import type { AdminStreetPassDto, AdminStreetPassRewardDto } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';

type Props = { roundId: string; pass: AdminStreetPassDto; onSaved: () => Promise<void> };
const kinds: AdminStreetPassRewardDto['kind'][] = ['CASH', 'TURNS', 'ITEM', 'PRODUCT', 'FAVOR_ITEM', 'COSMETIC_UNLOCK'];

function newReward(kind: AdminStreetPassRewardDto['kind'], pass: AdminStreetPassDto): AdminStreetPassRewardDto {
  const key = kind === 'ITEM' ? pass.catalogs.items[0]
    : kind === 'PRODUCT' ? pass.catalogs.products[0]
    : kind === 'FAVOR_ITEM' ? pass.catalogs.favors[0]
    : kind === 'COSMETIC_UNLOCK' ? pass.catalogs.cosmetics[0] : undefined;
  return { kind, ...(kind !== 'COSMETIC_UNLOCK' ? { amount: kind === 'FAVOR_ITEM' ? 1 : 1 } : {}), ...(key ? { key } : {}) };
}

export function AdminStreetPassEditor({ roundId, pass, onSaved }: Props) {
  const [tiers, setTiers] = useState(pass.tiers);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setTiers(pass.tiers), [pass]);

  function changeReward(tierIndex: number, rewardIndex: number, next: AdminStreetPassRewardDto) {
    setTiers(current => current.map((tier, index) => index !== tierIndex ? tier : {
      ...tier,
      rewards: tier.rewards.map((reward, itemIndex) => itemIndex === rewardIndex ? next : reward),
    }));
  }

  async function save() {
    setBusy(true); setError(null); setNotice(null);
    try {
      await adminApi.updateStreetPass(roundId, { reason: reason.trim(), tiers });
      setNotice('Street Pass rewards saved.');
      setReason('');
      await onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save Street Pass rewards.');
    } finally { setBusy(false); }
  }

  return (
    <Panel title={pass.name} aside="Street Pass rewards">
      {!pass.editable ? <p className="se-hint">Rewards are locked because registration has opened. Changes here apply only to this round.</p> : <>
        <p className="se-hint">Add, edit or remove rewards in each tier. Changes are saved to this scheduled round and locked when registration opens.</p>
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <p className="se-admin-notice" role="status">{notice}</p> : null}
        <div className="se-stack">
          {tiers.map((tier, tierIndex) => <details key={tier.tier} className="se-admin-card">
            <summary>Tier {tier.tier} <span className="se-muted">· {tier.rewards.length} reward{tier.rewards.length === 1 ? '' : 's'}</span></summary>
            <div className="se-stack se-mt">
              {tier.rewards.map((reward, rewardIndex) => {
                const options = reward.kind === 'ITEM' ? pass.catalogs.items
                  : reward.kind === 'PRODUCT' ? pass.catalogs.products
                  : reward.kind === 'FAVOR_ITEM' ? pass.catalogs.favors
                  : reward.kind === 'COSMETIC_UNLOCK' ? pass.catalogs.cosmetics : [];
                return <div key={rewardIndex} className="se-grid se-grid--2 se-admin-card">
                  <label className="se-field">
                    <span className="se-label">Reward type</span>
                    <select className="se-input" value={reward.kind} onChange={event => changeReward(tierIndex, rewardIndex, newReward(event.target.value as AdminStreetPassRewardDto['kind'], pass))}>
                      {kinds.map(kind => <option key={kind} value={kind}>{kind.replace('_', ' ')}</option>)}
                    </select>
                  </label>
                  {options.length ? <label className="se-field">
                    <span className="se-label">Reward</span>
                    <select className="se-input" value={reward.key ?? ''} onChange={event => changeReward(tierIndex, rewardIndex, { ...reward, key: event.target.value })}>
                      {options.map(key => <option key={key} value={key}>{key}</option>)}
                    </select>
                  </label> : null}
                  {reward.kind !== 'COSMETIC_UNLOCK' ? <label className="se-field">
                    <span className="se-label">{reward.kind === 'CASH' ? 'Amount (cents)' : 'Amount'}</span>
                    <input className="se-input" type="number" min="1" step="1" value={reward.amount ?? 1} onChange={event => changeReward(tierIndex, rewardIndex, { ...reward, amount: Number(event.target.value) })} />
                  </label> : null}
                  <div><Button className="se-btn se-btn--danger" type="button" onClick={() => setTiers(current => current.map((item, index) => index !== tierIndex ? item : { ...item, rewards: item.rewards.filter((_, itemIndex) => itemIndex !== rewardIndex) }))}>Remove reward</Button></div>
                </div>;
              })}
              <Button className="se-btn" type="button" onClick={() => setTiers(current => current.map((item, index) => index !== tierIndex ? item : { ...item, rewards: [...item.rewards, newReward('CASH', pass)] }))}>Add reward</Button>
              {tier.rewards.length === 0 ? <p className="se-error">Every tier needs at least one reward.</p> : null}
            </div>
          </details>)}
        </div>
        <label className="se-field se-mt">
          <span className="se-label">Audit reason</span>
          <textarea className="se-input se-admin-reason" maxLength={500} value={reason} onChange={event => setReason(event.target.value)} />
          <span className="se-hint">At least 5 characters. Saved to the audit log.</span>
        </label>
        <Button className="se-btn se-btn--primary se-mt" type="button" onClick={() => void save()} disabled={busy || reason.trim().length < 5 || tiers.some(tier => !tier.rewards.length)}>
          {busy ? 'Saving...' : 'Save Street Pass rewards'}
        </Button>
      </>}
    </Panel>
  );
}
