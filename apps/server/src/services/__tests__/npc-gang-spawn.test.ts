import { describe, expect, it } from 'vitest';
import { NPC_GANG_PERSONALITIES, NPC_GANG_ROSTER } from '@streets/rulesets';
import { DEFAULT_NPC_GANG_RULES } from '../npc-gang-rules.js';
import { NPC_ACCOUNT_DOMAIN, nextRosterCrew, npcAccountUsername, npcCrewTarget, npcProgressTier } from '../npc-gang-spawn.service.js';
import { npcActionId } from '../npc-gang.service.js';

const spawn = DEFAULT_NPC_GANG_RULES.spawn;
const progression = DEFAULT_NPC_GANG_RULES.progression;

describe('real NPC crews', () => {
  it('carries a crew per few active humans, within the floor, the cap and the roster', () => {
    expect(npcCrewTarget(0, spawn, 10)).toBe(2);
    expect(npcCrewTarget(9, spawn, 10)).toBe(3);
    expect(npcCrewTarget(100, spawn, 10)).toBe(10);
    expect(npcCrewTarget(100, spawn, 4)).toBe(4);
    expect(npcCrewTarget(100, { ...spawn, enabled: false }, 10)).toBe(0);
  });

  it('spawns roster crews in order, skipping any already in the round', () => {
    expect(nextRosterCrew(NPC_GANG_ROSTER, new Set())?.slug).toBe(NPC_GANG_ROSTER[0].slug);
    expect(nextRosterCrew(NPC_GANG_ROSTER, new Set([NPC_GANG_ROSTER[0].slug]))?.slug).toBe(NPC_GANG_ROSTER[1].slug);
    expect(nextRosterCrew(NPC_GANG_ROSTER, new Set(NPC_GANG_ROSTER.map((entry) => entry.slug)))).toBeNull();
  });

  it('authors a roster that resolves to real personalities with valid traits and unique names', () => {
    const slugs = new Set(NPC_GANG_ROSTER.map((entry) => entry.slug));
    expect(slugs.size).toBe(NPC_GANG_ROSTER.length);
    for (const entry of NPC_GANG_ROSTER) {
      expect(Object.keys(NPC_GANG_PERSONALITIES)).toContain(entry.personality);
      for (const trait of [entry.aggression, entry.ambition, entry.discipline]) expect(trait).toBeGreaterThanOrEqual(0);
      for (const trait of [entry.aggression, entry.ambition, entry.discipline]) expect(trait).toBeLessThanOrEqual(100);
    }
    // At least the first few crews into a round can fight from the start.
    expect(NPC_GANG_ROSTER.slice(0, 3).filter((entry) => entry.aggression >= 55).length).toBeGreaterThanOrEqual(2);
  });

  it('uses account names no human can register and an undeliverable address', () => {
    const username = npcAccountUsername('red-hand');
    expect(username).toBe('npc.red-hand');
    expect(/^[A-Za-z0-9_-]+$/.test(username)).toBe(false);
    expect(NPC_ACCOUNT_DOMAIN.endsWith('.invalid')).toBe(true);
  });

  it('climbs tiers by growth multiples and never steps down', () => {
    const start = 2_000_000;
    const tier = (netWorthCents: number, currentTier = 'SCRUB') => npcProgressTier({ startNetWorthCents: start, netWorthCents, currentTier, rules: progression });
    expect(tier(3_000_000)).toBe('SCRUB');
    expect(tier(4_000_000)).toBe('STREET');
    expect(tier(10_000_000)).toBe('VETERAN');
    expect(tier(24_000_000)).toBe('KINGPIN');
    expect(tier(1_000_000, 'VETERAN')).toBe('VETERAN');
    expect(npcProgressTier({ startNetWorthCents: 0, netWorthCents: 99_000_000, currentTier: 'STREET', rules: progression })).toBe('STREET');
    expect(npcProgressTier({ startNetWorthCents: start, netWorthCents: 99_000_000, currentTier: 'SCRUB', rules: { ...progression, enabled: false } })).toBe('SCRUB');
  });

  it('makes action ids that fit the shared 64-character schema', () => {
    // A gang id plus a UUID once ran past it, and combat refused every NPC hit.
    for (let index = 0; index < 20; index += 1) expect(npcActionId().length).toBeLessThanOrEqual(64);
    expect(npcActionId()).not.toBe(npcActionId());
  });
});
