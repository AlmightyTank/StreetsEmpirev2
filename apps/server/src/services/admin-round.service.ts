import { Prisma, type PrismaClient, type Round } from '@prisma/client';
import { rulesets } from '@streets/rulesets';
import type { AdminRoundAction, AdminRoundDto, AdminRoundsDto } from '@streets/shared';
import { toRoundDto } from '../game/dto.js';
import { lockRound, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { RoundService } from './round.service.js';

const DAY_MS = 86_400_000;
const LIFECYCLE_TRANSACTION = { maxWait: 10_000, timeout: 60_000 };

const actionVerb: Record<AdminRoundAction, string> = {
  'open-registration': 'open registration',
  start: 'start',
  'end-early': 'end early',
  archive: 'be archived',
};

export interface ScheduleRoundInput {
  name: string;
  slug?: string | undefined;
  rulesetId: string;
  startsAt: Date;
  endsAt?: Date | undefined;
  registrationOpensAt?: Date | null | undefined;
}

/** The lifecycle: SCHEDULED -> REGISTRATION -> ACTIVE -> ENDED -> ARCHIVED. */
export function availableRoundActions(round: Pick<Round, 'status'>): AdminRoundAction[] {
  switch (round.status) {
    case 'SCHEDULED': return ['open-registration', 'start'];
    case 'REGISTRATION': return ['start', 'end-early'];
    case 'ACTIVE': return ['end-early'];
    case 'ENDED': return ['archive'];
    default: return [];
  }
}

type LiveRound = Pick<Round, 'id' | 'name' | 'startsAt'>;

export type StartDecision<T extends LiveRound> =
  | { ok: true; supersedes: T[] }
  | { ok: false; code: 'ROUND_WOULD_BE_SUPERSEDED' | 'ROUND_HANDOFF_REQUIRED'; message: string };

/**
 * The newest running round is the current one, and starting it closes older
 * running rounds. So a round cannot start behind a newer live round, and
 * starting in front of one is a handoff the admin has to confirm.
 */
export function startDecision<T extends LiveRound>(
  round: Pick<Round, 'id' | 'name'>,
  live: T[],
  startsAt: Date,
  confirmHandoff: boolean,
): StartDecision<T> {
  const others = live.filter((other) => other.id !== round.id);
  const newer = others.find((other) => other.startsAt.getTime() >= startsAt.getTime());
  if (newer) {
    return {
      ok: false,
      code: 'ROUND_WOULD_BE_SUPERSEDED',
      message: `${newer.name} started later and would close ${round.name} straight away. End ${newer.name} first.`,
    };
  }
  if (others.length && !confirmHandoff) {
    return {
      ok: false,
      code: 'ROUND_HANDOFF_REQUIRED',
      message: `Starting ${round.name} ends ${others.map((other) => other.name).join(', ')} and freezes final standings. Confirm the handoff to continue.`,
    };
  }
  return { ok: true, supersedes: others };
}

export function slugifyRoundName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
}

function toAdminRoundDto(round: Round, playerCount: number): AdminRoundDto {
  return { ...toRoundDto(round, playerCount), createdAt: round.createdAt.toISOString(), actions: availableRoundActions(round) };
}

export async function adminRound(prisma: PrismaClient, round: Round): Promise<AdminRoundDto> {
  return toAdminRoundDto(round, await RoundService.playerCount(prisma, round.id));
}

async function lockedRound(tx: Db, roundId: string, action: AdminRoundAction): Promise<Round> {
  await lockRound(tx, roundId);
  const round = await tx.round.findUnique({ where: { id: roundId } });
  if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
  if (!availableRoundActions(round).includes(action)) {
    throw AppError.conflict('ROUND_ACTION_NOT_ALLOWED', `${round.name} is ${round.status.toLowerCase()}, so it cannot ${actionVerb[action]}.`);
  }
  return round;
}

export const AdminRoundService = {
  async list(prisma: PrismaClient, now = new Date()): Promise<AdminRoundsDto> {
    await RoundService.closeExpired(prisma, now);
    const rows = await prisma.round.findMany({ orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }], take: 50 });
    const counts = await prisma.roundPlayer.groupBy({
      by: ['roundId'],
      where: { roundId: { in: rows.map((round) => round.id) }, account: { isActive: true } },
      _count: { _all: true },
    });
    const countFor = new Map(counts.map((row) => [row.roundId, row._count._all]));
    return {
      now: now.toISOString(),
      rounds: rows.map((round) => toAdminRoundDto(round, countFor.get(round.id) ?? 0)),
      rulesets: Object.values(rulesets)
        .map((ruleset) => ({ id: ruleset.meta.id, version: ruleset.meta.version, name: ruleset.meta.name }))
        .reverse(),
    };
  },

  async schedule(prisma: PrismaClient, actor: AuditActor, input: ScheduleRoundInput, now = new Date()): Promise<AdminRoundDto> {
    const ruleset = rulesets[input.rulesetId];
    if (!ruleset) throw AppError.badRequest('UNKNOWN_RULESET', 'Pick a ruleset from the list.', { rulesetId: 'Unknown ruleset.' });

    const endsAt = input.endsAt ?? new Date(input.startsAt.getTime() + ruleset.round.defaultDurationDays * DAY_MS);
    if (endsAt.getTime() <= input.startsAt.getTime()) {
      throw AppError.badRequest('INVALID_ROUND_WINDOW', 'The round has to end after it starts.', { endsAt: 'Must be after the start.' });
    }
    if (endsAt.getTime() <= now.getTime()) {
      throw AppError.badRequest('INVALID_ROUND_WINDOW', 'That round would already be over.', { endsAt: 'Must be in the future.' });
    }
    const registrationOpensAt = input.registrationOpensAt ?? null;
    if (registrationOpensAt && registrationOpensAt.getTime() > input.startsAt.getTime()) {
      throw AppError.badRequest('INVALID_ROUND_WINDOW', 'Registration has to open before the round starts.', { registrationOpensAt: 'Must be before the start.' });
    }
    const slug = input.slug ?? slugifyRoundName(input.name);
    if (!slug) throw AppError.badRequest('INVALID_ROUND_SLUG', 'Give the round a name with letters or numbers.', { slug: 'Required.' });

    try {
      const round = await prisma.$transaction(async (tx) => {
        const created = await tx.round.create({
          data: {
            name: input.name,
            slug,
            rulesetId: ruleset.meta.id,
            rulesetVersion: ruleset.meta.version,
            status: 'SCHEDULED',
            startsAt: input.startsAt,
            endsAt,
            registrationOpensAt,
            nextPublicPimpId: ruleset.round.publicPimpIdStart,
          },
        });
        await AdminAuditService.record(tx, actor, { action: 'round.schedule', targetType: 'round', targetId: created.id, after: created });
        return created;
      });
      return toAdminRoundDto(round, 0);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppError.conflict('ROUND_SLUG_TAKEN', 'Another round already uses that slug.', { slug: 'Already in use.' });
      }
      throw error;
    }
  },

  async openRegistration(prisma: PrismaClient, actor: AuditActor, roundId: string, now = new Date()): Promise<AdminRoundDto> {
    const round = await prisma.$transaction(async (tx) => {
      const before = await lockedRound(tx, roundId, 'open-registration');
      if (before.endsAt.getTime() <= now.getTime()) throw AppError.conflict('ROUND_ALREADY_OVER', `${before.name} is already past its end date.`);
      const opened = await tx.round.update({
        where: { id: before.id },
        data: {
          status: 'REGISTRATION',
          ...(!before.registrationOpensAt || before.registrationOpensAt.getTime() > now.getTime() ? { registrationOpensAt: now } : {}),
        },
      });
      await AdminAuditService.record(tx, actor, { action: 'round.open-registration', targetType: 'round', targetId: before.id, before, after: opened });
      return opened;
    }, LIFECYCLE_TRANSACTION);
    return adminRound(prisma, round);
  },

  async start(
    prisma: PrismaClient,
    actor: AuditActor,
    roundId: string,
    options: { confirmHandoff: boolean },
    now = new Date(),
  ): Promise<AdminRoundDto> {
    const round = await prisma.$transaction(async (tx) => {
      // One round start at a time, so two admins cannot open two seasons at once.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(3002)`;
      const before = await lockedRound(tx, roundId, 'start');
      if (before.endsAt.getTime() <= now.getTime()) throw AppError.conflict('ROUND_ALREADY_OVER', `${before.name} is already past its end date.`);

      const startsAt = new Date(Math.min(before.startsAt.getTime(), now.getTime()));
      const live = await tx.round.findMany({
        where: { status: 'ACTIVE', endsAt: { gt: now }, id: { not: before.id } },
        orderBy: { startsAt: 'asc' },
      });
      const decision = startDecision(before, live, startsAt, options.confirmHandoff);
      if (!decision.ok) throw AppError.conflict(decision.code, decision.message);

      for (const other of decision.supersedes) {
        const result = await RoundService.closeRoundInTransaction(tx, other.id, now, { endsAt: now });
        if (!result.closed) continue;
        await AdminAuditService.record(tx, actor, {
          action: 'round.handoff-close',
          targetType: 'round',
          targetId: other.id,
          reason: `Handed off to ${before.name}.`,
          before: result.previous,
          after: result.round,
        });
      }

      const started = await tx.round.update({
        where: { id: before.id },
        data: {
          status: 'ACTIVE',
          startsAt,
          ...(before.registrationOpensAt && before.registrationOpensAt.getTime() > now.getTime() ? { registrationOpensAt: now } : {}),
        },
      });
      await AdminAuditService.record(tx, actor, { action: 'round.start', targetType: 'round', targetId: before.id, before, after: started });
      return started;
    }, LIFECYCLE_TRANSACTION);
    return adminRound(prisma, round);
  },

  /** Early ends settle and freeze like a normal finish, so final awards still apply. */
  async endEarly(prisma: PrismaClient, actor: AuditActor, roundId: string, reason: string, now = new Date()): Promise<AdminRoundDto> {
    const round = await prisma.$transaction(async (tx) => {
      await lockedRound(tx, roundId, 'end-early');
      const result = await RoundService.closeRoundInTransaction(tx, roundId, now, { endsAt: now });
      if (!result.closed) throw AppError.conflict('ROUND_ACTION_NOT_ALLOWED', `${result.round.name} is no longer running.`);
      await AdminAuditService.record(tx, actor, {
        action: 'round.end-early',
        targetType: 'round',
        targetId: roundId,
        reason,
        before: result.previous,
        after: result.round,
      });
      return result.round;
    }, LIFECYCLE_TRANSACTION);
    return adminRound(prisma, round);
  },

  async archive(prisma: PrismaClient, actor: AuditActor, roundId: string): Promise<AdminRoundDto> {
    const round = await prisma.$transaction(async (tx) => {
      const before = await lockedRound(tx, roundId, 'archive');
      const archived = await tx.round.update({ where: { id: before.id }, data: { status: 'ARCHIVED' } });
      await AdminAuditService.record(tx, actor, { action: 'round.archive', targetType: 'round', targetId: before.id, before, after: archived });
      return archived;
    }, LIFECYCLE_TRANSACTION);
    return adminRound(prisma, round);
  },

  /**
   * Rename a round or move its dates before it finishes. A running round keeps
   * its start date, and a new end date has to be in the future (End early
   * finishes a round now). Moving the end past the next day re-arms the Discord
   * "ending soon" alert.
   */
  async update(prisma: PrismaClient, actor: AuditActor, roundId: string, input: RoundUpdateInput, now = new Date()): Promise<AdminRoundDto> {
    const round = await prisma.$transaction(async (tx) => {
      await lockRound(tx, roundId);
      const before = await tx.round.findUnique({ where: { id: roundId } });
      if (!before) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
      if (before.status === 'ENDED' || before.status === 'ARCHIVED') {
        throw AppError.conflict('ROUND_FINISHED', `${before.name} has finished, so its details are frozen.`);
      }

      const name = input.name ?? before.name;
      const startsAt = input.startsAt ?? before.startsAt;
      const endsAt = input.endsAt ?? before.endsAt;
      const registrationOpensAt = input.registrationOpensAt === undefined ? before.registrationOpensAt : input.registrationOpensAt;
      const startMoved = startsAt.getTime() !== before.startsAt.getTime();
      const endMoved = endsAt.getTime() !== before.endsAt.getTime();

      if (before.status === 'ACTIVE' && startMoved) {
        throw AppError.conflict('ROUND_ALREADY_STARTED', `${before.name} is already running, so its start date is fixed.`);
      }
      if (endsAt.getTime() <= startsAt.getTime()) {
        throw AppError.badRequest('INVALID_ROUND_WINDOW', 'The round has to end after it starts.', { endsAt: 'Must be after the start.' });
      }
      if (endMoved && endsAt.getTime() <= now.getTime()) {
        throw AppError.badRequest('INVALID_ROUND_WINDOW', 'The new end date has to be in the future. Use End early to finish a round now.', { endsAt: 'Must be in the future.' });
      }
      if (registrationOpensAt && registrationOpensAt.getTime() > startsAt.getTime()) {
        throw AppError.badRequest('INVALID_ROUND_WINDOW', 'Registration has to open before the round starts.', { registrationOpensAt: 'Must be before the start.' });
      }
      const changed = name !== before.name || startMoved || endMoved
        || (registrationOpensAt?.getTime() ?? null) !== (before.registrationOpensAt?.getTime() ?? null);
      if (!changed) throw AppError.badRequest('NO_CHANGES', 'Nothing changed on that round.');

      const rearmEndingSoon = Boolean(before.discordEndingSoonAt) && endMoved && endsAt.getTime() > now.getTime() + DAY_MS;
      const updated = await tx.round.update({
        where: { id: before.id },
        data: { name, startsAt, endsAt, registrationOpensAt, ...(rearmEndingSoon ? { discordEndingSoonAt: null } : {}) },
      });
      await AdminAuditService.record(tx, actor, { action: 'round.update', targetType: 'round', targetId: before.id, reason: input.reason, before, after: updated });
      return updated;
    }, LIFECYCLE_TRANSACTION);
    return adminRound(prisma, round);
  },

  /** Season checklist action: close every round past its end date now instead of waiting for a visitor. */
  async closeExpiredNow(prisma: PrismaClient, actor: AuditActor, now = new Date()): Promise<AdminRoundDto[]> {
    const closed = await RoundService.closeExpired(prisma, now);
    if (closed.length) {
      await prisma.$transaction(async (tx) => {
        for (const round of closed) {
          await AdminAuditService.record(tx, actor, {
            action: 'round.close-expired',
            targetType: 'round',
            targetId: round.id,
            reason: 'Closed from the season checklist.',
            after: round,
          });
        }
      });
    }
    return Promise.all(closed.map((round) => adminRound(prisma, round)));
  },
};

export interface RoundUpdateInput {
  reason: string;
  name?: string | undefined;
  startsAt?: Date | undefined;
  endsAt?: Date | undefined;
  registrationOpensAt?: Date | null | undefined;
}
