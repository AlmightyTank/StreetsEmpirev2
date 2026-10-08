import type { NpcGangPersonality, NpcGangRosterEntry } from './types.js';

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
    bias: { HUSTLE: 20, RESTOCK: 15, PRODUCE: 15, RAID_PLAYER: 5, DRIVE_BY_PLAYER: -25, SPECIAL_RAID_PLAYER: -10, TURF: 10, LAY_LOW: 15 },
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
    bias: { RAID_PLAYER: 40, DRIVE_BY_PLAYER: 25, SPECIAL_RAID_PLAYER: 5, RESTOCK: 10, TURF: 10, HUSTLE: -5, PRODUCE: -15, LAY_LOW: -20 },
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
    bias: { SPECIAL_RAID_PLAYER: 35, DRIVE_BY_PLAYER: 30, RESTOCK: 10, HUSTLE: 5, PRODUCE: -10, LAY_LOW: -5 },
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
    bias: { PRODUCE: 50, HUSTLE: 10, RESTOCK: 20, TURF: 25, SPECIAL_RAID_PLAYER: 5, RAID_PLAYER: -20, DRIVE_BY_PLAYER: -25 },
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
    bias: { SPECIAL_RAID_PLAYER: 30, RAID_PLAYER: 20, HUSTLE: 5, TURF: -10, LAY_LOW: -10 },
    targeting: 'DISTRACTED',
    favoriteSpecial: 'LURE_CREW',
    squadShare: 1.1,
  },
} as const satisfies Record<string, NpcGangPersonality>;

export type NpcGangPersonalityKey = keyof typeof NPC_GANG_PERSONALITIES;

/**
 * The crews the server spawns into live rounds. Each joins with the round's starting
 * stock, like a new player, and climbs tiers only by growing. Order is spawn order:
 * the first crews into a quiet round are a mix of styles, and the fighters come early
 * enough that a small round still has some pressure. Aggression of 55 and up raids;
 * crews below it build and only fight once a grudge or a run lifts them.
 */
export const NPC_GANG_ROSTER = [
  { slug: 'red-hand', bossName: 'Knuckles Keane', crewName: 'Red Hand Crew', crewTag: 'RHC', personality: 'violent-crew', aggression: 68, ambition: 50, discipline: 45 },
  { slug: 'quiet-money', bossName: 'Penny Vance', crewName: 'Quiet Money Crew', crewTag: 'QMC', personality: 'cautious-hustlers', aggression: 56, ambition: 62, discipline: 70 },
  { slug: 'back-alley', bossName: 'Slim Ortega', crewName: 'Back Alley Crew', crewTag: 'BAC', personality: 'ambushers', aggression: 64, ambition: 45, discipline: 35 },
  { slug: 'cookhouse', bossName: 'Mama Reyes', crewName: 'Cookhouse Crew', crewTag: 'COOK', personality: 'product-cooks', aggression: 40, ambition: 75, discipline: 60 },
  { slug: 'hot-wire', bossName: 'Sparks Malone', crewName: 'Hot Wire Gang', crewTag: 'HWG', personality: 'ride-thieves', aggression: 62, ambition: 58, discipline: 40 },
  { slug: 'block-breakers', bossName: 'Big Dutch', crewName: 'Block Breakers', crewTag: 'BRK', personality: 'violent-crew', aggression: 74, ambition: 45, discipline: 40 },
  { slug: 'kitchen-boys', bossName: 'Lil Biscuit', crewName: 'Kitchen Boys', crewTag: 'KTB', personality: 'product-cooks', aggression: 46, ambition: 70, discipline: 55 },
  { slug: 'second-wave', bossName: 'Ghost Pryor', crewName: 'Second Wave', crewTag: 'SWV', personality: 'ambushers', aggression: 60, ambition: 50, discipline: 45 },
  { slug: 'chop-shop', bossName: 'Rhonda Chains', crewName: 'Chop Shop Crew', crewTag: 'CHOP', personality: 'ride-thieves', aggression: 66, ambition: 55, discipline: 50 },
  { slug: 'slow-hand', bossName: 'Deacon Price', crewName: 'Slow Hand Boys', crewTag: 'SHB', personality: 'cautious-hustlers', aggression: 52, ambition: 65, discipline: 72 },
] as const satisfies readonly NpcGangRosterEntry[];
