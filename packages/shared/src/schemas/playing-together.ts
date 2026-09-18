import { z } from 'zod';
import { actionIdSchema } from './game.js';
import { CONTACT_NOTE_MAX, WIRE_POST_MAX } from '../types/playing-together.js';

const publicPimpId = z.number({ invalid_type_error: 'Pick a player by pimp number.' }).int().min(1).max(2_147_483_647);

export const wirePostSchema = z.object({
  body: z.string({ invalid_type_error: 'Write something first.' })
    .trim()
    .min(1, 'Write something first.')
    .max(WIRE_POST_MAX, `Keep wire posts under ${WIRE_POST_MAX} characters.`),
}).strict();

export const wireRemoveSchema = z.object({
  reason: z.string().trim().max(200).optional(),
}).strict();

export const contactNoteSchema = z.string().trim().max(CONTACT_NOTE_MAX, `Keep notes under ${CONTACT_NOTE_MAX} characters.`);

export const addContactSchema = z.object({
  targetPublicPimpId: publicPimpId,
  note: contactNoteSchema.optional(),
}).strict();

export const updateContactSchema = z.object({ note: contactNoteSchema }).strict();

export type WirePostInputDto = z.infer<typeof wirePostSchema>;
export type AddContactInputDto = z.infer<typeof addContactSchema>;

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

export const workSupplyPreviewSchema = z.object({
  job: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/),
  turns: z.coerce.number().int().min(1).max(10_000),
}).strict();

// --- 0.5.0-B runs ----------------------------------------------------------------

const citySlug = z.string().trim().regex(/^[a-z][a-z-]{1,40}$/, 'Pick a city.');
const runProduct = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'Pick a product.');
const wholeCount = (what: string) => z.number({ invalid_type_error: `Enter ${what}.` }).int(`${what} must be a whole number.`).min(0).safe();

export const travelRoutesSchema = z.object({ to: citySlug }).strict();

export const runLaunchSchema = z.object({
  to: citySlug,
  route: z.number().int().min(0).max(9),
  lowRiders: z.number({ invalid_type_error: 'Say how many Low-Riders go.' }).int().min(1, 'A run needs at least one Low-Rider.').safe(),
  escortThugs: wholeCount('escorts'),
  cashCents: wholeCount('cash'),
  cargo: z.record(runProduct, wholeCount('a quantity')).default({}),
  actionId: actionIdSchema,
}).strict();
export type RunLaunchInput = z.infer<typeof runLaunchSchema>;

export const runTradeSchema = z.object({
  product: runProduct,
  direction: z.enum(['buy', 'sell']),
  quantity: z.number({ invalid_type_error: 'Enter a quantity.' }).int('Quantity must be a whole number.').positive('Enter at least one.').safe(),
  actionId: actionIdSchema,
}).strict();
export type RunTradeInput = z.infer<typeof runTradeSchema>;

export const runDriveOnSchema = z.object({
  to: citySlug,
  route: z.number().int().min(0).max(9),
  actionId: actionIdSchema,
}).strict();
export type RunDriveOnInput = z.infer<typeof runDriveOnSchema>;

export const runHeadHomeSchema = z.object({ actionId: actionIdSchema }).strict();
