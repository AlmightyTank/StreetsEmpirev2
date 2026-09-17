import { describe, expect, it } from 'vitest';
import { classicOgV03D } from '@streets/rulesets';
import { reinforcedDefense, reinforcementScenarios, runReinforcementSimulation } from '../simulations/reinforcement.js';

const model = classicOgV03D.combat;
const middle = reinforcementScenarios.find((scenario) => scenario.name === 'Middle mirror')!;
const bigger = reinforcementScenarios.find((scenario) => scenario.name === 'Attacker 25% bigger')!;

describe('reinforcement simulation', () => {
  it('trims help to the cap and lets only the reinforcements past the squad cap', () => {
    const { reinforcing, merged, mergedModel } = reinforcedDefense(middle, { label: 'x', maxAllies: 2, allyShare: 0.5, capOfOwnSquad: 0.1 }, model);
    expect(reinforcing).toBe(4);
    expect(merged.thugs).toBe(44);
    expect(mergedModel.squadCap).toBe(model.squadCap);
    const late = reinforcementScenarios.find((scenario) => scenario.name === 'Late mirror')!;
    expect(reinforcedDefense(late, { label: 'x', maxAllies: 2, allyShare: 0.5, capOfOwnSquad: 0.25 }, model).mergedModel.squadCap).toBe(125);
  });

  it('is repeatable and adds nothing without allies', () => {
    const candidates = [
      { label: 'none', maxAllies: 0, allyShare: 0, capOfOwnSquad: 0 },
      { label: 'ten', maxAllies: 2, allyShare: 0.5, capOfOwnSquad: 0.1 },
    ];
    const first = runReinforcementSimulation(model, 2_000, 7, [bigger], candidates);
    expect(runReinforcementSimulation(model, 2_000, 7, [bigger], candidates)).toEqual(first);
    expect(first[0]!.reinforcingThugs).toBe(0);
    expect(first[0]!.meanAllyWounds).toBe(0);
    // Help can only make the attacker's job harder.
    expect(first[1]!.attackerWinPercent).toBeLessThan(first[0]!.attackerWinPercent);
  });
});
