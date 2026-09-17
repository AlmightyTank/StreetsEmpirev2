import type { ProductEffects, Ruleset } from '@streets/rulesets';
import { simulateRaid, type CombatBoost, type CombatCrew } from '../calculations/combat.js';
import { combatSimulationRng } from './combat.js';

/**
 * 0.4.0-E. What product in a fight does, simulated with the live raid model
 * before it ships. Every row runs the same dice, so differences come from the
 * product alone.
 */

function crew(thugs: number, pistols: number, shotguns = 0, tek9s = 0, ak47s = 0): CombatCrew {
  return { thugs, thugHappiness: 100, weapons: { PISTOL: pistols, SHOTGUN: shotguns, TEK9: tek9s, AK47: ak47s } };
}

export interface CombatProductScenario {
  readonly name: string;
  readonly attacker: CombatCrew;
  readonly defender: CombatCrew;
}

export const combatProductScenarios: readonly CombatProductScenario[] = [
  { name: 'Early mirror', attacker: crew(10, 10), defender: crew(10, 10) },
  { name: 'Middle mirror', attacker: crew(40, 20, 12, 6, 2), defender: crew(40, 20, 12, 6, 2) },
  { name: 'Late mirror', attacker: crew(100, 40, 30, 20, 10), defender: crew(100, 40, 30, 20, 10) },
  { name: 'Attacker 25% bigger', attacker: crew(25, 25), defender: crew(20, 20) },
  { name: 'Attacker 60% bigger', attacker: crew(32, 32), defender: crew(20, 20) },
];

export interface CombatProductRow {
  readonly scenario: string;
  readonly side: 'attack' | 'defense';
  /** Null for no product. */
  readonly product: string | null;
  readonly attackerWinPercent: number;
  /** This side's mean wounds per fight. */
  readonly ownWounds: number;
}

function combatOf(ruleset: Ruleset, key: string): NonNullable<ProductEffects['combat']> | null {
  return (ruleset.products?.[key] as { effects?: ProductEffects } | undefined)?.effects?.combat ?? null;
}

export function runCombatProductSimulation(ruleset: Ruleset, samples = 20_000, seed = 20260917,
  scenarios: readonly CombatProductScenario[] = combatProductScenarios): CombatProductRow[] {
  const model = ruleset.combat;
  if (!model) throw new Error(`${ruleset.meta.id} has no combat.`);
  const products: Array<string | null> = [null, ...Object.keys(ruleset.products ?? {})];
  const rows: CombatProductRow[] = [];
  for (const scenario of scenarios) {
    for (const side of ['attack', 'defense'] as const) {
      for (const product of products) {
        const effects = product ? combatOf(ruleset, product) : null;
        const boost: CombatBoost | undefined = effects ? { strength: side === 'attack' ? effects.attack : effects.defense, wounds: effects.wounds } : undefined;
        const rng = combatSimulationRng(seed);
        let wins = 0;
        let wounds = 0;
        for (let i = 0; i < samples; i++) {
          const result = simulateRaid({
            attacker: scenario.attacker, defender: scenario.defender,
            attackingThugs: Math.min(scenario.attacker.thugs, model.squadCap), attackerTurns: model.turnCost, defenderCashCents: 0n,
            ...(side === 'attack' ? { attackerBoost: boost } : { defenderBoost: boost }),
          }, model, rng);
          wins += Number(result.winner === 'ATTACKER');
          wounds += side === 'attack' ? result.wounds.attacker : result.wounds.defender;
        }
        rows.push({ scenario: scenario.name, side, product, attackerWinPercent: wins * 100 / samples, ownWounds: wounds / samples });
      }
    }
  }
  return rows;
}

export interface CombatProductGate {
  /** Largest swing any product gives its side in any scenario, in points of attacker win rate. */
  readonly largestSwing: { readonly points: number; readonly scenario: string; readonly side: string; readonly product: string };
  readonly bestAttack: string;
  readonly bestDefense: string;
  readonly fewestWounds: string;
  readonly problems: string[];
}

/**
 * The gate: product tips a close fight but never decides a lopsided one (no swing
 * above `maxSwingPoints`), and no product is best at attacking, defending and
 * keeping its crew whole all at once.
 */
export function combatProductGate(rows: readonly CombatProductRow[], maxSwingPoints = 20): CombatProductGate {
  const baseline = (scenario: string, side: string) => rows.find((row) => row.scenario === scenario && row.side === side && row.product === null)!;
  let largestSwing = { points: 0, scenario: '', side: '', product: '' };
  const attackGain = new Map<string, number>();
  const defenseGain = new Map<string, number>();
  const woundsSaved = new Map<string, number>();
  for (const row of rows.filter((candidate) => candidate.product)) {
    const base = baseline(row.scenario, row.side);
    // Points in this side's favour.
    const gain = row.side === 'attack' ? row.attackerWinPercent - base.attackerWinPercent : base.attackerWinPercent - row.attackerWinPercent;
    if (Math.abs(gain) > Math.abs(largestSwing.points)) largestSwing = { points: gain, scenario: row.scenario, side: row.side, product: row.product! };
    const into = row.side === 'attack' ? attackGain : defenseGain;
    into.set(row.product!, (into.get(row.product!) ?? 0) + gain);
    woundsSaved.set(row.product!, (woundsSaved.get(row.product!) ?? 0) + base.ownWounds - row.ownWounds);
  }
  const best = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const bestAttack = best(attackGain);
  const bestDefense = best(defenseGain);
  const fewestWounds = best(woundsSaved);
  const problems: string[] = [];
  if (Math.abs(largestSwing.points) > maxSwingPoints) problems.push(`${largestSwing.product} swings ${largestSwing.scenario} (${largestSwing.side}) by ${largestSwing.points.toFixed(1)} points.`);
  if (bestAttack === bestDefense && bestDefense === fewestWounds) problems.push(`${bestAttack} is best at attacking, defending and avoiding wounds.`);
  return { largestSwing, bestAttack, bestDefense, fewestWounds, problems };
}

export function combatProductMarkdown(ruleset: Ruleset, rows: readonly CombatProductRow[], samples: number, seed: number): string {
  const gate = combatProductGate(rows);
  const name = (key: string | null) => (key ? ruleset.products?.[key]?.name ?? key : 'No product');
  const scenarios = [...new Set(rows.map((row) => row.scenario))];
  const products = [...new Set(rows.map((row) => row.product))];
  const model = ruleset.combat!;
  return [
    '# 0.4.0-E product in combat simulation', '',
    `Ruleset: ${ruleset.meta.id}, combat model ${model.version} (home advantage x${model.strength.defenseMultiplier}, rolls ±${model.strength.variance * 100}%). ${samples.toLocaleString('en-US')} fights a row, seed ${seed}, the same dice in every row.`,
    'Attack rows supply only the attacker; defense rows supply only the defender.', '',
    '## Gate', '',
    gate.problems.length ? `**Fails.**\n\n${gate.problems.map((line) => `- ${line}`).join('\n')}` : `**Passes.** The largest swing is ${gate.largestSwing.points.toFixed(1)} points (${name(gate.largestSwing.product)}, ${gate.largestSwing.scenario}, ${gate.largestSwing.side}), within 20. Best attacking: ${name(gate.bestAttack)}. Best defending: ${name(gate.bestDefense)}. Fewest wounds: ${name(gate.fewestWounds)}.`,
    '',
    ...(['attack', 'defense'] as const).flatMap((side) => [
      `## ${side === 'attack' ? 'Attacking squad supplied' : 'Defending crew supplied'}`, '',
      `Attacker win rate, and ${side === 'attack' ? "the attacker's" : "the defender's"} mean wounds.`, '',
      `| Product | ${scenarios.join(' | ')} |`, `| --- | ${scenarios.map(() => '---:').join(' | ')} |`,
      ...products.map((product) => `| ${name(product)} | ${scenarios.map((scenario) => {
        const row = rows.find((candidate) => candidate.scenario === scenario && candidate.side === side && candidate.product === product)!;
        return `${row.attackerWinPercent.toFixed(1)}% · ${row.ownWounds.toFixed(2)}`;
      }).join(' | ')} |`),
      '',
    ]),
  ].join('\n');
}
