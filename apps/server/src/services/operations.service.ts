import type { Prisma, PrismaClient } from '@prisma/client';
import { hashParts, seededRng } from '@streets/rules-engine';
import type { OperationDto, OperationsPageDto } from '@streets/shared';
import type {
  OperationAnswerInputDto,
  OperationExecuteInputDto,
  OperationInviteInputDto,
  OperationLockInputDto,
  OperationStartInputDto,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';
import type { Db } from '../utils/db.js';
import { ActivityService } from './activity.service.js';
import { emitCityMemoryEvent } from './city-memory.service.js';
import { EconomyLedgerService } from './economy-ledger.service.js';

/**
 * 2.0.0 empire-story-2-0. One-template criminal operations prototype.
 * INTEL (target picked at start) -> CREW_LOCK -> READY -> EXECUTING -> REPORTED.
 * Roles: driver, enforcer, intel. A role is filled by self-lock or an accepted
 * async invite. Execution resolves once, deterministically from the operation
 * id, and pays a fixed template pot split across distinct crew.
 */

export const OPERATION_ROLES = ['driver', 'enforcer', 'intel'] as const;
export type OperationRole = (typeof OPERATION_ROLES)[number];

export const LEADER_COOLDOWN_HOURS = 24;
const INVITE_TTL_HOURS = 24;
/** Prototype pot: $1,500 split across distinct crew on success. Integer cents. */
const TEMPLATE_PAYOUT_CENTS = 150_000;

const ORDER: Record<string, number> = { INTEL: 0, CREW_LOCK: 1, READY: 2, EXECUTING: 3, REPORTED: 4 };

function assertTransition(from: string, to: string): void {
  if ((ORDER[to] ?? -1) !== (ORDER[from] ?? -1) + 1) {
    throw AppError.conflict('OPERATION_BAD_STAGE', `An operation cannot go from ${from} to ${to}.`);
  }
}

type Seat = { role: string; roundPlayerId: string; status: string; expiresAt: Date | null };

function liveSeats(seats: Seat[], now: Date): Seat[] {
  return seats.filter((seat) => seat.status === 'LOCKED' || seat.status === 'ACCEPTED'
    || (seat.status === 'INVITED' && seat.expiresAt && seat.expiresAt > now));
}

function seatOpen(seats: Seat[], role: string, now: Date): boolean {
  const seat = seats.find((entry) => entry.role === role);
  return !seat || seat.status === 'DECLINED' || (seat.status === 'INVITED' && (!seat.expiresAt || seat.expiresAt <= now));
}

async function reapExpired(tx: Db, operationId: string, now: Date): Promise<void> {
  await tx.operationParticipant.updateMany({
    where: { operationId, status: 'INVITED', expiresAt: { lte: now } },
    data: { status: 'DECLINED' },
  });
}

async function maybeReady(tx: Db, operationId: string, now: Date): Promise<void> {
  const seats = await tx.operationParticipant.findMany({ where: { operationId } });
  const filled = OPERATION_ROLES.filter((role) => seats.some((seat) =>
    seat.role === role && (seat.status === 'LOCKED' || seat.status === 'ACCEPTED')));
  if (filled.length !== OPERATION_ROLES.length) return;
  const current = await tx.operation.findUniqueOrThrow({ where: { id: operationId }, select: { status: true } });
  if (current.status !== 'CREW_LOCK') return;
  assertTransition(current.status, 'READY');
  await tx.operation.update({ where: { id: operationId }, data: { status: 'READY' } });
}

function toDto(
  operation: {
    id: string;
    template: string;
    status: string;
    target: unknown;
    report: unknown;
    createdAt: Date;
    leaderId: string;
    city: { slug: string; name: string };
  },
  seats: Array<Seat & { roundPlayer: { id: string; displayName: string } }>,
  viewerId: string,
  now: Date,
): OperationDto {
  const target = (operation.target ?? {}) as { district?: string };
  const byRole = new Map(seats.map((seat) => [seat.role, seat]));
  const roles = Object.fromEntries(OPERATION_ROLES.map((role) => {
    const seat = byRole.get(role);
    const open = !seat || seat.status === 'DECLINED'
      || (seat.status === 'INVITED' && (!seat.expiresAt || seat.expiresAt <= now));
    return [role, {
      roundPlayerId: open ? null : seat!.roundPlayerId,
      displayName: open ? null : seat!.roundPlayer.displayName,
      status: open ? 'OPEN' : seat!.status,
    }];
  })) as OperationDto['roles'];
  const mine = seats.find((seat) => seat.roundPlayerId === viewerId && seat.status === 'INVITED'
    && seat.expiresAt && seat.expiresAt > now);
  const report = operation.report as OperationDto['report'];
  return {
    id: operation.id,
    template: operation.template,
    status: operation.status as OperationDto['status'],
    citySlug: operation.city.slug,
    cityName: operation.city.name,
    district: (target.district ?? null) as OperationDto['district'],
    roles,
    isLeader: operation.leaderId === viewerId,
    myInvite: mine ? { role: mine.role as OperationRole, expiresAt: mine.expiresAt!.toISOString() } : null,
    report,
    createdAt: operation.createdAt.toISOString(),
  };
}

export const OperationsService = {
  async page(prisma: PrismaClient, roundPlayerId: string): Promise<OperationsPageDto> {
    const me = await prisma.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { roundId: true } });
    const operations = await prisma.operation.findMany({
      where: {
        roundId: me.roundId,
        OR: [
          { leaderId: roundPlayerId },
          { participants: { some: { roundPlayerId } } },
        ],
      },
      include: {
        city: { select: { slug: true, name: true } },
        participants: { include: { roundPlayer: { select: { id: true, displayName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const now = new Date();
    return {
      operations: operations.map((operation) => toDto(operation, operation.participants, roundPlayerId, now)),
      leaderCooldownHours: LEADER_COOLDOWN_HOURS,
    };
  },

  /** Intel stage and crew lock open together: the target is picked at creation. */
  async start(prisma: PrismaClient, roundPlayerId: string, input: OperationStartInputDto): Promise<OperationDto> {
    const me = await prisma.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { roundId: true } });
    const city = await prisma.city.findUnique({ where: { slug: input.citySlug }, select: { id: true, slug: true, name: true } });
    if (!city) throw AppError.notFound('CITY_NOT_FOUND', 'That city does not exist.');
    const cooldownSince = new Date(Date.now() - LEADER_COOLDOWN_HOURS * 3_600_000);
    const recent = await prisma.operation.findFirst({
      where: { leaderId: roundPlayerId, createdAt: { gt: cooldownSince } },
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
      include: {
        city: { select: { slug: true, name: true } },
        participants: { include: { roundPlayer: { select: { id: true, displayName: true } } } },
      },
    });
    // Intel is submitted with the target at creation, so the crew lock opens at once.
    assertTransition(operation.status, 'CREW_LOCK');
    const opened = await prisma.operation.update({
      where: { id: operation.id },
      data: { status: 'CREW_LOCK' },
      include: {
        city: { select: { slug: true, name: true } },
        participants: { include: { roundPlayer: { select: { id: true, displayName: true } } } },
      },
    });
    return toDto(opened, opened.participants, roundPlayerId, new Date());
  },

  async lock(prisma: PrismaClient, roundPlayerId: string, input: OperationLockInputDto): Promise<OperationDto> {
    return prisma.$transaction(async (tx) => {
      const operation = await tx.operation.findUniqueOrThrow({
        where: { id: input.operationId },
        include: {
          city: { select: { slug: true, name: true } },
          participants: { include: { roundPlayer: { select: { id: true, displayName: true } } } },
        },
      });
      if (operation.status !== 'CREW_LOCK') throw AppError.conflict('OPERATION_BAD_STAGE', 'This operation is not locking crew.');
      const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { roundId: true } });
      if (player.roundId !== operation.roundId) throw AppError.badRequest('OPERATION_WRONG_ROUND', 'That operation is not your season.');
      const now = new Date();
      await reapExpired(tx, operation.id, now);
      const seats = await tx.operationParticipant.findMany({ where: { operationId: operation.id } });
      if (!seatOpen(seats, input.role, now)) throw AppError.conflict('OPERATION_ROLE_TAKEN', 'That role is already filled.');
      if (seats.some((seat) => seat.roundPlayerId === roundPlayerId && (seat.status === 'LOCKED' || seat.status === 'ACCEPTED'))) {
        throw AppError.conflict('OPERATION_ALREADY_CREW', 'You already hold a role on this operation.');
      }
      await tx.operationParticipant.upsert({
        where: { operationId_role: { operationId: operation.id, role: input.role } },
        create: { operationId: operation.id, roundPlayerId, role: input.role, status: 'LOCKED' },
        update: { roundPlayerId, status: 'LOCKED', expiresAt: null },
      });
      await maybeReady(tx, operation.id, now);
      const after = await tx.operation.findUniqueOrThrow({
        where: { id: operation.id },
        include: {
          city: { select: { slug: true, name: true } },
          participants: { include: { roundPlayer: { select: { id: true, displayName: true } } } },
        },
      });
      return toDto(after, after.participants, roundPlayerId, now);
    });
  },

  async invite(prisma: PrismaClient, roundPlayerId: string, input: OperationInviteInputDto): Promise<OperationDto> {
    const operation = await prisma.$transaction(async (tx) => {
      const row = await tx.operation.findUniqueOrThrow({
        where: { id: input.operationId },
        include: {
          city: { select: { slug: true, name: true } },
          participants: { include: { roundPlayer: { select: { id: true, displayName: true } } } },
        },
      });
      if (row.leaderId !== roundPlayerId) throw AppError.badRequest('OPERATION_NOT_LEADER', 'Only the leader invites crew.');
      if (row.status !== 'CREW_LOCK') throw AppError.conflict('OPERATION_BAD_STAGE', 'This operation is not locking crew.');
      const target = await tx.roundPlayer.findFirst({
        where: { publicPimpId: input.targetPublicPimpId, roundId: row.roundId },
        select: { id: true, displayName: true },
      });
      if (!target) throw AppError.notFound('PLAYER_NOT_FOUND', 'No crew with that number this season.');
      if (target.id === roundPlayerId) throw AppError.badRequest('OPERATION_INVITE_SELF', 'Lock the role yourself instead of inviting yourself.');
      const now = new Date();
      await reapExpired(tx, row.id, now);
      const seats = await tx.operationParticipant.findMany({ where: { operationId: row.id } });
      if (!seatOpen(seats, input.role, now)) throw AppError.conflict('OPERATION_ROLE_TAKEN', 'That role is already filled.');
      await tx.operationParticipant.upsert({
        where: { operationId_role: { operationId: row.id, role: input.role } },
        create: { operationId: row.id, roundPlayerId: target.id, role: input.role, status: 'INVITED', invitedById: roundPlayerId, expiresAt: new Date(now.getTime() + INVITE_TTL_HOURS * 3_600_000) },
        update: { roundPlayerId: target.id, status: 'INVITED', invitedById: roundPlayerId, expiresAt: new Date(now.getTime() + INVITE_TTL_HOURS * 3_600_000) },
      });
      await ActivityService.log(tx, target.id, 'GAME_ANNOUNCEMENT', {
        title: 'Operation invite',
        excerpt: `You are wanted as ${input.role} on a corner takeover. Answer before it expires.`,
        operationId: row.id,
        role: input.role,
      });
      const after = await tx.operation.findUniqueOrThrow({
        where: { id: row.id },
        include: {
          city: { select: { slug: true, name: true } },
          participants: { include: { roundPlayer: { select: { id: true, displayName: true } } } },
        },
      });
      return after;
    });
    return toDto(operation, operation.participants, roundPlayerId, new Date());
  },

  async answer(prisma: PrismaClient, roundPlayerId: string, input: OperationAnswerInputDto): Promise<OperationDto> {
    return prisma.$transaction(async (tx) => {
      const operation = await tx.operation.findUniqueOrThrow({
        where: { id: input.operationId },
        include: {
          city: { select: { slug: true, name: true } },
          participants: { include: { roundPlayer: { select: { id: true, displayName: true } } } },
        },
      });
      const now = new Date();
      await reapExpired(tx, operation.id, now);
      const seat = await tx.operationParticipant.findFirst({
        where: { operationId: operation.id, roundPlayerId, status: 'INVITED', expiresAt: { gt: now } },
      });
      if (!seat) throw AppError.notFound('OPERATION_INVITE_MISSING', 'No open invite for you on this operation.');
      await tx.operationParticipant.update({
        where: { id: seat.id },
        data: input.accept ? { status: 'ACCEPTED' } : { status: 'DECLINED' },
      });
      if (input.accept) await maybeReady(tx, operation.id, now);
      const after = await tx.operation.findUniqueOrThrow({
        where: { id: operation.id },
        include: {
          city: { select: { slug: true, name: true } },
          participants: { include: { roundPlayer: { select: { id: true, displayName: true } } } },
        },
      });
      return toDto(after, after.participants, roundPlayerId, now);
    });
  },

  async execute(prisma: PrismaClient, roundPlayerId: string, input: OperationExecuteInputDto): Promise<OperationDto> {
    return prisma.$transaction(async (tx) => {
      const operation = await tx.operation.findUniqueOrThrow({
        where: { id: input.operationId },
        include: {
          city: { select: { slug: true, name: true } },
          participants: { include: { roundPlayer: { select: { id: true, displayName: true } } } },
        },
      });
      if (operation.leaderId !== roundPlayerId) throw AppError.badRequest('OPERATION_NOT_LEADER', 'Only the leader runs the operation.');
      if (operation.status !== 'READY') throw AppError.conflict('OPERATION_NOT_READY', 'Fill every role before running the operation.');
      assertTransition(operation.status, 'EXECUTING');
      await tx.operation.update({ where: { id: operation.id }, data: { status: 'EXECUTING' } });
      const now = new Date();
      const crew = liveSeats(operation.participants, now);
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
          // Every story has a turn: a win carries one complication; a failed
          // operation still records the one role that did its job cleanly.
          const wentWrong = success ? role === pivotalRole : role !== pivotalRole;
          return {
            stage: role,
            detail: roleReportLine(role, !wentWrong, filledRoles.has(role)),
            wentWrong,
          };
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
      const after = await tx.operation.findUniqueOrThrow({
        where: { id: operation.id },
        include: {
          city: { select: { slug: true, name: true } },
          participants: { include: { roundPlayer: { select: { id: true, displayName: true } } } },
        },
      });
      return toDto(after, after.participants, roundPlayerId, now);
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
