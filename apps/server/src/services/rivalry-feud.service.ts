import type { PrismaClient } from '@prisma/client';
import { rivalryFeudAcceptanceSchema, rivalryFeudProposalSchema } from '@streets/shared';
import { rivalryRulesForRuleset, rulesets } from '@streets/rulesets';
import { AppError } from '../utils/errors.js';
import type { Db } from '../utils/db.js';

function terms(objective: string, expiresAt: Date, maxRewardCents: number) {
  return { objective, expiresAt: expiresAt.toISOString(), rewardCents: Math.max(0, Math.min(maxRewardCents, maxRewardCents)) };
}

export const RivalryFeudService = {
  async propose(db: Db, proposerId: string, rawInput: unknown, now = new Date()) {
    const input = rivalryFeudProposalSchema.parse(rawInput);
    const relationship = await db.rivalryRelationship.findUnique({ where: { id: input.relationshipId }, include: { round: true } });
    if (!relationship || (relationship.participantAId !== proposerId && relationship.participantBId !== proposerId)) throw AppError.notFound('RIVALRY_NOT_FOUND', 'That rivalry is not available.');
    const targetId = input.targetId;
    if (targetId === proposerId || (targetId !== relationship.participantAId && targetId !== relationship.participantBId)) throw AppError.notFound('RIVALRY_NOT_FOUND', 'That rivalry is not available.');
    const pinnedRuleset = rulesets[relationship.rulesetId];
    const rules = pinnedRuleset ? rivalryRulesForRuleset(pinnedRuleset) : null;
    if (!rules?.enabled || !rules.feud.enabled) throw AppError.conflict('RIVALRY_FEUD_DISABLED', 'Feud contracts are not enabled for this round.');
    if (relationship.round.status !== 'ACTIVE' || relationship.round.pausedAt || relationship.suppressedAt) throw AppError.conflict('RIVALRY_UNAVAILABLE', 'This rivalry is not accepting new terms.');
    if (input.expiresAt <= now || input.expiresAt.getTime() > now.getTime() + rules.feud.maxActiveMinutes * 60_000) throw AppError.badRequest('RIVALRY_FEUD_EXPIRY', 'That contract deadline is outside the allowed window.');
    const existing = await db.rivalryFeudContract.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    const active = await db.rivalryFeudContract.findFirst({ where: { relationshipId: input.relationshipId, status: { in: ['PROPOSED', 'ACCEPTED'] }, expiresAt: { gt: now } } });
    if (active) throw AppError.conflict('RIVALRY_FEUD_ACTIVE', 'This rivalry already has an open feud contract.');
    const recent = await db.rivalryFeudContract.findFirst({ where: { relationshipId: input.relationshipId, targetId, createdAt: { gt: new Date(now.getTime() - rules.feud.repeatTargetCooldownMinutes * 60_000) } } });
    if (recent) throw AppError.conflict('RIVALRY_TARGET_COOLDOWN', 'That target was recently included in a feud contract.');
    try {
      return await db.rivalryFeudContract.create({ data: { relationshipId: input.relationshipId, proposerId: proposerId, targetId, objective: input.objective, terms: terms(input.objective, input.expiresAt, rules.feud.maxRewardCents), expiresAt: input.expiresAt, idempotencyKey: input.idempotencyKey } });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return db.rivalryFeudContract.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } });
      throw error;
    }
  },

  async accept(db: Db, targetId: string, rawInput: unknown, now = new Date()) {
    const input = rivalryFeudAcceptanceSchema.parse(rawInput);
    const contract = await db.rivalryFeudContract.findUnique({ where: { id: input.contractId }, include: { relationship: true } });
    if (!contract || contract.relationshipId !== input.relationshipId || contract.targetId !== targetId) throw AppError.notFound('RIVALRY_FEUD_NOT_FOUND', 'That feud contract is not available.');
    if (contract.status === 'ACCEPTED') return contract;
    if (contract.status !== 'PROPOSED' || contract.expiresAt <= now) throw AppError.conflict('RIVALRY_FEUD_EXPIRED', 'That feud contract is no longer open.');
    if (contract.relationship.suppressedAt) throw AppError.conflict('RIVALRY_FEUD_UNAVAILABLE', 'That feud contract is suppressed.');
    return db.rivalryFeudContract.update({ where: { id: contract.id }, data: { status: 'ACCEPTED', acceptedAt: now } });
  },

  list(prisma: PrismaClient, relationshipId: string) {
    return prisma.rivalryFeudContract.findMany({ where: { relationshipId }, orderBy: { createdAt: 'asc' } });
  },
};
