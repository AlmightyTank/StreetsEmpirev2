import { z } from 'zod';

export const operationRoleSchema = z.enum(['driver', 'enforcer', 'intel']);

const operationId = z.string().min(1).max(64);
const citySlug = z.string().trim().min(1).max(64);
const district = z.enum(['CASINO', 'NIGHTCLUB', 'LOW_RENT', 'URBAN_GHETTO', 'WINO_SLUMS']);
const publicPimpId = z.number({ invalid_type_error: 'Pick a player by pimp number.' }).int().min(1).max(2_147_483_647);

/** 2.0.0. Start an operation: intel stage names the target city and district. */
export const operationStartSchema = z.object({ citySlug, district }).strict();
/** 2.0.0. Lock a role for yourself. */
export const operationLockSchema = z.object({ operationId, role: operationRoleSchema }).strict();
/** 2.0.0. Invite another player to a role; they answer asynchronously. */
export const operationInviteSchema = z.object({ operationId, role: operationRoleSchema, targetPublicPimpId: publicPimpId }).strict();
/** 2.0.0. Answer an invite to an operation role. */
export const operationAnswerSchema = z.object({ operationId, accept: z.boolean() }).strict();
/** 2.0.0. Run the operation once every role is filled. */
export const operationExecuteSchema = z.object({ operationId }).strict();

export type OperationStartInputDto = z.infer<typeof operationStartSchema>;
export type OperationLockInputDto = z.infer<typeof operationLockSchema>;
export type OperationInviteInputDto = z.infer<typeof operationInviteSchema>;
export type OperationAnswerInputDto = z.infer<typeof operationAnswerSchema>;
export type OperationExecuteInputDto = z.infer<typeof operationExecuteSchema>;
