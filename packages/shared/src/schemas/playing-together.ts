import { z } from 'zod';
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
