import { z } from 'zod';

export const ALLIANCE_NAME_MIN = 3;
export const ALLIANCE_NAME_MAX = 32;
export const ALLIANCE_TAG_MIN = 2;
export const ALLIANCE_TAG_MAX = 5;

export const allianceNameSchema = z
  .string({ invalid_type_error: 'Give your alliance a name.' })
  .trim()
  .min(ALLIANCE_NAME_MIN, `Alliance names need at least ${ALLIANCE_NAME_MIN} characters.`)
  .max(ALLIANCE_NAME_MAX, `Alliance names can be at most ${ALLIANCE_NAME_MAX} characters.`)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 '._-]*[A-Za-z0-9.]$/, 'Use letters, numbers, spaces and simple punctuation.')
  .refine((value) => !/\s{2,}/.test(value), 'Use single spaces between words.');

export const allianceTagSchema = z
  .string({ invalid_type_error: 'Give your alliance a tag.' })
  .trim()
  .min(ALLIANCE_TAG_MIN, `Tags need at least ${ALLIANCE_TAG_MIN} characters.`)
  .max(ALLIANCE_TAG_MAX, `Tags can be at most ${ALLIANCE_TAG_MAX} characters.`)
  .regex(/^[A-Za-z0-9]+$/, 'Tags are letters and numbers only.');

const publicPimpId = z.number({ invalid_type_error: 'Pick a player by pimp number.' }).int().min(1).max(2_147_483_647);

export const createAllianceSchema = z.object({ name: allianceNameSchema, tag: allianceTagSchema }).strict();
export const alliancePlayerSchema = z.object({ targetPublicPimpId: publicPimpId }).strict();
export const allianceInviteAnswerSchema = z.object({ tag: allianceTagSchema }).strict();

export const ALLIANCE_PITCH_MAX = 500;
export const allianceForumPostSchema = z.object({
  pitch: z.string().trim().max(ALLIANCE_PITCH_MAX, `Keep the pitch under ${ALLIANCE_PITCH_MAX} characters.`).optional(),
}).strict();
export type AllianceForumPostInputDto = z.infer<typeof allianceForumPostSchema>;

export type CreateAllianceInputDto = z.infer<typeof createAllianceSchema>;
export type AlliancePlayerInputDto = z.infer<typeof alliancePlayerSchema>;
export type AllianceInviteAnswerInputDto = z.infer<typeof allianceInviteAnswerSchema>;
