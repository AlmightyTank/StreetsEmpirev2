import { describe, expect, it } from 'vitest';
import { classicOgV02D, classicOgV02E } from '@streets/rulesets';
import {
  CombatError,
  driveByMaxShooters,
  simulateDriveBy,
  validateDriveByRules,
  type CombatCrew,
  type DriveByInput,
} from '../calculations/combat.js';
import { combatSimulationRng } from '../simulations/combat.js';
import { flatRng, type Rng } from '../rng.js';

const model = classicOgV02E.combat;
const rules = classicOgV02E.combat.driveBy;

const crew = (thugs: number, weapons: Partial<CombatCrew['weapons']> = { PISTOL: thugs }): CombatCrew => ({
  thugs, thugHappiness: 100, weapons: { PISTOL: 0, SHOTGUN: 0, TEK9: 0, AK47: 0, ...weapons },
});

const input = (overrides: Partial<DriveByInput> = {}): DriveByInput => ({
  attacker: crew(12), defender: crew(10), shooters: 6, lowRiders: 1,
  attackerTurns: 200, defenderWhores: 40, ...overrides,
});

/**
 * Hands out the given rolls in order, then 0.5 forever. The fixed roll order
 * is: attacker strength, defender strength, four hit rolls, the miss roll,
 * then one per shooter.
 */
function scripted(...values: number[]): Rng {
  let i = 0;
  return () => values[i++] ?? 0.5;
}
const noisyStart = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];

/** A crew the attacker cannot possibly out-shoot. */
const fortress = crew(200);

describe('drive-bys', () => {
  it('ship in E and nowhere earlier', () => {
    expect(rules).toBeDefined();
    expect('driveBy' in classicOgV02D.combat).toBe(false);
    expect(() => validateDriveByRules(rules)).not.toThrow();
    // Seats come from the same number the store has always shown.
    expect(rules.thugsPerLowRider).toBe(classicOgV02E.lowRiderThugCapacity);
  });

  describe('who can go', () => {
    it('needs a car', () => {
      expect(() => simulateDriveBy(input({ lowRiders: 0 }), model, rules, flatRng)).toThrow(/Low-Rider/);
    });

    it('never puts more shooters on the road than there are seats', () => {
      expect(driveByMaxShooters(100, 2, model, rules)).toBe(2 * rules.thugsPerLowRider);
      expect(driveByMaxShooters(3, 2, model, rules)).toBe(3);
      expect(() => simulateDriveBy(input({ shooters: rules.thugsPerLowRider + 1 }), model, rules, flatRng)).toThrow(CombatError);
    });

    it('costs turns up front', () => {
      expect(() => simulateDriveBy(input({ attackerTurns: rules.turnCost - 1 }), model, rules, flatRng)).toThrow(/turns/);
      expect(simulateDriveBy(input(), model, rules, flatRng).attackerTurnsAfter).toBe(200 - rules.turnCost);
    });
  });

  describe('the exchange', () => {
    it('only faces half the target’s crew, with no home advantage', () => {
      const result = simulateDriveBy(input({ defender: crew(11) }), model, rules, flatRng);
      expect(result.defender.committed).toBe(Math.ceil(11 * rules.defenderFieldedFraction));
      // Flat rolls: the only multiplier left on their side is the drive-by one.
      expect(result.effectiveStrength.defender).toBeCloseTo(result.defender.strength * rules.defenseMultiplier);
    });

    it('lets one full car beat a matched starter crew most of the time', () => {
      // Six pistols against Razor Ray's ten, five of whom are out front.
      const rng = combatSimulationRng(20260911);
      let hits = 0;
      for (let i = 0; i < 2_000; i++) {
        if (simulateDriveBy(input({ defender: crew(10) }), model, rules, rng).winner === 'ATTACKER') hits++;
      }
      expect(hits / 2_000).toBeGreaterThan(0.9);
    });

    it('takes no return fire from an empty block', () => {
      const result = simulateDriveBy(input({ defender: crew(0) }), model, rules, scripted(...noisyStart, 0, 0, 0, 0, 0, 0));
      expect(result.winner).toBe('ATTACKER');
      expect(result.casualtyChance).toBe(0);
      expect(result.wounds.attacker).toBe(0);
      expect(result.lowRidersLost).toBe(0);
    });
  });

  describe('a hit', () => {
    it('wounds their crew and kills whores, and takes nothing else', () => {
      // Top rolls on both, against a house small enough that no cap bites.
      const result = simulateDriveBy(input({ defender: crew(20), defenderWhores: 60, shooters: 12, lowRiders: 2 }), model, rules,
        scripted(0.5, 0.5, 0.999, 0.999, 0, 0, 0.5));
      expect(result.winner).toBe('ATTACKER');
      expect(result.thugWoundPercent).toBe(rules.hit.thugWounds.maxPercent);
      expect(result.whoreKillPercent).toBe(rules.hit.whoreKills.maxPercent);
      expect(result.wounds.defender).toBe(Math.floor(20 * rules.hit.thugWounds.maxPercent / 100));
      expect(result.whoresKilled).toBe(Math.floor(60 * rules.hit.whoreKills.maxPercent / 100));
      expect(result.defenderWhoresAfter).toBe(60 - result.whoresKilled);
      expect(result).not.toHaveProperty('lootCents');
    });

    it('rolls low far more often than high', () => {
      const rng = combatSimulationRng(7);
      const kills: number[] = [];
      for (let i = 0; i < 2_000; i++) kills.push(simulateDriveBy(input({ defender: crew(4) }), model, rules, rng).whoreKillPercent);
      const hits = kills.filter((percent) => percent > 0);
      const low = hits.filter((percent) => percent < (rules.hit.whoreKills.minPercent + rules.hit.whoreKills.maxPercent) / 2);
      expect(low.length / hits.length).toBeGreaterThan(0.6);
      expect(Math.max(...hits)).toBeLessThanOrEqual(rules.hit.whoreKills.maxPercent);
    });

    it('lets each shooter drop only so many, so one car never empties a big house', () => {
      const result = simulateDriveBy(input({ defender: crew(10, {}), defenderWhores: 10_000 }), model, rules,
        scripted(0.5, 0.5, 0.999, 0.999));
      expect(result.winner).toBe('ATTACKER');
      expect(result.whoresKilled).toBe(6 * rules.hit.perShooterWhoreKills);
      expect(result.wounds.defender).toBeLessThanOrEqual(6 * rules.hit.perShooterThugWounds);
    });
  });

  describe('a miss', () => {
    it('lands nothing on the target', () => {
      const result = simulateDriveBy(input({ defender: fortress }), model, rules, flatRng);
      expect(result.winner).toBe('DEFENDER');
      expect(result.whoresKilled).toBe(0);
      expect(result.thugWoundPercent).toBe(0);
      expect(result.defenderWhoresAfter).toBe(40);
    });

    it('costs more the worse you were outgunned, up to the cap', () => {
      const close = simulateDriveBy(input({ defender: crew(14) }), model, rules, flatRng);
      const lopsided = simulateDriveBy(input({ defender: crew(20) }), model, rules, flatRng);
      const hopeless = simulateDriveBy(input({ defender: fortress }), model, rules, flatRng);

      expect(close.winner).toBe('DEFENDER');
      expect(close.casualtyChance).toBeGreaterThanOrEqual(rules.casualties.onMissBase);
      expect(lopsided.casualtyChance).toBeGreaterThan(close.casualtyChance);
      expect(hopeless.casualtyChance).toBe(rules.casualties.max);
    });
  });

  describe('the cars', () => {
    it('loses a car only when everybody in it went down', () => {
      // Two full cars. The first loses all six; the second gets one home.
      const result = simulateDriveBy(input({ attacker: crew(12), shooters: 12, lowRiders: 2, defender: fortress }), model, rules,
        scripted(...noisyStart, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.99));

      expect(result.cars).toEqual([
        { crew: 6, down: 6, lost: true },
        { crew: 6, down: 5, lost: false },
      ]);
      expect(result.lowRidersLost).toBe(1);
      expect(result.lowRidersAfter).toBe(1);
      // Everyone who went down is wounded, including the five who made it back.
      expect(result.wounds.attacker).toBe(11);
    });

    it('fills cars in order, so a lone shooter in the last one is the car at risk', () => {
      const result = simulateDriveBy(input({ attacker: crew(7), shooters: 7, lowRiders: 2, defender: fortress }), model, rules,
        scripted(...noisyStart, 0.99, 0, 0, 0, 0, 0, 0));

      expect(result.cars.map((car) => car.crew)).toEqual([6, 1]);
      expect(result.cars.map((car) => car.lost)).toEqual([false, true]);
      expect(result.lowRidersLost).toBe(1);
    });

    it('leaves cars that were never used out of it', () => {
      const result = simulateDriveBy(input({ attacker: crew(6), shooters: 6, lowRiders: 5, defender: fortress }), model, rules,
        scripted(...noisyStart, 0, 0, 0, 0, 0, 0));
      expect(result.cars).toHaveLength(1);
      expect(result.lowRidersAfter).toBe(4);
    });
  });

  it('is reproducible from its rolls', () => {
    const a = simulateDriveBy(input(), model, rules, combatSimulationRng(42));
    const b = simulateDriveBy(input(), model, rules, combatSimulationRng(42));
    expect(a).toEqual(b);
  });
});
