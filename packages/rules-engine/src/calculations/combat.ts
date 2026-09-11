import type { CombatModel, WeaponKey } from '@streets/rulesets';
import { roundStochastic, type Rng } from '../rng.js';

/** Fit thugs only. An eventual service must exclude thugs still recovering. */
export interface CombatCrew {
  readonly thugs: number;
  readonly thugHappiness: number;
  readonly weapons: Readonly<Record<WeaponKey, number>>;
}

export interface CombatSquad {
  readonly committed: number;
  readonly armed: number;
  readonly unarmed: number;
  readonly equipment: Readonly<Record<WeaponKey, number>>;
  readonly baseStrength: number;
  readonly moraleMultiplier: number;
  readonly strength: number;
}

export interface RaidInput {
  readonly attacker: CombatCrew;
  readonly defender: CombatCrew;
  readonly attackingThugs: number;
  readonly attackerTurns: number;
  readonly defenderCashCents: bigint;
  readonly defenderCrack?: number;
}

export interface RaidResult {
  readonly modelVersion: string;
  readonly winner: 'ATTACKER' | 'DEFENDER';
  readonly attacker: CombatSquad;
  readonly defender: CombatSquad;
  readonly rolls: { readonly attacker: number; readonly defender: number };
  readonly effectiveStrength: { readonly attacker: number; readonly defender: number };
  readonly turnCost: number;
  readonly attackerTurnsAfter: number;
  /** Projections only in A: no injury state is persisted by this calculator. */
  readonly wounds: {
    readonly attacker: number;
    readonly defender: number;
    readonly recoveryMinutes: number;
  };
  readonly lootCents: bigint;
  readonly lootCrack: number;
  readonly cashChanges: { readonly attackerCents: bigint; readonly defenderCents: bigint };
  readonly crackChanges: { readonly attacker: number; readonly defender: number };
  readonly defenderCashAfterCents: bigint;
  readonly defenderCrackAfter: number;
}

export class CombatError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'CombatError';
  }
}

function requireCondition(condition: boolean, code: string, message: string): asserts condition {
  if (!condition) throw new CombatError(code, message);
}

function count(value: number, name: string): void {
  requireCondition(Number.isSafeInteger(value) && value >= 0, 'INVALID_COUNT', `${name} must be a nonnegative safe integer.`);
}

function fraction(value: number, name: string): void {
  requireCondition(Number.isFinite(value) && value >= 0 && value <= 1, 'INVALID_MODEL', `${name} must be between zero and one.`);
}

function weaponKeys(model: CombatModel): WeaponKey[] {
  return Object.keys(model.weapons) as WeaponKey[];
}

export function validateCombatModel(model: CombatModel): void {
  count(model.squadCap, 'Squad cap');
  count(model.turnCost, 'Turn cost');
  requireCondition(model.squadCap > 0 && model.turnCost > 0, 'INVALID_MODEL', 'Squad cap and turn cost must be positive.');
  const s = model.strength;
  requireCondition(
    [s.perThug, s.weaponPowerExponent, s.defenseMultiplier].every((n) => Number.isFinite(n) && n > 0),
    'INVALID_MODEL', 'Strength parameters must be finite and positive.',
  );
  fraction(s.moraleFloor, 'Morale floor');
  fraction(s.variance, 'Strength variance');
  requireCondition(s.moraleFloor > 0 && s.variance < 1, 'INVALID_MODEL', 'Morale must stay positive and variance below one.');
  for (const key of weaponKeys(model)) {
    const power = model.weapons[key].power;
    requireCondition(Number.isFinite(power) && power >= 0, 'INVALID_MODEL', 'Weapon power must be finite and nonnegative.');
    requireCondition(Number.isFinite(model.squadCap * (s.perThug + power ** s.weaponPowerExponent) * s.defenseMultiplier * (1 + s.variance)),
      'INVALID_MODEL', 'Squad strength exceeds the supported numeric range.');
  }
  fraction(model.wounds.winnerFraction, 'Winner wound fraction');
  fraction(model.wounds.loserFraction, 'Loser wound fraction');
  fraction(model.wounds.maxFraction, 'Wound cap');
  requireCondition(model.wounds.winnerFraction <= model.wounds.loserFraction && model.wounds.loserFraction <= model.wounds.maxFraction,
    'INVALID_MODEL', 'Wounds must increase from winner to loser and stay within the cap.');
  count(model.wounds.recoveryMinutes, 'Recovery minutes');
  requireCondition(model.wounds.recoveryMinutes > 0, 'INVALID_MODEL', 'Recovery must take positive time.');
  count(model.loot.protectedCashCents, 'Protected cash');
  count(model.loot.perFitAttackerCents, 'Carrying capacity');
  count(model.loot.exposedCashPercent, 'Loot percent');
  requireCondition(model.loot.exposedCashPercent <= 100, 'INVALID_MODEL', 'Loot percent cannot exceed 100.');
  if (model.loot.exposedDrugPercent !== undefined) {
    count(model.loot.exposedDrugPercent, 'Drug loot percent');
    requireCondition(model.loot.exposedDrugPercent <= 100, 'INVALID_MODEL', 'Drug loot percent cannot exceed 100.');
  }
  if (model.loot.perFitAttackerCrack !== undefined) count(model.loot.perFitAttackerCrack, 'Drug carrying capacity');
}

function validateCrew(crew: CombatCrew, model: CombatModel): void {
  count(crew.thugs, 'Fit thugs');
  requireCondition(Number.isFinite(crew.thugHappiness) && crew.thugHappiness >= 0 && crew.thugHappiness <= 100,
    'INVALID_MORALE', 'Thug happiness must be between zero and 100.');
  for (const key of weaponKeys(model)) count(crew.weapons[key], `${key} inventory`);
}

function equip(crew: CombatCrew, committed: number, model: CombatModel): CombatSquad {
  const equipment = {} as Record<WeaponKey, number>;
  let remaining = committed;
  let weaponStrength = 0;
  // Sort on the supplied powers, not on the names of the classic guns.
  const ordered = weaponKeys(model).sort((a, b) => model.weapons[b].power - model.weapons[a].power || a.localeCompare(b));
  for (const key of ordered) {
    const assigned = Math.min(crew.weapons[key], remaining);
    equipment[key] = assigned;
    remaining -= assigned;
    weaponStrength += assigned * model.weapons[key].power ** model.strength.weaponPowerExponent;
  }
  const baseStrength = committed * model.strength.perThug + weaponStrength;
  const moraleMultiplier = model.strength.moraleFloor + (1 - model.strength.moraleFloor) * crew.thugHappiness / 100;
  return { committed, armed: committed - remaining, unarmed: remaining, equipment, baseStrength, moraleMultiplier, strength: baseStrength * moraleMultiplier };
}

/** One weapon per committed thug; reserves and unused guns contribute no power. */
export function equipCombatSquad(crew: CombatCrew, committed: number, model: CombatModel): CombatSquad {
  validateCombatModel(model);
  validateCrew(crew, model);
  count(committed, 'Committed thugs');
  requireCondition(committed <= crew.thugs && committed <= model.squadCap, 'INVALID_SQUAD', 'The squad exceeds fit crew or the engagement cap.');
  return equip(crew, committed, model);
}

function checkedRoll(rng: Rng): number {
  const value = rng();
  requireCondition(Number.isFinite(value) && value >= 0 && value < 1, 'INVALID_RNG', 'Combat rolls must be in [0, 1).');
  return value;
}

function wounded(size: number, won: boolean, model: CombatModel, roll: number): number {
  const rate = won ? model.wounds.winnerFraction : model.wounds.loserFraction;
  // Stochastic rounding keeps tiny squads from being permanently immune.
  // Whole-person cap rounds up: a one-thug squad can have one temporary wound.
  return Math.min(size, Math.ceil(size * model.wounds.maxFraction), roundStochastic(size * rate, () => roll));
}

/**
 * Pure 0.2.0-A simulation. Requires explicit model and RNG; never reads a DB,
 * clock, or default ruleset. Eligibility and repeated attacks belong to B.
 * Consumes exactly four rolls: attacker strength, defender strength, two wounds.
 */
export function simulateRaid(input: RaidInput, model: CombatModel, rng: Rng): RaidResult {
  validateCombatModel(model);
  validateCrew(input.attacker, model);
  validateCrew(input.defender, model);
  count(input.attackingThugs, 'Attacking thugs');
  count(input.attackerTurns, 'Attacker turns');
  requireCondition(input.attackingThugs > 0 && input.attackingThugs <= input.attacker.thugs && input.attackingThugs <= model.squadCap,
    'INVALID_SQUAD', 'Send at least one fit thug, within your crew and the engagement cap.');
  requireCondition(input.attackerTurns >= model.turnCost, 'NOT_ENOUGH_TURNS', 'There are not enough turns for this raid.');
  requireCondition(typeof input.defenderCashCents === 'bigint' && input.defenderCashCents >= 0n,
    'INVALID_CASH', 'Defender cash must be nonnegative BigInt cents.');
  if (input.defenderCrack !== undefined) count(input.defenderCrack, 'Defender crack');

  const attacker = equip(input.attacker, input.attackingThugs, model);
  const defender = equip(input.defender, Math.min(input.defender.thugs, model.squadCap), model);
  const rolls = { attacker: checkedRoll(rng), defender: checkedRoll(rng) };
  const woundRolls = { attacker: checkedRoll(rng), defender: checkedRoll(rng) };
  const spread = (roll: number) => 1 + (roll * 2 - 1) * model.strength.variance;
  const effectiveStrength = {
    attacker: attacker.strength * spread(rolls.attacker),
    defender: defender.strength * model.strength.defenseMultiplier * spread(rolls.defender),
  };
  // Holding the ground is sufficient: exact ties go to the defender.
  const won = effectiveStrength.attacker > effectiveStrength.defender;
  const uncontested = defender.committed === 0;
  const wounds = {
    attacker: uncontested ? 0 : wounded(attacker.committed, won, model, woundRolls.attacker),
    defender: uncontested ? 0 : wounded(defender.committed, !won, model, woundRolls.defender),
    recoveryMinutes: model.wounds.recoveryMinutes,
  };
  const exposedCash = input.defenderCashCents > BigInt(model.loot.protectedCashCents)
    ? input.defenderCashCents - BigInt(model.loot.protectedCashCents) : 0n;
  const cashCap = exposedCash * BigInt(model.loot.exposedCashPercent) / 100n;
  const fitAttackersAfterWounds = attacker.committed - wounds.attacker;
  const carryCap = BigInt(fitAttackersAfterWounds) * BigInt(model.loot.perFitAttackerCents);
  const lootCents = won ? (cashCap < carryCap ? cashCap : carryCap) : 0n;
  const defenderCrack = input.defenderCrack ?? 0;
  const crackPercentCap = Math.floor(defenderCrack * (model.loot.exposedDrugPercent ?? 0) / 100);
  const crackCarryCap = fitAttackersAfterWounds * (model.loot.perFitAttackerCrack ?? 0);
  const lootCrack = won ? Math.min(defenderCrack, crackPercentCap, crackCarryCap) : 0;
  return {
    modelVersion: model.version,
    winner: won ? 'ATTACKER' : 'DEFENDER',
    attacker, defender, rolls, effectiveStrength,
    turnCost: model.turnCost,
    attackerTurnsAfter: input.attackerTurns - model.turnCost,
    wounds,
    lootCents,
    lootCrack,
    cashChanges: { attackerCents: lootCents, defenderCents: -lootCents },
    crackChanges: { attacker: lootCrack, defender: -lootCrack },
    defenderCashAfterCents: input.defenderCashCents - lootCents,
    defenderCrackAfter: defenderCrack - lootCrack,
  };
}
