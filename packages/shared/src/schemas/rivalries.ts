import { z } from 'zod';

export const rivalryRelationshipIdSchema = z.string().min(1).max(64);
export const rivalrySourceReceiptSchema = z.object({
  relationshipId: rivalryRelationshipIdSchema,
  sourceKind: z.enum(['COMBAT', 'RETALIATION', 'TURF', 'BLOCK_WAR']),
  sourceId: z.string().min(1).max(128),
  participantIds: z.array(z.string().min(1).max(64)).length(2),
  outcome: z.enum(['WIN', 'LOSS', 'TURF_FLIP', 'MATERIAL_CONSEQUENCE', 'DRAW']),
  settledAt: z.coerce.date(),
}).strict();

export const rivalryFeudAcceptanceSchema = z.object({
  relationshipId: rivalryRelationshipIdSchema,
  contractId: z.string().min(1).max(64),
  idempotencyKey: z.string().min(8).max(128),
}).strict();

export const rivalryFeudProposalSchema = z.object({
  relationshipId: rivalryRelationshipIdSchema,
  targetId: z.string().min(1).max(64),
  objective: z.enum(['COMBAT', 'TURF', 'BLOCK_WAR', 'MATERIAL_CONSEQUENCE']),
  expiresAt: z.coerce.date(),
  idempotencyKey: z.string().min(8).max(128),
}).strict();

export const rivalrySettlementSchema = z.object({
  relationshipId: rivalryRelationshipIdSchema,
  contractId: z.string().min(1).max(64).optional(),
  status: z.enum(['CEASEFIRE', 'TIMEOUT', 'DEFEATED', 'CLOSED']),
  reason: z.string().min(1).max(256),
}).strict();

export const rivalrySuppressionReportSchema = z.object({
  relationshipId: rivalryRelationshipIdSchema,
  reason: z.string().min(1).max(256),
}).strict();
