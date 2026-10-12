import { describe, expect, it } from 'vitest';
import { NPC_GANG_TIERS, storedPause } from '../admin-npc-gang.service.js';
import { DEFAULT_NPC_GANG_RULES } from '../npc-gang-rules.js';

describe('NPC gang admin controls (Phase O)', () => {
  it('reads an operator pause back from memory', () => {
    const paused = { by: 'admin', at: '2026-10-08T12:00:00.000Z', reason: 'runaway raids', until: '2026-10-09T12:00:00.000Z' };
    expect(storedPause({ paused })).toEqual(paused);
    expect(storedPause({ paused: null })).toBeNull();
    expect(storedPause({ paused: { ...paused, reason: '' } })).toBeNull();
    expect(storedPause(null)).toBeNull();
  });

  it('offers exactly the tiers the scheduler knows', () => {
    expect([...NPC_GANG_TIERS]).toEqual(['SCRUB', 'STREET', 'VETERAN', 'KINGPIN']);
    for (const tier of DEFAULT_NPC_GANG_RULES.migration.tiers) expect(NPC_GANG_TIERS).toContain(tier);
    for (const tier of Object.keys(DEFAULT_NPC_GANG_RULES.rewards.bountyCents)) expect(NPC_GANG_TIERS).toContain(tier);
  });
});
