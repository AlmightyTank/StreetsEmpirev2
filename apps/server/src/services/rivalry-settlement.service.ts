import type { RivalryStatus } from '@prisma/client';
import { rivalrySettlementSchema } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import type { Db } from '../utils/db.js';

const terminalStatuses = new Set<RivalryStatus>(['CEASEFIRE', 'TIMEOUT', 'DEFEATED', 'CLOSED']);

export const RivalrySettlementService = {
  async settle(db: Db, actorId: string, rawInput: unknown, now = new Date()) {
    const input = rivalrySettlementSchema.parse(rawInput);
    if (!terminalStatuses.has(input.status as RivalryStatus)) throw AppError.badRequest('RIVALRY_STATUS', 'That is not a terminal rivalry state.');
    await db.$queryRaw`SELECT id FROM "RivalryRelationship" WHERE id = ${input.relationshipId} FOR UPDATE`;
    const relationship = await db.rivalryRelationship.findUnique({ where: { id: input.relationshipId }, include: { contracts: true } });
    if (!relationship || (relationship.participantAId !== actorId && relationship.participantBId !== actorId)) throw AppError.notFound('RIVALRY_NOT_FOUND', 'That rivalry is not available.');
    if (relationship.suppressedAt) throw AppError.conflict('RIVALRY_SUPPRESSED', 'That rivalry is suppressed.');
    if (relationship.status === input.status) {
      const replay = await db.rivalrySettlement.findFirst({ where: { relationshipId: relationship.id, status: input.status }, orderBy: { settledAt: 'asc' } });
      if (replay) return replay;
    }
    if (['CEASEFIRE', 'TIMEOUT', 'DEFEATED', 'CLOSED'].includes(relationship.status)) {
      throw AppError.conflict('RIVALRY_TERMINAL', 'That rivalry is already closed.');
    }
    const contract = input.contractId ? relationship.contracts.find((item) => item.id === input.contractId) : undefined;
    if (input.contractId && !contract) throw AppError.notFound('RIVALRY_FEUD_NOT_FOUND', 'That feud contract is not available.');
    if (contract && contract.status !== 'ACCEPTED' && input.status !== 'CLOSED') throw AppError.conflict('RIVALRY_FEUD_NOT_ACTIVE', 'That feud contract is not active.');
    const existing = await db.rivalrySettlement.findFirst({ where: { relationshipId: relationship.id, contractId: input.contractId ?? null, status: input.status } });
    if (existing) return existing;
    const settlement = await db.rivalrySettlement.create({ data: { relationshipId: relationship.id, contractId: input.contractId, status: input.status, reason: input.reason, receipt: { source: 'player_choice', actorId }, settledAt: now } });
    await db.rivalryStateTransition.create({ data: { relationshipId: relationship.id, fromStatus: relationship.status, toStatus: input.status, reason: input.reason, createdAt: now } });
    await db.rivalryRelationship.update({ where: { id: relationship.id }, data: { status: input.status, archivedAt: now } });
    if (contract) await db.rivalryFeudContract.update({ where: { id: contract.id }, data: { status: 'SETTLED', settledAt: now } });
    return settlement;
  },

  /** Close an expired optional feud without requiring either player to act. */
  async settleExpired(db: Db, relationshipId: string, now = new Date()) {
    await db.$queryRaw`SELECT id FROM "RivalryRelationship" WHERE id = ${relationshipId} FOR UPDATE`;
    const relationship = await db.rivalryRelationship.findUnique({ where: { id: relationshipId }, include: { contracts: true } });
    if (!relationship || relationship.suppressedAt) return null;
    if (['CEASEFIRE', 'TIMEOUT', 'DEFEATED', 'CLOSED'].includes(relationship.status)) return null;
    const contract = relationship.contracts.find((item) => ['PROPOSED', 'ACCEPTED'].includes(item.status) && item.expiresAt <= now);
    if (!contract) return null;
    const existing = await db.rivalrySettlement.findFirst({ where: { relationshipId, status: 'TIMEOUT' }, orderBy: { settledAt: 'asc' } });
    if (existing) return existing;
    const settlement = await db.rivalrySettlement.create({ data: { relationshipId, contractId: contract.id, status: 'TIMEOUT', reason: 'feud_deadline_elapsed', receipt: { source: 'deadline', contractId: contract.id }, settledAt: now } });
    await db.rivalryStateTransition.create({ data: { relationshipId, fromStatus: relationship.status, toStatus: 'TIMEOUT', reason: 'feud_deadline_elapsed', createdAt: now } });
    await db.rivalryRelationship.update({ where: { id: relationshipId }, data: { status: 'TIMEOUT', archivedAt: now } });
    await db.rivalryFeudContract.update({ where: { id: contract.id }, data: { status: 'EXPIRED', settledAt: now } });
    return settlement;
  },

  async decline(db: Db, actorId: string, contractId: string) {
    const contract = await db.rivalryFeudContract.findUnique({ where: { id: contractId }, include: { relationship: true } });
    if (!contract || contract.targetId !== actorId) throw AppError.notFound('RIVALRY_FEUD_NOT_FOUND', 'That feud contract is not available.');
    if (contract.status !== 'PROPOSED') throw AppError.conflict('RIVALRY_FEUD_CLOSED', 'That feud contract is already closed.');
    return db.rivalryFeudContract.update({ where: { id: contract.id }, data: { status: 'DECLINED' } });
  },
};
