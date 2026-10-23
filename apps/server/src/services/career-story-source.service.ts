import type { CareerStorySourceKind } from '@streets/shared';

export interface CareerStorySourceReceipt {
  sourceKind: CareerStorySourceKind;
  sourceId: string;
  settledAt: Date;
}

const SOURCE_PREFIXES: Array<[CareerStorySourceKind, string[]]> = [
  ['COMBAT', ['RAID_', 'COMBAT_']],
  ['TURF', ['TURF_']],
  ['TRAVEL', ['TRAVEL_', 'RUN_', 'CONVOY_']],
  ['SUPPLY', ['SUPPLY_', 'STORE_']],
  ['CONTACT', ['CONTACT_']],
  ['BUSINESS', ['BUSINESS_']],
  ['SCOUT', ['SCOUT_']],
  ['CASE', ['CASE_']],
  ['CREW', ['CREW_']],
  ['FACTION', ['FACTION_']],
  ['PUBLIC_ACTIVITY', ['PUBLIC_']],
];

export function careerStorySourceFromActivity(activity: { id: string; type: string; createdAt: Date | string; payload?: unknown }): CareerStorySourceReceipt | null {
  const type = String(activity.type);
  const match = SOURCE_PREFIXES.find(([, prefixes]) => prefixes.some((prefix) => type.startsWith(prefix)));
  return match ? { sourceKind: match[0], sourceId: `activity:${activity.id}`, settledAt: new Date(activity.createdAt) } : null;
}
