import { z } from 'zod';
import { actionIdSchema, MAX_ORDER_QUANTITY } from './game.js';
import { CONTACT_NOTE_MAX, WIRE_POST_MAX } from '../types/playing-together.js';

const publicPimpId = z.number({ invalid_type_error: 'Pick a player by pimp number.' }).int().min(1).max(2_147_483_647);

export const wirePostSchema = z.object({
  body: z.string({ invalid_type_error: 'Write something first.' })
    .trim()
    .min(1, 'Write something first.')
    .max(WIRE_POST_MAX, `Keep wire posts under ${WIRE_POST_MAX} characters.`),
  kind: z.enum(['MESSAGE', 'ANNOUNCEMENT']).default('MESSAGE'),
  pinned: z.boolean().default(false),
}).strict();

export const wirePinSchema = z.object({
  pinned: z.boolean().default(true),
}).strict();

export const wireRemoveSchema = z.object({
  reason: z.string().trim().max(200).optional(),
}).strict();

export const contactNoteSchema = z.string().trim().max(CONTACT_NOTE_MAX, `Keep notes under ${CONTACT_NOTE_MAX} characters.`);
export const contactKindSchema = z.enum(['CONTACT', 'ENEMY']);

export const addContactSchema = z.object({
  targetPublicPimpId: publicPimpId,
  kind: contactKindSchema.default('CONTACT'),
  note: contactNoteSchema.optional(),
}).strict();

export const updateContactSchema = z.object({ note: contactNoteSchema }).strict();
export const updateContactKindSchema = z.object({ kind: contactKindSchema }).strict();

export type WirePostInputDto = z.infer<typeof wirePostSchema>;
export type WirePinInputDto = z.infer<typeof wirePinSchema>;
export type AddContactInputDto = z.infer<typeof addContactSchema>;
export type UpdateContactKindInputDto = z.infer<typeof updateContactKindSchema>;

const productKey = z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'Pick a product.');

/** 0.4.0-B. Fallback and emergency must differ from what comes before them. */
export const workSupplyPolicySchema = z.object({
  job: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'Pick a job.'),
  primary: productKey,
  fallback: productKey.nullable().optional(),
  emergency: productKey.nullable().optional(),
  strict: z.boolean().optional(),
}).strict().superRefine((policy, ctx) => {
  if (policy.fallback && policy.fallback === policy.primary) ctx.addIssue({ code: 'custom', path: ['fallback'], message: 'The fallback is already the primary.' });
  if (policy.emergency && [policy.primary, policy.fallback].includes(policy.emergency)) ctx.addIssue({ code: 'custom', path: ['emergency'], message: 'The emergency product is already in the list.' });
  if (policy.emergency && !policy.fallback) ctx.addIssue({ code: 'custom', path: ['emergency'], message: 'Set a fallback before an emergency product.' });
});

/** 0.4.0-E. POST /api/game/work-supply/policy/clear. */
export const workSupplyClearSchema = z.object({
  job: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'Pick a job.'),
}).strict();

/** 0.4.0-C. POST /api/game/heat/bribe. */
export const heatBribeSchema = z.object({
  points: z.number().int().min(1).max(1_000),
  actionId: z.string().min(1).max(128).optional(),
}).strict();

/** 1.3.0-C. Lawyering up on a warrant, and keeping a lawyer on retainer. */
export const lawyerActionSchema = z.object({
  actionId: z.string().min(1).max(128).optional(),
}).strict();

export const workSupplyPreviewSchema = z.object({
  job: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/),
  turns: z.coerce.number().int().min(1).max(10_000),
}).strict();

// --- 0.5.0-B runs ----------------------------------------------------------------

const citySlug = z.string().trim().regex(/^[a-z][a-z-]{1,40}$/, 'Pick a city.');
const runProduct = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'Pick a product.');
const wholeCount = (what: string) => z.number({ invalid_type_error: `Enter ${what}.` }).int(`${what} must be a whole number.`).min(0).safe();
/** 1.0.0-C. Goods and crew, as opposed to cash: capped like any other order. */
const unitCount = (what: string) => wholeCount(what).max(MAX_ORDER_QUANTITY, 'That order is too large.');

const runId = z.string().trim().min(1).max(64);
export const travelRoutesSchema = z.object({ to: citySlug, runId: runId.optional() }).strict();

export const runLaunchSchema = z.object({
  to: citySlug,
  route: z.number().int().min(0).max(9),
  lowRiders: z.number({ invalid_type_error: 'Say how many Low-Riders go.' }).int().min(1, 'A run needs at least one Low-Rider.').safe(),
  escortThugs: unitCount('escorts'),
  cashCents: wholeCount('cash'),
  /** 0.6.0-D. Beer rides as real cargo so a run can supply an outpost. */
  beer: unitCount('beer').default(0),
  cargo: z.record(runProduct, unitCount('a quantity')).default({}),
  /** 0.5.0-F. Bought on the home high market as it leaves, straight into the trunk. */
  market: z.record(runProduct, unitCount('a quantity')).default({}),
  /** The next-unit prices the player saw on the home market; the launch is refused if one has moved too far. */
  marketQuotes: z.record(runProduct, z.number().int().positive().safe()).optional(),
  /** Trips B. The boss rides along. */
  rideAlong: z.boolean().default(false),
  actionId: actionIdSchema,
}).strict();
export type RunLaunchInput = z.infer<typeof runLaunchSchema>;

export const runTradeSchema = z.object({
  runId: runId.optional(),
  product: runProduct,
  direction: z.enum(['buy', 'sell']),
  /** 0.5.0-C. Pip's counter, or the high market. */
  venue: z.enum(['pip', 'market']).default('pip'),
  /** 0.5.0-C. The next-unit price the player saw on the high market; the trade is refused if it has moved too far. */
  quoteCents: z.number().int().positive().safe().optional(),
  quantity: z.number({ invalid_type_error: 'Enter a quantity.' }).int('Quantity must be a whole number.').positive('Enter at least one.').max(MAX_ORDER_QUANTITY, 'That order is too large.'),
  actionId: actionIdSchema,
}).strict();
export type RunTradeInput = z.infer<typeof runTradeSchema>;

export const runDriveOnSchema = z.object({
  runId: runId.optional(),
  to: citySlug,
  route: z.number().int().min(0).max(9),
  actionId: actionIdSchema,
}).strict();
export type RunDriveOnInput = z.infer<typeof runDriveOnSchema>;

export const runHeadHomeSchema = z.object({ runId: runId.optional(), actionId: actionIdSchema }).strict();

// --- 0.6.0-D outposts --------------------------------------------------------------

const outpostDistrict = z.enum(['CASINO', 'NIGHTCLUB', 'LOW_RENT', 'URBAN_GHETTO', 'WINO_SLUMS']);
const outpostProducts = z.record(runProduct, unitCount('a quantity')).default({});

export const runOutpostEstablishSchema = z.object({
  runId: runId.optional(),
  district: outpostDistrict,
  thugs: z.number({ invalid_type_error: 'Say how many escorts stay.' }).int('Send whole thugs.').positive('Leave at least one thug.').safe(),
  cashCents: wholeCount('cash'),
  beer: unitCount('beer'),
  products: outpostProducts,
  actionId: actionIdSchema,
}).strict();
export type RunOutpostEstablishInput = z.infer<typeof runOutpostEstablishSchema>;

export const runOutpostTransferSchema = z.object({
  runId: runId.optional(),
  district: outpostDistrict,
  direction: z.enum(['deposit', 'withdraw']),
  cashCents: wholeCount('cash'),
  beer: unitCount('beer'),
  products: outpostProducts,
  actionId: actionIdSchema,
}).strict().superRefine((input, ctx) => {
  const units = Object.values(input.products).reduce<number>((sum, quantity) => sum + quantity, 0);
  if (input.cashCents === 0 && input.beer === 0 && units === 0) {
    ctx.addIssue({ code: 'custom', message: 'Move at least one thing.' });
  }
});
export type RunOutpostTransferInput = z.infer<typeof runOutpostTransferSchema>;

// --- 0.5.0-D relocation ------------------------------------------------------------

export const relocationSchema = z.object({ to: citySlug, actionId: actionIdSchema }).strict();
export type RelocationInput = z.infer<typeof relocationSchema>;

// --- Trips A: the boss travels -----------------------------------------------------

export const tripLaunchSchema = z.object({
  to: citySlug,
  stayMinutes: z.number({ invalid_type_error: 'Pick a stay.' }).int('Pick a stay.').positive('Pick a stay.').safe(),
  bankrollCents: wholeCount('a bankroll'),
  /** Trips D. Fit thugs flying with the boss. */
  bodyguards: wholeCount('bodyguards').default(0),
  actionId: actionIdSchema,
}).strict();
export type TripLaunchInput = z.infer<typeof tripLaunchSchema>;

/** Trips D. Rent guns in town for the boss's bodyguards, one each at most. */
export const tripRentGunsSchema = z.object({
  guns: z.object({
    PISTOL: wholeCount('pistols').default(0),
    SHOTGUN: wholeCount('shotguns').default(0),
    TEK9: wholeCount('Tek-9s').default(0),
    AK47: wholeCount('AK-47s').default(0),
  }).strict(),
  actionId: actionIdSchema,
}).strict();
export type TripRentGunsInput = z.infer<typeof tripRentGunsSchema>;

/** Trips D2. Walk an outpost in the city the boss is in; a boss who flew in can carry its cash. */
export const tripOutpostVisitSchema = z.object({
  outpostId: z.string().trim().min(1).max(64),
  collectCents: wholeCount('cash to collect').default(0),
  actionId: actionIdSchema,
}).strict();
export type TripOutpostVisitInput = z.infer<typeof tripOutpostVisitSchema>;

/** Trips D2. Propose a sit-down to another boss in the same city, or answer one. */
export const sitDownProposeSchema = z.object({ targetPublicPimpId: z.number().int().positive().safe() }).strict();
export const sitDownAnswerSchema = z.object({ sitDownId: z.string().trim().min(1).max(64), accept: z.boolean() }).strict();

export const tripExtendSchema = z.object({
  blocks: z.number({ invalid_type_error: 'Say how long to stay on.' }).int('Extend by whole blocks.').min(1, 'Extend by at least one block.').max(24).safe(),
  actionId: actionIdSchema,
}).strict();
export type TripExtendInput = z.infer<typeof tripExtendSchema>;

export const tripHeadHomeSchema = z.object({ actionId: actionIdSchema }).strict();
export type TripHeadHomeInput = z.infer<typeof tripHeadHomeSchema>;

// --- 0.5.0-E convoys ----------------------------------------------------------------

const convoyId = z.string().trim().min(1).max(64);
export const convoyTailSchema = z.object({
  runId: convoyId,
  squad: z.number({ invalid_type_error: 'Say how many ride.' }).int('Send whole thugs.').positive('Send at least one thug.').safe(),
  actionId: actionIdSchema,
}).strict();
export const convoyBackupSchema = z.object({
  tailId: convoyId,
  thugs: z.number({ invalid_type_error: 'Say how many ride.' }).int('Send whole thugs.').positive('Send at least one thug.').safe(),
  actionId: actionIdSchema,
}).strict();
export const convoyCallSchema = z.object({ tailId: convoyId }).strict();
export const convoyReconSchema = z.object({ actionId: actionIdSchema }).strict();
/** Trips C. Hit a boss visiting where you live. */
export const bossHitSchema = z.object({
  tripId: convoyId,
  squad: z.number({ invalid_type_error: 'Say how many ride.' }).int('Send whole thugs.').positive('Send at least one thug.').safe(),
  actionId: actionIdSchema,
}).strict();
export type BossHitInput = z.infer<typeof bossHitSchema>;
/** Trips D2. The boss calls allies who live where the hit is coming. */
export const bossHitCallSchema = z.object({ hitId: convoyId }).strict();
/** Trips D2. An ally sends thugs to a boss's fight. */
export const bossHitBackupSchema = z.object({
  hitId: convoyId,
  thugs: z.number({ invalid_type_error: 'Say how many ride.' }).int('Send whole thugs.').positive('Send at least one thug.').safe(),
  actionId: actionIdSchema,
}).strict();
export type BossHitBackupInput = z.infer<typeof bossHitBackupSchema>;
