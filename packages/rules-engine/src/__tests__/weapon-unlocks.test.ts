import { describe, expect, it } from 'vitest';
import { classicOgV01, type Ruleset } from '@streets/rulesets';
import { calculateStoreTrade } from '../calculations/stores.js';
import { calculateWeaponUnlock, weaponUnlockProgress } from '../calculations/weapon-unlocks.js';

const player = {
  ...classicOgV01.round.startingPlayer, cashCents: 2_500_000n, thugs: 25,
  streetWorkTurns: 150, tek9Unlocked: false, ak47Unlocked: false,
};

describe('Tommy’s purchasing access', () => {
  it.each(['PISTOL', 'SHOTGUN'])('keeps %s available immediately', (item) => {
    expect(calculateStoreTrade(player, { store: 'TOMMY', item, quantity: 1, direction: 'buy' }, classicOgV01).quantityChange).toBe(1);
  });

  it.each(['TEK9', 'AK47'])('blocks %s even with enough money, work and crew', (item) => {
    expect(() => calculateStoreTrade(player, { store: 'TOMMY', item, quantity: 1, direction: 'buy' }, classicOgV01)).toThrow('Complete Tommy');
  });

  it('allows selling previously owned weapons without granting access', () => {
    const trade = calculateStoreTrade({ ...player, ak47s: 1 }, { store: 'TOMMY', item: 'AK47', quantity: 1, direction: 'sell' }, classicOgV01);
    expect(trade.quantityChange).toBe(-1);
    expect(player.ak47Unlocked).toBe(false);
  });

  it('shows existing work progress and all locked requirements', () => {
    const progress = weaponUnlockProgress({ ...player, streetWorkTurns: 49, thugs: 9 }, 'TEK9', classicOgV01);
    expect(progress).toMatchObject({ workTurns: 49, workTurnsRequired: 50, thugs: 9, thugsRequired: 10,
      crackCost: 100, reputationMet: false, canComplete: false, unlocked: false });
  });

  it('opens the first favor at the exact thresholds', () => {
    const ready = { ...player, streetWorkTurns: 50, thugs: 10, crack: 100 };
    expect(weaponUnlockProgress(ready, 'TEK9', classicOgV01).canComplete).toBe(true);
    expect(calculateWeaponUnlock(ready, 'TEK9', classicOgV01)).toMatchObject({
      field: 'tek9Unlocked', cashSpentCents: 0, crackDelivered: 100,
    });
  });

  it.each([{ streetWorkTurns: 49 }, { thugs: 9 }])('rejects a premature favor %j', (override) => {
    expect(() => calculateWeaponUnlock({ ...player, ...override }, 'TEK9', classicOgV01)).toThrow('50 street-work turns and 10 thugs');
  });

  it('requires the full supply delivery', () => {
    expect(() => calculateWeaponUnlock({ ...player, crack: 99 }, 'TEK9', classicOgV01)).toThrow('enough crack');
  });

  it('requires Tek-9 access before the AK-47 favor', () => {
    expect(() => calculateWeaponUnlock(player, 'AK47', classicOgV01)).toThrow('Earn Tek-9 access first');
  });

  it('requires the full shipment payment and uses integer cents', () => {
    expect(() => calculateWeaponUnlock({ ...player, tek9Unlocked: true, cashCents: 2_499_999n }, 'AK47', classicOgV01)).toThrow('enough cash');
    expect(calculateWeaponUnlock({ ...player, tek9Unlocked: true }, 'AK47', classicOgV01)).toMatchObject({ cashSpentCents: 2_500_000, crackDelivered: 0, field: 'ak47Unlocked' });
  });

  it('keeps access after losing crew and reputation thresholds', () => {
    const unlocked = { ...player, tek9Unlocked: true, thugs: 0, streetWorkTurns: 0 };
    expect(weaponUnlockProgress(unlocked, 'TEK9', classicOgV01).unlocked).toBe(true);
    expect(calculateStoreTrade(unlocked, { store: 'TOMMY', item: 'TEK9', quantity: 1, direction: 'buy' }, classicOgV01).totalCents).toBe(125_000n);
    expect(() => calculateWeaponUnlock(unlocked, 'TEK9', classicOgV01)).toThrow('already have access');
  });

  it.each(['PISTOL', '__proto__', 'constructor'])('rejects unknown favor %s', (key) => {
    expect(() => calculateWeaponUnlock(player, key, classicOgV01)).toThrow('does not have that favor');
  });

  it('reads all thresholds and costs from the round’s ruleset', () => {
    const rules: Ruleset = { ...classicOgV01, weaponUnlocks: {
      ...classicOgV01.weaponUnlocks, TEK9: { ...classicOgV01.weaponUnlocks.TEK9, workTurns: 200, thugs: 30, crack: 250 },
    } };
    expect(weaponUnlockProgress(player, 'TEK9', rules)).toMatchObject({ workTurnsRequired: 200, thugsRequired: 30, crackCost: 250, canComplete: false });
  });
});
