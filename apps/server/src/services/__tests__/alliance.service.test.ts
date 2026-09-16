import { describe, expect, it } from 'vitest';
import type { RoundPlayer } from '@prisma/client';
import { classicOgV03C } from '@streets/rulesets';
import { allianceRelation, allianceTargetBlock, normalizeAllianceName, sharedRevengeScope } from '../alliance.service.js';
import { combatTargetBlock, driveByTargetBlock } from '../combat.service.js';

const now = new Date('2026-09-20T12:00:00.000Z');
const old = new Date('2026-09-10T00:00:00.000Z');
const later = new Date(now.getTime() + 3_600_000);
const earlier = new Date(now.getTime() - 3_600_000);

function side(overrides: Partial<Pick<RoundPlayer, 'allianceId' | 'formerAllianceId' | 'allianceCooldownUntil'>> = {}) {
  return { allianceId: null, formerAllianceId: null, allianceCooldownUntil: null, ...overrides };
}

function player(overrides: Partial<RoundPlayer> = {}): RoundPlayer {
  return {
    id: 'player-a', accountId: 'account-a', roundId: 'round-a', cityId: 'city-a', displayName: 'A', publicPimpId: 1000,
    cashCents: 2_000_000n, turns: 200, whores: 50, thugs: 40, woundedThugs: 0, condoms: 250, medicine: 0, crack: 100, beer: 100,
    pistols: 40, shotguns: 0, tek9s: 0, ak47s: 0, lowRiders: 2, payoutPercent: 50, thugHappiness: 100, whoreHappiness: 100,
    netWorthCents: 2_000_000n, lastActiveAt: now, lastTurnCalculationAt: old, createdAt: old, updatedAt: old,
    raidProtectedUntil: null, raidCooldownUntil: null, lastRaidedAt: null,
    driveByProtectedUntil: null, driveByCooldownUntil: null, lastDrivenByAt: null,
    hideoutSafeRoomLevel: 0, hideoutLookoutsLevel: 0, hideoutWorkshopLevel: 0, hideoutBackOfficeLevel: 0,
    allianceId: null, allianceJoinedAt: null, formerAllianceId: null, allianceCooldownUntil: null,
    ...overrides,
  } as unknown as RoundPlayer;
}

describe('alliance relations', () => {
  it('treats members of one alliance as allies, and strangers as strangers', () => {
    expect(allianceRelation(side({ allianceId: 'a' }), side({ allianceId: 'a' }), now)).toBe('ALLY');
    expect(allianceRelation(side({ allianceId: 'a' }), side({ allianceId: 'b' }), now)).toBeNull();
    expect(allianceRelation(side(), side(), now)).toBeNull();
  });

  it('keeps a leaver and their old alliance apart until the cooldown passes', () => {
    const leaver = side({ formerAllianceId: 'a', allianceCooldownUntil: later });
    expect(allianceRelation(leaver, side({ allianceId: 'a' }), now)).toBe('FORMER_ALLY');
    expect(allianceRelation(side({ allianceId: 'a' }), leaver, now)).toBe('FORMER_ALLY');
    // Two players who both left the same alliance recently are still former allies.
    expect(allianceRelation(leaver, side({ formerAllianceId: 'a', allianceCooldownUntil: later }), now)).toBe('FORMER_ALLY');
    // Once it passes they are strangers.
    expect(allianceRelation(side({ formerAllianceId: 'a', allianceCooldownUntil: earlier }), side({ allianceId: 'a' }), now)).toBeNull();
    // A cooldown from a different alliance says nothing about this one.
    expect(allianceRelation(side({ formerAllianceId: 'b', allianceCooldownUntil: later }), side({ allianceId: 'a' }), now)).toBeNull();
  });

  it('writes a player-facing reason', () => {
    expect(allianceTargetBlock(side({ allianceId: 'a' }), side({ allianceId: 'a' }), now)).toContain('your alliance');
    expect(allianceTargetBlock(side({ formerAllianceId: 'a', allianceCooldownUntil: later }), side({ allianceId: 'a' }), now)).toContain('cooldown');
  });

  it('shares revenge only for hits on the alliance since the member joined', () => {
    expect(sharedRevengeScope({ id: 'p', allianceId: null, allianceJoinedAt: null })).toEqual([{ defenderId: 'p' }]);
    expect(sharedRevengeScope({ id: 'p', allianceId: 'a', allianceJoinedAt: old })).toEqual([
      { defenderId: 'p' },
      { defenderAllianceId: 'a', createdAt: { gte: old } },
    ]);
  });

  it('normalizes names so case and spacing cannot duplicate one', () => {
    expect(normalizeAllianceName('  The   East  Side ')).toBe(normalizeAllianceName('the east side'));
  });
});

describe('no friendly fire in combat eligibility', () => {
  const model = classicOgV03C.combat;
  const attacker = player({ id: 'attacker', accountId: 'attacker-account', allianceId: 'crew' });
  const ally = player({ id: 'ally', accountId: 'ally-account', publicPimpId: 1001, allianceId: 'crew' });
  const stranger = player({ id: 'stranger', accountId: 'stranger-account', publicPimpId: 1002, allianceId: 'other' });
  const dropped = player({ id: 'dropped', accountId: 'dropped-account', publicPimpId: 1003, formerAllianceId: 'crew', allianceCooldownUntil: later });

  it('blocks raids and drive-bys on allies even when revenge is open', () => {
    expect(combatTargetBlock(attacker, ally, model, now, true)).toContain('your alliance');
    expect(driveByTargetBlock(attacker, ally, model, now, true)).toContain('your alliance');
    expect(combatTargetBlock(attacker, stranger, model, now)).toBeNull();
  });

  it('blocks a member who was just dropped, in both directions', () => {
    expect(combatTargetBlock(attacker, dropped, model, now, true)).toContain('cooldown');
    expect(combatTargetBlock(dropped, attacker, model, now, true)).toContain('cooldown');
    expect(driveByTargetBlock(dropped, attacker, model, now)).toContain('cooldown');
  });
});
