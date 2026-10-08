import type { NpcGangPersonality } from './types.js';

/**
 * Phase M. The named crew styles NPC gangs run with. Biases add to the scheduler's
 * intent weights (roughly 10-60 range), so a +40 is a strong habit and a -25 is a move
 * the crew only makes when little else is on the table.
 */
export const NPC_GANG_PERSONALITIES = {
  'cautious-hustlers': {
    label: 'Cautious hustlers',
    names: [
      { name: 'Quiet Money Crew', tag: 'QMC' },
      { name: 'Corner Accountants', tag: 'ACCT' },
      { name: 'Slow Hand Boys', tag: 'SHB' },
    ],
    style: 'Count twice, hit once. They pick soft marks and are gone before anyone looks up.',
    aliases: ['balanced-street-crew', 'local-rivals', 'balanced', 'hustler'],
    bias: { RESTOCK: 15, PRODUCE: 15, RAID_PLAYER: 5, DRIVE_BY_PLAYER: -25, SPECIAL_RAID_PLAYER: -10, TURF: 10, LAY_LOW: 15 },
    targeting: 'WEAKEST',
    squadShare: 0.8,
  },
  'violent-crew': {
    label: 'Violent crew',
    names: [
      { name: 'Block Breakers', tag: 'BRK' },
      { name: 'Red Hand Crew', tag: 'RHC' },
      { name: 'Front Door Boys', tag: 'FDB' },
    ],
    style: 'Loud, heavy and first through the door. They go after the biggest name on the block.',
    aliases: ['muscle-crew', 'muscle', 'hitter', 'enforcer', 'violent'],
    bias: { RAID_PLAYER: 40, DRIVE_BY_PLAYER: 25, SPECIAL_RAID_PLAYER: 5, RESTOCK: 10, TURF: 10, PRODUCE: -15, LAY_LOW: -20 },
    targeting: 'RICHEST',
    squadShare: 1.3,
  },
  'ride-thieves': {
    label: 'Ride thieves',
    names: [
      { name: 'Hubcap Kings', tag: 'HUB' },
      { name: 'Chop Shop Crew', tag: 'CHOP' },
      { name: 'Hot Wire Gang', tag: 'HWG' },
    ],
    style: 'They want your wheels. Cars parked out front have a way of going missing.',
    aliases: ['ride', 'driver', 'car', 'thief'],
    bias: { SPECIAL_RAID_PLAYER: 35, DRIVE_BY_PLAYER: 30, RESTOCK: 10, PRODUCE: -10, LAY_LOW: -5 },
    targeting: 'RIDES',
    favoriteSpecial: 'STEAL_RIDE',
    squadShare: 1,
  },
  'product-cooks': {
    label: 'Product cooks',
    names: [
      { name: 'Cookhouse Crew', tag: 'COOK' },
      { name: 'Kitchen Boys', tag: 'KTB' },
      { name: 'Late Stove Gang', tag: 'LSG' },
    ],
    style: 'Stove on all night. They guard their stash, and when they do swing, your product goes bad.',
    aliases: ['stash-builder', 'stash', 'builder', 'cook'],
    bias: { PRODUCE: 50, RESTOCK: 20, TURF: 25, SPECIAL_RAID_PLAYER: 5, RAID_PLAYER: -20, DRIVE_BY_PLAYER: -25 },
    targeting: 'PRODUCT',
    favoriteSpecial: 'DRUG_HOES',
    squadShare: 0.9,
  },
  ambushers: {
    label: 'Ambushers',
    names: [
      { name: 'Back Alley Crew', tag: 'BAC' },
      { name: 'Second Wave', tag: 'SWV' },
      { name: 'Low Light Boys', tag: 'LLB' },
    ],
    style: 'They wait for you to bleed. Wounded crews and unhappy corners are their whole menu.',
    aliases: ['desperate-locals', 'desperate', 'lure', 'locals', 'ambush'],
    bias: { SPECIAL_RAID_PLAYER: 30, RAID_PLAYER: 20, TURF: -10, LAY_LOW: -10 },
    targeting: 'DISTRACTED',
    favoriteSpecial: 'LURE_CREW',
    squadShare: 1.1,
  },
} as const satisfies Record<string, NpcGangPersonality>;

export type NpcGangPersonalityKey = keyof typeof NPC_GANG_PERSONALITIES;
