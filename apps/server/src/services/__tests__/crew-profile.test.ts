import { describe, expect, it } from 'vitest';
import { CREW_BASELINE_TRAITS, crewMemberName, crewMemberSpecialty, crewMemberTraits } from '../crew-profile.js';

describe('crew profiles', () => {
  it('creates stable unique names across the first two roster cycles', () => {
    for (const role of ['THUG', 'WORKER'] as const) {
      const firstCycle = Array.from({ length: 256 }, (_, index) => crewMemberName(role, index + 1));
      expect(new Set(firstCycle).size).toBe(firstCycle.length);
      expect(crewMemberName(role, 1)).toBe(crewMemberName(role, 1));
      expect(crewMemberName(role, 257)).not.toBe(crewMemberName(role, 1));
    }
  });

  it('assigns visible descriptive traits without defining outcome modifiers', () => {
    for (const role of ['THUG', 'WORKER'] as const) {
      const traits = Array.from({ length: 300 }, (_, index) => crewMemberTraits(role, index + 1)[0]!);
      expect(new Set(traits)).toEqual(new Set(CREW_BASELINE_TRAITS));
    }
    expect(crewMemberSpecialty(null, 'GENERALIST')).toBe('GENERALIST');
    expect(crewMemberSpecialty(null, 'SCOUT')).toBe('SCOUT');
    expect(crewMemberSpecialty('staff-id', 'SCOUT')).toBe('DEALER');
  });
});
