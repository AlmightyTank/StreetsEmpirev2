import { describe, expect, it } from 'vitest';
import {
  clearPendingAction,
  loadPendingAction,
  savePendingAction,
} from '../pendingAction.js';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('pending actions', () => {
  it('round-trips the exact action id and payload across a reload', () => {
    const storage = memoryStorage();
    savePendingAction(storage, 'store:p1', '12345678-abcd', { quantity: 10 }, 1_000);

    expect(loadPendingAction<{ quantity: number }>(storage, 'store:p1', 2_000)).toMatchObject({
      actionId: '12345678-abcd',
      payload: { quantity: 10 },
      savedAt: 1_000,
    });
  });

  it('refuses an action after the safe replay window', () => {
    const storage = memoryStorage();
    savePendingAction(storage, 'store:p1', '12345678-abcd', { quantity: 10 }, 1_000);

    expect(loadPendingAction(storage, 'store:p1', 9 * 60_000)).toBeNull();
  });

  it('drops corrupted data instead of attempting a guessed transaction', () => {
    const storage = memoryStorage();
    storage.setItem('se.pending-action.store:p1', '{broken');

    expect(loadPendingAction(storage, 'store:p1', 2_000)).toBeNull();
  });

  it('clears a confirmed transaction', () => {
    const storage = memoryStorage();
    savePendingAction(storage, 'store:p1', '12345678-abcd', { quantity: 10 }, 1_000);
    clearPendingAction(storage, 'store:p1');

    expect(loadPendingAction(storage, 'store:p1', 2_000)).toBeNull();
  });
});
