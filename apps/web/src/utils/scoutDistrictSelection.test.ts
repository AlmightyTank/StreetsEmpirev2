import { describe, expect, it } from 'vitest';
import type { DistrictDto } from '@streets/shared';
import { isScoutDistrictUnlocked, resolveScoutDistrict } from './scoutDistrictSelection.js';

const locked = { key: 'MIDTOWN', districtAccess: { unlocked: false } } as DistrictDto;
const open = { key: 'BOWERY', districtAccess: { unlocked: true } } as DistrictDto;
const legacy = { key: 'OTHER' } as DistrictDto;

describe('Scout district access', () => {
  it('skips a locked deep link or remembered district and falls back to an unlocked one', () => {
    expect(resolveScoutDistrict([locked, open, legacy], 'MIDTOWN', 'MIDTOWN')).toBe('BOWERY');
    expect(resolveScoutDistrict([locked, open, legacy], 'MIDTOWN', 'OTHER')).toBe('OTHER');
    expect(resolveScoutDistrict([locked, open], 'BOWERY', 'MIDTOWN')).toBe('BOWERY');
  });
  it('preserves legacy districts without an access gate', () => {
    expect(isScoutDistrictUnlocked(legacy)).toBe(true);
    expect(isScoutDistrictUnlocked(locked)).toBe(false);
    expect(isScoutDistrictUnlocked(undefined)).toBe(false);
  });
  it('leaves the selection empty if no district is unlocked', () => {
    expect(resolveScoutDistrict([locked], 'MIDTOWN', 'MIDTOWN')).toBe('');
    expect(resolveScoutDistrict([], '', '')).toBe('');
  });
});
