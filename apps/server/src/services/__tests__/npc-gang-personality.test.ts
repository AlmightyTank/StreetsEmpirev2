import { describe, expect, it } from 'vitest';
import { NPC_GANG_PERSONALITIES } from '@streets/rulesets';
import { DEFAULT_NPC_GANG_RULES } from '../npc-gang-rules.js';
import {
  EMPTY_HISTORY, favoriteMove, npcIdentity, npcPersonality, npcReputation, orderByTargeting, storedHistory, withHit, withLoss,
  historyJson, type NpcTargetTraits,
} from '../npc-gang-personality.js';

const rules = DEFAULT_NPC_GANG_RULES;
const now = new Date('2026-10-08T12:00:00.000Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

function target(id: string, overrides: Partial<NpcTargetTraits> = {}): NpcTargetTraits {
  return {
    id, thugs: 20, woundedThugs: 0, postedThugs: 0, businessThugs: 0, lowRiders: 0, crack: 0,
    whoreHappiness: 100, thugHappiness: 100, lastRaidedAt: null, ...overrides,
  };
}

describe('NPC gang personalities (Phase M)', () => {
  it('resolves keys, old archetype strings and unknowns to a personality', () => {
    expect(npcPersonality(rules, 'ride-thieves').key).toBe('ride-thieves');
    expect(npcPersonality(rules, 'stash-builder').key).toBe('product-cooks');
    expect(npcPersonality(rules, 'muscle-crew').key).toBe('violent-crew');
    expect(npcPersonality(rules, 'desperate-locals').key).toBe('ambushers');
    expect(npcPersonality(rules, 'Big-Muscle-Squad').key).toBe('violent-crew');
    expect(npcPersonality(rules, 'something-new').key).toBe('cautious-hustlers');
  });

  it('gives every catalog personality names, a style and a sane squad share', () => {
    for (const personality of Object.values(NPC_GANG_PERSONALITIES)) {
      expect(personality.names.length).toBeGreaterThan(0);
      expect(personality.style.length).toBeGreaterThan(10);
      expect(personality.squadShare).toBeGreaterThan(0.5);
      expect(personality.squadShare).toBeLessThan(1.5);
    }
  });

  it('keeps a seeded crew name, and otherwise picks one stably from the gang id', () => {
    const view = npcPersonality(rules, 'product-cooks');
    expect(npcIdentity(view, 'gang-1', { identity: { name: 'Night Kitchen', tag: 'NK' } })).toEqual({ name: 'Night Kitchen', tag: 'NK' });
    const picked = npcIdentity(view, 'gang-1', {});
    expect(view.personality.names).toContainEqual(picked);
    expect(npcIdentity(view, 'gang-1', null)).toEqual(picked);
  });

  it('orders ordinary targets by the crew habit', () => {
    const list = [
      target('rich'),
      target('rides', { lowRiders: 3 }),
      target('stash', { crack: 500 }),
      target('weak', { thugs: 4 }),
      target('hurt', { woundedThugs: 12 }),
    ];
    expect(orderByTargeting(list, 'RICHEST')[0]!.id).toBe('rich');
    expect(orderByTargeting(list, 'RIDES')[0]!.id).toBe('rides');
    expect(orderByTargeting(list, 'PRODUCT')[0]!.id).toBe('stash');
    expect(orderByTargeting(list, 'WEAKEST')[0]!.id).toBe('weak');
    expect(orderByTargeting(list, 'DISTRACTED')[0]!.id).toBe('hurt');
  });

  it('keeps a record: wins, moves, biggest hit and last loss', () => {
    let history = withHit(EMPTY_HISTORY, { kind: 'STEAL_RIDE', won: true, cashCents: 0, target: 'Ray', at: hoursAgo(10) });
    history = withHit(history, { kind: 'RAID', won: true, cashCents: 2_000_000, target: 'Carlo', at: hoursAgo(8) });
    history = withHit(history, { kind: 'RAID', won: true, cashCents: 500_000, target: 'Maya', at: hoursAgo(6) });
    history = withHit(history, { kind: 'STEAL_RIDE', won: false, cashCents: 0, target: 'Lou', at: hoursAgo(4) });

    expect(history).toMatchObject({ wins: 3, losses: 1, moves: { STEAL_RIDE: 1, RAID: 2 } });
    expect(history.biggestHit).toEqual({ cents: 2_000_000, target: 'Carlo', at: hoursAgo(8) });
    expect(history.lastLoss).toEqual({ opponent: 'Lou', kind: 'STEAL_RIDE', at: hoursAgo(4) });
    expect(favoriteMove(history)).toBe('RAID');

    expect(withLoss(history, { opponent: 'Older', kind: 'RAID', at: hoursAgo(20) }).lastLoss?.opponent).toBe('Lou');
    expect(withLoss(history, { opponent: 'Newer', kind: 'RAID', at: hoursAgo(1) }).lastLoss?.opponent).toBe('Newer');
    // Round-trip through real JSON, the way memory is stored.
    expect(storedHistory(JSON.parse(JSON.stringify({ history: historyJson(history) })))).toEqual(history);
  });

  it('phrases reputation in bands, without exact money or counts', () => {
    let history = EMPTY_HISTORY;
    for (const at of [hoursAgo(30), hoursAgo(20)]) history = withHit(history, { kind: 'DRIVE_BY', won: true, cashCents: 0, target: 'Ray', at });
    history = withHit(history, { kind: 'RAID', won: true, cashCents: 2_500_000, target: 'Carlo', at: hoursAgo(5) });
    history = withHit(history, { kind: 'RAID', won: false, cashCents: 0, target: 'Maya', at: hoursAgo(2) });

    const lines = npcReputation(history, now);
    expect(lines).toEqual([
      'Known for drive-bys.',
      'Took a five-figure score off Carlo this week.',
      'Got sent home by Maya lately.',
    ]);
    expect(lines.join(' ')).not.toMatch(/\d/);
    expect(npcReputation(EMPTY_HISTORY, now)).toEqual([]);
  });
});
