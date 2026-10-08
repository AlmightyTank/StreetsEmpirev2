import { describe, expect, it } from 'vitest';
import { DEFAULT_NPC_GANG_RULES } from '../npc-gang-rules.js';
import {
  dormancyCall, momentumAggression, momentumPace, npcMomentum, npcMood, storedDormancy, storedMomentum, type NpcFight,
} from '../npc-gang-momentum.js';

const rules = DEFAULT_NPC_GANG_RULES.escalation;
const now = new Date('2026-10-08T12:00:00.000Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

function fight(overrides: Partial<NpcFight> = {}): NpcFight {
  return { attacker: true, won: true, cashCents: 0, human: true, at: now, ...overrides };
}

describe('NPC gang momentum (Phase L)', () => {
  it('heats up on wins, more for profitable ones, and cools on losses', () => {
    expect(npcMomentum([fight()], 0, rules, now)).toBe(8);
    expect(npcMomentum([fight({ cashCents: 5_000 })], 0, rules, now)).toBe(12);
    expect(npcMomentum([fight({ won: false })], 0, rules, now)).toBe(-10);
    expect(npcMomentum([fight({ attacker: false, won: true })], 0, rules, now)).toBe(4);
    expect(npcMomentum([fight({ attacker: false, won: false })], 0, rules, now)).toBe(-8);
  });

  it('fades old fights on the half-life and charges for blocked streaks', () => {
    expect(npcMomentum([fight({ at: hoursAgo(12) })], 0, rules, now)).toBe(4);
    expect(npcMomentum([], 2, rules, now)).toBe(-6);
  });

  it('caps momentum both ways and is flat when escalation is off', () => {
    const wins = Array.from({ length: 20 }, () => fight({ cashCents: 1 }));
    expect(npcMomentum(wins, 0, rules, now)).toBe(50);
    expect(npcMomentum(wins.map((row) => ({ ...row, won: false })), 0, rules, now)).toBe(-50);
    expect(npcMomentum(wins, 0, { ...rules, enabled: false }, now)).toBe(0);
  });

  it('reads mood and shifts aggression and pacing within their caps', () => {
    expect(npcMood(25, rules)).toBe('HOT');
    expect(npcMood(0, rules)).toBe('STEADY');
    expect(npcMood(-20, rules)).toBe('COOLED');
    expect(momentumAggression(25, rules)).toBe(10);
    expect(momentumAggression(-50, rules)).toBe(-20);
    expect(momentumPace(50, rules)).toBeCloseTo(0.75);
    expect(momentumPace(-50, rules)).toBeCloseTo(1.25);
    expect(momentumPace(0, rules)).toBe(1);
  });

  it('sends beaten gangs to ground for longer the deeper the hole', () => {
    expect(dormancyCall({ momentum: -29, humanHits: 0, rules })).toBeNull();
    expect(dormancyCall({ momentum: -30, humanHits: 0, rules })).toEqual({ reason: 'BEATEN', hours: 8 });
    expect(dormancyCall({ momentum: -40, humanHits: 0, rules })).toEqual({ reason: 'BEATEN', hours: 16 });
    expect(dormancyCall({ momentum: -50, humanHits: 0, rules })).toEqual({ reason: 'BEATEN', hours: 24 });
  });

  it('sends over-targeted gangs to ground whatever their momentum', () => {
    expect(dormancyCall({ momentum: 30, humanHits: 5, rules })).toEqual({ reason: 'OVER_TARGETED', hours: 24 });
    expect(dormancyCall({ momentum: 30, humanHits: 4, rules })).toBeNull();
    expect(dormancyCall({ momentum: -50, humanHits: 9, rules: { ...rules, enabled: false } })).toBeNull();
  });

  it('reads momentum and dormancy back from memory', () => {
    const dormancy = { reason: 'BEATEN', since: hoursAgo(10).toISOString(), until: now.toISOString(), momentum: -35, wokeAt: null };
    expect(storedDormancy({ dormancy })).toEqual(dormancy);
    expect(storedDormancy({ dormancy: { ...dormancy, reason: 'TIRED' } })).toBeNull();
    expect(storedMomentum({ momentum: 12.5 })).toBe(12.5);
    expect(storedMomentum({ momentum: 'hot' })).toBe(0);
    expect(storedMomentum(null)).toBe(0);
  });
});
