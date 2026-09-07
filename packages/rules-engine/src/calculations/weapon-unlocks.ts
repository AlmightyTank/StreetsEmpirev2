import type { Ruleset, WeaponUnlockKey } from '@streets/rulesets';

export interface WeaponUnlockState {
  streetWorkTurns: number;
  tek9Unlocked: boolean;
  ak47Unlocked: boolean;
}

type FavorPlayer = WeaponUnlockState & { thugs: number; cashCents: bigint; crack: number };

export function weaponUnlockField(key: WeaponUnlockKey): 'tek9Unlocked' | 'ak47Unlocked' {
  return key === 'TEK9' ? 'tek9Unlocked' : 'ak47Unlocked';
}

export function hasWeaponAccess(player: WeaponUnlockState, key: WeaponUnlockKey): boolean {
  return player[weaponUnlockField(key)];
}

export function weaponUnlockProgress(player: FavorPlayer, key: WeaponUnlockKey, ruleset: Ruleset) {
  const rules = ruleset.weaponUnlocks[key];
  const unlocked = hasWeaponAccess(player, key);
  const prerequisiteMet = rules.prerequisite === null || hasWeaponAccess(player, rules.prerequisite);
  const reputationMet = player.streetWorkTurns >= rules.workTurns && player.thugs >= rules.thugs && prerequisiteMet;
  return {
    key,
    weaponName: ruleset.weapons[key].name,
    title: rules.title,
    description: rules.description,
    unlocked,
    workTurns: player.streetWorkTurns,
    workTurnsRequired: rules.workTurns,
    thugs: player.thugs,
    thugsRequired: rules.thugs,
    prerequisiteName: rules.prerequisite ? ruleset.weapons[rules.prerequisite].name : null,
    prerequisiteMet,
    cashCostCents: rules.cashCents,
    crackCost: rules.crack,
    reputationMet,
    canComplete: !unlocked && reputationMet && player.cashCents >= BigInt(rules.cashCents) && player.crack >= rules.crack,
  };
}

export class WeaponUnlockError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

/** Completing a favor grants access only; buying a weapon is a separate trade. */
export function calculateWeaponUnlock(player: FavorPlayer, key: string, ruleset: Ruleset) {
  if (!Object.hasOwn(ruleset.weaponUnlocks, key)) {
    throw new WeaponUnlockError('UNKNOWN_FAVOR', 'Tommy does not have that favor for you.');
  }
  const unlockKey = key as WeaponUnlockKey;
  const progress = weaponUnlockProgress(player, unlockKey, ruleset);
  if (progress.unlocked) throw new WeaponUnlockError('ALREADY_UNLOCKED', 'You already have access to that weapon this round.');
  if (!progress.prerequisiteMet) throw new WeaponUnlockError('FAVOR_PREREQUISITE', `Earn ${progress.prerequisiteName} access first.`);
  if (!progress.reputationMet) throw new WeaponUnlockError('REPUTATION_TOO_LOW', `Tommy needs ${progress.workTurnsRequired} street-work turns and ${progress.thugsRequired} thugs before offering this favor.`);
  if (player.cashCents < BigInt(progress.cashCostCents)) throw new WeaponUnlockError('NOT_ENOUGH_CASH', 'You do not have enough cash to fund this shipment.');
  if (player.crack < progress.crackCost) throw new WeaponUnlockError('NOT_ENOUGH_CRACK', 'You do not have enough crack for Tommy’s delivery.');
  return {
    key: unlockKey, weaponName: progress.weaponName, favorTitle: progress.title,
    cashSpentCents: progress.cashCostCents, crackDelivered: progress.crackCost,
    field: weaponUnlockField(unlockKey),
  };
}
