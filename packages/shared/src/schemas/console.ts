import { z } from 'zod';
import { actionIdSchema } from './game.js';
import {
  MESSAGE_BODY_MAX,
  MESSAGE_REPORT_REASON_MAX,
  MESSAGE_SUBJECT_MAX,
} from '../types/console.js';

const publicPimpId = z.number({ invalid_type_error: 'Pick a player.' })
  .int('Pick a player.')
  .min(1, 'Pick a player.')
  .max(2_147_483_647);

export const sendDirectMessageSchema = z.object({
  recipientPublicPimpId: publicPimpId,
  subject: z.string()
    .trim()
    .min(1, 'Write a subject.')
    .max(MESSAGE_SUBJECT_MAX, `Keep the subject under ${MESSAGE_SUBJECT_MAX} characters.`),
  body: z.string()
    .trim()
    .min(1, 'Write a message.')
    .max(MESSAGE_BODY_MAX, `Keep the message under ${MESSAGE_BODY_MAX} characters.`),
  actionId: actionIdSchema,
}).strict();

export const archiveDirectMessageSchema = z.object({
  archived: z.boolean().default(true),
}).strict();

export const blockPlayerSchema = z.object({
  targetPublicPimpId: publicPimpId,
}).strict();

export const reportDirectMessageSchema = z.object({
  reason: z.string()
    .trim()
    .min(1, 'Tell us what happened.')
    .max(MESSAGE_REPORT_REASON_MAX, `Keep the report under ${MESSAGE_REPORT_REASON_MAX} characters.`),
}).strict();

export type SendDirectMessageInput = z.infer<typeof sendDirectMessageSchema>;
export type ArchiveDirectMessageInput = z.infer<typeof archiveDirectMessageSchema>;
export type BlockPlayerInput = z.infer<typeof blockPlayerSchema>;
export type ReportDirectMessageInput = z.infer<typeof reportDirectMessageSchema>;
