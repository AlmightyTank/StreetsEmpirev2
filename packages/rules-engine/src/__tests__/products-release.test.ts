import { describe, expect, it } from 'vitest';
import { classicOgV04D, classicOgV04E } from '@streets/rulesets';
import { simulateDriveBy, simulateRaid, type CombatCrew } from '../calculations/combat.js';
import { DEFENSE_JOB, RAID_JOB, planWorkSupply, workSupplyStatus } from '../calculations/work-supply.js';
import { combatProductGate, runCombatProductSimulation } from '../simulations/combat-products.js';
import { productRoundGate, runProductRoundSimulation } from '../simulations/product-round.js';

const model = classicOgV04E.combat;
const squad = (thugs: number): CombatCrew => ({ thugs, thugHappiness: 100, weapons: { PISTOL: thugs, SHOTGUN: 0, TEK9: 0, AK47: 0 } });
const fixed = (values: number[]) => { let i = 0; return () => values[i++ % values.length]!; };
const policy = (primary: string) => ({ primary, fallback: null, emergency: null, strict: false });

describe('0.4.0-E combat boosts', () => {
  it('leaves every fight unchanged without a boost', () => {
    const input = { attacker: squad(20), defender: squad(20), attackingThugs: 20, attackerTurns: 100, defenderCashCents: 1_000_000n };
    expect(simulateRaid({ ...input, attackerBoost: { strength: 1, wounds: 1 } }, model, fixed([0.7, 0.3, 0.5, 0.5, 0.5])))
      .toEqual(simulateRaid(input, model, fixed([0.7, 0.3, 0.5, 0.5, 0.5])));
  });

  it('scales strength and wounds on the side that took product', () => {
    const input = { attacker: squad(40), defender: squad(40), attackingThugs: 40, attackerTurns: 100, defenderCashCents: 0n };
    const rolls = [0.5, 0.5, 0.5, 0.5, 0.5];
    const plain = simulateRaid(input, model, fixed(rolls));
    const boosted = simulateRaid({ ...input, attackerBoost: { strength: 1.5, wounds: 0 }, defenderBoost: { strength: 0.5, wounds: 1 } }, model, fixed(rolls));
    expect(boosted.effectiveStrength.attacker).toBeCloseTo(plain.effectiveStrength.attacker * 1.5, 8);
    expect(boosted.effectiveStrength.defender).toBeCloseTo(plain.effectiveStrength.defender * 0.5, 8);
    expect(boosted.wounds.attacker).toBe(0);
  });

  it('boosts drive-by shooters and their casualty chance', () => {
    const rules = model.driveBy!;
    const input = { attacker: squad(8), defender: squad(40), shooters: 8, lowRiders: 2, attackerTurns: 100, defenderWhores: 100 };
    const plain = simulateDriveBy(input, model, rules, fixed([0.5]));
    const boosted = simulateDriveBy({ ...input, attackerBoost: { strength: 2, wounds: 0 } }, model, rules, fixed([0.5]));
    expect(boosted.effectiveStrength.attacker).toBeCloseTo(plain.effectiveStrength.attacker * 2, 8);
    expect(boosted.casualtyChance).toBe(0);
  });
});

describe('fight supply plans', () => {
  it('burns per committed thug per fight and carries attack, defense and wounds', () => {
    const cocaine = classicOgV04E.products.COCAINE.effects.combat;
    const raid = planWorkSupply({ job: RAID_JOB, role: 'fighters', workers: 40, turns: 1, policy: policy('COCAINE'), inventory: { COCAINE: 5 }, ruleset: classicOgV04E });
    expect(raid.need).toBe(Math.ceil(40 * classicOgV04E.combatSupply.productPerThugPerFight));
    expect(raid.takeMultiplier).toBeCloseTo(0.5 * cocaine.attack + 0.5, 10);
    expect(raid.woundMultiplier).toBeCloseTo(0.5 * cocaine.wounds + 0.5, 10);
    const meth = classicOgV04E.products.METH.effects.combat;
    const defense = planWorkSupply({ job: DEFENSE_JOB, role: 'fighters', workers: 40, turns: 1, policy: policy('METH'), inventory: { METH: 100 }, ruleset: classicOgV04E });
    expect(defense.takeMultiplier).toBe(meth.defense);
    expect(workSupplyStatus(defense, { METH: 100 }, 40)).toEqual({ turnsOfSupply: 10, shortWorkers: 0 });
  });

  it('reports how long stock lasts and who goes without', () => {
    const plan = planWorkSupply({ job: 'CASINO', workers: 100, turns: 10, policy: { primary: 'ECSTASY', fallback: 'CRACK', emergency: null, strict: false }, inventory: { ECSTASY: 20, CRACK: 5 }, ruleset: classicOgV04D });
    // 5 units a turn; 25 allowed units last 5 turns; 25 of 50 needed are missing.
    expect(workSupplyStatus(plan, { ECSTASY: 20, CRACK: 5 }, 100)).toEqual({ turnsOfSupply: 5, shortWorkers: 50 });
  });
});

describe('0.4.0-E simulation gates', () => {
  it('product tips a close fight without deciding a lopsided one, and no product is best at everything', () => {
    const gate = combatProductGate(runCombatProductSimulation(classicOgV04E, 4_000));
    expect(gate.problems).toEqual([]);
    expect(new Set([gate.bestAttack, gate.bestDefense, gate.fewestWounds]).size).toBeGreaterThan(1);
  });

  it('a full round rewards mixing products over any single product', () => {
    expect(productRoundGate(runProductRoundSimulation(classicOgV04E))).toEqual([]);
  });
});
