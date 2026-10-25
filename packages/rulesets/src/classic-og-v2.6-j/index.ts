import { classicOgV26I } from '../classic-og-v2.6-i/index.js';
import type { Ruleset } from '../types.js';

/** The Board B. One book per rarity; see docs/ROADMAP-THE-BOARD.md for the table. */
const COMMON = 400;
const UNCOMMON = 2_500;
const RARE = 8_000;
const EPIC = 25_000;
const LEGENDARY = 250_000;

/**
 * The Board A-B. Adds the player-listing block, switched off: the band can be priced and the part
 * books are defined, but nothing posts, fills, renders or counts toward rank. Every other rule is
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
  },
} as const satisfies Ruleset;
