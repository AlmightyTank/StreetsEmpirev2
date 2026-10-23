import type { DistrictDto } from '@streets/shared';

/** Never treat a missing district as an eligible choice. */
export function isScoutDistrictUnlocked(district: DistrictDto | undefined): district is DistrictDto {
  return !!district && district.districtAccess?.unlocked !== false;
}

/** Resolve stale saved selections and deep links using only currently unlocked districts. */
export function resolveScoutDistrict(districts: DistrictDto[], requested: string, remembered: string): string {
  const unlocked = districts.filter(isScoutDistrictUnlocked);
  return unlocked.find((row) => row.key === requested)?.key
    ?? unlocked.find((row) => row.key === remembered)?.key
    ?? unlocked[0]?.key
    ?? '';
}
