import { describe, expect, it } from 'vitest';
import { classicOgV01 } from '@streets/rulesets';
import type { TraderKey, WeaponUnlockKey } from '@streets/rulesets';
import {
  calculateWeaponUnlock,
  hasWeaponAccess,
  WeaponUnlockError,
  weaponUnlockProgress,
  type WeaponUnlockState,
} from '../calculations/weapon-unlocks.js';
import { emptyStandings, traderKeys, type Standings } from '../calculations/reputation.js';
import { calculateStoreTrade } from '../calculations/stores.js';
import { fullShelves } from '../calculations/restock.js';

const rules = classicOgV01;
const LADDER: WeaponUnlockKey[] = ['SHOTGUN', 'TEK9', 'AK47'];

/** A player with no access to anything heavier than a pistol. */
function locked(overrides: Partial<WeaponUnlockState> = {}): WeaponUnlockState {
  return { shotgunUnlocked: false, tek9Unlocked: false, ak47Unlocked: false, ...overrides };
}

/** Standing spread evenly across every trader, totalling `total`. */
function standingOf(total: number): Standings {
  const standings = emptyStandings(rules);
  const keys = traderKeys(rules);
  let left = total;
  keys.forEach((key, index) => {
    const share = Math.min(rules.reputation.perTraderMax, Math.ceil(left / (keys.length - index)));
    standings[key]!.points = share;
    left -= share;
  });
  return standings;
}

describe('weapon access', () => {
  it('is bought with standing, not with turns or cash', () => {
    // The old ladder read `streetWorkTurns`, a counter named after an action
    // that was deleted. Nothing in a rule should reference work or money.
    for (const key of LADDER) {
      expect(Object.keys(rules.weaponUnlocks[key])).toEqual([
        'title',
        'description',
        'totalRep',
        'prerequisite',
      ]);
    }
  });

  it('climbs in order, each rung dearer than the last', () => {
    expect(rules.weaponUnlocks.SHOTGUN.totalRep).toBeLessThan(rules.weaponUnlocks.TEK9.totalRep);
    expect(rules.weaponUnlocks.TEK9.totalRep).toBeLessThan(rules.weaponUnlocks.AK47.totalRep);

    expect(rules.weaponUnlocks.SHOTGUN.prerequisite).toBeNull();
    expect(rules.weaponUnlocks.TEK9.prerequisite).toBe('SHOTGUN');
    expect(rules.weaponUnlocks.AK47.prerequisite).toBe('TEK9');
  });

  it('cannot be reached by trading alone', () => {
    // The guard on the whole design: showing up every day for a round tops out
    // below the AK-47, so the favours are mandatory rather than a shortcut.
    const tradeOnly = rules.reputation.trade.maxPoints * traderKeys(rules).length;

    expect(tradeOnly).toBeLessThan(rules.weaponUnlocks.AK47.totalRep);
    expect(
      weaponUnlockProgress(locked({ shotgunUnlocked: true, tek9Unlocked: true }), standingOf(tradeOnly), 'AK47', rules)
        .canComplete,
    ).toBe(false);
  });

  it('is reachable inside a round once every favour is done', () => {
    const ceiling =
      (rules.reputation.trade.maxPoints + rules.reputation.questPoints) * traderKeys(rules).length;

    expect(ceiling).toBeGreaterThanOrEqual(rules.weaponUnlocks.AK47.totalRep);
  });

  it('refuses a rung whose prerequisite is not held, however high the standing', () => {
    expect(() =>
      calculateWeaponUnlock(locked(), standingOf(400), 'AK47', rules),
    ).toThrow(/Shotgun access first|Tek-9 access first/);
  });

  it('refuses a rung the city does not rate you for', () => {
    expect(() => calculateWeaponUnlock(locked(), standingOf(10), 'SHOTGUN', rules)).toThrow(
      WeaponUnlockError,
    );
    expect(() => calculateWeaponUnlock(locked(), standingOf(10), 'SHOTGUN', rules)).toThrow(
      /10 of 50 reputation/,
    );
  });

  it('grants access and takes nothing for it', () => {
    // Unlocking is the city agreeing about you. Buying the gun is a separate
    // trade against your wallet and Tommy's shelf.
    const unlock = calculateWeaponUnlock(locked(), standingOf(50), 'SHOTGUN', rules);

    expect(unlock).toEqual({
      key: 'SHOTGUN',
      weaponName: rules.weapons.SHOTGUN.name,
      title: rules.weaponUnlocks.SHOTGUN.title,
      field: 'shotgunUnlocked',
    });
    expect(Object.keys(unlock)).not.toContain('cashSpentCents');
    expect(Object.keys(unlock)).not.toContain('crackDelivered');
  });

  it('will not grant the same access twice', () => {
    expect(() =>
      calculateWeaponUnlock(locked({ shotgunUnlocked: true }), standingOf(400), 'SHOTGUN', rules),
    ).toThrow(/already have access/);
  });

  it('refuses to sell a locked weapon whatever the shelf holds', () => {
    const buyer = {
      ...rules.round.startingPlayer,
      cashCents: 1_000_000_000n,
      ...locked(),
      ...fullShelves(rules),
    };

    for (const key of LADDER) {
      expect(() =>
        calculateStoreTrade(buyer, { store: 'TOMMY', item: key, direction: 'buy', quantity: 1 }, rules),
      ).toThrow();
    }
  });

  it('reports progress against the total, not against one shopkeeper', () => {
    // Tommy sells to you partly because Pip vouches for you, so standing
    // spread across four traders counts the same as standing with one.
    const spread = emptyStandings(rules);
    for (const key of traderKeys(rules)) spread[key]!.points = 20;

    const concentrated = emptyStandings(rules);
    concentrated[traderKeys(rules)[0] as TraderKey]!.points = 80;

    expect(weaponUnlockProgress(locked(), spread, 'SHOTGUN', rules).totalRep).toBe(80);
    expect(weaponUnlockProgress(locked(), concentrated, 'SHOTGUN', rules).totalRep).toBe(80);
  });

  it('never revokes access that has been earned', () => {
    // Standing can stall, but a shopkeeper who decided you are worth selling
    // to does not un-decide it because your crew shrank.
    const armed = locked({ shotgunUnlocked: true, tek9Unlocked: true, ak47Unlocked: true });
    const ruined = emptyStandings(rules);

    for (const key of LADDER) {
      expect(hasWeaponAccess(armed, key)).toBe(true);
      expect(weaponUnlockProgress(armed, ruined, key, rules).unlocked).toBe(true);
    }
  });

  it('does not sell what nobody in the city stocks', () => {
    expect(() => calculateWeaponUnlock(locked(), standingOf(400), 'ROCKET', rules)).toThrow(
      /Nobody in this city sells that/,
    );
  });
});
