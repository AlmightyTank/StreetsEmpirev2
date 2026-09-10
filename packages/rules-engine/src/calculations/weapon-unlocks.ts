/**
 * Section 34. Who the city will sell the heavy stuff to.
 *
 * Access is bought with standing, not with turns or cash. The gate reads the
 * total reputation across every trader, so a gun is the city agreeing about
 * you rather than one shopkeeper being paid enough.
 *
 * Unlocking is not a purchase and takes nothing off the player: it flips a
 * flag, and buying the weapon afterwards is an ordinary trade. That keeps the
 * two systems separate - reputation decides what is on the menu, the shelf and
 * your wallet decide what you leave with.
 */

import type { Ruleset, WeaponUnlockKey } from '@streets/rulesets';
import { totalReputation, type Standings } from './reputation.js';

export interface WeaponUnlockState {
  shotgunUnlocked: boolean;
  tek9Unlocked: boolean;
  ak47Unlocked: boolean;
}

export type WeaponUnlockField = 'shotgunUnlocked' | 'tek9Unlocked' | 'ak47Unlocked';

const FIELDS: Record<WeaponUnlockKey, WeaponUnlockField> = {
  SHOTGUN: 'shotgunUnlocked',
  TEK9: 'tek9Unlocked',
  AK47: 'ak47Unlocked',
};

export function weaponUnlockField(key: WeaponUnlockKey): WeaponUnlockField {
  return FIELDS[key];
}

export function hasWeaponAccess(player: WeaponUnlockState, key: WeaponUnlockKey): boolean {
  return player[weaponUnlockField(key)];
}

export interface WeaponUnlockProgress {
  key: WeaponUnlockKey;
  weaponName: string;
  title: string;
  description: string;
  unlocked: boolean;
  /** Standing across the whole city, and what this rung wants. */
  totalRep: number;
  totalRepRequired: number;
  prerequisiteName: string | null;
  prerequisiteMet: boolean;
  canComplete: boolean;
}

export function weaponUnlockProgress(
  player: WeaponUnlockState,
  standings: Standings,
  key: WeaponUnlockKey,
  ruleset: Ruleset,
): WeaponUnlockProgress {
  const rules = ruleset.weaponUnlocks[key];
  const unlocked = hasWeaponAccess(player, key);
  const prerequisiteMet = rules.prerequisite === null || hasWeaponAccess(player, rules.prerequisite);
  const rep = totalReputation(standings);

  return {
    key,
    weaponName: ruleset.weapons[key].name,
    title: rules.title,
    description: rules.description,
    unlocked,
    totalRep: rep,
    totalRepRequired: rules.totalRep,
    prerequisiteName: rules.prerequisite ? ruleset.weapons[rules.prerequisite].name : null,
    prerequisiteMet,
    canComplete: !unlocked && prerequisiteMet && rep >= rules.totalRep,
  };
}

export class WeaponUnlockError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function calculateWeaponUnlock(
  player: WeaponUnlockState,
  standings: Standings,
  key: string,
  ruleset: Ruleset,
) {
  if (!Object.hasOwn(ruleset.weaponUnlocks, key)) {
    throw new WeaponUnlockError('UNKNOWN_UNLOCK', 'Nobody in this city sells that.');
  }

  const unlockKey = key as WeaponUnlockKey;
  const progress = weaponUnlockProgress(player, standings, unlockKey, ruleset);

  if (progress.unlocked) {
    throw new WeaponUnlockError(
      'ALREADY_UNLOCKED',
      'You already have access to that weapon this round.',
    );
  }
  if (!progress.prerequisiteMet) {
    throw new WeaponUnlockError(
      'UNLOCK_PREREQUISITE',
      `Earn ${progress.prerequisiteName} access first.`,
    );
  }
  if (progress.totalRep < progress.totalRepRequired) {
    throw new WeaponUnlockError(
      'REPUTATION_TOO_LOW',
      `The city needs to think more of you than it does: ${progress.totalRep} of ${progress.totalRepRequired} reputation.`,
    );
  }

  return {
    key: unlockKey,
    weaponName: progress.weaponName,
    title: progress.title,
    field: weaponUnlockField(unlockKey),
  };
}
