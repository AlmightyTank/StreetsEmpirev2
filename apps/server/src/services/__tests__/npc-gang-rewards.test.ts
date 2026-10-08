import { describe, expect, it } from 'vitest';
import { DEFAULT_NPC_GANG_RULES } from '../npc-gang-rules.js';
import { npcBattleNotes, npcBountyBlock, npcBountyCents, npcRetireReason, storedRetirement } from '../npc-gang-rewards.js';

const rules = DEFAULT_NPC_GANG_RULES.rewards;
const open = { rules, wanted: true, playerToday: 0, playerCrewRecent: 0, crewToday: 0 };

describe('NPC gang rewards (Phase N)', () => {
  it('prices bounties by tier, and pays half for holding off a hit', () => {
    expect(npcBountyCents('SCRUB', 'ATTACKER', rules)).toBe(150_000);
    expect(npcBountyCents('KINGPIN', 'ATTACKER', rules)).toBe(1_200_000);
    expect(npcBountyCents('VETERAN', 'DEFENDER', rules)).toBe(300_000);
    expect(npcBountyCents('MYSTERY', 'ATTACKER', rules)).toBe(150_000);
  });

  it('only pays for wanted crews, and caps per player, per crew pair and per crew', () => {
    expect(npcBountyBlock(open)).toBeNull();
    expect(npcBountyBlock({ ...open, wanted: false })).toBe('NOT_WANTED');
    expect(npcBountyBlock({ ...open, playerToday: 3 })).toBe('PLAYER_DAILY_CAP');
    expect(npcBountyBlock({ ...open, playerCrewRecent: 1 })).toBe('CREW_COOLDOWN');
    expect(npcBountyBlock({ ...open, crewToday: 4 })).toBe('CREW_DAILY_CAP');
    expect(npcBountyBlock({ ...open, rules: { ...rules, enabled: false } })).toBe('DISABLED');
  });

  it('breaks a crew up after too many groundings or when it wakes broken', () => {
    expect(npcRetireReason({ dormancies: 2, woke: false, thugs: 1, rules })).toBeNull();
    expect(npcRetireReason({ dormancies: 3, woke: false, thugs: 30, rules })).toBe('GROUNDED_TOO_OFTEN');
    expect(npcRetireReason({ dormancies: 1, woke: true, thugs: 2, rules })).toBe('BROKEN');
    expect(npcRetireReason({ dormancies: 1, woke: true, thugs: 3, rules })).toBeNull();
    expect(npcRetireReason({ dormancies: 9, woke: true, thugs: 0, rules: { ...rules, enabled: false } })).toBeNull();
  });

  it('notes the NPC side and the bounty only on the winner it paid', () => {
    const outcome = { attackerNpc: false, defenderNpc: true, bounty: { playerId: 'human', cents: 150_000, crew: 'Cookhouse Crew' } };
    expect(npcBattleNotes(outcome, 'human', true)).toEqual({ opponentNpc: true, npcBounty: { cents: 150_000, crew: 'Cookhouse Crew' } });
    expect(npcBattleNotes(outcome, 'gang', false)).toEqual({});
    expect(npcBattleNotes({ attackerNpc: false, defenderNpc: false, bounty: null }, 'human', true)).toEqual({});
  });

  it('reads a break-up back from memory', () => {
    expect(storedRetirement({ retired: { reason: 'BROKEN', at: '2026-10-08T12:00:00.000Z' } })).toEqual({ reason: 'BROKEN', at: '2026-10-08T12:00:00.000Z' });
    expect(storedRetirement({ retired: 'yes' })).toBeNull();
    expect(storedRetirement(null)).toBeNull();
  });
});
