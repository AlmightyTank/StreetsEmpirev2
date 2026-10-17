import { z } from 'zod';

export const operationRoleSchema = z.string().trim().min(1).max(32);

const operationId = z.string().min(1).max(64);
const citySlug = z.string().trim().min(1).max(64);
const district = z.enum(['CASINO', 'NIGHTCLUB', 'LOW_RENT', 'URBAN_GHETTO', 'WINO_SLUMS']);
const publicPimpId = z.number({ invalid_type_error: 'Pick a player by pimp number.' }).int().min(1).max(2_147_483_647);
const operationTemplateSchema = z.enum([
  'CORNER_TAKEOVER',
  'STASH_RECOVERY',
  'CONVOY_PROTECTION',
  'BLOCK_DEFENSE',
  'BIG_SCORE',
]);

/** 2.0.0. Start an operation. Corner Takeover names a district. 2.2.0 templates add their source. */
export const operationStartSchema = z.object({
  citySlug,
  district: district.optional(),
  template: operationTemplateSchema.optional(),
  supplyStockId: z.string().trim().min(1).max(64).optional(),
  runId: z.string().trim().min(1).max(64).optional(),
  escort: z.number().int().min(0).max(50).optional(),
  routeRisk: z.enum(['LOW', 'BALANCED', 'HIGH']).optional(),
  threatKind: z.enum(['block-war', 'turf-push']).optional(),
  threatId: z.string().trim().min(1).max(64).optional(),
}).strict();
/** 2.0.0. Lock a role for yourself. */
export const operationLockSchema = z.object({ operationId, role: operationRoleSchema }).strict();
/** 2.0.0. Invite another player to a role; they answer asynchronously. */
export const operationInviteSchema = z.object({ operationId, role: operationRoleSchema, targetPublicPimpId: publicPimpId }).strict();
/** 2.0.0. Answer an invite to an operation role. */
export const operationAnswerSchema = z.object({ operationId, accept: z.boolean() }).strict();
/** 2.2.0. Leave a seat before execution. */
export const operationReleaseSchema = z.object({ operationId, role: operationRoleSchema }).strict();
/** 2.2.0. Leader cancels before execution and unused stake is returned. */
export const operationCancelSchema = z.object({ operationId }).strict();
/** 2.2.0. Cite an already settled combat, turf, travel, convoy, or product result. */
export const operationCiteSchema = z.object({
  operationId,
  windowKey: z.enum(['intel', 'prep', 'action']),
  sourceKind: z.enum(['supply-stock', 'run', 'block-war', 'turf-push', 'intel-rumor']),
  sourceId: z.string().trim().min(1).max(64),
}).strict();
/** 2.0.0. Run the operation once every role is filled. */
export const operationExecuteSchema = z.object({ operationId }).strict();

export type OperationStartInputDto = z.infer<typeof operationStartSchema>;
export type OperationLockInputDto = z.infer<typeof operationLockSchema>;
export type OperationInviteInputDto = z.infer<typeof operationInviteSchema>;
export type OperationAnswerInputDto = z.infer<typeof operationAnswerSchema>;
export type OperationExecuteInputDto = z.infer<typeof operationExecuteSchema>;
export type OperationReleaseInputDto = z.infer<typeof operationReleaseSchema>;
export type OperationCancelInputDto = z.infer<typeof operationCancelSchema>;
export type OperationCiteInputDto = z.infer<typeof operationCiteSchema>;
