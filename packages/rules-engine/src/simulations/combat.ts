import { classicOgV24D, combatPrototype, type CombatModel } from '@streets/rulesets';
import { simulateRaid, type CombatCrew, type RaidInput } from '../calculations/combat.js';
import type { Rng } from '../rng.js';

export interface CombatScenario {
  readonly name: string;
  readonly purpose: string;
  readonly input: RaidInput;
}

function crew(thugs: number, pistols: number, shotguns = 0, tek9s = 0, ak47s = 0, thugHappiness = 100): CombatCrew {
  return { thugs, thugHappiness, weapons: { PISTOL: pistols, SHOTGUN: shotguns, TEK9: tek9s, AK47: ak47s } };
}

const early = crew(10, 10);
const middle = crew(40, 20, 12, 6, 2);
const late = crew(100, 40, 30, 20, 10);

function scenario(name: string, purpose: string, attacker: CombatCrew, defender: CombatCrew, cashDollars: number, attackingThugs = attacker.thugs): CombatScenario {
  return { name, purpose, input: { attacker, defender, attackingThugs, attackerTurns: 200, defenderCashCents: BigInt(cashDollars) * 100n } };
}

/** Hypothetical snapshots, not claims about the day these inventories are earned. */
export const combatScenarios: readonly CombatScenario[] = [
  scenario('Early mirror', '10 pistols against 10 pistols; home advantage.', early, early, 20_000),
  scenario('Middle mirror', '40 mixed guns against the same crew.', middle, middle, 150_000),
  scenario('Late mirror', '100 mixed guns against the same crew.', late, late, 1_000_000),
  scenario('Early into middle', 'Tests whether randomness can rescue a large strength deficit.', early, middle, 150_000),
  scenario('Middle into early', 'Checks loot exposure when an older crew attacks a smaller one.', middle, early, 20_000),
  scenario('Middle into late', 'Progression gap with a larger and better armed defender.', middle, late, 1_000_000),
  scenario('Late into middle', 'Strength surplus; B must separately control target eligibility.', late, middle, 150_000),
  scenario('25 versus 20 pistols', 'A modest numerical advantage against the defense bonus.', crew(25, 25), crew(20, 20), 150_000),
  scenario('20 shotguns versus 20 pistols', 'First reputation unlock gives a useful advantage.', crew(20, 0, 20), crew(20, 20), 150_000),
  scenario('20 Tek-9s versus 20 shotguns', 'Second reputation unlock matters.', crew(20, 0, 0, 20), crew(20, 0, 20), 150_000),
  scenario('20 AKs versus 20 Tek-9s', 'Top reputation unlock matters.', crew(20, 0, 0, 0, 20), crew(20, 0, 0, 20), 150_000),
  scenario('40 pistols versus 10 AKs', 'A larger lightly armed crew can defeat an elite squad.', crew(40, 40), crew(10, 0, 0, 0, 10), 150_000),
  scenario('Low morale middle mirror', 'Supplies and existing happiness affect readiness.', { ...middle, thugHappiness: 0 }, middle, 150_000),
  scenario('One thug versus rich undefended', 'Loot carrying capacity bounds a token attack.', crew(1, 1), crew(0, 0), 1_000_000),
  scenario('Protected starting cash', 'A combat win cannot consume the protected $5,000.', middle, early, 5_000),
  scenario('Late versus 1,000 pistol reserves', 'Only 100 defenders participate; reserves add no strength.', late, crew(1_000, 1_000), 1_000_000),
];

const ammoRules = classicOgV24D.ammoParts!.ammo;
function ammoScenario(name: string, purpose: string, attacker: CombatCrew, defender: CombatCrew, cashDollars: number,
  attackerRounds: number, defenderRounds: number, defenderFloor = ammoRules.defenderFloor, attackerCapRounds?: number): CombatScenario {
  const base = scenario(name, purpose, attacker, defender, cashDollars);
  return { ...base, input: { ...base.input, ammo: {
    attackerRounds, defenderRounds, roundsPerFight: ammoRules.roundsPerFight, defenderFloor,
    lootShareBps: ammoRules.lootShareBps, ...(attackerCapRounds === undefined ? {} : { attackerCapRounds }),
  } } };
}

/** Focused 2.4.0-D ammunition cases for checking spend and defender safety. */
export const ammoCombatScenarios: readonly CombatScenario[] = [
  ammoScenario('Empty early mirror', 'Both crews are dry; the free defender floor preserves a minimum defense.', early, early, 20_000, 0, 0),
  ammoScenario('Stocked early mirror', 'Both early crews have enough rounds for every assigned pistol.', early, early, 20_000, 120, 120),
  ammoScenario('Capped middle attack', 'The attacker caps a fully stocked mixed squad at 1,000 rounds.', middle, early, 150_000, 20_000, 2_000, 10, 1_000),
  ammoScenario('Stocked late mirror', 'Late mixed crews have enough rounds for all guns in the engagement.', late, late, 1_000_000, 100_000, 100_000),
];

/** Mulberry32, for repeatable experiments only. Not a production combat RNG. */
export function combatSimulationRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CombatScenarioSummary {
  readonly name: string;
  readonly purpose: string;
  readonly samples: number;
  readonly winPercent: number;
  readonly meanLootCents: number;
  readonly meanLootPerTurnCents: number;
  readonly meanAttackerWounds: number;
  readonly meanDefenderWounds: number;
  readonly maxLootCents: bigint;
  readonly strengthRatio: number | null;
  readonly meanAttackerAmmoSpent: number | null;
  readonly meanDefenderAmmoSpent: number | null;
  readonly meanAmmoLoot: number | null;
}

export function runCombatSimulation(samples = 10_000, seed = 20260910, model: CombatModel = combatPrototype,
  scenarios: readonly CombatScenario[] = combatScenarios): CombatScenarioSummary[] {
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 1_000_000) throw new Error('Samples must be an integer from 1 to 1,000,000.');
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be an unsigned 32-bit integer.');
  return scenarios.map(({ name, purpose, input }) => {
    // Common random numbers make model comparisons reproducible, even if rows move.
    const rng = combatSimulationRng(seed);
    let wins = 0;
    let totalLoot = 0n;
    let maxLootCents = 0n;
    let attackerWounds = 0;
    let defenderWounds = 0;
    let attackerAmmoSpent = 0;
    let defenderAmmoSpent = 0;
    let ammoLooted = 0;
    let strengthRatio: number | null = null;
    for (let i = 0; i < samples; i++) {
      const result = simulateRaid(input, model, rng);
      wins += Number(result.winner === 'ATTACKER');
      totalLoot += result.lootCents;
      maxLootCents = result.lootCents > maxLootCents ? result.lootCents : maxLootCents;
      attackerWounds += result.wounds.attacker;
      defenderWounds += result.wounds.defender;
      attackerAmmoSpent += result.ammunition?.attackerRoundsSpent ?? 0;
      defenderAmmoSpent += result.ammunition?.defenderRoundsSpent ?? 0;
      ammoLooted += result.ammunition?.ammoLootRounds ?? 0;
      const defense = result.defender.strength * model.strength.defenseMultiplier;
      strengthRatio = defense === 0 ? null : result.attacker.strength / defense;
    }
    // Reports use numbers for averages; raid money calculations stay in BigInt.
    const meanLootCents = Number(totalLoot / BigInt(samples)) + Number(totalLoot % BigInt(samples)) / samples;
    return {
      name, purpose, samples, winPercent: wins * 100 / samples,
      meanLootCents, meanLootPerTurnCents: meanLootCents / model.turnCost,
      meanAttackerWounds: attackerWounds / samples, meanDefenderWounds: defenderWounds / samples,
      maxLootCents, strengthRatio,
      meanAttackerAmmoSpent: input.ammo ? attackerAmmoSpent / samples : null,
      meanDefenderAmmoSpent: input.ammo ? defenderAmmoSpent / samples : null,
      meanAmmoLoot: input.ammo ? ammoLooted / samples : null,
    };
  });
}

export function combatSimulationMarkdown(rows: readonly CombatScenarioSummary[], samples: number, seed: number, model: CombatModel): string {
  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  return [
    '# Combat simulation', '',
    `Model: ${model.version}. Samples per matchup: ${samples.toLocaleString('en-US')}. Seed: ${seed}.`, '',
    'Each trial resets both crews and cash. Fixtures are hypothetical progression snapshots, not simulated player growth.',
    'Win rates are empirical. Mean loot includes defeats; loot per turn excludes recovery and foregone scouting income.',
    'Wounds are temporary projections. This report does not validate repeated attacks, protection, or the round economy.', '',
    '| Matchup | A/D strength | Attacker wins | Mean loot | Loot/turn | Mean wounds A / D | Ammo spent A / D | Ammo looted | Max loot |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map((row) => `| ${row.name} | ${row.strengthRatio?.toFixed(2) ?? 'undefended'} | ${row.winPercent.toFixed(2)}% | ${money(row.meanLootCents)} | ${money(row.meanLootPerTurnCents)} | ${row.meanAttackerWounds.toFixed(2)} / ${row.meanDefenderWounds.toFixed(2)} | ${row.meanAttackerAmmoSpent?.toFixed(0) ?? '—'} / ${row.meanDefenderAmmoSpent?.toFixed(0) ?? '—'} | ${row.meanAmmoLoot?.toFixed(0) ?? '—'} | ${money(Number(row.maxLootCents))} |`),
    '', '## Scenario purposes', '',
    ...rows.map((row) => `- **${row.name}:** ${row.purpose}`), '',
  ].join('\n');
}
