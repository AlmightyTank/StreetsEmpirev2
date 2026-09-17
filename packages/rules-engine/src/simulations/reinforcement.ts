import type { CombatModel, WeaponKey } from '@streets/rulesets';
import { equipCombatSquad, simulateRaid, type CombatCrew } from '../calculations/combat.js';
import { combatSimulationRng } from './combat.js';

/**
 * 0.3.0-D. A candidate shape for defense reinforcement, simulated before any of
 * it reaches a ruleset. Nothing here is live game rules.
 */
export interface ReinforcementCandidate {
  readonly label: string;
  /** How many allies can send help to one defense. */
  readonly maxAllies: number;
  /** Share of each ally's fit crew that shows up, rounded down. */
  readonly allyShare: number;
  /** Reinforcements can never outnumber this fraction of the defender's own squad. */
  readonly capOfOwnSquad: number;
}

export interface ReinforcementScenario {
  readonly name: string;
  readonly purpose: string;
  readonly attacker: CombatCrew;
  readonly defender: CombatCrew;
  /** Every ally is assumed to have this crew. */
  readonly ally: CombatCrew;
  readonly attackingThugs: number;
  readonly defenderCashCents: bigint;
}

export interface ReinforcementSummary {
  readonly scenario: string;
  readonly candidate: string;
  readonly reinforcingThugs: number;
  readonly defenseStrength: number;
  readonly attackerWinPercent: number;
  readonly meanLootCents: number;
  readonly meanAttackerWounds: number;
  readonly meanDefenderWounds: number;
  /** Wounds carried by the allies who came to help, per defense. */
  readonly meanAllyWounds: number;
}

const WEAPONS: readonly WeaponKey[] = ['PISTOL', 'SHOTGUN', 'TEK9', 'AK47'];

function crew(thugs: number, pistols: number, shotguns = 0, tek9s = 0, ak47s = 0): CombatCrew {
  return { thugs, thugHappiness: 100, weapons: { PISTOL: pistols, SHOTGUN: shotguns, TEK9: tek9s, AK47: ak47s } };
}

const early = crew(10, 10);
const middle = crew(40, 20, 12, 6, 2);
const late = crew(100, 40, 30, 20, 10);

export const reinforcementScenarios: readonly ReinforcementScenario[] = [
  { name: 'Early mirror', purpose: 'Starting crews: 10 pistols each, allies the same.', attacker: early, defender: early, ally: early, attackingThugs: 10, defenderCashCents: 2_000_000n },
  { name: 'Middle mirror', purpose: '40 mixed guns each, allies the same.', attacker: middle, defender: middle, ally: middle, attackingThugs: 40, defenderCashCents: 15_000_000n },
  { name: 'Late mirror', purpose: '100 mixed guns each, at the squad cap.', attacker: late, defender: late, ally: late, attackingThugs: 100, defenderCashCents: 100_000_000n },
  { name: 'Attacker 25% bigger', purpose: '25 pistols into 20, allies of 20. Solo, this attacker usually wins.', attacker: crew(25, 25), defender: crew(20, 20), ally: crew(20, 20), attackingThugs: 25, defenderCashCents: 15_000_000n },
  { name: 'Shotguns into pistols', purpose: 'A reputation unlock against a pistol block with pistol allies.', attacker: crew(20, 0, 20), defender: crew(20, 20), ally: crew(20, 20), attackingThugs: 20, defenderCashCents: 15_000_000n },
  { name: 'Late into middle', purpose: 'A big solo crew hitting a middle crew whose allies are middle too.', attacker: late, defender: middle, ally: middle, attackingThugs: 100, defenderCashCents: 15_000_000n },
];

/**
 * Combat turns on a narrow threshold (defense bonus x1.1, variance ±10%), so what
 * matters is how much strength help adds. The cap is swept finely; two allies
 * sending half their crew is enough to hit every cap in these fixtures.
 */
export const reinforcementCandidates: readonly ReinforcementCandidate[] = [
  { label: 'None (today)', maxAllies: 0, allyShare: 0, capOfOwnSquad: 0 },
  ...[0.05, 0.1, 0.15, 0.25, 0.5].map((capOfOwnSquad) => ({
    label: `Help capped at ${capOfOwnSquad * 100}% of own squad`, maxAllies: 2, allyShare: 0.5, capOfOwnSquad,
  })),
  { label: '1 ally · 25% of crew, no cap', maxAllies: 1, allyShare: 0.25, capOfOwnSquad: 1 },
];

/**
 * The defense squad with help: the defender's own squad, plus each ally's best
 * weapons for the thugs they send, trimmed to the cap. Only the defender's own
 * squad counts toward the model's squad cap.
 */
export function reinforcedDefense(scenario: ReinforcementScenario, candidate: ReinforcementCandidate, model: CombatModel) {
  const ownCommitted = Math.min(scenario.defender.thugs, model.squadCap);
  const own = equipCombatSquad(scenario.defender, ownCommitted, model);
  const perAlly = Math.floor(scenario.ally.thugs * candidate.allyShare);
  const offered = perAlly * candidate.maxAllies;
  const reinforcing = Math.min(offered, Math.floor(ownCommitted * candidate.capOfOwnSquad));
  const weapons = Object.fromEntries(WEAPONS.map((key) => [key, own.equipment[key]])) as Record<WeaponKey, number>;
  let left = reinforcing;
  for (let ally = 0; ally < candidate.maxAllies && left > 0; ally++) {
    const sent = Math.min(perAlly, left);
    const squad = equipCombatSquad(scenario.ally, Math.min(sent, model.squadCap), model);
    for (const key of WEAPONS) weapons[key] += squad.equipment[key];
    left -= sent;
  }
  const merged: CombatCrew = { thugs: ownCommitted + reinforcing, thugHappiness: scenario.defender.thugHappiness, weapons };
  // Let the merged squad past the cap by exactly the reinforcements; the attacker's limit is unchanged.
  const mergedModel: CombatModel = { ...model, squadCap: Math.max(model.squadCap, merged.thugs) };
  return { reinforcing, merged, mergedModel };
}

export function runReinforcementSimulation(model: CombatModel, samples = 10_000, seed = 20260917,
  scenarios: readonly ReinforcementScenario[] = reinforcementScenarios,
  candidates: readonly ReinforcementCandidate[] = reinforcementCandidates): ReinforcementSummary[] {
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 1_000_000) throw new Error('Samples must be an integer from 1 to 1,000,000.');
  return scenarios.flatMap((scenario) => candidates.map((candidate) => {
    const { reinforcing, merged, mergedModel } = reinforcedDefense(scenario, candidate, model);
    // Common random numbers across candidates, so differences come from the rules, not the dice.
    const rng = combatSimulationRng(seed);
    let wins = 0;
    let loot = 0n;
    let attackerWounds = 0;
    let defenderWounds = 0;
    let allyWounds = 0;
    let defenseStrength = 0;
    for (let i = 0; i < samples; i++) {
      const result = simulateRaid({
        attacker: scenario.attacker, defender: merged, attackingThugs: scenario.attackingThugs,
        attackerTurns: model.turnCost, defenderCashCents: scenario.defenderCashCents,
      }, mergedModel, rng);
      wins += Number(result.winner === 'ATTACKER');
      loot += result.lootCents;
      attackerWounds += result.wounds.attacker;
      // Wounds fall on everyone who stood on the block, in proportion.
      const allyShare = merged.thugs === 0 ? 0 : reinforcing / merged.thugs;
      allyWounds += result.wounds.defender * allyShare;
      defenderWounds += result.wounds.defender * (1 - allyShare);
      defenseStrength = result.defender.strength * model.strength.defenseMultiplier;
    }
    return {
      scenario: scenario.name,
      candidate: candidate.label,
      reinforcingThugs: reinforcing,
      defenseStrength,
      attackerWinPercent: wins * 100 / samples,
      meanLootCents: Number(loot / BigInt(samples)),
      meanAttackerWounds: attackerWounds / samples,
      meanDefenderWounds: defenderWounds / samples,
      meanAllyWounds: allyWounds / samples,
    };
  }));
}

export function reinforcementSimulationMarkdown(rows: readonly ReinforcementSummary[], model: CombatModel, samples: number, seed: number,
  scenarios: readonly ReinforcementScenario[] = reinforcementScenarios): string {
  const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
  return [
    '# 0.3.0-D defense reinforcement simulation', '',
    `Combat model: ${model.version} (defense bonus x${model.strength.defenseMultiplier}, variance ±${model.strength.variance * 100}%, squad cap ${model.squadCap}).`,
    `Samples per row: ${samples.toLocaleString('en-US')}. Seed: ${seed}. Every row uses the same dice, so differences come from the rules.`, '',
    'Allies send their best weapons for the thugs they send. Reinforcements are trimmed to the cap, and only the',
    'defender\'s own squad counts toward the squad cap. Defender wounds are split in proportion between the defender and the allies.',
    'Loot is unchanged by reinforcement except through who wins. No live rules are set by this report.', '',
    ...scenarios.flatMap((scenario) => [
      `## ${scenario.name}`, '', scenario.purpose, '',
      '| Reinforcement | Help | Defense strength | Attacker wins | Mean loot | Wounds: attacker / defender / allies |',
      '| --- | ---: | ---: | ---: | ---: | ---: |',
      ...rows.filter((row) => row.scenario === scenario.name).map((row) =>
        `| ${row.candidate} | ${row.reinforcingThugs} | ${row.defenseStrength.toFixed(1)} | ${row.attackerWinPercent.toFixed(1)}% | ${money(row.meanLootCents)} | ${row.meanAttackerWounds.toFixed(2)} / ${row.meanDefenderWounds.toFixed(2)} / ${row.meanAllyWounds.toFixed(2)} |`),
      '',
    ]),
  ].join('\n');
}
