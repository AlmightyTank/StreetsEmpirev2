import { describe, expect, it } from 'vitest';
import { armoryBulkActionSchema } from '../schemas/game.js';

const base = { actionId: 'armory-action-0001', items: [{ kind: 'GUN', id: 'gun-1' }] };

describe('armory bulk action input', () => {
  it('accepts gun flags and vehicle naming', () => {
    expect(armoryBulkActionSchema.safeParse({ ...base, action: 'RESERVE' }).success).toBe(true);
    expect(armoryBulkActionSchema.safeParse({ ...base, items: [{ kind: 'VEHICLE', id: 'car-1' }], action: 'RENAME', name: 'Night Runner' }).success).toBe(true);
  });

  it('requires a name for renames and keeps favourites/reserves gun-only', () => {
    expect(armoryBulkActionSchema.safeParse({ ...base, action: 'RENAME' }).success).toBe(false);
    expect(armoryBulkActionSchema.safeParse({ ...base, items: [{ kind: 'VEHICLE', id: 'car-1' }], action: 'FAVORITE' }).success).toBe(false);
  });

  it('bounds the selection to 100 rows', () => {
    const items = Array.from({ length: 101 }, (_, index) => ({ kind: 'GUN' as const, id: `gun-${index}` }));
    expect(armoryBulkActionSchema.safeParse({ actionId: base.actionId, items, action: 'RESERVE' }).success).toBe(false);
  });
});
