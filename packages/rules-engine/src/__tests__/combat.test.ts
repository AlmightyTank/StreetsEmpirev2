import { describe, expect, it } from 'vitest';
import { classicOgV01, combatPrototype, rulesets, type CombatModel } from '@streets/rulesets';
import { CombatError, equipCombatSquad, simulateRaid, type CombatCrew, type RaidInput } from '../calculations/combat.js';
import { combatScenarios, combatSimulationMarkdown, combatSimulationRng, runCombatSimulation } from '../simulations/combat.js';
import { flatRng } from '../rng.js';

const crew = (thugs: number, pistols = thugs): CombatCrew => ({
  thugs, thugHappiness: 100, weapons: { PISTOL: pistols, SHOTGUN: 0, TEK9: 0, AK47: 0 },
});
const input = (overrides: Partial<RaidInput> = {}): RaidInput => ({
  attacker: crew(40), defender: crew(10), attackingThugs: 40,
  attackerTurns: 200, defenderCashCents: 2_000_000n, defenderCrack: 1_000, ...overrides,
});
const model = combatPrototype;

describe('experimental combat equipment', () => {
  it('does not register a combat round or change classic powers', () => {
    expect(rulesets[model.version]).toBeUndefined();
    expect('combat' in classicOgV01).toBe(false);
    expect(classicOgV01.meta.version).toBe('0.1.0');
    expect(Object.values(classicOgV01.weapons).map((w) => w.power)).toEqual([1, 4, 9, 22]);
  });

  it('equips the best available weapon once per committed thug', () => {
    const squad = equipCombatSquad({ ...crew(100), weapons: { PISTOL: 100, SHOTGUN: 5, TEK9: 2, AK47: 1 } }, 5, model);
    expect(squad.equipment).toEqual({ AK47: 1, TEK9: 2, SHOTGUN: 2, PISTOL: 0 });
    expect(squad).toMatchObject({ committed: 5, armed: 5, unarmed: 0 });
  });

  it('gives no power to guns that have nobody to carry them', () => {
    const one = equipCombatSquad(crew(10), 10, model);
    const surplus = equipCombatSquad(crew(10, 1_000_000), 10, model);
    expect(surplus).toEqual(one);
  });

  it('keeps unarmed and unhappy crews able to defend', () => {
    expect(equipCombatSquad({ ...crew(10, 0), thugHappiness: 0 }, 10, model))
      .toMatchObject({ armed: 0, unarmed: 10, strength: 7.5 });
  });

  it('uses variant weapon powers for equipment ordering and strength', () => {
    const variant: CombatModel = { ...model, weapons: { ...model.weapons, PISTOL: { ...model.weapons.PISTOL, power: 100 } } };
    const squad = equipCombatSquad({ ...crew(1), weapons: { ...crew(1).weapons, AK47: 1 } }, 1, variant);
    expect(squad.equipment.PISTOL).toBe(1);
    expect(squad.equipment.AK47).toBe(0);
    expect(squad.strength).toBe(11);
  });

  it('makes each gun upgrade stronger without treating an AK as 22 pistol carriers', () => {
    const strengths = (['PISTOL', 'SHOTGUN', 'TEK9', 'AK47'] as const).map((key) =>
      equipCombatSquad({ ...crew(1, 0), weapons: { ...crew(1, 0).weapons, [key]: 1 } }, 1, model).strength);
    expect(strengths[0]).toBe(2);
    expect(strengths[1]).toBe(3);
    expect(strengths[2]).toBe(4);
    expect(strengths[3]).toBeCloseTo(5.690416);
  });
});

describe('raid outcome and resource boundaries', () => {
  it('returns a reproducible before/after cash transfer and charges turns', () => {
    const result = simulateRaid(input(), model, flatRng);
    expect(result).toMatchObject({
      modelVersion: '0.2.0-A.1', winner: 'ATTACKER', turnCost: 10, attackerTurnsAfter: 190,
      wounds: { attacker: 1, defender: 1, recoveryMinutes: 120 },
      lootCents: 75_000n, defenderCashAfterCents: 1_925_000n,
      cashChanges: { attackerCents: 75_000n, defenderCents: -75_000n },
    });
  });

  it('charges turns for defeat and awards no loot or cash to either side', () => {
    const result = simulateRaid(input({ attacker: crew(10), attackingThugs: 10, defender: crew(40) }), model, flatRng);
    expect(result).toMatchObject({ winner: 'DEFENDER', lootCents: 0n, lootCrack: 0, attackerTurnsAfter: 190 });
    expect(result.defenderCashAfterCents).toBe(2_000_000n);
    expect(result.defenderCrackAfter).toBe(1_000);
  });

  it('steals bounded crack only when the ruleset enables drug loot', () => {
    const cashOnly = simulateRaid(input(), model, flatRng);
    expect(cashOnly.lootCrack).toBe(0);
    expect(cashOnly.defenderCrackAfter).toBe(1_000);

    const withDrugs: CombatModel = {
      ...model,
      loot: { ...model.loot, exposedDrugPercent: 10, perFitAttackerCrack: 5 },
    };
    const result = simulateRaid(input({ attackingThugs: 40, defenderCrack: 1_000 }), withDrugs, flatRng);
    expect(result.lootCrack).toBe(100);
    expect(result.crackChanges).toEqual({ attacker: 100, defender: -100 });
    expect(result.defenderCrackAfter).toBe(900);
  });

  it('can roll up to 40% rarely and reduces repeated target loot', () => {
    const weighted: CombatModel = {
      ...model,
      strength: { ...model.strength, defenseMultiplier: 1, variance: 0 },
      wounds: { ...model.wounds, winnerFraction: 0, loserFraction: 0, maxFraction: 0 },
      loot: {
        protectedCashCents: 0,
        exposedCashPercent: 40,
        perFitAttackerCents: 1_000_000,
        exposedDrugPercent: 40,
        perFitAttackerCrack: 1_000,
        weightedPercent: { minPercent: 5, maxPercent: 40, exponent: 2.5, repeatPenaltyPercent: 25, repeatFloorPercent: 25 },
      },
    };
    const maxRoll = simulateRaid(input({ defenderCashCents: 1_000_000n, defenderCrack: 1_000 }), weighted, () => 0.999999);
    expect(maxRoll).toMatchObject({ baseLootPercent: 40, lootPercent: 40, repeatTargetHits: 0, repeatLootMultiplierPercent: 100 });
    expect(maxRoll.lootCents).toBe(400_000n);
    expect(maxRoll.lootCrack).toBe(400);

    const repeated = simulateRaid(input({ defenderCashCents: 1_000_000n, defenderCrack: 1_000, repeatTargetHits: 2 }), weighted, () => 0.999999);
    expect(repeated).toMatchObject({ baseLootPercent: 40, lootPercent: 20, repeatTargetHits: 2, repeatLootMultiplierPercent: 50 });
    expect(repeated.lootCents).toBe(200_000n);
    expect(repeated.lootCrack).toBe(200);
  });

  it('gives an exact strength tie to the defender', () => {
    const variant: CombatModel = { ...model, strength: { ...model.strength, defenseMultiplier: 1, variance: 0 } };
    expect(simulateRaid(input({ defender: crew(40) }), variant, flatRng).winner).toBe('DEFENDER');
  });

  it('lets numbers overcome better equipment even at the attacker’s worst roll', () => {
    const rolls = [0, 0.999999, 0.5, 0.5];
    const defender = { ...crew(10, 0), weapons: { ...crew(10, 0).weapons, AK47: 10 } };
    expect(simulateRaid(input({ defender }), model, () => rolls.shift()!).winner).toBe('ATTACKER');
  });

  it('does not let extreme rolls erase a major strength deficit', () => {
    const rolls = [0.999999, 0, 0.5, 0.5];
    expect(simulateRaid(input({ attacker: crew(10), attackingThugs: 10, defender: crew(40) }), model, () => rolls.shift()!).winner)
      .toBe('DEFENDER');
  });

  it('automatically caps the defensive squad while leaving reserves untouched', () => {
    const result = simulateRaid(input({ defender: crew(1_000) }), model, flatRng);
    expect(result.defender.committed).toBe(100);
    expect(result.defender.equipment.PISTOL).toBe(100);
  });

  it.each([0n, 1n, 499_999n, 500_000n, 500_019n])('preserves protected cash and floors sub-cent loot at %s cents', (cash) => {
    const result = simulateRaid(input({ defenderCashCents: cash }), model, flatRng);
    expect(result.winner).toBe('ATTACKER');
    expect(result.lootCents).toBe(0n);
    expect(result.defenderCashAfterCents).toBe(cash);
  });

  it('caps a token attack against a rich undefended player and causes no wounds', () => {
    const result = simulateRaid(input({ attacker: crew(1), attackingThugs: 1, defender: crew(0), defenderCashCents: 10n ** 25n }), model, flatRng);
    expect(result.lootCents).toBe(10_000n);
    expect(result.wounds).toMatchObject({ attacker: 0, defender: 0 });
    expect(result.defenderCashAfterCents).toBe(10n ** 25n - 10_000n);
  });

  it('can wound the only attacker, removing their ability to carry loot', () => {
    const attacker = { ...crew(1, 0), weapons: { ...crew(1, 0).weapons, AK47: 1 } };
    const result = simulateRaid(input({ attacker, attackingThugs: 1, defender: crew(1, 0) }), model, () => 0);
    expect(result.winner).toBe('ATTACKER');
    expect(result.wounds.attacker).toBe(1);
    expect(result.lootCents).toBe(0n);
  });

  it('passes alternate turn, loot, defense, morale and wound rules through the model', () => {
    const variant: CombatModel = {
      ...model, version: 'test', squadCap: 50, turnCost: 7,
      strength: { ...model.strength, moraleFloor: 0.5, defenseMultiplier: 1, variance: 0 },
      wounds: { winnerFraction: 0.1, loserFraction: 0.2, maxFraction: 0.2, recoveryMinutes: 60 },
      loot: { protectedCashCents: 0, exposedCashPercent: 100, perFitAttackerCents: 100, exposedDrugPercent: 100, perFitAttackerCrack: 2 },
    };
    const result = simulateRaid(input({ attacker: { ...crew(40), thugHappiness: 0 } }), variant, flatRng);
    expect(result).toMatchObject({ modelVersion: 'test', attackerTurnsAfter: 193, lootCents: 3_600n, lootCrack: 72,
      wounds: { attacker: 4, defender: 2, recoveryMinutes: 60 } });
    expect(result.attacker.moraleMultiplier).toBe(0.5);
  });

  it('does not mutate either input or the model and always consumes four rolls', () => {
    const request = input();
    const before = structuredClone(request);
    const beforeModel = structuredClone(model);
    let calls = 0;
    simulateRaid(request, model, () => { calls++; return 0.5; });
    expect(calls).toBe(4);
    expect(request).toEqual(before);
    expect(model).toEqual(beforeModel);
  });

  it('uses one extra roll when weighted loot is enabled', () => {
    const weighted: CombatModel = {
      ...model,
      loot: { ...model.loot, exposedCashPercent: 40, weightedPercent: { minPercent: 5, maxPercent: 40, exponent: 2.5, repeatPenaltyPercent: 25, repeatFloorPercent: 25 } },
    };
    let calls = 0;
    simulateRaid(input(), weighted, () => { calls++; return 0.5; });
    expect(calls).toBe(5);
  });

  it('conserves cash, respects carrying capacity and bounds wounds across sizes and rolls', () => {
    const rng = combatSimulationRng(9876);
    for (let size = 1; size <= 100; size++) {
      for (let trial = 0; trial < 20; trial++) {
        const defenderSize = Math.floor(rng() * 150);
        const cash = BigInt(Math.floor(rng() * 100_000_000));
        const crack = Math.floor(rng() * 10_000);
        const result = simulateRaid(input({ attacker: crew(size), attackingThugs: size, defender: crew(defenderSize), defenderCashCents: cash, defenderCrack: crack }), model, rng);
        expect(result.cashChanges.attackerCents + result.cashChanges.defenderCents).toBe(0n);
        expect(result.crackChanges.attacker + result.crackChanges.defender).toBe(0);
        expect(result.defenderCashAfterCents + result.lootCents).toBe(cash);
        expect(result.defenderCrackAfter + result.lootCrack).toBe(crack);
        expect(result.defenderCashAfterCents).toBeGreaterThanOrEqual(cash < 500_000n ? cash : 500_000n);
        expect(result.lootCents).toBeGreaterThanOrEqual(0n);
        expect(result.lootCrack).toBeGreaterThanOrEqual(0);
        expect(result.lootCents).toBeLessThanOrEqual(BigInt(size - result.wounds.attacker) * 10_000n);
        for (const side of ['attacker', 'defender'] as const) {
          expect(Number.isInteger(result.wounds[side])).toBe(true);
          expect(result.wounds[side]).toBeGreaterThanOrEqual(0);
          expect(result.wounds[side]).toBeLessThanOrEqual(Math.ceil(result[side].committed * 0.1));
        }
      }
    }
  });
});

describe('combat rejects invalid inputs before rolling', () => {
  it.each([0, -1, 1.5, NaN, Infinity, 41, Number.MAX_SAFE_INTEGER + 1])('rejects an invalid squad of %s', (attackingThugs) => {
    expect(() => simulateRaid(input({ attackingThugs }), model, flatRng)).toThrow(CombatError);
  });
  it('rejects a squad over the engagement cap even with enough crew', () => {
    expect(() => simulateRaid(input({ attacker: crew(200), attackingThugs: 101 }), model, flatRng)).toThrow('engagement cap');
  });
  it.each([-1, 1.5, NaN, Infinity])('rejects invalid inventory %s', (quantity) => {
    expect(() => simulateRaid(input({ defender: crew(10, quantity) }), model, flatRng)).toThrow(CombatError);
  });
  it.each([-1, 101, NaN])('rejects invalid morale %s', (thugHappiness) => {
    expect(() => simulateRaid(input({ attacker: { ...crew(40), thugHappiness } }), model, flatRng)).toThrow(CombatError);
  });
  it('rejects insufficient turns without consuming random numbers', () => {
    expect(() => simulateRaid(input({ attackerTurns: 9 }), model, () => { throw new Error('Should not roll'); })).toThrow('not enough turns');
  });
  it('rejects invalid repeat target counts', () => {
    expect(() => simulateRaid(input({ repeatTargetHits: -1 }), model, flatRng)).toThrow(CombatError);
    expect(() => simulateRaid(input({ repeatTargetHits: 1.5 }), model, flatRng)).toThrow(CombatError);
  });
  it('rejects negative cash', () => {
    expect(() => simulateRaid(input({ defenderCashCents: -1n }), model, flatRng)).toThrow(CombatError);
  });
  it('rejects invalid crack inventory', () => {
    expect(() => simulateRaid(input({ defenderCrack: -1 }), model, flatRng)).toThrow(CombatError);
    expect(() => simulateRaid(input({ defenderCrack: 1.5 }), model, flatRng)).toThrow(CombatError);
  });
  it.each([-0.1, 1, NaN, Infinity])('rejects RNG output %s', (value) => {
    expect(() => simulateRaid(input(), model, () => value)).toThrow('Combat rolls');
  });
  it('rejects rules that can create negative strength or steal more than exposed cash', () => {
    expect(() => simulateRaid(input(), { ...model, strength: { ...model.strength, variance: 1 } }, flatRng)).toThrow(CombatError);
    expect(() => simulateRaid(input(), { ...model, loot: { ...model.loot, exposedCashPercent: 101 } }, flatRng)).toThrow(CombatError);
    expect(() => simulateRaid(input(), { ...model, loot: { ...model.loot, exposedDrugPercent: 101 } }, flatRng)).toThrow(CombatError);
    expect(() => simulateRaid(input(), { ...model, loot: { ...model.loot, weightedPercent: { minPercent: 41, maxPercent: 40, exponent: 2.5, repeatPenaltyPercent: 25, repeatFloorPercent: 25 } } }, flatRng)).toThrow(CombatError);
    expect(() => simulateRaid(input(), { ...model, loot: { ...model.loot, exposedCashPercent: 40, weightedPercent: { minPercent: 5, maxPercent: 40, exponent: 0, repeatPenaltyPercent: 25, repeatFloorPercent: 25 } } }, flatRng)).toThrow(CombatError);
  });
});

describe('combat balance experiments', () => {
  it('repeats the same simulation exactly with the same seed', () => {
    expect(runCombatSimulation(100, 42)).toEqual(runCombatSimulation(100, 42));
  });
  it('finds close fights uncertain, upgrade advantages useful, and a numerical counter to elite squads', () => {
    const rows = runCombatSimulation(5_000, 42);
    const get = (name: string) => rows.find((row) => row.name === name)!;
    expect(get('Early mirror').winPercent).toBeGreaterThan(10);
    expect(get('Early mirror').winPercent).toBeLessThan(18);
    expect(get('25 versus 20 pistols').winPercent).toBeGreaterThan(85);
    for (const name of ['20 shotguns versus 20 pistols', '20 Tek-9s versus 20 shotguns', '20 AKs versus 20 Tek-9s']) {
      expect(get(name).winPercent).toBeGreaterThan(95);
    }
    expect(get('40 pistols versus 10 AKs').winPercent).toBe(100);
    expect(get('Early into middle').winPercent).toBe(0);
    expect(get('Protected starting cash').maxLootCents).toBe(0n);
  });
  it('removes the home advantage when supplied a neutral-defense variant', () => {
    const variant = { ...model, strength: { ...model.strength, defenseMultiplier: 1 } };
    const [row] = runCombatSimulation(5_000, 42, variant, [combatScenarios[0]!]);
    expect(row!.winPercent).toBeGreaterThan(47);
    expect(row!.winPercent).toBeLessThan(53);
  });
  it('renders the model revision, seed, units and experiment limitations in the report', () => {
    const report = combatSimulationMarkdown(runCombatSimulation(10, 42), 10, 42, model);
    expect(report).toContain('0.2.0-A.1');
    expect(report).toContain('Seed: 42');
    expect(report).toContain('Mean loot');
    expect(report).toContain('does not validate repeated attacks');
  });
  it.each([0, -1, NaN, 1.5, 1_000_001])('rejects invalid simulation samples %s', (samples) => {
    expect(() => runCombatSimulation(samples)).toThrow('Samples');
  });
});
