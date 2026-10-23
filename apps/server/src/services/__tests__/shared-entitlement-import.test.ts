import { describe, expect, it } from 'vitest';
import { DROP_SOURCE } from '@streets/rulesets';
import { legacyCrownImportRef, snapshotLegacyEntitlements } from '../shared-entitlement-import.js';

describe('shared entitlement legacy import', () => {
  it('selects Drop unlocks and creates a stable import key for retry safety', () => {
    const snapshot = snapshotLegacyEntitlements('beta', 'acct-1', { balance: 125, heldAt: null, holdReason: null }, [
      { key: 'drop:sedan', kind: 'VEHICLE', title: 'Sedan', description: 'A Drop vehicle', rarity: 'RARE', styleKey: null, sourceQuestKey: DROP_SOURCE, awardedAt: new Date('2026-01-01T00:00:00Z') },
      { key: 'quest:badge', kind: 'BADGE', title: 'Badge', description: 'Quest reward', rarity: 'COMMON', styleKey: null, sourceQuestKey: 'quest:finish', awardedAt: new Date('2026-01-02T00:00:00Z') },
    ]);

    expect(snapshot.balance).toBe(125);
    expect(snapshot.unlocks.map((item) => item.key)).toEqual(['drop:sedan']);
    expect(legacyCrownImportRef(snapshot)).toBe('legacy-import:beta:acct-1');
    expect(legacyCrownImportRef(snapshot)).toBe(legacyCrownImportRef(snapshot));
  });

  it('treats a missing wallet as zero and rejects invalid balances', () => {
    expect(snapshotLegacyEntitlements('production', 'acct-main', null, []).balance).toBe(0);
    expect(() => snapshotLegacyEntitlements('beta', 'acct-1', { balance: -1, heldAt: null, holdReason: null }, [])).toThrow(/Invalid legacy Crown balance/);
  });
});
