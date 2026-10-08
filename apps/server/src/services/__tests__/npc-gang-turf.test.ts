import { describe, expect, it } from 'vitest';
import type { NpcGangTurfRules } from '@streets/rulesets';
import { NO_NPC_TURF, npcTurfMoves, type NpcTurfBlock, type NpcTurfCapacity, type NpcTurfProspect, type NpcTurfState } from '../npc-gang-turf.js';

const rules: NpcGangTurfRules = {
  enabled: true,
  minAmbition: 50,
  maxBlocksPerGang: 1,
  maxNpcBlocksPerCity: 2,
  reinforceBelowMinimum: 1.25,
  supplyHours: 12,
  abandonAfterLosses: 3,
  lossWindowHours: 24,
  pressureIntentBonus: 15,
};

function cap(overrides: Partial<NpcTurfCapacity> = {}): NpcTurfCapacity {
  return {
    ambition: 70, armedFit: 20, turns: 40, postTurnCost: 2, scoutMinTurns: 1, perScoutTurn: 1, squadCap: 25,
    beer: 50, beerNeed: 6, canBuyBeer: true, ...overrides,
  };
}

function block(overrides: Partial<NpcTurfBlock> = {}): NpcTurfBlock {
  return { turfId: 'turf-1', district: 'CASINO', districtName: 'Casino', cornerThugs: 10, minimum: 8, push: null, war: null, ...overrides };
}

function prospect(overrides: Partial<NpcTurfProspect> = {}): NpcTurfProspect {
  return { district: 'LOW_RENT', districtName: 'Low Rent', presence: 10, needed: 40, locals: 12, minimum: 4, ...overrides };
}

function state(overrides: Partial<NpcTurfState> = {}): NpcTurfState {
  return { ...NO_NPC_TURF, enabled: true, canHoldMore: true, ...overrides };
}

describe('NPC gang turf moves (Phase J)', () => {
  it('does nothing when NPC turf is off', () => {
    expect(npcTurfMoves(NO_NPC_TURF, rules, cap())).toEqual({ forced: null, option: null });
  });

  it('works a locals block for presence until it can claim it', () => {
    const { option } = npcTurfMoves(state({ prospect: prospect() }), rules, cap());
    expect(option).toMatchObject({ kind: 'WORK', turns: 12 });

    const almost = npcTurfMoves(state({ prospect: prospect({ presence: 37.5 }) }), rules, cap());
    expect(almost.option).toMatchObject({ kind: 'WORK', turns: 3 });
  });

  it('claims with a squad that beats the locals and clears the corner minimum', () => {
    const { option } = npcTurfMoves(state({ prospect: prospect({ presence: 41 }) }), rules, cap());
    expect(option).toMatchObject({ kind: 'CLAIM', thugs: 14 });
    expect(npcTurfMoves(state({ prospect: prospect({ presence: 41 }) }), rules, cap({ armedFit: 13 })).option).toBeNull();
  });

  it('leaves turf alone when unambitious, capped or out of room', () => {
    const ready = prospect({ presence: 41 });
    expect(npcTurfMoves(state({ prospect: ready }), rules, cap({ ambition: 40 })).option).toBeNull();
    expect(npcTurfMoves(state({ prospect: ready, canHoldMore: false }), rules, cap()).option).toBeNull();
  });

  it('reinforces a thin corner before looking for more turf', () => {
    const { option } = npcTurfMoves(state({ held: [block({ cornerThugs: 8 })], prospect: prospect() }), rules, cap());
    expect(option).toMatchObject({ kind: 'REINFORCE', thugs: 2 });
  });

  it('backs up a spotted push instead of posting more', () => {
    const push = { id: 'push-1', landsAt: '2026-10-08T13:00:00.000Z', seen: true, backedUp: false };
    expect(npcTurfMoves(state({ held: [block({ cornerThugs: 8, push })] }), rules, cap()).forced)
      .toMatchObject({ kind: 'BACKUP', pushId: 'push-1', thugs: 20 });

    const unseen = npcTurfMoves(state({ held: [block({ cornerThugs: 8, push: { ...push, seen: false } })] }), rules, cap());
    expect(unseen.forced).toBeNull();
    expect(unseen.option).toMatchObject({ kind: 'REINFORCE' });

    const sent = npcTurfMoves(state({ held: [block({ cornerThugs: 8, push: { ...push, backedUp: true } })] }), rules, cap());
    expect(sent).toEqual({ forced: null, option: null });
  });

  it('answers a block war: defends the incoming assault, then breaks a siege', () => {
    const war = { id: 'war-1', status: 'OPENING', defendFightId: 'fight-1', canBreak: false };
    expect(npcTurfMoves(state({ held: [block({ war })] }), rules, cap()).forced)
      .toMatchObject({ kind: 'WAR_DEFEND', warId: 'war-1', thugs: 20 });
    expect(npcTurfMoves(state({ held: [block({ war: { ...war, status: 'SIEGE', defendFightId: null, canBreak: true } })] }), rules, cap()).forced)
      .toMatchObject({ kind: 'WAR_BREAK', warId: 'war-1' });
  });

  it('never walks away from a block mid-war', () => {
    const war = { id: 'war-1', status: 'BETWEEN', defendFightId: null, canBreak: false };
    expect(npcTurfMoves(state({ held: [block({ war })], recentLosses: 5 }), rules, cap())).toEqual({ forced: null, option: null });
  });

  it('abandons after repeated losses, an unfixable corner or no way to feed it', () => {
    expect(npcTurfMoves(state({ held: [block()], recentLosses: 3 }), rules, cap()).forced)
      .toMatchObject({ kind: 'ABANDON', reason: 'LOSSES' });
    expect(npcTurfMoves(state({ held: [block({ cornerThugs: 3 })] }), rules, cap({ armedFit: 2 })).forced)
      .toMatchObject({ kind: 'ABANDON', reason: 'UNDERMANNED' });
    expect(npcTurfMoves(state({ held: [block()] }), rules, cap({ beer: 0, canBuyBeer: false })).forced)
      .toMatchObject({ kind: 'ABANDON', reason: 'UNSUPPLIED' });
  });
});
