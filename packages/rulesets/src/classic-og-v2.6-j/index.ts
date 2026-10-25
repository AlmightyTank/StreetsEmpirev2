import { classicOgV26I } from '../classic-og-v2.6-i/index.js';
import type { Ruleset } from '../types.js';

/** The Board B. One book per rarity; see docs/ROADMAP-THE-BOARD.md for the table. */
const COMMON = 400;
const UNCOMMON = 2_500;
const RARE = 8_000;
const EPIC = 25_000;
const LEGENDARY = 250_000;

/**
 * The Board A-C. Adds the player-listing block, switched off: the band, part books and listing
 * rules are defined, but nothing posts, fills, renders or counts toward rank. Every other rule is
 * 2.6.0-I's.
 */
export const classicOgV26J = {
  ...classicOgV26I,
  meta: { ...classicOgV26I.meta, id: 'classic-og-v2.6-j', version: '2.6.0-J', name: 'Classic OG - The Board (dark)' },
  playerBoard: {
    enabled: false,
    taxPercent: 8,
    partBookCents: {
      SCRAP_METAL: COMMON, WIRING: COMMON, TOOL_KIT: COMMON, BOTTLES: COMMON, LABELS: COMMON,
      PACKAGING: COMMON, LUMBER: COMMON, FASTENERS: COMMON, CLOTH: COMMON,
      BASIC_MEDICINE: UNCOMMON, FUEL_CAN: UNCOMMON, RADIO: UNCOMMON,
      MOTOR_ASSEMBLY: RARE, REPAIR_SUPPLIES: RARE, SPECIALTY_CONTAINER: RARE,
      PRECISION_PARTS: EPIC, ADVANCED_MEDICAL: EPIC,
      HIGH_CAPACITY_FUEL_CELL: LEGENDARY, SPECIALIST_CIRCUITRY: LEGENDARY,
    },
    postingFeePercent: 1,
    postingFeeMinCents: 100,
    maxOpenOffers: 6,
    listingHours: [12, 48],
  },
} as const satisfies Ruleset;

/**
 * The Board E. 2.6.0-J with player listings switched on, for a new round an admin opts in. It is
 * registered ahead of 2.6.0-J, so 2.6.0-J stays the default for new rounds until the Board's
 * release slice says otherwise.
 */
export const classicOgV26JBoard = {
  ...classicOgV26J,
  meta: { ...classicOgV26J.meta, id: 'classic-og-v2.6-j-board', version: '2.6.0-J-board', name: 'Classic OG - The Board (live)' },
  playerBoard: { ...classicOgV26J.playerBoard, enabled: true },
} as const satisfies Ruleset;
