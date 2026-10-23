import { describe, expect, it } from 'vitest';
import { careerStoryCrossover } from '../career-story-crossover.service.js';

describe('career story crossover privacy', () => {
  it('keeps the base path safe when a source is private', () => {
    expect(careerStoryCrossover({ kind: 'CASE', sourceId: 'case-secret', label: 'Private case', ownerVisible: false, publicVisible: false })).toEqual({ kind: 'CASE', sourceId: 'unavailable', label: 'Optional crossover unavailable', available: false });
  });
  it('exposes only a stable permitted reference', () => {
    expect(careerStoryCrossover({ kind: 'CREW', sourceId: 'crew-1', label: 'Crew cameo', ownerVisible: true, publicVisible: false }).sourceId).toBe('crew-1');
  });
});
