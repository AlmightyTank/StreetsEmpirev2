import { describe, expect, it } from 'vitest';
import { medicineNeededForTreatment } from '../combat-recovery.service.js';

describe('Infirmary medicine efficiency', () => {
  it('keeps older treatment exact at zero efficiency', () => {
    expect(medicineNeededForTreatment(10, 1, 0)).toBe(10);
  });

  it('applies bounded whole-medicine savings', () => {
    expect(medicineNeededForTreatment(10, 1, 15)).toBe(9);
    expect(medicineNeededForTreatment(20, 1, 15)).toBe(17);
  });

  it('never makes a nonzero treatment free', () => {
    expect(medicineNeededForTreatment(1, 1, 15)).toBe(1);
    expect(medicineNeededForTreatment(1, 1, 50)).toBe(1);
  });
});
