import { describe, expect, it } from 'vitest';
import {
  consumeGeneratorFuel,
  generatorCapacity,
  generatorFuelPerTurn,
} from '../generator.service.js';

describe('hideout generator', () => {
  it('scales capacity and efficiency upgrades', () => {
    expect(generatorCapacity(0)).toBe(10);
    expect(generatorCapacity(3)).toBe(25);
    expect(generatorFuelPerTurn(0)).toBe(2);
    expect(generatorFuelPerTurn(1)).toBe(1);
    expect(generatorFuelPerTurn(2)).toBe(1);
  });

  it('drains fuel for powered turns and switches off at zero', () => {
    const next = consumeGeneratorFuel({ generatorPowered: true, generatorFuel: 10, generatorEfficiencyLevel: 0 }, 3);
    expect(next).toEqual({ generatorPowered: true, generatorFuel: 4, generatorEfficiencyLevel: 0 });

    const empty = consumeGeneratorFuel(next, 3);
    expect(empty).toEqual({ generatorPowered: false, generatorFuel: 0, generatorEfficiencyLevel: 0 });
  });

  it('uses the improved rate and preserves unpowered fuel', () => {
    expect(consumeGeneratorFuel({ generatorPowered: true, generatorFuel: 5, generatorEfficiencyLevel: 1 }, 3)).toMatchObject({
      generatorPowered: true,
      generatorFuel: 2,
    });
    expect(consumeGeneratorFuel({ generatorPowered: false, generatorFuel: 5, generatorEfficiencyLevel: 0 }, 4)).toMatchObject({
      generatorPowered: false,
      generatorFuel: 5,
    });
  });
});
