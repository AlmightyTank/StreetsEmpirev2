import type { Prisma, PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { UnderworldOperationTemplate } from '@streets/rulesets';
import type { OperationCiteInputDto, OperationStartInputDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActivityService } from './activity.service.js';
import { emitCityMemoryEvent } from './city-memory.service.js';
import { EconomyLedgerService } from './economy-ledger.service.js';
import { OPERATION_SOURCES } from './operation-catalog.js';
import { CRACK, ProductInventoryService } from './product-inventory.service.js';
import {
  inviteOpen,
  isUniqueConflict,
  operationInclude,
  pauseOffsetMs,
  recordOperationTransition,
  ROUND_CLOCK_SELECT,
  snapshotOf,
  toOperationDto,
  type RoundClock,
} from './operation-shared.js';

type StoredWindow = { key: string; sourceKind: string | null; sourceId: string | null; contributorId?: string | null };

const LIVE_WAR = ['OPENING', 'SIEGE', 'BETWEEN'];

function windowsOf(value: unknown): StoredWindow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row) => row && typeof row === 'object' && 'key' in row) as StoredWindow[];
}

function targetOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

async function loadRound(db: Db | PrismaClient, roundId: string): Promise<RoundClock> {
  const round = await db.round.findUnique({ where: { id: roundId }, select: ROUND_CLOCK_SELECT });
  if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That season does not exist.');
  return round;
}

function templateFor(round: RoundClock, key: string): UnderworldOperationTemplate {
  const ruleset = loadRulesetForRound(round);
  const found = ruleset.underworldOperations?.templates.find((row) => row.key === key);
  if (!found) throw AppError.badRequest('OPERATION_UNKNOWN_TEMPLATE', 'That operation is not in this season\'s catalog.');
  return found;
}

function offersFrom(round: RoundClock | null) {
  if (!round) return [];
  let ruleset;
  try {
    ruleset = loadRulesetForRound(round);
  } catch {
    return [];
  }
  const templates = ruleset.underworldOperations?.templates ?? [];
  return templates.map((template) => {
    const flagged = round.underworldOperationsEnabled;
    return {
      key: template.key,
      label: template.label,
      available: flagged,
      unavailableReason: flagged ? null : 'This operation is not open this season.',
      startCostCents: template.startCostCents,
      deadlineHours: template.deadlineHours,
      bands: template.bands,
    };
  });
}

async function blocked(tx: Db, leftAccountId: string, rightAccountId: string): Promise<boolean> {
  const row = await tx.playerBlock.findFirst({
    where: {
      OR: [
        { blockerAccountId: leftAccountId, blockedAccountId: rightAccountId },
        { blockerAccountId: rightAccountId, blockedAccountId: leftAccountId },
      ],
    },
    select: { id: true },
  });
  return Boolean(row);
}

async function reload(tx: Db, operationId: string) {
  return tx.operation.findUniqueOrThrow({ where: { id: operationId }, include: operationInclude });
}

function filled(seats: Array<{ status: string }>): number {
  return seats.filter((seat) => seat.status === 'LOCKED' || seat.status === 'ACCEPTED').length;
}

async function markReady(tx: Db, operationId: string, snapshot: UnderworldOperationTemplate, actorId: string): Promise<void> {
  const seats = await tx.operationParticipant.findMany({ where: { operationId } });
  if (filled(seats) < snapshot.minSeats) return;
  const current = await tx.operation.findUniqueOrThrow({ where: { id: operationId }, select: { status: true } });
  if (current.status !== 'CREW_LOCK') return;
  await tx.operation.update({ where: { id: operationId }, data: { status: 'READY' } });
  await recordOperationTransition(tx, operationId, actorId, 'CREW_LOCK', 'READY', 'seats filled');
}

async function priorPayoutCents(tx: Db, roundPlayerId: string, templateKey: string): Promise<number> {
  const rows = await tx.economyLedgerEntry.findMany({
    where: { roundPlayerId, source: 'OPERATION_PAYOUT' },
    select: { amountCents: true, metadata: true },
  });
  return rows.reduce((sum, row) => {
    const meta = (row.metadata ?? {}) as { templateKey?: string };
    return meta.templateKey === templateKey ? sum + Number(row.amountCents) : sum;
  }, 0);
}

async function resolveSupply(tx: Db, operation: { id: string; roundId: string; leaderId: string }, snapshot: UnderworldOperationTemplate, stockId: string): Promise<boolean> {
  const stock = await tx.supplyStock.findUnique({
    where: { id: stockId },
    include: { warehouse: { select: { roundPlayerId: true } } },
  });
  // Source IDs are untrusted. Never take stock out of another player's warehouse
  // or convert a different product into the catalog's recovery product.
  if (!stock || stock.warehouse.roundPlayerId !== operation.leaderId
      || stock.productKey !== snapshot.productKey || stock.quantity < snapshot.units) return false;
  const moved = await tx.supplyStock.updateMany({
    where: { id: stockId, quantity: { gte: snapshot.units } },
    data: { quantity: { decrement: snapshot.units } },
  });
  if (moved.count !== 1) return false;
  try {
    await tx.operationSourceClaim.create({
      data: { roundId: operation.roundId, sourceKind: OPERATION_SOURCES.supplyStock, sourceId: stockId, operationId: operation.id },
    });
  } catch (error) {
    await tx.supplyStock.update({ where: { id: stockId }, data: { quantity: { increment: snapshot.units } } });
    if (isUniqueConflict(error)) return false;
    throw error;
  }
  const round = await loadRound(tx, operation.roundId);
  const ruleset = loadRulesetForRound(round);
  await ProductInventoryService.adjust(tx, operation.leaderId, ruleset, { [snapshot.productKey || CRACK]: snapshot.units });
  await tx.supplyMovement.create({
    data: {
      roundPlayerId: operation.leaderId,
      kind: 'OPERATION_RECOVERY',
      productKey: snapshot.productKey || CRACK,
      quantityDelta: snapshot.units,
      fromLocation: `supply-stock:${stockId}`,
      toLocation: `player:${operation.leaderId}`,
      warehouseId: stock.warehouseId,
      requestKey: `operation:${operation.id}:stash`,
      metadata: { operationId: operation.id, sourceKind: OPERATION_SOURCES.supplyStock, sourceId: stockId },
    },
  });
  return true;
}

async function claimSource(tx: Db, operation: { id: string; roundId: string }, sourceKind: string, sourceId: string): Promise<boolean> {
  const existing = await tx.operationSourceClaim.findUnique({
    where: { roundId_sourceKind_sourceId: { roundId: operation.roundId, sourceKind, sourceId } },
  });
  if (existing) return existing.operationId === operation.id;
  try {
    await tx.operationSourceClaim.create({
      data: { roundId: operation.roundId, sourceKind, sourceId, operationId: operation.id },
    });
    return true;
  } catch (error) {
    if (isUniqueConflict(error)) return false;
    throw error;
  }
}

async function sourceReady(tx: Db, operation: { id: string; roundId: string; leaderId: string }, snapshot: UnderworldOperationTemplate, sourceKind: string, sourceId: string): Promise<boolean> {
  if (sourceKind === OPERATION_SOURCES.supplyStock) return resolveSupply(tx, operation, snapshot, sourceId);
  if (sourceKind === OPERATION_SOURCES.shipment) {
    const run = await tx.run.findUnique({ where: { id: sourceId }, select: { id: true, status: true, roundPlayer: { select: { roundId: true } } } });
    if (!run || run.status !== 'RETURNED' || run.roundPlayer.roundId !== operation.roundId) return false;
    return claimSource(tx, operation, sourceKind, sourceId);
  }
  if (sourceKind === OPERATION_SOURCES.blockWar) {
    const war = await tx.blockWar.findUnique({ where: { id: sourceId }, select: { id: true, status: true, roundId: true } });
    if (!war || war.roundId !== operation.roundId || !LIVE_WAR.includes(war.status)) return false;
    return claimSource(tx, operation, sourceKind, sourceId);
  }
  if (sourceKind === OPERATION_SOURCES.turfPush) {
    const push = await tx.turfPush.findUnique({ where: { id: sourceId }, select: { id: true, status: true, roundId: true } });
    if (!push || push.roundId !== operation.roundId || push.status !== 'PENDING') return false;
    return claimSource(tx, operation, sourceKind, sourceId);
  }
  if (sourceKind === OPERATION_SOURCES.intelRumor) {
    const rumor = await tx.intelRumor.findUnique({ where: { id: sourceId }, select: { id: true, roundId: true } });
    if (!rumor || rumor.roundId !== operation.roundId) return false;
    return claimSource(tx, operation, sourceKind, sourceId);
  }
  return false;
}

async function withWindow(tx: Db, operationId: string, key: string, sourceKind: string, sourceId: string, contributorId: string | null = null): Promise<void> {
  const row = await tx.operation.findUniqueOrThrow({ where: { id: operationId }, select: { windows: true } });
  const windows = windowsOf(row.windows);
  const next = windows.some((window) => window.key === key)
    ? windows.map((window) => window.key === key ? { key, sourceKind, sourceId, contributorId } : window)
    : [...windows, { key, sourceKind, sourceId, contributorId }];
  await tx.operation.update({ where: { id: operationId }, data: { windows: next as unknown as Prisma.InputJsonValue } });
}

function bandFor(snapshot: UnderworldOperationTemplate, windows: StoredWindow[]): 'success' | 'partial' | 'failure' {
  const required = snapshot.windows.filter((window) => !window.optional);
  const done = required.filter((window) => windows.some((row) => row.key === window.key && row.sourceId)).length;
  const anyDone = snapshot.windows.some((window) => windows.some((row) => row.key === window.key && row.sourceId));
  if (required.length === 0 || done === required.length) return 'success';
  if (anyDone) return 'partial';
  if (done === 0) return 'failure';
  return 'partial';
}

async function autoResolve(tx: Db, operation: { id: string; roundId: string; leaderId: string; target: unknown; windows: unknown }, snapshot: UnderworldOperationTemplate): Promise<StoredWindow[]> {
  const target = targetOf(operation.target);
  let windows = windowsOf(operation.windows);
  const tryOne = async (key: string, sourceKind: string, sourceId: string | undefined) => {
    if (!sourceId || windows.some((row) => row.key === key && row.sourceId)) return;
    const window = snapshot.windows.find((row) => row.key === key);
    if (!window || !window.sourceKinds.includes(sourceKind)) return;
    const ok = await sourceReady(tx, operation, snapshot, sourceKind, sourceId);
    if (!ok) return;
    await withWindow(tx, operation.id, key, sourceKind, sourceId, operation.leaderId);
    windows = windows.map((row) => row.key === key ? { key, sourceKind, sourceId, contributorId: operation.leaderId } : row);
    if (!windows.some((row) => row.key === key)) windows = [...windows, { key, sourceKind, sourceId, contributorId: operation.leaderId }];
  };
  await tryOne('action', OPERATION_SOURCES.supplyStock, typeof target.supplyStockId === 'string' ? target.supplyStockId : undefined);
  await tryOne('prep', OPERATION_SOURCES.shipment, typeof target.runId === 'string' ? target.runId : undefined);
  if (typeof target.threatKind === 'string' && typeof target.threatId === 'string') {
    await tryOne('action', target.threatKind, target.threatId);
  }
  const fresh = await tx.operation.findUniqueOrThrow({ where: { id: operation.id }, select: { windows: true } });
  return windowsOf(fresh.windows);
}

export async function abandonTemplated(
  tx: Db,
  operation: { id: string; status: string; leaderId: string; committedCostCents: number },
  toStatus: 'CANCELLED' | 'EXPIRED',
  actorId: string | null,
  reason: string,
  now: Date,
): Promise<void> {
  if (operation.status === 'REPORTED' || operation.status === 'CANCELLED' || operation.status === 'EXPIRED') {
    throw AppError.conflict('OPERATION_BAD_STAGE', 'That operation is already finished.');
  }
  if (operation.committedCostCents > 0) {
    await tx.roundPlayer.update({ where: { id: operation.leaderId }, data: { cashCents: { increment: operation.committedCostCents } } });
    await EconomyLedgerService.record(tx, operation.leaderId, [{
      source: 'OPERATION_REFUND',
      label: 'Operation refund',
      amountCents: operation.committedCostCents,
      metadata: { operationId: operation.id },
    }], now);
  }
  await tx.operationParticipant.deleteMany({ where: { operationId: operation.id } });
  await tx.operation.update({
    where: { id: operation.id },
    data: { status: toStatus, committedCostCents: 0 },
  });
  await recordOperationTransition(tx, operation.id, actorId, operation.status, toStatus, reason);
}

async function assertThreat(tx: Db, roundId: string, leaderId: string, kind: string, threatId: string): Promise<void> {
  if (kind === OPERATION_SOURCES.blockWar) {
    const war = await tx.blockWar.findUnique({ where: { id: threatId } });
    if (!war || war.roundId !== roundId || !LIVE_WAR.includes(war.status)) {
      throw AppError.conflict('OPERATION_NO_THREAT', 'There is no live block war to defend.');
    }
    if (war.defenderId !== leaderId && war.attackerId !== leaderId) {
      throw AppError.forbidden('That war is not yours to answer.');
    }
    return;
  }
  if (kind === OPERATION_SOURCES.turfPush) {
    const push = await tx.turfPush.findUnique({ where: { id: threatId } });
    if (!push || push.roundId !== roundId || push.status !== 'PENDING' || push.defenderId !== leaderId) {
      throw AppError.conflict('OPERATION_NO_THREAT', 'There is no live push on your block.');
    }
    return;
  }
  throw AppError.badRequest('OPERATION_NO_THREAT', 'Name the threat you are answering.');
}

export const TemplatedOperations = {
  offers: offersFrom,

  async start(prisma: PrismaClient, roundPlayerId: string, input: OperationStartInputDto, templateKey: string) {
    const me = await prisma.roundPlayer.findUniqueOrThrow({
      where: { id: roundPlayerId },
      select: { id: true, roundId: true, cashCents: true, accountId: true, allianceId: true },
    });
    const round = await loadRound(prisma, me.roundId);
    const template = templateFor(round, templateKey);
    if (!round.underworldOperationsEnabled) {
      throw AppError.conflict('OPERATION_FLAG_OFF', 'That operation is not open this season.');
    }
    const city = await prisma.city.findUnique({ where: { slug: input.citySlug }, select: { id: true } });
    if (!city) throw AppError.notFound('CITY_NOT_FOUND', 'That city does not exist.');
    if (template.startCostCents > 0 && BigInt(me.cashCents) < BigInt(template.startCostCents)) {
      throw AppError.conflict('OPERATION_COST', 'You cannot cover the cost of that operation.');
    }
    const since = new Date(Date.now() - template.cooldownHours * 3_600_000);
    const recent = await prisma.operation.findFirst({
      where: { leaderId: roundPlayerId, catalogKey: templateKey, createdAt: { gt: since } },
      select: { id: true },
    });
    if (recent) throw AppError.conflict('OPERATION_COOLDOWN', 'That operation is still on cooldown.');
    const target: Record<string, unknown> = {};
    if (input.district) target.district = input.district;
    if (templateKey === 'STASH_RECOVERY') {
      if (!input.supplyStockId) throw AppError.badRequest('OPERATION_SOURCE', 'Name the stash you are recovering.');
      const stock = await prisma.supplyStock.findUnique({
        where: { id: input.supplyStockId },
        include: { warehouse: { select: { roundPlayerId: true, citySlug: true } } },
      });
      if (!stock || stock.warehouse.roundPlayerId !== roundPlayerId
          || stock.warehouse.citySlug !== input.citySlug
          || stock.productKey !== template.productKey || stock.quantity < template.units) {
        throw AppError.conflict('OPERATION_STOCK_SHORT', 'That stash is not available for recovery.');
      }
      target.supplyStockId = input.supplyStockId;
    }
    if (templateKey === 'CONVOY_PROTECTION') {
      if (!input.runId || input.escort === undefined || !input.routeRisk) {
        throw AppError.badRequest('OPERATION_SOURCE', 'Choose the shipment, escort, and route risk first.');
      }
      const run = await prisma.run.findUnique({ where: { id: input.runId }, select: { id: true, roundPlayer: { select: { roundId: true } } } });
      if (!run || run.roundPlayer.roundId !== me.roundId) throw AppError.notFound('OPERATION_SOURCE', 'That shipment is not in this season.');
      target.runId = input.runId;
      target.escort = input.escort;
      target.routeRisk = input.routeRisk;
    }
    if (templateKey === 'BLOCK_DEFENSE') {
      if (!input.threatKind || !input.threatId) throw AppError.badRequest('OPERATION_NO_THREAT', 'Name the threat you are answering.');
      await assertThreat(prisma, me.roundId, roundPlayerId, input.threatKind, input.threatId);
      target.threatKind = input.threatKind;
      target.threatId = input.threatId;
    }
    const now = new Date();
    const operation = await prisma.$transaction(async (tx) => {
      if (template.startCostCents > 0) {
        const fresh = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { cashCents: true } });
        if (BigInt(fresh.cashCents) < BigInt(template.startCostCents)) {
          throw AppError.conflict('OPERATION_COST', 'You cannot cover the cost of that operation.');
        }
        await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { cashCents: { decrement: template.startCostCents } } });
        await EconomyLedgerService.record(tx, roundPlayerId, [{
          source: 'OPERATION_COST',
          label: 'Operation stake',
          amountCents: -template.startCostCents,
          metadata: { templateKey },
        }], now);
      }
      const created = await tx.operation.create({
        data: {
          roundId: me.roundId,
          cityId: city.id,
          template: templateKey,
          status: 'CREW_LOCK',
          leaderId: roundPlayerId,
          target: target as Prisma.InputJsonValue,
          roles: {},
          catalogKey: templateKey,
          catalogVersion: round.rulesetVersion,
          rulesSnapshot: template as unknown as Prisma.InputJsonValue,
          windows: [],
          committedCostCents: template.startCostCents,
        },
        include: operationInclude,
      });
      await recordOperationTransition(tx, created.id, roundPlayerId, 'INTEL', 'CREW_LOCK', 'templated start');
      return created;
    });
    return toOperationDto(operation, operation.participants, roundPlayerId, now, pauseOffsetMs(round, now));
  },

  async lock(prisma: PrismaClient, roundPlayerId: string, operationId: string, role: string) {
    return prisma.$transaction(async (tx) => {
      const operation = await tx.operation.findUniqueOrThrow({ where: { id: operationId }, include: operationInclude });
      const snapshot = snapshotOf(operation.rulesSnapshot);
      if (!snapshot) throw AppError.conflict('OPERATION_BAD_STAGE', 'This operation is not using a template.');
      if (operation.status !== 'CREW_LOCK' && operation.status !== 'READY') {
        throw AppError.conflict('OPERATION_BAD_STAGE', 'This operation is not locking crew.');
      }
      const roleRule = snapshot.roles.find((entry) => entry.key === role);
      if (!roleRule) throw AppError.badRequest('OPERATION_ROLE', 'That seat is not on this operation.');
      const player = await tx.roundPlayer.findUniqueOrThrow({
        where: { id: roundPlayerId },
        select: { roundId: true, allianceId: true, accountId: true },
      });
      if (player.roundId !== operation.roundId) throw AppError.badRequest('OPERATION_WRONG_ROUND', 'That operation is not your season.');
      const leader = await tx.roundPlayer.findUniqueOrThrow({ where: { id: operation.leaderId }, select: { allianceId: true } });
      if (roleRule.allianceOnly && (!leader.allianceId || player.allianceId !== leader.allianceId)) {
        throw AppError.conflict('OPERATION_ALLIANCE', 'That seat is for the leader\'s alliance.');
      }
      const round = await loadRound(tx, operation.roundId);
      const now = new Date();
      const pauseMs = pauseOffsetMs(round, now);
      const seats = await tx.operationParticipant.findMany({ where: { operationId } });
      const current = seats.find((seat) => seat.role === role);
      const open = !current || current.status === 'DECLINED' || (current.status === 'INVITED' && !inviteOpen(current.expiresAt, now, pauseMs));
      if (!open) throw AppError.conflict('OPERATION_ROLE_TAKEN', 'That role is already filled.');
      if (seats.some((seat) => seat.roundPlayerId === roundPlayerId && (seat.status === 'LOCKED' || seat.status === 'ACCEPTED'))) {
        throw AppError.conflict('OPERATION_ALREADY_CREW', 'You already hold a role on this operation.');
      }
      if (current) {
        const taken = await tx.operationParticipant.updateMany({
          where: { id: current.id, status: { in: ['DECLINED', 'INVITED'] } },
          data: { roundPlayerId, status: 'LOCKED', expiresAt: null },
        });
        if (taken.count !== 1) throw AppError.conflict('OPERATION_ROLE_TAKEN', 'That role is already filled.');
      } else {
        try {
          await tx.operationParticipant.create({
            data: { operationId, roundPlayerId, role, status: 'LOCKED' },
          });
        } catch (error) {
          if (isUniqueConflict(error)) throw AppError.conflict('OPERATION_ROLE_TAKEN', 'That role is already filled.');
          throw error;
        }
      }
      if (operation.status === 'READY') {
        await tx.operation.update({ where: { id: operationId }, data: { status: 'CREW_LOCK' } });
      }
      await markReady(tx, operationId, snapshot, roundPlayerId);
      const after = await reload(tx, operationId);
      return toOperationDto(after, after.participants, roundPlayerId, now, pauseMs);
    });
  },

  async invite(prisma: PrismaClient, roundPlayerId: string, operationId: string, role: string, targetPublicPimpId: number) {
    return prisma.$transaction(async (tx) => {
      const operation = await tx.operation.findUniqueOrThrow({ where: { id: operationId }, include: operationInclude });
      const snapshot = snapshotOf(operation.rulesSnapshot);
      if (!snapshot) throw AppError.conflict('OPERATION_BAD_STAGE', 'This operation is not using a template.');
      if (operation.leaderId !== roundPlayerId) throw AppError.badRequest('OPERATION_NOT_LEADER', 'Only the leader invites crew.');
      if (operation.status !== 'CREW_LOCK') throw AppError.conflict('OPERATION_BAD_STAGE', 'This operation is not locking crew.');
      const roleRule = snapshot.roles.find((entry) => entry.key === role);
      if (!roleRule) throw AppError.badRequest('OPERATION_ROLE', 'That seat is not on this operation.');
      const leader = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { accountId: true, allianceId: true } });
      const target = await tx.roundPlayer.findFirst({
        where: { publicPimpId: targetPublicPimpId, roundId: operation.roundId },
        select: { id: true, accountId: true, allianceId: true },
      });
      if (!target) throw AppError.notFound('PLAYER_NOT_FOUND', 'No crew with that number this season.');
      if (target.id === roundPlayerId) throw AppError.badRequest('OPERATION_INVITE_SELF', 'Lock the role yourself instead of inviting yourself.');
      if (await blocked(tx, leader.accountId, target.accountId)) {
        throw AppError.conflict('OPERATION_BLOCKED', 'That invite is not allowed.');
      }
      if (roleRule.allianceOnly && (!leader.allianceId || target.allianceId !== leader.allianceId)) {
        throw AppError.conflict('OPERATION_ALLIANCE', 'That seat is for the leader\'s alliance.');
      }
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 3_600_000);
      const recentInvites = await tx.operationParticipant.findMany({
        where: { invitedById: roundPlayerId, status: 'INVITED', createdAt: { gt: hourAgo } },
      });
      if (recentInvites.length >= snapshot.inviteLimitPerHour) {
        throw AppError.tooManyRequests('OPERATION_INVITE_LIMIT', 'You are sending invites too quickly.');
      }
      const pair = recentInvites.filter((seat) => seat.roundPlayerId === target.id).length;
      if (pair >= snapshot.collusionPairLimit) {
        throw AppError.conflict('OPERATION_COLLUSION', 'That crew pair has too many open invites.');
      }
      const round = await loadRound(tx, operation.roundId);
      const pauseMs = pauseOffsetMs(round, now);
      const seats = await tx.operationParticipant.findMany({ where: { operationId } });
      const current = seats.find((seat) => seat.role === role);
      const open = !current || current.status === 'DECLINED' || (current.status === 'INVITED' && !inviteOpen(current.expiresAt, now, pauseMs));
      if (!open) throw AppError.conflict('OPERATION_ROLE_TAKEN', 'That role is already filled.');
      const expiresAt = new Date(now.getTime() + snapshot.inviteTtlHours * 3_600_000);
      if (current) {
        await tx.operationParticipant.update({
          where: { id: current.id },
          data: { roundPlayerId: target.id, status: 'INVITED', invitedById: roundPlayerId, expiresAt },
        });
      } else {
        await tx.operationParticipant.create({
          data: { operationId, roundPlayerId: target.id, role, status: 'INVITED', invitedById: roundPlayerId, expiresAt },
        });
      }
      await ActivityService.log(tx, target.id, 'GAME_ANNOUNCEMENT', {
        title: 'Operation invite',
        excerpt: `You are wanted as ${role} on ${snapshot.label}. Answer before it expires.`,
        operationId,
        role,
      });
      const after = await reload(tx, operationId);
      return toOperationDto(after, after.participants, roundPlayerId, now, pauseMs);
    });
  },

  async answer(prisma: PrismaClient, roundPlayerId: string, operationId: string, accept: boolean) {
    return prisma.$transaction(async (tx) => {
      const operation = await tx.operation.findUniqueOrThrow({ where: { id: operationId }, include: operationInclude });
      const snapshot = snapshotOf(operation.rulesSnapshot);
      if (!snapshot) throw AppError.conflict('OPERATION_BAD_STAGE', 'This operation is not using a template.');
      const round = await loadRound(tx, operation.roundId);
      const now = new Date();
      const pauseMs = pauseOffsetMs(round, now);
      const seat = await tx.operationParticipant.findFirst({
        where: { operationId, roundPlayerId, status: 'INVITED' },
      });
      if (!seat || !inviteOpen(seat.expiresAt, now, pauseMs)) {
        throw AppError.notFound('OPERATION_INVITE_MISSING', 'No open invite for you on this operation.');
      }
      await tx.operationParticipant.update({
        where: { id: seat.id },
        data: accept ? { status: 'ACCEPTED', expiresAt: null } : { status: 'DECLINED' },
      });
      if (accept) await markReady(tx, operationId, snapshot, roundPlayerId);
      const after = await reload(tx, operationId);
      return toOperationDto(after, after.participants, roundPlayerId, now, pauseMs);
    });
  },

  async release(prisma: PrismaClient, roundPlayerId: string, operationId: string, role: string) {
    return prisma.$transaction(async (tx) => {
      const operation = await tx.operation.findUniqueOrThrow({ where: { id: operationId }, include: operationInclude });
      if (operation.status === 'REPORTED' || operation.status === 'CANCELLED' || operation.status === 'EXPIRED') {
        throw AppError.conflict('OPERATION_BAD_STAGE', 'That operation is already finished.');
      }
      const seat = await tx.operationParticipant.findFirst({ where: { operationId, role, roundPlayerId } });
      if (!seat || (seat.status !== 'LOCKED' && seat.status !== 'ACCEPTED')) {
        throw AppError.notFound('OPERATION_ROLE', 'You do not hold that seat.');
      }
      await tx.operationParticipant.delete({ where: { id: seat.id } });
      if (operation.status === 'READY') {
        await tx.operation.update({ where: { id: operationId }, data: { status: 'CREW_LOCK' } });
        await recordOperationTransition(tx, operationId, roundPlayerId, 'READY', 'CREW_LOCK', 'seat released');
      }
      const round = await loadRound(tx, operation.roundId);
      const now = new Date();
      const after = await reload(tx, operationId);
      return toOperationDto(after, after.participants, roundPlayerId, now, pauseOffsetMs(round, now));
    });
  },

  async cancel(prisma: PrismaClient, roundPlayerId: string, operationId: string) {
    return prisma.$transaction(async (tx) => {
      const operation = await tx.operation.findUniqueOrThrow({ where: { id: operationId } });
      if (operation.leaderId !== roundPlayerId) throw AppError.badRequest('OPERATION_NOT_LEADER', 'Only the leader cancels.');
      if (operation.report) throw AppError.conflict('OPERATION_BAD_STAGE', 'A reported operation cannot be cancelled.');
      const now = new Date();
      await abandonTemplated(tx, operation, 'CANCELLED', roundPlayerId, 'leader cancel', now);
      const round = await loadRound(tx, operation.roundId);
      const after = await reload(tx, operationId);
      return toOperationDto(after, after.participants, roundPlayerId, now, pauseOffsetMs(round, now));
    });
  },

  async cite(prisma: PrismaClient, roundPlayerId: string, input: OperationCiteInputDto) {
    return prisma.$transaction(async (tx) => {
      const operation = await tx.operation.findUniqueOrThrow({ where: { id: input.operationId }, include: operationInclude });
      const snapshot = snapshotOf(operation.rulesSnapshot);
      if (!snapshot) throw AppError.conflict('OPERATION_BAD_STAGE', 'This operation is not using a template.');
      if (operation.status === 'REPORTED' || operation.status === 'CANCELLED' || operation.status === 'EXPIRED') {
        const round = await loadRound(tx, operation.roundId);
        const now = new Date();
        return toOperationDto(operation, operation.participants, roundPlayerId, now, pauseOffsetMs(round, now));
      }
      const seated = operation.participants.some((seat) => seat.roundPlayerId === roundPlayerId && (seat.status === 'LOCKED' || seat.status === 'ACCEPTED'))
        || operation.leaderId === roundPlayerId;
      if (!seated) throw AppError.forbidden('You are not on this operation.');
      const window = snapshot.windows.find((row) => row.key === input.windowKey);
      if (!window || !window.sourceKinds.includes(input.sourceKind)) {
        throw AppError.badRequest('OPERATION_WINDOW', 'That result does not fit this stage.');
      }
      const existing = windowsOf(operation.windows).find((row) => row.key === input.windowKey);
      const now = new Date();
      const round = await loadRound(tx, operation.roundId);
      if (existing?.sourceId) {
        return toOperationDto(operation, operation.participants, roundPlayerId, now, pauseOffsetMs(round, now));
      }
      const ok = await sourceReady(tx, operation, snapshot, input.sourceKind, input.sourceId);
      if (!ok) throw AppError.conflict('OPERATION_SOURCE', 'That result is not settled, or another operation already claimed it.');
       await withWindow(tx, operation.id, input.windowKey, input.sourceKind, input.sourceId, roundPlayerId);
      await recordOperationTransition(tx, operation.id, roundPlayerId, operation.status, operation.status, `cite ${input.windowKey}`);
      const after = await reload(tx, operation.id);
      return toOperationDto(after, after.participants, roundPlayerId, now, pauseOffsetMs(round, now));
    });
  },

  async execute(prisma: PrismaClient, roundPlayerId: string, operationId: string) {
    return prisma.$transaction(async (tx) => {
      const operation = await tx.operation.findUniqueOrThrow({ where: { id: operationId }, include: operationInclude });
      const snapshot = snapshotOf(operation.rulesSnapshot);
      if (!snapshot) throw AppError.conflict('OPERATION_BAD_STAGE', 'This operation is not using a template.');
      const round = await loadRound(tx, operation.roundId);
      const now = new Date();
      const pauseMs = pauseOffsetMs(round, now);
      if (operation.report) return toOperationDto(operation, operation.participants, roundPlayerId, now, pauseMs);
      if (operation.leaderId !== roundPlayerId) throw AppError.badRequest('OPERATION_NOT_LEADER', 'Only the leader runs the operation.');
      const deadline = operation.createdAt.getTime() + snapshot.deadlineHours * 3_600_000 + pauseMs;
      if (now.getTime() > deadline) {
        await abandonTemplated(tx, operation, 'EXPIRED', roundPlayerId, 'deadline', now);
        const after = await reload(tx, operationId);
        return toOperationDto(after, after.participants, roundPlayerId, now, pauseMs);
      }
      if (operation.status !== 'READY' && operation.status !== 'EXECUTING') {
        throw AppError.conflict('OPERATION_NOT_READY', 'Fill the required seats before running the operation.');
      }
      const moved = await tx.operation.updateMany({
        where: { id: operationId, status: { in: ['READY', 'EXECUTING'] } },
        data: { status: 'EXECUTING' },
      });
      if (moved.count !== 1) {
        const again = await reload(tx, operationId);
        if (again.report) return toOperationDto(again, again.participants, roundPlayerId, now, pauseMs);
        throw AppError.conflict('OPERATION_NOT_READY', 'That operation is already resolving.');
      }
      const windows = await autoResolve(tx, operation, snapshot);
      const band = bandFor(snapshot, windows);
      const crew = operation.participants.filter((seat) => seat.status === 'LOCKED' || seat.status === 'ACCEPTED');
      const distinct = [...new Set(crew.map((seat) => seat.roundPlayerId))];
      if (distinct.length === 0) distinct.push(operation.leaderId);
      const budget = snapshot.bands[band].payoutCents;
      let capApplied = false;
      const shares: number[] = [];
      for (const playerId of distinct) {
        const even = Math.floor(budget / distinct.length);
        const room = Math.max(0, snapshot.rewardCapCents - await priorPayoutCents(tx, playerId, snapshot.key));
        const share = Math.min(even, room);
        if (share < even) capApplied = true;
        shares.push(share);
      }
      for (let index = 0; index < distinct.length; index += 1) {
        const playerId = distinct[index]!;
        const share = shares[index]!;
        if (share <= 0) continue;
        try {
          await tx.operationGrant.create({ data: { operationId, roundPlayerId: playerId, kind: 'CASH' } });
        } catch (error) {
          if (isUniqueConflict(error)) continue;
          throw error;
        }
        await tx.roundPlayer.update({ where: { id: playerId }, data: { cashCents: { increment: share } } });
        await EconomyLedgerService.record(tx, playerId, [{
          source: 'OPERATION_PAYOUT',
          label: 'Operation cut',
          amountCents: share,
          metadata: { operationId, templateKey: snapshot.key, band },
        }], now);
      }
      if (band === 'success' && snapshot.milestone) {
        const players = await tx.roundPlayer.findMany({
          where: { id: { in: distinct } },
          select: { id: true, accountId: true },
        });
        for (const player of players) {
          const idempotencyKey = `operation:${operationId}:milestone:${player.accountId}`;
          const existing = await tx.legacyEntry.findUnique({ where: { idempotencyKey } });
          if (existing) continue;
          try {
            await tx.legacyEntry.create({
              data: {
                accountId: player.accountId,
                sourceRoundId: operation.roundId,
                kind: snapshot.milestone.kind,
                title: snapshot.milestone.title,
                summary: { operationId, templateKey: snapshot.key },
                idempotencyKey,
              },
            });
          } catch (error) {
            if (!isUniqueConflict(error)) throw error;
          }
        }
      }
      const totalPayoutCents = shares.reduce((sum, share) => sum + share, 0);
      const cited = windows.find((window) => window.sourceId);
      const target = targetOf(operation.target);
      const report = {
        success: band === 'success',
        band,
        stages: snapshot.windows.map((window) => {
          const hit = windows.find((row) => row.key === window.key && row.sourceId);
           return {
             stage: window.key,
             detail: hit ? `${window.key} cited ${hit.sourceKind}.` : `${window.key} was not completed.`,
             wentWrong: !hit,
             optional: window.optional,
             contributorId: hit?.contributorId ?? null,
           };
        }),
        payoutCents: distinct.length ? Math.floor(totalPayoutCents / distinct.length) : 0,
        totalPayoutCents,
         contributions: distinct.map((playerId, index) => ({
           roundPlayerId: playerId,
           role: crew.find((seat) => seat.roundPlayerId === playerId)?.role ?? snapshot.roles[0]?.key ?? 'runner',
           payoutCents: shares[index] ?? 0,
           windows: windows.filter((window) => window.contributorId === playerId).map((window) => window.key),
         })),
        capApplied,
        source: cited ? {
          kind: cited.sourceKind,
          id: cited.sourceId,
          escort: target.escort ?? null,
          routeRisk: target.routeRisk ?? null,
        } : null,
      };
      await tx.operation.update({
        where: { id: operationId },
        data: { status: 'REPORTED', report: report as unknown as Prisma.InputJsonValue },
      });
      await recordOperationTransition(tx, operationId, roundPlayerId, 'EXECUTING', 'REPORTED', band);
      await emitCityMemoryEvent(tx, {
        roundId: operation.roundId,
        cityId: operation.cityId,
        kind: 'operation_complete',
        visibility: band === 'failure' ? 'involved-only' : 'public',
        actorRoundPlayerIds: distinct,
        summary: { operationId, band, template: snapshot.key },
        happenedAt: now,
        idempotencyKey: `operation:${operationId}`,
      });
      for (const playerId of distinct) {
        await ActivityService.log(tx, playerId, 'GAME_ANNOUNCEMENT', {
          operationId,
          band,
          payoutCents: report.payoutCents,
        } as unknown as Prisma.InputJsonValue);
      }
      const after = await reload(tx, operationId);
      return toOperationDto(after, after.participants, roundPlayerId, now, pauseMs);
    });
  },
};
