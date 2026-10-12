import type { EncounterGangRules } from './types.js';

export const ENCOUNTER_GANG_RULES = {
  enabled: true,
  minCrews: 2,
  maxCrews: 8,
  humansPerCrew: 4,
  startingTurfChance: 0.7,
  pushBelowReputation: 25,
  retaliationHours: 24,
  wantedHours: 24,
  dormantBelowMomentum: -20,
  dormantHours: 12,
  migrateAfterHours: 36,
  bountyCents: { SCRUB: 150_000, STREET: 300_000, VETERAN: 600_000, KINGPIN: 1_200_000 },
  personalities: {
    'cautious-hustlers': { label: 'Cautious hustlers', style: 'Count twice, hit once. They favor soft marks and quiet exits.', targeting: 'WEAKEST', favoriteMove: 'CASH_RAID' },
    'violent-crew': { label: 'Violent crew', style: 'Loud, heavy and first through the door. They favor the biggest name nearby.', targeting: 'RICHEST', favoriteMove: 'DRIVE_BY' },
    'ride-thieves': { label: 'Ride thieves', style: 'They watch parked cars and road traffic for an opening.', targeting: 'RIDES', favoriteMove: 'STEAL_RIDE' },
    'product-cooks': { label: 'Product cooks', style: 'They protect their kitchen and lean on anyone moving product nearby.', targeting: 'PRODUCT', favoriteMove: 'DRUG_HOES' },
    ambushers: { label: 'Ambushers', style: 'They wait for wounded, unhappy or distracted crews.', targeting: 'DISTRACTED', favoriteMove: 'LURE_CREW' },
  },
  roster: [
    { slug: 'red-hand', bossName: 'Knuckles Keane', crewName: 'Red Hand Crew', crewTag: 'RHC', personality: 'violent-crew', aggression: 68, ambition: 50, discipline: 45 },
    { slug: 'quiet-money', bossName: 'Penny Vance', crewName: 'Quiet Money Crew', crewTag: 'QMC', personality: 'cautious-hustlers', aggression: 56, ambition: 62, discipline: 70 },
    { slug: 'back-alley', bossName: 'Slim Ortega', crewName: 'Back Alley Crew', crewTag: 'BAC', personality: 'ambushers', aggression: 64, ambition: 45, discipline: 35 },
    { slug: 'cookhouse', bossName: 'Mama Reyes', crewName: 'Cookhouse Crew', crewTag: 'COOK', personality: 'product-cooks', aggression: 40, ambition: 75, discipline: 60 },
    { slug: 'hot-wire', bossName: 'Sparks Malone', crewName: 'Hot Wire Gang', crewTag: 'HWG', personality: 'ride-thieves', aggression: 62, ambition: 58, discipline: 40 },
    { slug: 'block-breakers', bossName: 'Big Dutch', crewName: 'Block Breakers', crewTag: 'BRK', personality: 'violent-crew', aggression: 74, ambition: 45, discipline: 40 },
    { slug: 'kitchen-boys', bossName: 'Lil Biscuit', crewName: 'Kitchen Boys', crewTag: 'KTB', personality: 'product-cooks', aggression: 46, ambition: 70, discipline: 55 },
    { slug: 'chop-shop', bossName: 'Rhonda Chains', crewName: 'Chop Shop Crew', crewTag: 'CHOP', personality: 'ride-thieves', aggression: 66, ambition: 55, discipline: 50 },
  ],
} as const satisfies EncounterGangRules;
