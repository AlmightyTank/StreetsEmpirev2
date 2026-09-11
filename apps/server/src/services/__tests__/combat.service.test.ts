import { describe, expect, it } from 'vitest';
import type { RoundPlayer } from '@prisma/client';
import { classicOgV02, classicOgV02D } from '@streets/rulesets';
import { combatAttackerBlock, combatProtectionUntil, combatTargetBlock } from '../combat.service.js';

const model = classicOgV02.combat;
const old = new Date('2026-09-08T00:00:00.000Z');
const now = new Date('2026-09-10T00:00:00.000Z');

function player(overrides: Partial<RoundPlayer> = {}): RoundPlayer {
  return {
    id: 'player-a',
    accountId: 'account-a',
    roundId: 'round-a',
    cityId: 'city-a',
    displayName: 'Player A',
    publicPimpId: 1000,
    cashCents: 2_000_000n,
    turns: 200,
    whores: 1,
    thugs: 40,
    woundedThugs: 0,
    condoms: 250,
    medicine: 0,
    crack: 100,
    beer: 100,
    pistols: 40,
    shotguns: 0,
    tek9s: 0,
    ak47s: 0,
    lowRiders: 0,
    payoutPercent: 50,
    thugHappiness: 100,
    whoreHappiness: 100,
    netWorthCents: 2_000_000n,
    localRank: 1,
    nationalRank: 1,
    dailyStartingLocalRank: 1,
    dailyStartingNationalRank: 1,
    dailyRankSnapshotAt: old,
    lastTurnCalculationAt: old,
    lastAwayBonusAt: null,
    lastActiveAt: now,
    raidProtectedUntil: null,
    raidCooldownUntil: null,
    lastRaidedAt: null,
    createdAt: old,
    updatedAt: old,
    ...overrides,
  } as unknown as RoundPlayer;
}

describe('combat eligibility helpers', () => {
  it('uses the later of newcomer and raid protection', () => {
    const newcomer = player({ createdAt: new Date('2026-09-09T12:00:00.000Z') });
    expect(combatProtectionUntil(newcomer, model).toISOString()).toBe('2026-09-10T12:00:00.000Z');

    const shielded = player({ createdAt: old, raidProtectedUntil: new Date('2026-09-10T06:00:00.000Z') });
    expect(combatProtectionUntil(shielded, model).toISOString()).toBe('2026-09-10T06:00:00.000Z');
  });

  it('blocks protected attackers, cooldowns, empty crews and low turns', () => {
    expect(combatAttackerBlock(player({ createdAt: new Date('2026-09-09T12:00:00.000Z') }), model, now)).toContain('protected');
    expect(combatAttackerBlock(player({ raidCooldownUntil: new Date('2026-09-10T00:15:00.000Z') }), model, now)).toContain('regrouping');
    expect(combatAttackerBlock(player({ thugs: 0 }), model, now)).toContain('recover');
    expect(combatAttackerBlock(player({ turns: 9 }), model, now)).toContain('10 turns');
  });

  it('lets fresh 0.2.0-D players test raids immediately', () => {
    const modelD = classicOgV02D.combat;
    const freshAttacker = player({ id: 'attacker', accountId: 'attacker-account', createdAt: now });
    const freshDefender = player({ id: 'defender', accountId: 'defender-account', publicPimpId: 1001, createdAt: now });

    expect(combatProtectionUntil(freshAttacker, modelD)).toEqual(now);
    expect(combatAttackerBlock(freshAttacker, modelD, now)).toBeNull();
    expect(combatTargetBlock(freshAttacker, freshDefender, modelD, now)).toBeNull();
    expect(classicOgV02D.round.startingPlayer.cashCents).toBeGreaterThan(modelD.loot.protectedCashCents);
    expect(classicOgV02D.round.startingPlayer.thugs).toBe(10);
    expect(classicOgV02D.round.startingPlayer.pistols).toBe(10);
  });

  it('compares full available strength, not the attack squad size', () => {
    const attacker = player({ id: 'attacker', accountId: 'attacker-account', thugs: 40, woundedThugs: 20, pistols: 40 });
    const weak = player({ id: 'defender', accountId: 'defender-account', publicPimpId: 1001, thugs: 5, pistols: 5 });
    const fair = player({ id: 'defender', accountId: 'defender-account', publicPimpId: 1001, thugs: 10, pistols: 10 });

    expect(combatTargetBlock(attacker, weak, model, now)).toContain('too weak');
    expect(combatTargetBlock(attacker, fair, model, now)).toBeNull();
  });

  it('requires same round, same city, exposed cash and a defender return after raids', () => {
    const attacker = player({ id: 'attacker', accountId: 'attacker-account' });
    expect(combatTargetBlock(attacker, player({ id: 'defender', accountId: 'defender-account', roundId: 'other' }), model, now)).toContain('round');
    expect(combatTargetBlock(attacker, player({ id: 'defender', accountId: 'defender-account', cityId: 'other' }), model, now)).toContain('city');
    expect(combatTargetBlock(attacker, player({ id: 'defender', accountId: 'defender-account', cashCents: 500_000n }), model, now)).toContain('exposed cash');
    expect(combatTargetBlock(attacker, player({
      id: 'defender',
      accountId: 'defender-account',
      lastActiveAt: new Date('2026-09-09T23:00:00.000Z'),
      lastRaidedAt: new Date('2026-09-09T23:30:00.000Z'),
    }), model, now)).toContain('not returned');
  });
});
