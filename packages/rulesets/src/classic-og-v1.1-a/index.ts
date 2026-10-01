import { classicOgV08H } from '../classic-og-v0.8-h/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.1.0-A, the first Businesses, Fronts & Rackets ruleset. 0.8.0-H balance, plus a
 * `business` block: the three lots on every turf block, what each business costs, staffs
 * and earns, the city signatures, block tiers, war fatigue, block-war timings, the one
 * ally per side, and how the locals let an abandoned block's businesses decay.
 *
 * Nothing reads these numbers yet: a 1.1.0-A round plays exactly like a 0.8.0-H one, and
 * a test pins that. They are here so `npm run qa:business` can argue with them before any
 * of it is built, the way 0.6.0-A did for turf. See docs/ROADMAP-1.1.0.md.
 *
 * Sizing:
 * - A business's build costs about two and a half days of its level-1 income on an
 *   ordinary block, and taking it to level 5 costs ten builds. The last upgrades pay back
 *   slowly on purpose: level 5 is a mid-season goal for a crew that holds its block, not
 *   a first-week build.
 * - Income is sized against a mid-round crew's street day: the best front at level 1 is a
 *   few percent of it, and a fully built home cap never grosses a street day and nets at
 *   most half of one after its staff, so businesses supplement the street the way turf
 *   does.
 * - Staff are the price. Thugs on a business are thugs not covering girls, the same
 *   trade a corner crew makes. On the Casino strip a thug covers the fewest girls, so
 *   foot traffic (`districtIncome`) has to pay for them there.
 */
export const classicOgV11A = {
  ...classicOgV08H,
  meta: { id: 'classic-og-v1.1-a', version: '1.1.0-A', name: 'Classic OG - Businesses' },
  business: {
    catalog: {
      CASINO_FRONT: { name: 'Casino Front', staff: 'THUGS', baseStaff: 2, incomeCentsPerHour: 33_000, buildCostCents: 1_980_000 },
      NIGHTCLUB: { name: 'Nightclub', staff: 'THUGS', baseStaff: 2, incomeCentsPerHour: 26_500, buildCostCents: 1_590_000 },
      STRIP_CLUB: { name: 'Strip Club', staff: 'WHORES', baseStaff: 4, incomeCentsPerHour: 25_000, buildCostCents: 1_500_000 },
      CHOP_SHOP: { name: 'Chop Shop', staff: 'THUGS', baseStaff: 2, incomeCentsPerHour: 18_500, buildCostCents: 1_110_000 },
      AUTO_GARAGE: { name: 'Auto Garage', staff: 'THUGS', baseStaff: 2, incomeCentsPerHour: 16_500, buildCostCents: 990_000 },
      PAWN_SHOP: { name: 'Pawn Shop', staff: 'THUGS', baseStaff: 1, incomeCentsPerHour: 13_500, buildCostCents: 810_000 },
      WAREHOUSE: { name: 'Warehouse', staff: 'THUGS', baseStaff: 1, incomeCentsPerHour: 12_500, buildCostCents: 750_000 },
      BAR: { name: 'Bar', staff: 'THUGS', baseStaff: 1, incomeCentsPerHour: 12_500, buildCostCents: 750_000 },
      LAUNDROMAT: { name: 'Laundromat', staff: 'THUGS', baseStaff: 1, incomeCentsPerHour: 8_500, buildCostCents: 510_000 },
      CONVENIENCE_STORE: { name: 'Convenience Store', staff: 'THUGS', baseStaff: 1, incomeCentsPerHour: 7_500, buildCostCents: 450_000 },
    },
    lots: {
      CASINO: ['CASINO_FRONT', 'BAR', 'PAWN_SHOP'],
      NIGHTCLUB: ['NIGHTCLUB', 'STRIP_CLUB', 'BAR'],
      LOW_RENT: ['LAUNDROMAT', 'CONVENIENCE_STORE', 'AUTO_GARAGE'],
      URBAN_GHETTO: ['CHOP_SHOP', 'CONVENIENCE_STORE', 'WAREHOUSE'],
      WINO_SLUMS: ['PAWN_SHOP', 'WAREHOUSE', 'LAUNDROMAT'],
    },
    signatures: {
      'las-vegas': { business: 'CASINO_FRONT', multiplier: 1.25 },
      'miami-beach': { business: 'NIGHTCLUB', multiplier: 1.25 },
      'detroit': { business: 'CHOP_SHOP', multiplier: 1.25 },
      'los-angeles': { business: 'AUTO_GARAGE', multiplier: 1.25 },
      'seattle': { business: 'WAREHOUSE', multiplier: 1.25 },
      'atlanta': { business: 'STRIP_CLUB', multiplier: 1.25 },
      'new-york-city': { business: 'LAUNDROMAT', multiplier: 1.25 },
      'beverly-hills': { business: 'PAWN_SHOP', multiplier: 1.25 },
    },
    districtIncome: { CASINO: 1.5, NIGHTCLUB: 1.25, LOW_RENT: 1, URBAN_GHETTO: 1, WINO_SLUMS: 0.8 },
    levels: {
      maxLevel: 5,
      incomeMultiplier: [1, 1.8, 2.5, 3.1, 3.6],
      staffMultiplier: [1, 1.5, 2, 2.5, 3],
      costMultiplier: [1, 1.25, 1.75, 2.5, 3.5],
      buildTurnCost: 6,
      fatiguedUpgradeMarkup: 0.25,
    },
    supply: { beerPerStaffPerHour: 0.05, productPerStaffPerHour: 0.02 },
    register: { capHours: 24, collectTurnCost: 2 },
    staffTurnCost: 2,
    staffDepartureTurnsPerHour: 5,
    awayOutputShare: 0.75,
    tiers: {
      lotsOpen: [1, 2, 3],
      establishedHours: 24,
      strongholdHours: 96,
      establishedLotOneLevel: 2,
      strongholdLevels: 6,
      takeTierDrop: 1,
    },
    fatigue: {
      max: 80,
      perFight: 10,
      perSiegeHour: 2,
      onTake: 30,
      onConcede: 15,
      onSack: 40,
      onLocalsClaim: 10,
      recoveryPerHour: 1.25,
      scarredRecoveryPerHour: 0.75,
      scarredHandsChanged: 2,
      scarredWindowHours: 168,
      upgradeMarkupAbove: 40,
    },
    wars: {
      declareTurnCost: 12,
      maxDeclaredPerCrew: 1,
      warningMinutes: 30,
      siegeHours: 12,
      allySiegeSpeedup: 0.5,
      breakSiegeControlLoss: 40,
      resiegeCooldownHours: 4,
      maxWarHours: 48,
      truceHours: 24,
      sackTruceHours: 72,
      loserCooldownHours: 72,
      breakMusterMinutes: 15,
    },
    allies: {
      maxPerSide: 1,
      maxShareOfDeclarer: 1,
      siegeCallMinutes: 15,
      maxWarsAsAlly: 1,
      maxCutShare: 0.5,
      cutStep: 0.1,
    },
    locals: {
      graceHours: 24,
      levelLossEveryHours: 48,
      takeoverTierDrop: 1,
      footholdAfterHours: 72,
      localsPerLevel: 1,
      maxLocalsBonusShare: 0.5,
    },
    torch: { levelsLost: 2, salvageShare: 0.2, turnCost: 6, minutes: 30, closedFinalHours: 48 },
    sackLevelsLost: 1,
  },
} as const satisfies Ruleset;
