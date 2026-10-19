import { describe, expect, it } from 'vitest';
import { chooseLane } from '../admission.service.js';

describe('admission fairness', () => {
  it('uses a 3:1 supporter rotation while preserving standard progress', () => {
    expect([0, 1, 2].map((sequence) => chooseLane(sequence, true, true, true))).toEqual(['SUPPORTER', 'SUPPORTER', 'SUPPORTER']);
    expect(chooseLane(3, true, true, true)).toBe('STANDARD');
  });

  it('falls back to the only eligible lane', () => {
    expect(chooseLane(0, false, true, true)).toBe('STANDARD');
    expect(chooseLane(0, true, false, true)).toBe('SUPPORTER');
    expect(chooseLane(0, false, false, true)).toBeNull();
  });

  it('does not prioritize supporters when the priority gate is off', () => {
    expect(chooseLane(0, true, true, false)).toBe('STANDARD');
  });
});
