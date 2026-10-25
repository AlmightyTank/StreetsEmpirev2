import { classicOgV26I } from '../classic-og-v2.6-i/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { contactSideStories } from './contact-side-stories.js';
import { completeQuestNarratives } from './quest-narrative-completion.js';

/** The Board B. One book per rarity; see docs/ROADMAP-THE-BOARD.md for the table. */
const COMMON = 400;
const UNCOMMON = 2_500;
const RARE = 8_000;
const EPIC = 25_000;
const LEGENDARY = 250_000;

/**
 * The Board A-G. Adds the player-listing block, switched off: the band, part books, listing
 * rules, listable drugs and keeper goods are defined, but nothing posts, fills, renders or counts toward rank. Every other rule is
 * 2.6.0-I's.
 */
const {
  ammoParts: _retiredAmmoParts,
  individualItems: _retiredIndividualItems,
  supplyNetwork: _retiredSupplyNetwork,
  loanShark: _retiredLoanShark,
  ...classicOgV26JBase
} = classicOgV26I;

const {
  AMMO_BOX: _retiredAmmoBox,
  AMMO_CASE: _retiredAmmoCase,
  AMMO_CRATE: _retiredAmmoCrate,
  ...tommyItemsWithoutAmmo
} = classicOgV26JBase.stores.TOMMY.items;
const {
  PARTS_BOX: _retiredPartsBox,
  PARTS_CRATE: _retiredPartsCrate,
  PARTS_PALLET: _retiredPartsPallet,
  ...charlieItemsWithoutParts
} = classicOgV26JBase.stores.CHARLIE.items;

const retiredAmmoQuest = classicOgV26JBase.questDefinitions?.ML_M13_DATE_CHANGED_IN_INK;
const currentQuestDefinitions = retiredAmmoQuest
  ? defineQuestCatalog(completeQuestNarratives({
      ...classicOgV26JBase.questDefinitions,
      ...contactSideStories,
      ML_M13_DATE_CHANGED_IN_INK: {
        ...retiredAmmoQuest,
        objectives: retiredAmmoQuest.objectives.filter((objective) => objective.id !== 'crew_ammo'),
        story: {
          ...retiredAmmoQuest.story!,
          inProgress: 'Tommy has a copy of the raid report from the night the rival crew hit the corner, and the roster of who was working it.\n\n“I don’t talk raids with a crew that can’t answer one,” he says. “Read it, and tell me what you see.”',
          actionHint: 'Read the raid report in the scene below. A recon is a bonus, not a requirement.',
          scenes: retiredAmmoQuest.story!.scenes!.map((scene) => ({ ...scene, after: undefined })),
        },
      },
    }, classicOgV26JBase.contacts))
  : classicOgV26JBase.questDefinitions;

export const classicOgV26J = {
  ...classicOgV26JBase,
  meta: { ...classicOgV26I.meta, id: 'classic-og-v2.6-j', version: '2.6.0-J', name: 'Classic OG - The Board (dark)' },
  vehicleCatalog: classicOgV26I.vehicleCatalog
    ? { ...classicOgV26I.vehicleCatalog, service: undefined }
    : undefined,
  stores: {
    ...classicOgV26JBase.stores,
    TOMMY: { ...classicOgV26JBase.stores.TOMMY, items: tommyItemsWithoutAmmo },
    CHARLIE: { ...classicOgV26JBase.stores.CHARLIE, items: charlieItemsWithoutParts },
  },
  questDefinitions: currentQuestDefinitions,
  retiredFeatures: {
    salvageYard: true,
    bulkOrders: true,
    loanShark: true,
    dealerCrews: true,
    armory: true,
    garage: true,
    ammoParts: true,
    scavenging: false,
  },
  playerBoard: {
    enabled: false,
    taxPercent: 0,
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
    maxOpenOffers: 10,
    startingOpenOffers: 3,
    reputationPerOpenOffer: 1,
    listingHours: [12, 48],
    listableProducts: ['CRACK', 'WEED', 'ECSTASY', 'COCAINE', 'METH', 'HEROIN'],
    maxAskItems: 3,
    listableKeeperGoods: ['PISTOL', 'SHOTGUN', 'TEK9', 'AK47', 'LOW_RIDER'],
  },
} as const satisfies Ruleset;

/**
 * The Board E-H. 2.6.0-J with player listings switched on. Since H it is registered last, so new
 * rounds pin it; any round already on 2.6.0-J keeps the Board off.
 */
export const classicOgV26JBoard = {
  ...classicOgV26J,
  meta: { ...classicOgV26J.meta, id: 'classic-og-v2.6-j-board', version: '2.6.0-J-board', name: 'Classic OG - The Board (live)' },
  playerBoard: { ...classicOgV26J.playerBoard, enabled: true },
} as const satisfies Ruleset;
