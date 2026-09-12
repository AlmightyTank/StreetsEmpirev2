import type { CombatModel, DriveByRules, WeaponKey, WeightedPercentRange } from '@streets/rulesets';
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
  readonly repeatTargetHits?: number;
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
  readonly lootPercent: number;
  readonly baseLootPercent: number;
  readonly repeatTargetHits: number;
  readonly repeatLootMultiplierPercent: number;
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
  if (model.loot.weightedPercent) {
    const weighted = model.loot.weightedPercent;
    count(weighted.minPercent, 'Minimum weighted loot percent');
    count(weighted.maxPercent, 'Maximum weighted loot percent');
    requireCondition(weighted.minPercent <= weighted.maxPercent, 'INVALID_MODEL', 'Weighted loot minimum cannot exceed its maximum.');
    requireCondition(weighted.maxPercent <= model.loot.exposedCashPercent, 'INVALID_MODEL', 'Weighted loot maximum cannot exceed the exposed cash percent.');
    if (model.loot.exposedDrugPercent !== undefined) {
      requireCondition(weighted.maxPercent <= model.loot.exposedDrugPercent, 'INVALID_MODEL', 'Weighted loot maximum cannot exceed the exposed drug percent.');
    }
    requireCondition(Number.isFinite(weighted.exponent) && weighted.exponent > 0, 'INVALID_MODEL', 'Weighted loot exponent must be finite and positive.');
    count(weighted.repeatPenaltyPercent, 'Repeat-target loot penalty');
    count(weighted.repeatFloorPercent, 'Repeat-target loot floor');
    requireCondition(weighted.repeatPenaltyPercent <= 100 && weighted.repeatFloorPercent <= 100, 'INVALID_MODEL', 'Repeat-target loot settings must be percentages.');
  }
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

function lootPercent(model: CombatModel, rng: Rng, repeatTargetHits: number): {
  baseLootPercent: number;
  lootPercent: number;
  repeatLootMultiplierPercent: number;
} {
  const weighted = model.loot.weightedPercent;
  if (!weighted) {
    return {
      baseLootPercent: model.loot.exposedCashPercent,
      lootPercent: model.loot.exposedCashPercent,
      repeatLootMultiplierPercent: 100,
    };
  }
  const roll = checkedRoll(rng);
  const spread = weighted.maxPercent - weighted.minPercent + 1;
  const baseLootPercent = Math.min(weighted.maxPercent, weighted.minPercent + Math.floor(roll ** weighted.exponent * spread));
  const repeatLootMultiplierPercent = Math.max(weighted.repeatFloorPercent, 100 - repeatTargetHits * weighted.repeatPenaltyPercent);
  return {
    baseLootPercent,
    lootPercent: Math.floor(baseLootPercent * repeatLootMultiplierPercent / 100),
    repeatLootMultiplierPercent,
  };
}

/**
 * Pure 0.2.0-A simulation. Requires explicit model and RNG; never reads a DB,
 * clock, or default ruleset. Eligibility and repeated attacks belong to B.
 * Consumes exactly four rolls in fixed-loot models: attacker strength, defender
 * strength and two wounds. Weighted-loot models consume one extra loot roll.
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
  if (input.repeatTargetHits !== undefined) count(input.repeatTargetHits, 'Repeat target hits');

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
  const repeatTargetHits = input.repeatTargetHits ?? 0;
  const lootRoll = lootPercent(model, rng, repeatTargetHits);
  const cashCap = exposedCash * BigInt(lootRoll.lootPercent) / 100n;
  const fitAttackersAfterWounds = attacker.committed - wounds.attacker;
  const carryCap = BigInt(fitAttackersAfterWounds) * BigInt(model.loot.perFitAttackerCents);
  const lootCents = won ? (cashCap < carryCap ? cashCap : carryCap) : 0n;
  const defenderCrack = input.defenderCrack ?? 0;
  const crackPercent = model.loot.weightedPercent ? Math.min(lootRoll.lootPercent, model.loot.exposedDrugPercent ?? 0) : model.loot.exposedDrugPercent ?? 0;
  const crackPercentCap = Math.floor(defenderCrack * crackPercent / 100);
  const crackCarryCap = fitAttackersAfterWounds * (model.loot.perFitAttackerCrack ?? 0);
  const lootCrack = won ? Math.min(defenderCrack, crackPercentCap, crackCarryCap) : 0;
  return {
    modelVersion: model.version,
    winner: won ? 'ATTACKER' : 'DEFENDER',
    attacker, defender, rolls, effectiveStrength,
    turnCost: model.turnCost,
    attackerTurnsAfter: input.attackerTurns - model.turnCost,
    wounds,
    lootPercent: lootRoll.lootPercent,
    baseLootPercent: lootRoll.baseLootPercent,
    repeatTargetHits,
    repeatLootMultiplierPercent: lootRoll.repeatLootMultiplierPercent,
    lootCents,
    lootCrack,
    cashChanges: { attackerCents: lootCents, defenderCents: -lootCents },
    crackChanges: { attacker: lootCrack, defender: -lootCrack },
    defenderCashAfterCents: input.defenderCashCents - lootCents,
    defenderCrackAfter: defenderCrack - lootCrack,
  };
}

// --- drive-bys ----------------------------------------------------------------

export interface DriveByInput {
  readonly attacker: CombatCrew;
  readonly defender: CombatCrew;
  readonly shooters: number;
  readonly lowRiders: number;
  readonly attackerTurns: number;
  readonly defenderWhores: number;
}

/** One Low-Rider's run: who rode in it, who went down, and whether it came home. */
export interface DriveByCar {
  readonly crew: number;
  readonly down: number;
  readonly lost: boolean;
}

export interface DriveByResult {
  readonly modelVersion: string;
  readonly winner: 'ATTACKER' | 'DEFENDER';
  readonly attacker: CombatSquad;
  readonly defender: CombatSquad;
  readonly rolls: { readonly attacker: number; readonly defender: number };
  readonly effectiveStrength: { readonly attacker: number; readonly defender: number };
  readonly turnCost: number;
  readonly attackerTurnsAfter: number;
  /** Chance each shooter had of going down on this run. */
  readonly casualtyChance: number;
  readonly cars: readonly DriveByCar[];
  readonly lowRidersLost: number;
  readonly lowRidersAfter: number;
  readonly wounds: {
    readonly attacker: number;
    readonly defender: number;
    readonly recoveryMinutes: number;
  };
  /** Zero on a miss: nothing lands when the target's crew wins the exchange. */
  readonly thugWoundPercent: number;
  readonly whoreKillPercent: number;
  readonly whoresKilled: number;
  readonly defenderWhoresAfter: number;
}

function validateRange(range: WeightedPercentRange, name: string): void {
  count(range.minPercent, `${name} minimum`);
  count(range.maxPercent, `${name} maximum`);
  requireCondition(range.minPercent <= range.maxPercent && range.maxPercent <= 100, 'INVALID_MODEL', `${name} must be an ordered percentage range.`);
  requireCondition(Number.isFinite(range.exponent) && range.exponent > 0, 'INVALID_MODEL', `${name} exponent must be finite and positive.`);
}

export function validateDriveByRules(rules: DriveByRules): void {
  count(rules.turnCost, 'Drive-by turn cost');
  count(rules.thugsPerLowRider, 'Shooters per Low-Rider');
  requireCondition(rules.turnCost > 0 && rules.thugsPerLowRider > 0, 'INVALID_MODEL', 'Drive-by turn cost and seats must be positive.');
  count(rules.cooldownMinutes, 'Drive-by cooldown');
  count(rules.protectionHours, 'Drive-by protection');
  fraction(rules.defenderFieldedFraction, 'Fielded defenders');
  requireCondition(Number.isFinite(rules.defenseMultiplier) && rules.defenseMultiplier > 0, 'INVALID_MODEL', 'Drive-by defense multiplier must be positive.');
  validateRange(rules.hit.thugWounds, 'Thug wound roll');
  validateRange(rules.hit.whoreKills, 'Whore kill roll');
  count(rules.hit.perShooterThugWounds, 'Thug wounds per shooter');
  count(rules.hit.perShooterWhoreKills, 'Whore kills per shooter');
  const c = rules.casualties;
  fraction(c.onHit, 'Casualties on a hit');
  fraction(c.onMissBase, 'Casualties on a miss');
  fraction(c.max, 'Casualty cap');
  requireCondition(Number.isFinite(c.onMissPerMargin) && c.onMissPerMargin >= 0, 'INVALID_MODEL', 'Casualty margin must be finite and nonnegative.');
  requireCondition(c.onHit <= c.onMissBase && c.onMissBase <= c.max, 'INVALID_MODEL', 'Casualties must rise from a hit to a miss and stay within the cap.');
}

/** Same weighting as raid loot: `roll ^ exponent` pulls toward the minimum. */
function weightedPercent(range: WeightedPercentRange, roll: number): number {
  const spread = range.maxPercent - range.minPercent + 1;
  return Math.min(range.maxPercent, range.minPercent + Math.floor(roll ** range.exponent * spread));
}

/** Most shooters a player could put in their cars right now. */
export function driveByMaxShooters(fitThugs: number, lowRiders: number, model: CombatModel, rules: DriveByRules): number {
  return Math.max(0, Math.min(fitThugs, lowRiders * rules.thugsPerLowRider, model.squadCap));
}

/**
 * A hit-and-run from Low-Riders. Pure: explicit model, rules and RNG.
 *
 * The exchange uses the raid strength model, but the target only has
 * `defenderFieldedFraction` of their fit crew out front and gets
 * `defenseMultiplier` rather than the raid home advantage.
 *
 * A hit wounds a rolled share of the target's fit thugs and kills a rolled
 * share of their whores. It takes no cash or crack. Each shooter can drop only
 * so many of each, so a single car never empties a big house.
 *
 * Casualties are rolled per shooter, car by car. Cars are filled in order and
 * the last one takes the remainder; a car is lost only when everybody in it
 * went down. If one of them makes it back, so does the car.
 *
 * Rolls are consumed in a fixed order: attacker strength, defender strength,
 * thug-wound percent, whore-kill percent, thug-wound rounding, whore-kill
 * rounding, defender wounds on a miss, then one per shooter.
 */
export function simulateDriveBy(input: DriveByInput, model: CombatModel, rules: DriveByRules, rng: Rng): DriveByResult {
  validateCombatModel(model);
  validateDriveByRules(rules);
  validateCrew(input.attacker, model);
  validateCrew(input.defender, model);
  count(input.shooters, 'Shooters');
  count(input.lowRiders, 'Low-Riders');
  count(input.attackerTurns, 'Attacker turns');
  count(input.defenderWhores, 'Defender whores');
  requireCondition(input.lowRiders > 0, 'NO_LOW_RIDER', 'You need a Low-Rider for a drive-by.');
  requireCondition(input.shooters > 0 && input.shooters <= driveByMaxShooters(input.attacker.thugs, input.lowRiders, model, rules),
    'INVALID_SQUAD', `Send at least one fit thug, with no more than ${rules.thugsPerLowRider} to a car.`);
  requireCondition(input.attackerTurns >= rules.turnCost, 'NOT_ENOUGH_TURNS', 'There are not enough turns for this drive-by.');

  const fielded = Math.min(input.defender.thugs, model.squadCap, Math.ceil(input.defender.thugs * rules.defenderFieldedFraction));
  const attacker = equip(input.attacker, input.shooters, model);
  const defender = equip(input.defender, fielded, model);
  const rolls = { attacker: checkedRoll(rng), defender: checkedRoll(rng) };
  const hitRolls = { thugs: checkedRoll(rng), whores: checkedRoll(rng), thugRounding: checkedRoll(rng), whoreRounding: checkedRoll(rng) };
  const missRoll = checkedRoll(rng);

  const spread = (roll: number) => 1 + (roll * 2 - 1) * model.strength.variance;
  const effectiveStrength = {
    attacker: attacker.strength * spread(rolls.attacker),
    defender: defender.strength * rules.defenseMultiplier * spread(rolls.defender),
  };
  const uncontested = defender.committed === 0;
  // Exact ties go to the target, as in a raid.
  const won = uncontested || effectiveStrength.attacker > effectiveStrength.defender;

  let thugWoundPercent = 0;
  let whoreKillPercent = 0;
  let defenderWounds = 0;
  let whoresKilled = 0;
  if (won) {
    thugWoundPercent = weightedPercent(rules.hit.thugWounds, hitRolls.thugs);
    whoreKillPercent = weightedPercent(rules.hit.whoreKills, hitRolls.whores);
    defenderWounds = Math.min(input.defender.thugs, input.shooters * rules.hit.perShooterThugWounds,
      roundStochastic(input.defender.thugs * thugWoundPercent / 100, () => hitRolls.thugRounding));
    whoresKilled = Math.min(input.defenderWhores, input.shooters * rules.hit.perShooterWhoreKills,
      roundStochastic(input.defenderWhores * whoreKillPercent / 100, () => hitRolls.whoreRounding));
  } else {
    // The crew that saw them off takes the ordinary winner's scratches.
    defenderWounds = wounded(defender.committed, true, model, missRoll);
  }

  const c = rules.casualties;
  const casualtyChance = uncontested ? 0
    : won ? c.onHit
    : Math.min(c.max, c.onMissBase + c.onMissPerMargin * Math.max(0, effectiveStrength.defender / effectiveStrength.attacker - 1));

  const cars: DriveByCar[] = [];
  for (let seated = 0; seated < input.shooters; seated += rules.thugsPerLowRider) {
    const crew = Math.min(rules.thugsPerLowRider, input.shooters - seated);
    let down = 0;
    for (let i = 0; i < crew; i++) if (checkedRoll(rng) < casualtyChance) down++;
    cars.push({ crew, down, lost: down === crew });
  }
  const attackerWounds = cars.reduce((sum, car) => sum + car.down, 0);
  const lowRidersLost = cars.filter((car) => car.lost).length;

  return {
    modelVersion: model.version,
    winner: won ? 'ATTACKER' : 'DEFENDER',
    attacker, defender, rolls, effectiveStrength,
    turnCost: rules.turnCost,
    attackerTurnsAfter: input.attackerTurns - rules.turnCost,
    casualtyChance,
    cars,
    lowRidersLost,
    lowRidersAfter: input.lowRiders - lowRidersLost,
    wounds: { attacker: attackerWounds, defender: defenderWounds, recoveryMinutes: model.wounds.recoveryMinutes },
    thugWoundPercent,
    whoreKillPercent,
    whoresKilled,
    defenderWhoresAfter: input.defenderWhores - whoresKilled,
  };
}
