import { z } from 'zod';


/**
 * Every resource-changing request carries a client generated actionId so a
 * double click, a retry or a flaky connection cannot execute it twice.
 * Section 52.
 */
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
  .positive('Spend at least one turn.');

/**
 * The district key is validated against the round's own ruleset rather than a
 * list frozen here - a different ruleset is allowed different districts.
 */
export const scoutSchema = z.object({
  district: z.string().trim().min(1, 'Pick a district to scout.'),
  turns: turnsToSpendSchema,
  actionId: actionIdSchema,
});

export const produceCrackSchema = z.object({
  turns: turnsToSpendSchema,
  /** A product key the round can cook. Defaults to crack. */
  productType: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'Pick something to cook.').default('CRACK'),
  actionId: actionIdSchema,
});

/** Section 31. Bounds live in the ruleset; this only checks the shape. */
export const payoutSchema = z.object({
  percent: z
    .number({ invalid_type_error: 'Payout must be a whole percentage.' })
    .int('Payout must be a whole percentage.'),
  actionId: actionIdSchema,
});

export type JoinRoundInput = z.infer<typeof joinRoundSchema>;
export type ScoutInput = z.infer<typeof scoutSchema>;

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

export const storeTradeSchema = z.object({
  store: z.string().trim().min(1, 'Pick a store.').max(64),
  item: z.string().trim().min(1, 'Pick an item.').max(64),
  direction: z.enum(['buy', 'sell']),
  quantity: z.number({ invalid_type_error: 'Enter a quantity.' })
    .int('Quantity must be a whole number.').positive('Enter at least one.').safe(),
  actionId: actionIdSchema,
});

export type StoreTradeInput = z.infer<typeof storeTradeSchema>;

/** 0.4.0-D. Pip's counter for a non-crack product. */
export const productTradeSchema = z.object({
  product: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'Pick a product.'),
  direction: z.enum(['buy', 'sell']),
  quantity: z.number({ invalid_type_error: 'Enter a quantity.' })
    .int('Quantity must be a whole number.').positive('Enter at least one.').safe(),
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
export const questClaimSchema = z.object({ actionId: actionIdSchema }).strict();
export const questTrackSchema = z.object({ tracked: z.boolean() }).strict();
export const questAbandonSchema = z.object({}).strict();

export type QuestAcceptInput = z.infer<typeof questAcceptSchema>;
export type QuestClaimInput = z.infer<typeof questClaimSchema>;
export type QuestTrackInput = z.infer<typeof questTrackSchema>;
export type QuestAbandonInput = z.infer<typeof questAbandonSchema>;

export const raidSchema = z.object({
  roundId: z.string().min(1).max(64),
  targetPublicPimpId: z.number().int().positive().max(2_147_483_647),
  attackingThugs: z.number().int().positive().safe(),
  actionId: actionIdSchema,
}).strict();
export type RaidInputDto = z.infer<typeof raidSchema>;

/** Same intent as a raid: a target, how many go, and a retry-safe id. */
export const driveBySchema = raidSchema;
export type DriveByInputDto = z.infer<typeof driveBySchema>;

export const specialRaidSchema = raidSchema.extend({
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
