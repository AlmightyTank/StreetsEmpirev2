import type { Prisma, PrismaClient } from '@prisma/client';
import { hashParts, seededRng } from '@streets/rules-engine';
import type {
  OperationAnswerInputDto,
  OperationCancelInputDto,
  OperationCiteInputDto,
  OperationExecuteInputDto,
  OperationInviteInputDto,
  OperationLockInputDto,
  OperationReleaseInputDto,
  OperationStartInputDto,
  OperationsPageDto,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';
import type { Db } from '../utils/db.js';
import { ActivityService } from './activity.service.js';
import { emitCityMemoryEvent } from './city-memory.service.js';
import { EconomyLedgerService } from './economy-ledger.service.js';
import {
  inviteOpen,
  LEADER_COOLDOWN_HOURS,
  OPERATION_ROLES,
  operationInclude,
  pauseOffsetMs,
  recordOperationTransition,
  ROUND_CLOCK_SELECT,
  TEMPLATE_PAYOUT_CENTS,
  toOperationDto,
  type OperationRole,
} from './operation-shared.js';
import { TemplatedOperations } from './operation-templated.service.js';

/**
 * 2.0.0 empire-story-2-0. One-template criminal operations prototype.
 * INTEL (target picked at start) -> CREW_LOCK -> READY -> EXECUTING -> REPORTED.
 * A null catalogVersion stays on this interpreter for the life of the row.
 * 2.2.0 templates delegate to TemplatedOperations.
 */

const ORDER: Record<string, number> = { INTEL: 0, CREW_LOCK: 1, READY: 2, EXECUTING: 3, REPORTED: 4 };

function assertTransition(from: string, to: string): void {
  if ((ORDER[to] ?? -1) !== (ORDER[from] ?? -1) + 1) {
    throw AppError.conflict('OPERATION_BAD_STAGE', `An operation cannot go from ${from} to ${to}.`);
  }
}

type Seat = { role: string; roundPlayerId: string; status: string; expiresAt: Date | null };

function liveSeats(seats: Seat[], now: Date, pauseMs: number): Seat[] {
  return seats.filter((seat) => seat.status === 'LOCKED' || seat.status === 'ACCEPTED'
    || (seat.status === 'INVITED' && inviteOpen(seat.expiresAt, now, pauseMs)));
}

function seatOpen(seats: Seat[], role: string, now: Date, pauseMs: number): boolean {
  const seat = seats.find((entry) => entry.role === role);
  return !seat || seat.status === 'DECLINED' || (seat.status === 'INVITED' && !inviteOpen(seat.expiresAt, now, pauseMs));
}

async function pauseFor(tx: Db | PrismaClient, roundId: string, now: Date): Promise<number> {
  const round = await tx.round.findUnique({ where: { id: roundId }, select: ROUND_CLOCK_SELECT });
  return pauseOffsetMs(round, now);
}

async function reapExpired(tx: Db, operationId: string, now: Date, pauseMs: number): Promise<void> {
  const seats = await tx.operationParticipant.findMany({ where: { operationId, status: 'INVITED' } });
  for (const seat of seats) {
    if (!inviteOpen(seat.expiresAt, now, pauseMs)) {
      await tx.operationParticipant.update({ where: { id: seat.id }, data: { status: 'DECLINED' } });
    }
  }
}

async function maybeReady(tx: Db, operationId: string): Promise<void> {
  const seats = await tx.operationParticipant.findMany({ where: { operationId } });
  const filled = OPERATION_ROLES.filter((role) => seats.some((seat) =>
    seat.role === role && (seat.status === 'LOCKED' || seat.status === 'ACCEPTED')));
  if (filled.length !== OPERATION_ROLES.length) return;
  const current = await tx.operation.findUniqueOrThrow({ where: { id: operationId }, select: { status: true } });
  if (current.status !== 'CREW_LOCK') return;
  assertTransition(current.status, 'READY');
  await tx.operation.update({ where: { id: operationId }, data: { status: 'READY' } });
  await recordOperationTransition(tx, operationId, null, 'CREW_LOCK', 'READY', 'prototype seats filled');
}

export const OperationsService = {
  async page(prisma: PrismaClient, roundPlayerId: string): Promise<OperationsPageDto> {
    const me = await prisma.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { roundId: true } });
    const round = await prisma.round.findUnique({ where: { id: me.roundId }, select: ROUND_CLOCK_SELECT });
    const operations = await prisma.operation.findMany({
      where: {
        roundId: me.roundId,
        OR: [
          { leaderId: roundPlayerId },
          { participants: { some: { roundPlayerId } } },
        ],
      },
      include: operationInclude,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const now = new Date();
    const pauseMs = pauseOffsetMs(round, now);
    const [stash, shipments, blockWars, turfPushes] = await Promise.all([
      prisma.supplyStock.findMany({
        where: { warehouse: { roundPlayerId, isActive: true }, quantity: { gt: 0 } },
        select: { id: true, productKey: true, quantity: true, warehouse: { select: { citySlug: true } } },
        orderBy: [{ warehouse: { citySlug: 'asc' } }, { productKey: 'asc' }],
      }),
      prisma.run.findMany({
        where: { roundPlayerId },
        select: { id: true, homeCity: true, status: true },
        orderBy: { launchedAt: 'desc' },
      }),
      prisma.blockWar.findMany({
        where: {
          roundId: me.roundId,
          status: { in: ['OPENING', 'SIEGE', 'BETWEEN'] },
          OR: [{ attackerId: roundPlayerId }, { defenderId: roundPlayerId }],
        },
        select: { id: true, status: true, endsBy: true, turf: { select: { district: true, city: { select: { slug: true } } } } },
        orderBy: { endsBy: 'asc' },
      }),
      prisma.turfPush.findMany({
        where: { roundId: me.roundId, defenderId: roundPlayerId, status: 'PENDING' },
        select: { id: true, status: true, landsAt: true, turf: { select: { district: true, city: { select: { slug: true } } } } },
        orderBy: { landsAt: 'asc' },
      }),
    ]);
    return {
      operations: operations.map((operation) => toOperationDto(operation, operation.participants, roundPlayerId, now, pauseMs)),
      leaderCooldownHours: LEADER_COOLDOWN_HOURS,
      underworldOperationsEnabled: round?.underworldOperationsEnabled ?? false,
      catalog: [
        {
          key: 'CORNER_TAKEOVER',
          label: 'Corner takeover',
          available: true,
          unavailableReason: null,
          startCostCents: 0,
          deadlineHours: null,
          bands: null,
        },
        ...TemplatedOperations.offers(round),
      ],
      sources: {
        stash: stash.map((source) => ({
          id: source.id,
          citySlug: source.warehouse.citySlug,
          productKey: source.productKey,
          quantity: source.quantity,
        })),
        shipments: shipments.map((source) => ({
          id: source.id,
          homeCity: source.homeCity,
          status: source.status,
        })),
        threats: [
          ...blockWars.map((source) => ({
            kind: 'block-war' as const,
            id: source.id,
            citySlug: source.turf.city.slug,
            district: source.turf.district,
            status: source.status,
            endsAt: source.endsBy.toISOString(),
          })),
          ...turfPushes.map((source) => ({
            kind: 'turf-push' as const,
            id: source.id,
            citySlug: source.turf.city.slug,
            district: source.turf.district,
            status: source.status,
            endsAt: source.landsAt.toISOString(),
          })),
        ],
      },
    };
  },

  /** Intel stage and crew lock open together: the target is picked at creation. */
  async start(prisma: PrismaClient, roundPlayerId: string, input: OperationStartInputDto) {
    const template = input.template ?? 'CORNER_TAKEOVER';
    if (template !== 'CORNER_TAKEOVER') return TemplatedOperations.start(prisma, roundPlayerId, input, template);
    if (!input.district) throw AppError.badRequest('OPERATION_DISTRICT', 'Name the district you are taking.');
    const me = await prisma.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { roundId: true } });
    const city = await prisma.city.findUnique({ where: { slug: input.citySlug }, select: { id: true, slug: true, name: true } });
    if (!city) throw AppError.notFound('CITY_NOT_FOUND', 'That city does not exist.');
    const cooldownSince = new Date(Date.now() - LEADER_COOLDOWN_HOURS * 3_600_000);
    const recent = await prisma.operation.findFirst({
      where: { leaderId: roundPlayerId, template: 'CORNER_TAKEOVER', createdAt: { gt: cooldownSince } },
      select: { id: true },
    });
    if (recent) throw AppError.conflict('OPERATION_COOLDOWN', `You can lead another operation in ${LEADER_COOLDOWN_HOURS} hours.`);
    const operation = await prisma.operation.create({
      data: {
        roundId: me.roundId,
        cityId: city.id,
        template: 'CORNER_TAKEOVER',
        status: 'INTEL',
        leaderId: roundPlayerId,
        target: { district: input.district },
        roles: {},
      },
      include: operationInclude,
    });
    assertTransition(operation.status, 'CREW_LOCK');
    const opened = await prisma.operation.update({
      where: { id: operation.id },
      data: { status: 'CREW_LOCK' },
      include: operationInclude,
    });
    await recordOperationTransition(prisma, operation.id, roundPlayerId, 'INTEL', 'CREW_LOCK', 'prototype start');
    const now = new Date();
    return toOperationDto(opened, opened.participants, roundPlayerId, now, await pauseFor(prisma, me.roundId, now));
  },

  async lock(prisma: PrismaClient, roundPlayerId: string, input: OperationLockInputDto) {
    const peek = await prisma.operation.findUniqueOrThrow({ where: { id: input.operationId }, select: { catalogVersion: true } });
    if (peek.catalogVersion) return TemplatedOperations.lock(prisma, roundPlayerId, input.operationId, input.role);
    return prisma.$transaction(async (tx) => {
      const operation = await tx.operation.findUniqueOrThrow({ where: { id: input.operationId }, include: operationInclude });
      if (operation.status !== 'CREW_LOCK') throw AppError.conflict('OPERATION_BAD_STAGE', 'This operation is not locking crew.');
      if (!OPERATION_ROLES.includes(input.role as OperationRole)) throw AppError.badRequest('OPERATION_ROLE', 'That seat is not on this operation.');
      const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { roundId: true } });
      if (player.roundId !== operation.roundId) throw AppError.badRequest('OPERATION_WRONG_ROUND', 'That operation is not your season.');
      const now = new Date();
      const pauseMs = await pauseFor(tx, operation.roundId, now);
      await reapExpired(tx, operation.id, now, pauseMs);
      const seats = await tx.operationParticipant.findMany({ where: { operationId: operation.id } });
      if (!seatOpen(seats, input.role, now, pauseMs)) throw AppError.conflict('OPERATION_ROLE_TAKEN', 'That role is already filled.');
      if (seats.some((seat) => seat.roundPlayerId === roundPlayerId && (seat.status === 'LOCKED' || seat.status === 'ACCEPTED'))) {
        throw AppError.conflict('OPERATION_ALREADY_CREW', 'You already hold a role on this operation.');
      }
      await tx.operationParticipant.upsert({
        where: { operationId_role: { operationId: operation.id, role: input.role } },
        create: { operationId: operation.id, roundPlayerId, role: input.role, status: 'LOCKED' },
        update: { roundPlayerId, status: 'LOCKED', expiresAt: null },
      });
      await maybeReady(tx, operation.id);
      const after = await tx.operation.findUniqueOrThrow({ where: { id: operation.id }, include: operationInclude });
      return toOperationDto(after, after.participants, roundPlayerId, now, pauseMs);
    });
  },

  async invite(prisma: PrismaClient, roundPlayerId: string, input: OperationInviteInputDto) {
    const peek = await prisma.operation.findUniqueOrThrow({ where: { id: input.operationId }, select: { catalogVersion: true } });
    if (peek.catalogVersion) {
      return TemplatedOperations.invite(prisma, roundPlayerId, input.operationId, input.role, input.targetPublicPimpId);
    }
    const operation = await prisma.$transaction(async (tx) => {
      const row = await tx.operation.findUniqueOrThrow({ where: { id: input.operationId }, include: operationInclude });
      if (row.leaderId !== roundPlayerId) throw AppError.badRequest('OPERATION_NOT_LEADER', 'Only the leader invites crew.');
      if (row.status !== 'CREW_LOCK') throw AppError.conflict('OPERATION_BAD_STAGE', 'This operation is not locking crew.');
      if (!OPERATION_ROLES.includes(input.role as OperationRole)) throw AppError.badRequest('OPERATION_ROLE', 'That seat is not on this operation.');
      const target = await tx.roundPlayer.findFirst({
        where: { publicPimpId: input.targetPublicPimpId, roundId: row.roundId },
        select: { id: true, displayName: true, accountId: true },
      });
      if (!target) throw AppError.notFound('PLAYER_NOT_FOUND', 'No crew with that number this season.');
      if (target.id === roundPlayerId) throw AppError.badRequest('OPERATION_INVITE_SELF', 'Lock the role yourself instead of inviting yourself.');
      const leader = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { accountId: true } });
      if (leader.accountId && target.accountId) {
        const block = await tx.playerBlock.findFirst({
          where: {
            OR: [
              { blockerAccountId: leader.accountId, blockedAccountId: target.accountId },
              { blockerAccountId: target.accountId, blockedAccountId: leader.accountId },
            ],
          },
          select: { id: true },
        });
        if (block) throw AppError.conflict('OPERATION_BLOCKED', 'That invite is not allowed.');
      }
      const now = new Date();
      const pauseMs = await pauseFor(tx, row.roundId, now);
      await reapExpired(tx, row.id, now, pauseMs);
      const seats = await tx.operationParticipant.findMany({ where: { operationId: row.id } });
      if (!seatOpen(seats, input.role, now, pauseMs)) throw AppError.conflict('OPERATION_ROLE_TAKEN', 'That role is already filled.');
      await tx.operationParticipant.upsert({
        where: { operationId_role: { operationId: row.id, role: input.role } },
        create: {
          operationId: row.id,
          roundPlayerId: target.id,
          role: input.role,
          status: 'INVITED',
          invitedById: roundPlayerId,
          expiresAt: new Date(now.getTime() + 24 * 3_600_000),
        },
        update: {
          roundPlayerId: target.id,
          status: 'INVITED',
          invitedById: roundPlayerId,
          expiresAt: new Date(now.getTime() + 24 * 3_600_000),
        },
      });
      await ActivityService.log(tx, target.id, 'GAME_ANNOUNCEMENT', {
        title: 'Operation invite',
        excerpt: `You are wanted as ${input.role} on a corner takeover. Answer before it expires.`,
        operationId: row.id,
        role: input.role,
      });
      return tx.operation.findUniqueOrThrow({ where: { id: row.id }, include: operationInclude });
    });
    const now = new Date();
    return toOperationDto(operation, operation.participants, roundPlayerId, now, await pauseFor(prisma, operation.roundId, now));
  },

  async answer(prisma: PrismaClient, roundPlayerId: string, input: OperationAnswerInputDto) {
    const peek = await prisma.operation.findUniqueOrThrow({ where: { id: input.operationId }, select: { catalogVersion: true } });
    if (peek.catalogVersion) return TemplatedOperations.answer(prisma, roundPlayerId, input.operationId, input.accept);
    return prisma.$transaction(async (tx) => {
      const operation = await tx.operation.findUniqueOrThrow({ where: { id: input.operationId }, include: operationInclude });
      const now = new Date();
      const pauseMs = await pauseFor(tx, operation.roundId, now);
      await reapExpired(tx, operation.id, now, pauseMs);
      const seat = await tx.operationParticipant.findFirst({
        where: { operationId: operation.id, roundPlayerId, status: 'INVITED' },
      });
      if (!seat || !inviteOpen(seat.expiresAt, now, pauseMs)) {
        throw AppError.notFound('OPERATION_INVITE_MISSING', 'No open invite for you on this operation.');
      }
      await tx.operationParticipant.update({
        where: { id: seat.id },
        data: input.accept ? { status: 'ACCEPTED' } : { status: 'DECLINED' },
      });
      if (input.accept) await maybeReady(tx, operation.id);
      const after = await tx.operation.findUniqueOrThrow({ where: { id: operation.id }, include: operationInclude });
      return toOperationDto(after, after.participants, roundPlayerId, now, pauseMs);
    });
  },

  async release(prisma: PrismaClient, roundPlayerId: string, input: OperationReleaseInputDto) {
    const peek = await prisma.operation.findUniqueOrThrow({ where: { id: input.operationId }, select: { catalogVersion: true } });
    if (peek.catalogVersion) return TemplatedOperations.release(prisma, roundPlayerId, input.operationId, input.role);
    return prisma.$transaction(async (tx) => {
      const operation = await tx.operation.findUniqueOrThrow({ where: { id: input.operationId }, include: operationInclude });
      if (operation.status === 'REPORTED' || operation.status === 'EXECUTING') {
        throw AppError.conflict('OPERATION_BAD_STAGE', 'That operation is already finished.');
      }
      const seat = operation.participants.find((entry) => entry.role === input.role && entry.roundPlayerId === roundPlayerId);
      if (!seat) throw AppError.notFound('OPERATION_ROLE', 'You do not hold that seat.');
      await tx.operationParticipant.delete({ where: { id: seat.id } });
      if (operation.status === 'READY') {
        await tx.operation.update({ where: { id: operation.id }, data: { status: 'CREW_LOCK' } });
        await recordOperationTransition(tx, operation.id, roundPlayerId, 'READY', 'CREW_LOCK', 'seat released');
      }
      const now = new Date();
      const after = await tx.operation.findUniqueOrThrow({ where: { id: operation.id }, include: operationInclude });
      return toOperationDto(after, after.participants, roundPlayerId, now, await pauseFor(tx, operation.roundId, now));
    });
  },

  async cancel(prisma: PrismaClient, roundPlayerId: string, input: OperationCancelInputDto) {
    const peek = await prisma.operation.findUniqueOrThrow({ where: { id: input.operationId }, select: { catalogVersion: true, report: true } });
    if (peek.report) throw AppError.conflict('OPERATION_BAD_STAGE', 'A reported operation cannot be cancelled.');
    if (peek.catalogVersion) return TemplatedOperations.cancel(prisma, roundPlayerId, input.operationId);
    return prisma.$transaction(async (tx) => {
      const operation = await tx.operation.findUniqueOrThrow({ where: { id: input.operationId } });
      if (operation.leaderId !== roundPlayerId) throw AppError.badRequest('OPERATION_NOT_LEADER', 'Only the leader cancels.');
      const now = new Date();
      await tx.operationParticipant.deleteMany({ where: { operationId: operation.id } });
      await tx.operation.update({ where: { id: operation.id }, data: { status: 'CANCELLED' } });
      await recordOperationTransition(tx, operation.id, roundPlayerId, operation.status, 'CANCELLED', 'leader cancel');
      const after = await tx.operation.findUniqueOrThrow({ where: { id: operation.id }, include: operationInclude });
      return toOperationDto(after, after.participants, roundPlayerId, now, await pauseFor(tx, operation.roundId, now));
    });
  },

  async cite(prisma: PrismaClient, roundPlayerId: string, input: OperationCiteInputDto) {
    return TemplatedOperations.cite(prisma, roundPlayerId, input);
  },

  async execute(prisma: PrismaClient, roundPlayerId: string, input: OperationExecuteInputDto) {
    const peek = await prisma.operation.findUniqueOrThrow({ where: { id: input.operationId }, select: { catalogVersion: true } });
    if (peek.catalogVersion) return TemplatedOperations.execute(prisma, roundPlayerId, input.operationId);
    return prisma.$transaction(async (tx) => {
      const operation = await tx.operation.findUniqueOrThrow({ where: { id: input.operationId }, include: operationInclude });
      const now = new Date();
      const pauseMs = await pauseFor(tx, operation.roundId, now);
      if (operation.status === 'REPORTED' && operation.report) {
        return toOperationDto(operation, operation.participants, roundPlayerId, now, pauseMs);
      }
      if (operation.leaderId !== roundPlayerId) throw AppError.badRequest('OPERATION_NOT_LEADER', 'Only the leader runs the operation.');
      if (operation.status !== 'READY') throw AppError.conflict('OPERATION_NOT_READY', 'Fill every role before running the operation.');
      const claimed = await tx.operation.updateMany({
        where: { id: operation.id, status: 'READY' },
        data: { status: 'EXECUTING' },
      });
      if (claimed.count !== 1) {
        const again = await tx.operation.findUniqueOrThrow({ where: { id: operation.id }, include: operationInclude });
        if (again.report) return toOperationDto(again, again.participants, roundPlayerId, now, pauseMs);
        throw AppError.conflict('OPERATION_NOT_READY', 'That operation is already resolving.');
      }
      assertTransition('READY', 'EXECUTING');
      await recordOperationTransition(tx, operation.id, roundPlayerId, 'READY', 'EXECUTING', 'prototype execute');
      const crew = liveSeats(operation.participants, now, pauseMs);
      const distinct = [...new Set(crew.map((seat) => seat.roundPlayerId))];
      const odds = 0.5 + 0.15 * (distinct.length - 1);
      const rng = seededRng(hashParts('operation', operation.id));
      const success = rng() < odds;
      const filledRoles = new Set(crew.map((seat) => seat.role));
      const target = (operation.target ?? {}) as { district?: string };
      const pivotalRole = failedRole(operation.id);
      const stages = [
        { stage: 'intel', detail: `Target cased: ${target.district ?? 'the block'}.`, wentWrong: false },
        ...OPERATION_ROLES.map((role) => {
          const wentWrong = success ? role === pivotalRole : role !== pivotalRole;
          return { stage: role, detail: roleReportLine(role, !wentWrong, filledRoles.has(role)), wentWrong };
        }),
      ];
      const payoutCents = success ? Math.floor(TEMPLATE_PAYOUT_CENTS / distinct.length) : 0;
      const report = { success, stages, payoutCents };
      if (success) {
        for (const playerId of distinct) {
          await tx.roundPlayer.update({ where: { id: playerId }, data: { cashCents: { increment: payoutCents } } });
          await EconomyLedgerService.record(tx, playerId, [{
            source: 'OPERATION_PAYOUT',
            label: 'Operation cut',
            amountCents: payoutCents,
            metadata: { operationId: operation.id },
          }], now);
        }
      }
      await tx.operation.update({ where: { id: operation.id }, data: { status: 'REPORTED', report: report as unknown as Prisma.InputJsonValue } });
      await recordOperationTransition(tx, operation.id, roundPlayerId, 'EXECUTING', 'REPORTED', success ? 'success' : 'failure');
      await emitCityMemoryEvent(tx, {
        roundId: operation.roundId,
        cityId: operation.cityId,
        kind: 'operation_complete',
        visibility: success ? 'public' : 'involved-only',
        actorRoundPlayerIds: distinct,
        summary: { operationId: operation.id, success, district: target.district ?? null },
        happenedAt: now,
        idempotencyKey: `operation:${operation.id}`,
      });
      const payload = { operationId: operation.id, success, payoutCents } as unknown as Prisma.InputJsonValue;
      for (const playerId of distinct) await ActivityService.log(tx, playerId, 'GAME_ANNOUNCEMENT', payload);
      const after = await tx.operation.findUniqueOrThrow({ where: { id: operation.id }, include: operationInclude });
      return toOperationDto(after, after.participants, roundPlayerId, now, pauseMs);
    });
  },
};

function roleReportLine(role: OperationRole, success: boolean, filled: boolean): string {
  if (!filled) return `${role}: nobody showed.`;
  if (success) {
    if (role === 'driver') return 'driver: engine running, clean getaway.';
    if (role === 'enforcer') return 'enforcer: muscle held the room.';
    return 'intel: eyes inside, timing perfect.';
  }
  if (role === 'driver') return 'driver: wrong turn, headlights everywhere.';
  if (role === 'enforcer') return 'enforcer: backup arrived early.';
  return 'intel: the mark moved. Nobody told us.';
}

function failedRole(operationId: string): OperationRole {
  const rng = seededRng(hashParts('operation-fail', operationId));
  const index = Math.floor(rng() * OPERATION_ROLES.length);
  return OPERATION_ROLES[index]!;
}
