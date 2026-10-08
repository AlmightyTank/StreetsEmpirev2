import { describe, expect, it } from 'vitest';
import { runLaunchSchema, vehiclePurchaseSchema, vehicleServiceSchema } from '../schemas/playing-together.js';

const actionId = '00000000-0000-4000-8000-000000000015';

describe('1.5.0-B vehicle request schemas', () => {
  it('accepts a mixed run loadout while keeping the legacy Low-Rider field optional', () => {
    const parsed = runLaunchSchema.parse({
      to: 'detroit', route: 0, vehicleLoadout: { LOW_RIDER: 1, SEDAN: 1, VAN: 0 },
      escortThugs: 4, cashCents: 0, actionId,
    });
    expect(parsed.vehicleLoadout).toEqual({ LOW_RIDER: 1, SEDAN: 1, VAN: 0 });
    expect(parsed.lowRiders).toBeUndefined();
  });

  it('caps vehicle purchases to a small whole-number order', () => {
    expect(vehiclePurchaseSchema.parse({ classId: 'VAN', quantity: 2, actionId })).toMatchObject({ classId: 'VAN', quantity: 2 });
    expect(() => vehiclePurchaseSchema.parse({ classId: 'VAN', quantity: 11, actionId })).toThrow();
  });
});

describe('1.5.0-C garage service schema', () => {
  it('accepts a repair or a recovery for any class and refuses anything else', () => {
    expect(vehicleServiceSchema.parse({ classId: 'LOW_RIDER', kind: 'RECOVER', quantity: 1, actionId })).toMatchObject({ classId: 'LOW_RIDER', kind: 'RECOVER' });
    expect(() => vehicleServiceSchema.parse({ classId: 'VAN', kind: 'SCRAP', quantity: 1, actionId })).toThrow();
    expect(() => vehicleServiceSchema.parse({ classId: 'VAN', kind: 'REPAIR', quantity: 0, actionId })).toThrow();
  });
});
