import type { ActivityType } from '@streets/shared';

/**
 * Combat events belong to the cinematic presentation, never the ordinary toast
 * lane. Keep this list in sync with encounterAlertForActivity().
 */
export function isCinematicEncounterActivity(type: ActivityType): boolean {
  switch (type) {
    case 'RAID_ATTACK':
    case 'RAID_DEFENSE':
    case 'DRIVE_BY_ATTACK':
    case 'DRIVE_BY_DEFENSE':
    case 'TURF_PUSH_INCOMING':
    case 'TURF_PUSH_ATTACK':
    case 'TURF_PUSH_DEFENSE':
    case 'CONVOY_TAILED':
    case 'CONVOY_DEFENSE':
      return true;
    default:
      return false;
  }
}
