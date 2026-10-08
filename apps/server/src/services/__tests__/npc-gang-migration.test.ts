import { describe, expect, it } from 'vitest';
import type { NpcGangMigrationRules } from '@streets/rulesets';
import { chooseMigration, destinationOpen, npcGangsAllowed, storedMigrationPlan, type NpcCityStat } from '../npc-gang-migration.js';

const rules: NpcGangMigrationRules = {
  enabled: true,
  tiers: ['VETERAN', 'KINGPIN'],
  evaluateEveryHours: 6,
  minStayHours: 36,
  activeHumanHours: 24,
  quietBelowHumans: 2,
  humansPerGang: 3,
  hostileLosses: 4,
  betterByHumans: 4,
  packingHours: 36,
};
const maxPerCity = 4;

function city(slug: string, overrides: Partial<NpcCityStat> = {}): NpcCityStat {
  return { slug, name: slug.toUpperCase(), activeHumans: 9, npcGangs: 1, inbound: 0, reachable: true, ...overrides };
}

function choose(here: NpcCityStat, cities: NpcCityStat[], overrides: { tier?: string; recentLosses?: number } = {}) {
  return chooseMigration({ tier: overrides.tier ?? 'VETERAN', here, cities: [here, ...cities], recentLosses: overrides.recentLosses ?? 0, rules, maxPerCity });
}

describe('NPC gang migration (Phase K)', () => {
  it('scales the NPC cap with the human population, never below one or above the city cap', () => {
    expect(npcGangsAllowed(0, rules, maxPerCity)).toBe(1);
    expect(npcGangsAllowed(5, rules, maxPerCity)).toBe(1);
    expect(npcGangsAllowed(9, rules, maxPerCity)).toBe(3);
    expect(npcGangsAllowed(40, rules, maxPerCity)).toBe(4);
  });

  it('only moves the tiers the rules allow', () => {
    const here = city('detroit', { activeHumans: 0 });
    expect(choose(here, [city('chicago')], { tier: 'STREET' })).toBeNull();
    expect(choose(here, [city('chicago')], { tier: 'KINGPIN' })).toMatchObject({ reason: 'QUIET', to: { slug: 'chicago' } });
  });

  it('leaves a hostile city first, then a crowded one, then a quiet one', () => {
    const dest = [city('chicago')];
    expect(choose(city('detroit'), dest, { recentLosses: 4 })?.reason).toBe('HOSTILE');
    expect(choose(city('detroit', { activeHumans: 4, npcGangs: 3 }), dest)?.reason).toBe('CROWDED');
    expect(choose(city('detroit', { activeHumans: 1 }), dest)?.reason).toBe('QUIET');
  });

  it('only moves for a richer city by a clear margin', () => {
    const here = city('detroit', { activeHumans: 8 });
    expect(choose(here, [city('chicago', { activeHumans: 11, npcGangs: 0 })])).toBeNull();
    expect(choose(here, [city('chicago', { activeHumans: 12, npcGangs: 0 })])).toMatchObject({ reason: 'RICHER', to: { slug: 'chicago' } });
  });

  it('never picks a full, dead or unreachable city, and counts crews already on the road', () => {
    const here = city('detroit', { activeHumans: 0 });
    expect(choose(here, [city('chicago', { activeHumans: 6, npcGangs: 2 })])).toBeNull();
    expect(choose(here, [city('chicago', { activeHumans: 6, npcGangs: 1, inbound: 1 })])).toBeNull();
    expect(choose(here, [city('chicago', { activeHumans: 1, npcGangs: 0 })])).toBeNull();
    expect(choose(here, [city('chicago', { npcGangs: 0, reachable: false })])).toBeNull();
  });

  it('prefers the city with the most humans left per crew', () => {
    const here = city('detroit', { activeHumans: 0 });
    const picked = choose(here, [
      city('chicago', { activeHumans: 12, npcGangs: 3 }),
      city('atlanta', { activeHumans: 9, npcGangs: 0 }),
    ]);
    expect(picked?.to.slug).toBe('atlanta');
  });

  it('rechecks room before the truck leaves', () => {
    expect(destinationOpen(city('chicago', { activeHumans: 9, npcGangs: 2 }), rules, maxPerCity)).toBe(true);
    expect(destinationOpen(city('chicago', { activeHumans: 9, npcGangs: 2, inbound: 1 }), rules, maxPerCity)).toBe(false);
    expect(destinationOpen(undefined, rules, maxPerCity)).toBe(false);
  });

  it('reads a stored packing plan and ignores junk', () => {
    const plan = { to: 'chicago', toName: 'Chicago', reason: 'QUIET', decidedAt: '2026-10-08T12:00:00.000Z' };
    expect(storedMigrationPlan({ migration: plan })).toEqual(plan);
    expect(storedMigrationPlan({ migration: { ...plan, reason: 'BORED' } })).toBeNull();
    expect(storedMigrationPlan({ migration: null })).toBeNull();
    expect(storedMigrationPlan(null)).toBeNull();
  });
});
