import { describe, expect, it } from 'vitest';
import { loadPendingRaid, savePendingRaid, type PendingRaid } from '../pendingRaid.js';

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const pending: PendingRaid = { input: { roundId: 'round-one', targetPublicPimpId: 1001, attackingThugs: 20, actionId: 'the-same-action-id' }, targetName: 'Rival' };

describe('durable pending raids', () => {
  it('preserves the exact round, target, squad and action id across reloads', () => {
    const store = storage();
    savePendingRaid(store, 'player-a', pending);
    expect(loadPendingRaid(store, 'player-a')).toEqual(pending);
    expect(loadPendingRaid(store, 'player-b')).toBeNull();
    savePendingRaid(store, 'player-a', null);
    expect(loadPendingRaid(store, 'player-a')).toBeNull();
  });
  it('rejects corrupted saved requests and works with disabled storage', () => {
    const store = storage();
    store.setItem('se.pending-raid.player-a', JSON.stringify({ ...pending, input: { ...pending.input, attackingThugs: -1 } }));
    expect(loadPendingRaid(store, 'player-a')).toBeNull();
    expect(store.getItem('se.pending-raid.player-a')).toBeNull();
    expect(() => savePendingRaid(null, 'player-a', pending)).not.toThrow();
    expect(loadPendingRaid(null, 'player-a')).toBeNull();
  });
});
