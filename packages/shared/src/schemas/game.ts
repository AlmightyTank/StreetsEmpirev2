import { z } from 'zod';


/**
 * Every resource-changing request carries a client generated actionId so a
 * double click, a retry or a flaky connection cannot execute it twice.
 * Section 52.
 */
/**
 * 1.0.0-C. The most units one order may name. Inventory columns are 32-bit, and
 * price x quantity has to stay exact in a JavaScript number, so anything above
 * this is refused as input instead of overflowing somewhere downstream.
 */
export const MAX_ORDER_QUANTITY = 100_000_000;
/** More turns than any ruleset can hold; a request above it is not a real request. */
export const MAX_TURNS_PER_ACTION = 100_000;

export const actionIdSchema = z
  .string()
  .trim()
  .min(8, 'Missing action id.')
  .max(64, 'Invalid action id.');

export const joinRoundSchema = z.object({
  actionId: actionIdSchema.optional(),
});

/**
 * Turns to spend on an action. The upper bound is not here: how many turns
 * exist is a fact about the player and the round, so the service checks it and
 * answers with the real numbers ("you tried to spend 25, you have 18").
 */
export const turnsToSpendSchema = z
  .number({ invalid_type_error: 'Enter how many turns to spend.' })
  .int('Turns must be a whole number.')
  .positive('Spend at least one turn.')
  .max(MAX_TURNS_PER_ACTION, 'That is more turns than you can hold.');

/**
 * The district key is validated against the round's own ruleset rather than a
 * list frozen here - a different ruleset is allowed different districts.
 */
export const scoutSchema = z.object({
  district: z.string().trim().min(1, 'Pick a district to scout.'),
  turns: turnsToSpendSchema,
  territoryAccessGrantId: z.string().min(1).max(64).optional(),
  crewMemberIds: z.array(z.string().trim().min(1).max(64)).max(5).refine((ids) => new Set(ids).size === ids.length, 'Choose each crew member once.').optional(),
  actionId: actionIdSchema,
}).strict();

export const produceCrackSchema = z.object({
  turns: turnsToSpendSchema,
  /** A product key the round can cook. Defaults to crack. */
  productType: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'Pick something to cook.').default('CRACK'),
  actionId: actionIdSchema,
});

export const randomEncounterChoiceSchema = z.object({
  choice: z.string().trim().min(1, 'Pick a response.').max(64, 'Pick a response.'),
  actionId: actionIdSchema,
}).strict();

/** Section 31. Bounds live in the ruleset; this only checks the shape. */
export const payoutSchema = z.object({
  percent: z
    .number({ invalid_type_error: 'Payout must be a whole percentage.' })
    .int('Payout must be a whole percentage.'),
  actionId: actionIdSchema,
});

export type JoinRoundInput = z.infer<typeof joinRoundSchema>;
export type ScoutInput = z.infer<typeof scoutSchema>;
export type RandomEncounterChoiceInput = z.infer<typeof randomEncounterChoiceSchema>;

const turfMoveSchema = z.object({
  district: z.string().trim().min(1, 'Pick a turf block.'),
  thugs: z.number({ invalid_type_error: 'Enter how many thugs to send.' })
    .int('Thugs must be a whole number.').positive('Send at least one thug.').safe(),
  actionId: actionIdSchema,
}).strict();

export const turfClaimSchema = turfMoveSchema;
export const turfPostSchema = turfMoveSchema;
export const turfPullSchema = turfMoveSchema;

export const turfPushSchema = z.object({
  district: z.string().trim().min(1, 'Pick a turf block.'),
  squad: z.number({ invalid_type_error: 'Enter how many thugs to send.' })
    .int('Thugs must be a whole number.').positive('Send at least one thug.').safe(),
  actionId: actionIdSchema,
}).strict();

export const turfPushBackupSchema = z.object({
  pushId: z.string().trim().min(1).max(64),
  thugs: z.number({ invalid_type_error: 'Enter how many thugs to send.' })
    .int('Thugs must be a whole number.').positive('Send at least one thug.').safe(),
  actionId: actionIdSchema,
}).strict();

export const turfPushCallSchema = z.object({
  pushId: z.string().trim().min(1).max(64),
  actionId: actionIdSchema,
}).strict();

export type TurfClaimInput = z.infer<typeof turfClaimSchema>;
export type TurfPostInput = z.infer<typeof turfPostSchema>;
export type TurfPullInput = z.infer<typeof turfPullSchema>;
export type TurfPushInput = z.infer<typeof turfPushSchema>;
export type TurfPushBackupInput = z.infer<typeof turfPushBackupSchema>;
export type TurfPushCallInput = z.infer<typeof turfPushCallSchema>;

/** 1.1.0-B/E. One lot on one of the player's blocks; city is optional for home compatibility. */
const businessLotSchema = z.object({
  city: z.string().trim().regex(/^[a-z][a-z-]{1,40}$/, 'Pick a city.').optional(),
  district: z.string().trim().min(1, 'Pick a turf block.'),
  lot: z.number({ invalid_type_error: 'Pick a lot.' }).int('Pick a lot.').min(1, 'Pick a lot.').max(3, 'Pick a lot.'),
  actionId: actionIdSchema,
}).strict();

export const businessBuildSchema = businessLotSchema;
/** Set how many staff to keep there (0 closes it, up to the level's max), and auto-staff. */
export const businessStaffSchema = businessLotSchema.extend({
  staff: z.number({ invalid_type_error: 'Enter how many staff to keep there.' }).int('Staff must be a whole number.').min(0, 'Staff cannot be negative.').safe(),
  autoStaff: z.boolean().optional(),
}).strict();
export const businessCollectSchema = z.object({ actionId: actionIdSchema }).strict();
/** 1.1.0-C. Run a racket on the business (a ruleset racket key), or null to run the front alone. */
export const businessRacketSchema = businessLotSchema.extend({
  racket: z.string().trim().min(1, 'Pick a racket.').max(40, 'Pick a racket.').nullable(),
}).strict();
export type BusinessRacketInput = z.infer<typeof businessRacketSchema>;

/** 1.1.0-D. Block wars. */
const warThugs = z.number({ invalid_type_error: 'Enter how many thugs to send.' }).int('Thugs must be a whole number.').min(1, 'Send at least one thug.').safe();
export const blockWarDeclareSchema = z.object({
  district: z.string().trim().min(1, 'Pick a turf block.'),
  goal: z.enum(['TAKE', 'SACK']),
  squad: warThugs,
  actionId: actionIdSchema,
}).strict();
/** The holder's backup for a pending fight, a break attempt, or the declarer's re-assault. */
export const blockWarSendSchema = z.object({
  warId: z.string().trim().min(1),
  thugs: warThugs,
  actionId: actionIdSchema,
}).strict();
/** Call one ally to your side, promising a cut of 0-50% in steps of 10. */
export const blockWarCallSchema = z.object({
  warId: z.string().trim().min(1),
  cutPercent: z.number().int().min(0).max(50).multipleOf(10, 'The cut moves in steps of 10%.'),
  actionId: actionIdSchema,
}).strict();
export const blockWarAnswerSchema = z.object({
  warId: z.string().trim().min(1),
  side: z.enum(['ATTACKER', 'DEFENDER']),
  thugs: warThugs,
  actionId: actionIdSchema,
}).strict();
export const blockWarEndSchema = z.object({
  warId: z.string().trim().min(1),
  actionId: actionIdSchema,
}).strict();
export const businessTorchSchema = businessLotSchema;
export type BlockWarDeclareInput = z.infer<typeof blockWarDeclareSchema>;
export type BlockWarSendInput = z.infer<typeof blockWarSendSchema>;
export type BlockWarCallInput = z.infer<typeof blockWarCallSchema>;
export type BlockWarAnswerInput = z.infer<typeof blockWarAnswerSchema>;
export type BlockWarEndInput = z.infer<typeof blockWarEndSchema>;
export type BusinessTorchInput = z.infer<typeof businessTorchSchema>;
export type BusinessBuildInput = z.infer<typeof businessBuildSchema>;
export type BusinessStaffInput = z.infer<typeof businessStaffSchema>;
export type BusinessCollectInput = z.infer<typeof businessCollectSchema>;

export type ProduceCrackInput = z.infer<typeof produceCrackSchema>;
export type PayoutInput = z.infer<typeof payoutSchema>;

export const hideoutUpgradeSchema = z.object({
  room: z.enum(['SAFE_ROOM', 'LOOKOUTS', 'WORKSHOP', 'BACK_OFFICE', 'GARAGE']),
  actionId: actionIdSchema,
});
export type HideoutUpgradeInput = z.infer<typeof hideoutUpgradeSchema>;

export const hideoutWeaponPrioritySchema = z.object({
  priority: z.enum(['POWER', 'CONSERVE']),
  actionId: actionIdSchema,
}).strict();
export type HideoutWeaponPriorityInput = z.infer<typeof hideoutWeaponPrioritySchema>;

export const hideoutSpecializationSchema = z.object({
  room: z.enum(['SAFE_ROOM', 'LOOKOUTS', 'WORKSHOP', 'BACK_OFFICE']),
  specialization: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'Pick a specialization.'),
  actionId: actionIdSchema,
}).strict();
export type HideoutSpecializationInput = z.infer<typeof hideoutSpecializationSchema>;

export const storeTradeSchema = z.object({
  store: z.string().trim().min(1, 'Pick a store.').max(64),
  item: z.string().trim().min(1, 'Pick an item.').max(64),
  direction: z.enum(['buy', 'sell']),
  quantity: z.number({ invalid_type_error: 'Enter a quantity.' })
    .int('Quantity must be a whole number.').positive('Enter at least one.').max(MAX_ORDER_QUANTITY, 'That order is too large.'),
  territoryAccessGrantId: z.string().min(1).max(64).optional(),
  actionId: actionIdSchema,
});

export type StoreTradeInput = z.infer<typeof storeTradeSchema>;

export const storeCheckoutLineSchema = storeTradeSchema.omit({ actionId: true });

export const storeCheckoutSchema = z.object({
  lines: z.array(storeCheckoutLineSchema)
    .min(1, 'Add something to the basket.')
    .max(20, 'Check out up to 20 lines at a time.'),
  territoryAccessGrantId: z.string().min(1).max(64).optional(),
  actionId: actionIdSchema,
});

export type StoreCheckoutLineInput = z.infer<typeof storeCheckoutLineSchema>;
export type StoreCheckoutInput = z.infer<typeof storeCheckoutSchema>;

export const storeSpecialOrderSchema = z.object({
  store: z.string().trim().min(1, 'Pick a store.').max(64),
  item: z.string().trim().min(1, 'Pick an item.').max(64),
  actionId: actionIdSchema,
});

export type StoreSpecialOrderInput = z.infer<typeof storeSpecialOrderSchema>;

/** 1.6.0-B. A prepaid wholesale order held at its supplier for later pickup. */
export const supplyOrderSchema = z.object({
  supplierKey: z.string().trim().min(1).max(64),
  productKey: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'Pick a product.'),
  quantity: z.number({ invalid_type_error: 'Enter a quantity.' }).int().positive().max(MAX_ORDER_QUANTITY),
  /** Durable order idempotency key; unlike actionId it remains unique beyond the action cache window. */
  requestKey: actionIdSchema,
  actionId: actionIdSchema,
}).strict();

export type SupplyOrderInput = z.infer<typeof supplyOrderSchema>;

const pickupCount = (what: string) => z.number({ invalid_type_error: `Say how many ${what}.` })
  .int(`${what} must be a whole number.`).min(0, `${what} cannot be negative.`).max(MAX_ORDER_QUANTITY, 'That is too many.');
const supplyCrewMemberIdsSchema = z.array(z.string().trim().min(1).max(64))
  .max(50, 'Choose up to 50 crew members.')
  .refine((ids) => new Set(ids).size === ids.length, 'Choose each crew member once.');

/** Send vehicles for one load, or keep them shuttling until the requested balance is collected. */
export const supplyPickupSchema = z.object({
  orderId: z.string().trim().min(1).max(64),
  quantity: z.number({ invalid_type_error: 'Enter a quantity.' }).int().positive().max(MAX_ORDER_QUANTITY),
  /** Keep the selected crew and fleet running full loads until this quantity is collected. */
  continuous: z.boolean().default(false),
  vehicleLoadout: z.object({ LOW_RIDER: pickupCount('Low-Riders').optional(), SEDAN: pickupCount('Sedans').optional(), VAN: pickupCount('Vans').optional() }).strict(),
  escortThugs: pickupCount('escorts').default(0),
  /** Which of the ways to the supplier. Ignored for a supplier in the player's own city. */
  route: z.number().int().min(0).max(9).default(0),
  /** 1.6.0-D. The warehouse the load goes to. Absent: the home stash. */
  warehouseId: z.string().trim().min(1).max(64).optional(),
  /** 1.8.6-G. Optional named escorts; when present, count must match escortThugs. */
  escortMemberIds: supplyCrewMemberIdsSchema.optional(),
  /** Durable pickup idempotency key, like an order's. */
  requestKey: actionIdSchema,
  actionId: actionIdSchema,
}).strict();

export type SupplyPickupInput = z.input<typeof supplyPickupSchema>;

/** 1.6.0-F. Ship stock from one of the player's warehouses to another, by run. */
export const supplyShipmentSchema = z.object({
  sourceWarehouseId: z.string().trim().min(1).max(64),
  destinationWarehouseId: z.string().trim().min(1).max(64),
  productKey: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'Pick a product.'),
  quantity: z.number({ invalid_type_error: 'Enter a quantity.' }).int().positive().max(MAX_ORDER_QUANTITY),
  vehicleLoadout: z.object({ LOW_RIDER: pickupCount('Low-Riders').optional(), SEDAN: pickupCount('Sedans').optional(), VAN: pickupCount('Vans').optional() }).strict(),
  escortThugs: pickupCount('escorts').default(0),
  /** 1.8.6-G. Optional named escorts; when present, count must match escortThugs. */
  escortMemberIds: supplyCrewMemberIdsSchema.optional(),
  route: z.number().int().min(0).max(9).default(0),
  requestKey: actionIdSchema,
  actionId: actionIdSchema,
}).strict();

export type SupplyShipmentInput = z.input<typeof supplyShipmentSchema>;

/** 1.6.0-H. Buy abroad and ship by route card to a warehouse in one of its entry cities. */
export const supplyLaneOrderSchema = z.object({
  supplierKey: z.string().trim().min(1).max(64),
  productKey: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'Pick a product.'),
  quantity: z.number({ invalid_type_error: 'Enter a quantity.' }).int().positive().max(MAX_ORDER_QUANTITY),
  route: z.enum(['FREIGHT', 'OVERLAND', 'AIR', 'NORTHERN']),
  /** A warehouse id, or `stash` for the home stash. */
  warehouseKey: z.string().trim().min(1).max(64),
  requestKey: actionIdSchema,
  actionId: actionIdSchema,
}).strict();

export type SupplyLaneOrderInput = z.infer<typeof supplyLaneOrderSchema>;

/** 1.6.0-D. Buy a warehouse or a safehouse in a city. */
export const supplyPropertyBuySchema = z.object({
  kind: z.enum(['WAREHOUSE', 'SAFEHOUSE']),
  citySlug: z.string().trim().min(1).max(64),
  actionId: actionIdSchema,
}).strict();

/** 1.6.0-D. Give up a property. A warehouse must be empty with nothing on the way. */
export const supplyPropertyCloseSchema = z.object({
  kind: z.enum(['WAREHOUSE', 'SAFEHOUSE']),
  propertyId: z.string().trim().min(1).max(64),
  actionId: actionIdSchema,
}).strict();

const districtKeySchema = z.enum(['CASINO', 'WINO_SLUMS', 'LOW_RENT', 'NIGHTCLUB', 'URBAN_GHETTO']);

/** 1.6.0-E. Set a dealer crew up in a district, with this many dealers from the crew at home. */
export const dealerCrewEstablishSchema = z.object({
  citySlug: z.string().trim().min(1).max(64),
  districtKey: districtKeySchema,
  dealers: z.number().int().min(1).max(50),
  actionId: actionIdSchema,
}).strict();

/** 1.6.0-E. What a crew sells and asks. A new product needs an empty crew. */
export const dealerCrewOfferSchema = z.object({
  productKey: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'Pick a product.').optional(),
  priceCents: z.number().int().positive().max(100_000_000).optional(),
  actionId: actionIdSchema,
}).strict();

/** 1.6.0-E. Move stock between a crew and a warehouse in its city. */
export const dealerCrewStockSchema = z.object({
  warehouseId: z.string().trim().min(1).max(64),
  direction: z.enum(['LOAD', 'RETURN']),
  quantity: z.number().int().positive().max(MAX_ORDER_QUANTITY),
  actionId: actionIdSchema,
}).strict();

/** 1.8.6-F. How much same-city storage runners must leave behind for this crew. */
export const dealerCrewRunnerReserveSchema = z.object({
  reserveUnits: z.number().int().min(0).max(MAX_ORDER_QUANTITY),
  actionId: actionIdSchema,
}).strict();

/** 1.6.0-E. Pause, resume, move or close a crew. */
export const dealerCrewManageSchema = z.object({
  action: z.enum(['PAUSE', 'RESUME', 'MOVE', 'CLOSE']),
  /** Where it moves to, for MOVE. */
  districtKey: districtKeySchema.optional(),
  actionId: actionIdSchema,
}).strict();

export type DealerCrewEstablishInput = z.infer<typeof dealerCrewEstablishSchema>;
export type DealerCrewOfferInput = z.infer<typeof dealerCrewOfferSchema>;
export type DealerCrewStockInput = z.infer<typeof dealerCrewStockSchema>;
export type DealerCrewRunnerReserveInput = z.infer<typeof dealerCrewRunnerReserveSchema>;
export type DealerCrewManageInput = z.infer<typeof dealerCrewManageSchema>;

export type SupplyPropertyBuyInput = z.infer<typeof supplyPropertyBuySchema>;
export type SupplyPropertyCloseInput = z.infer<typeof supplyPropertyCloseSchema>;

/** 1.6.0-A. Hire a fresh dealer career or reassign a previously released one. */
export const dealerStaffAssignSchema = z.object({
  staffId: z.string().trim().min(1).max(64).optional(),
  actionId: actionIdSchema,
}).strict();

/** 1.6.0-A. Release one named dealer career back to the available thug pool. */
export const dealerStaffReleaseSchema = z.object({ actionId: actionIdSchema }).strict();

export type DealerStaffAssignInput = z.infer<typeof dealerStaffAssignSchema>;
export type DealerStaffReleaseInput = z.infer<typeof dealerStaffReleaseSchema>;

/** 1.7.0-A. A page of the crew roster. */
export const crewRosterQuerySchema = z.object({
  role: z.enum(['THUG', 'WORKER']).optional(),
  status: z.enum(['AVAILABLE', 'ASSIGNED', 'IN_TRANSIT', 'RECOVERING', 'RELEASED']).optional(),
  assignment: z.enum(['BUSINESS', 'DEALER', 'TURF', 'CORNER_ENFORCER', 'CORNER_LOOKOUT', 'STASH_GUARD', 'RUNNER', 'BODYGUARD', 'ESCORT']).optional(),
  specialty: z.enum(['GENERALIST', 'ENFORCER', 'WHEELMAN', 'SCOUT', 'DEALER', 'SERVICE']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
}).strict();

export type CrewRosterQuery = z.infer<typeof crewRosterQuerySchema>;

/** 1.8.6-E. Move already-posted corner thugs into or out of corner specialty jobs. */
export const crewCornerJobSchema = z.object({
  district: z.string().trim().min(1, 'Pick a turf block.').max(64),
  kind: z.enum(['CORNER_LOOKOUT', 'STASH_GUARD']),
  memberIds: z.array(z.string().trim().min(1).max(64)).min(1).max(50)
    .refine((ids) => new Set(ids).size === ids.length, 'Choose each crew member once.'),
  actionId: actionIdSchema,
}).strict();

export type CrewCornerJobInput = z.infer<typeof crewCornerJobSchema>;

/** 1.8.6-H. Keep a standing headcount filled on player-triggered actions. */
export const crewStaffingOrderSchema = z.object({
  kind: z.enum(['DEALER', 'TURF', 'CORNER_LOOKOUT', 'STASH_GUARD', 'RUNNER']),
  targetRef: z.string().trim().min(1).max(64),
  headcount: z.number().int().min(0).max(50),
  keepTurns: z.number().int().min(0).max(10_000).default(10),
  actionId: actionIdSchema,
}).strict();

export type CrewStaffingOrderInput = z.infer<typeof crewStaffingOrderSchema>;

/** Optional round-only mentorship links. No action turns or spend. */
export const crewMentorLinkSchema = z.object({
  mentorId: z.string().trim().min(1).max(64),
  apprenticeId: z.string().trim().min(1).max(64),
}).strict();
export type CrewMentorLinkInput = z.infer<typeof crewMentorLinkSchema>;

export const crewMentorEndSchema = z.object({
  bondId: z.string().trim().min(1).max(64),
}).strict();
export type CrewMentorEndInput = z.infer<typeof crewMentorEndSchema>;

export const crewNicknameSchema = z.object({
  memberId: z.string().trim().min(1).max(64),
  nicknameKey: z.enum(['CORNER_KEEPER','ROAD_VETERAN','SHIFT_ANCHOR','STREET_REGULAR','TRUSTED_HAND']).nullable(),
}).strict();
export type CrewNicknameInput = z.infer<typeof crewNicknameSchema>;

/** 1.7.0-D. Train an available member who already earned the selected specialty. */
export const crewTrainingSchema = z.object({
  memberId: z.string().trim().min(1).max(64),
  actionId: actionIdSchema,
}).strict();
export type CrewTrainingInput = z.infer<typeof crewTrainingSchema>;

/** Replace an existing job occupant, or trade an available member for a released veteran. */
export const crewAssignmentSchema = z.object({
  memberId: z.string().trim().min(1).max(64),
  replaceMemberId: z.string().trim().min(1).max(64),
  actionId: actionIdSchema,
}).strict();
export type CrewAssignmentInput = z.infer<typeof crewAssignmentSchema>;

const crewMemberIdsSchema = z.array(z.string().trim().min(1).max(64))
  .min(1, 'Choose at least one crew member.')
  .max(50, 'Move up to 50 crew members at a time.')
  .refine((ids) => new Set(ids).size === ids.length, 'Choose each crew member once.');

/** 1.8.6-B. Put named members on a dealer crew, or move named dealers to another crew. */
export const crewDealerMembersSchema = z.object({
  memberIds: crewMemberIdsSchema,
  actionId: actionIdSchema,
}).strict();
export type CrewDealerMembersInput = z.infer<typeof crewDealerMembersSchema>;

/** 1.8.6-B. Put named members on a corner, or bring named corner defenders home. */
export const crewTurfMembersSchema = z.object({
  district: z.string().trim().min(1, 'Pick a turf block.'),
  memberIds: crewMemberIdsSchema,
  actionId: actionIdSchema,
}).strict();
export type CrewTurfMembersInput = z.infer<typeof crewTurfMembersSchema>;

/** 1.8.6-B. Move named corner defenders from their current corner to another held corner. */
export const crewTurfMoveMembersSchema = z.object({
  toDistrict: z.string().trim().min(1, 'Pick a destination turf block.'),
  memberIds: crewMemberIdsSchema,
  actionId: actionIdSchema,
}).strict();
export type CrewTurfMoveMembersInput = z.infer<typeof crewTurfMoveMembersSchema>;

/** 0.4.0-D. Pip's counter for a non-crack product. */
export const productTradeSchema = z.object({
  product: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'Pick a product.'),
  direction: z.enum(['buy', 'sell']),
  quantity: z.number({ invalid_type_error: 'Enter a quantity.' })
    .int('Quantity must be a whole number.').positive('Enter at least one.').max(MAX_ORDER_QUANTITY, 'That order is too large.'),
  actionId: actionIdSchema,
});
export type ProductTradeInput = z.infer<typeof productTradeSchema>;

export const weaponUnlockSchema = z.object({
  weapon: z.enum(['SHOTGUN', 'TEK9', 'AK47']),
  actionId: actionIdSchema,
});
export type WeaponUnlockInput = z.infer<typeof weaponUnlockSchema>;

export const questKeySchema = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,63}$/, 'Invalid quest.');
export const questAcceptSchema = z.object({ actionId: actionIdSchema }).strict();
export const questClaimSchema = z.object({
  actionId: actionIdSchema,
  branchKey: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,63}$/, 'Invalid branch.').optional(),
}).strict();
export const questTrackSchema = z.object({ tracked: z.boolean() }).strict();
/** Start daily, weekly and city board work automatically. */
export const questAutoAcceptSchema = z.object({ enabled: z.boolean() }).strict();
/** Street Pass: claim one reached tier. */
export const streetPassClaimSchema = z.object({
  tier: z.number().int().min(1).max(200),
  actionId: actionIdSchema,
}).strict();
export type StreetPassClaimInput = z.infer<typeof streetPassClaimSchema>;
export const questAbandonSchema = z.object({}).strict();
export const favorActivateSchema = z.object({ actionId: actionIdSchema }).strict();
export const favorArmSchema = z.object({ actionId: actionIdSchema }).strict();

export type FavorActivateInput = z.infer<typeof favorActivateSchema>;
export type FavorArmInput = z.infer<typeof favorArmSchema>;
export type QuestAcceptInput = z.infer<typeof questAcceptSchema>;
export type QuestClaimInput = z.infer<typeof questClaimSchema>;
export type QuestTrackInput = z.infer<typeof questTrackSchema>;
export type QuestAbandonInput = z.infer<typeof questAbandonSchema>;

export const raidSchema = z.object({
  roundId: z.string().min(1).max(64),
  targetPublicPimpId: z.number().int().positive().max(2_147_483_647),
  attackingThugs: z.number().int().positive().safe(),
  /** 2.4.0-D. Optional per-raid ammunition spend ceiling, in rounds. */
  attackerAmmoCapRounds: z.number().int().min(0).max(2_147_483_647).optional(),
  crewMemberIds: z.array(z.string().trim().min(1).max(64)).max(5).refine((ids) => new Set(ids).size === ids.length, 'Choose each crew member once.').optional(),
  actionId: actionIdSchema,
}).strict();
export type RaidInputDto = z.infer<typeof raidSchema>;

/** Same intent as a raid: a target, how many go, and a retry-safe id. */
export const driveBySchema = raidSchema.omit({ crewMemberIds: true, attackerAmmoCapRounds: true });
export type DriveByInputDto = z.infer<typeof driveBySchema>;

export const specialRaidSchema = raidSchema.omit({ crewMemberIds: true, attackerAmmoCapRounds: true }).extend({
  kind: z.enum(['DRUG_HOES', 'STEAL_RIDE', 'LURE_CREW']),
}).strict();
export type SpecialRaidInputDto = z.infer<typeof specialRaidSchema>;

export const combatTreatmentSchema = z.object({
  roundId: z.string().min(1).max(64),
  thugs: z.number().int().positive().safe(),
  actionId: actionIdSchema,
}).strict();
export type CombatTreatmentInputDto = z.infer<typeof combatTreatmentSchema>;

export const combatReconSchema = z.object({
  roundId: z.string().min(1).max(64),
  targetPublicPimpId: z.number().int().positive().max(2_147_483_647),
  actionId: actionIdSchema,
}).strict();
export type CombatReconInputDto = z.infer<typeof combatReconSchema>;

/** 1.6.5-B. Accept one of the loan shark's fixed offers. The server resolves its terms. */
export const loanAcceptSchema = z.object({
  offerKey: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'Pick an offer.'),
  /** 1.6.5-C. The fee the player was shown. A loan is never taken at a price nobody saw. */
  quotedFeeCents: z.number({ invalid_type_error: 'Missing the quoted fee.' }).int().min(0).max(Number.MAX_SAFE_INTEGER),
  /** Durable acceptance key: the same key always answers with the same loan. */
  requestKey: actionIdSchema,
  actionId: actionIdSchema,
}).strict();
export type LoanAcceptInputDto = z.infer<typeof loanAcceptSchema>;

/** 1.6.5-D. A payment from cash toward one loan: partial, overdue or a payoff. */
export const loanPaymentSchema = z.object({
  /** At most this much. A payoff request may name more than the payoff; only the payoff is taken. */
  amountCents: z.number({ invalid_type_error: 'Enter an amount.' }).int('Whole cents only.').positive('Pay at least one cent.').max(Number.MAX_SAFE_INTEGER),
  requestKey: actionIdSchema,
  actionId: actionIdSchema,
}).strict();
export type LoanPaymentInputDto = z.infer<typeof loanPaymentSchema>;
