import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forgetRemembered, isTurns, readRemembered, rememberedKey, writeRemembered } from './remembered.js';

/** Node has no window; a small Map-backed localStorage stands in. */
function installStorage(blocked = false) {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => {
      if (blocked) throw new Error('blocked');
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (blocked) throw new Error('blocked');
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage };
  return store;
}

describe('remembered choices', () => {
  beforeEach(() => {
    installStorage();
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('keys choices by player, and keeps nothing until the player is known', () => {
    expect(rememberedKey('scout.district', 'player-1')).toBe('scout.district:player-1');
    expect(rememberedKey('scout.district', null)).toBeNull();
    writeRemembered(null, 'CASINO');
    expect(readRemembered(null)).toEqual({ found: false });
  });

  it('round-trips a choice and forgets it on request', () => {
    const key = rememberedKey('scout.district', 'player-1');
    writeRemembered(key, 'CASINO');
    expect(readRemembered(key)).toEqual({ found: true, value: 'CASINO' });
    expect(readRemembered(rememberedKey('scout.district', 'player-2'))).toEqual({ found: false });
    forgetRemembered(key);
    expect(readRemembered(key)).toEqual({ found: false });
  });

  it('rejects stored values that no longer fit, and old ones past their age', () => {
    const key = 'scout.turns:player-1';
    writeRemembered(key, 'lots');
    expect(readRemembered(key, { accept: isTurns })).toEqual({ found: false });
    writeRemembered(key, 20, 1_000);
    expect(readRemembered(key, { accept: isTurns, maxAgeMs: 500 }, 2_000)).toEqual({ found: false });
    expect(readRemembered(key, { accept: isTurns, maxAgeMs: 5_000 }, 2_000)).toEqual({ found: true, value: 20 });
  });

  it('shrugs off blocked or corrupted storage', () => {
    const store = installStorage();
    store.set('streets.remember.v1.bad:player-1', '{not json');
    expect(readRemembered('bad:player-1')).toEqual({ found: false });
    installStorage(true);
    expect(() => writeRemembered('scout.district:player-1', 'CASINO')).not.toThrow();
    expect(readRemembered('scout.district:player-1')).toEqual({ found: false });
  });
});
