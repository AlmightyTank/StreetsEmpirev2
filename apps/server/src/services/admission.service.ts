import type { AdmissionSettings, Prisma, PrismaClient } from '@prisma/client';
import { ActiveSupporterService } from './active-supporter.service.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

type Db = PrismaClient | Prisma.TransactionClient;
type Lane = 'SUPPORTER' | 'STANDARD';

function activeSettings(settings: AdmissionSettings): boolean {
  return env.admission.enabled && settings.enabled && settings.capacity !== null && settings.capacity > 0;
}

async function settings(db: Db, roundId: string): Promise<AdmissionSettings> {
  return db.admissionSettings.upsert({
    where: { roundId },
    create: { roundId },
    update: {},
  });
}

async function clearExpired(db: Db, roundId: string, now: Date): Promise<void> {
  await db.admissionLease.deleteMany({ where: { roundId, expiresAt: { lte: now } } });
  await db.admissionTicket.deleteMany({ where: { roundId, canceledAt: { not: null } } });
}

async function serializable<T>(db: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(work, { isolationLevel: 'Serializable' });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2034' || attempt === 2) throw error;
    }
  }
  throw new Error('Admission transaction retry exhausted.');
}

export function chooseLane(sequence: number, supporterAvailable: boolean, standardAvailable: boolean, priority: boolean): Lane | null {
  if (!supporterAvailable && !standardAvailable) return null;
  if (!priority || !supporterAvailable) return standardAvailable ? 'STANDARD' : 'SUPPORTER';
  if (!standardAvailable) return 'SUPPORTER';
  return sequence % 4 === 3 ? 'STANDARD' : 'SUPPORTER';
}

async function promote(db: Db, roundId: string, now: Date): Promise<void> {
  const locked = await db.admissionSettings.findUnique({ where: { roundId } });
  if (!locked || !activeSettings(locked)) return;

  await clearExpired(db, roundId, now);
  const activeCount = await db.admissionLease.count({ where: { roundId, expiresAt: { gt: now } } });
  const room = Math.max(0, locked.capacity! - activeCount);
  for (let i = 0; i < room; i += 1) {
    const [supporter, standard] = await Promise.all([
      db.admissionTicket.findFirst({ where: { roundId, canceledAt: null, admittedAt: null, lane: 'SUPPORTER' }, orderBy: { enqueuedAt: 'asc' } }),
      db.admissionTicket.findFirst({ where: { roundId, canceledAt: null, admittedAt: null, lane: 'STANDARD' }, orderBy: { enqueuedAt: 'asc' } }),
    ]);
    const supporterEligible = Boolean(supporter && await ActiveSupporterService.has(db as PrismaClient, supporter.accountId, now, true));
    if (supporter && !supporterEligible) await db.admissionTicket.update({ where: { id: supporter.id }, data: { lane: 'STANDARD' } });
    const standardAvailable = Boolean(standard || (supporter && !supporterEligible));
    const chosen = chooseLane(locked.rotationSequence, supporterEligible, standardAvailable, locked.supporterPriority && env.admission.supporterPriority);
    const ticket = chosen === 'SUPPORTER' ? supporter : standard ?? (supporter && !supporterEligible ? supporter : null);
    if (!ticket) break;
    const expiresAt = new Date(now.getTime() + env.admission.leaseMs);
    await db.admissionLease.create({ data: { accountId: ticket.accountId, roundId, expiresAt } });
    await db.admissionTicket.update({ where: { id: ticket.id }, data: { admittedAt: now } });
    await db.admissionSettings.update({ where: { roundId }, data: { rotationSequence: { increment: 1 }, lastPromotionAt: now } });
    locked.rotationSequence += 1;
  }
}

export const AdmissionService = {
  async join(db: PrismaClient, accountId: string, roundId: string, now = new Date()) {
    return serializable(db, async (tx) => {
      const current = await settings(tx, roundId);
      if (!activeSettings(current)) return { state: 'disabled' as const };
      await clearExpired(tx, roundId, now);
      const lease = await tx.admissionLease.findUnique({ where: { accountId_roundId: { accountId, roundId } } });
      if (lease && lease.expiresAt > now) return { state: 'admitted' as const, expiresAt: lease.expiresAt.toISOString() };
      const supporter = current.supporterPriority && env.admission.supporterPriority
        ? await ActiveSupporterService.has(tx as PrismaClient, accountId, now, true) : false;
      const ticket = await tx.admissionTicket.upsert({
        where: { accountId_roundId: { accountId, roundId } },
        create: { accountId, roundId, lane: supporter ? 'SUPPORTER' : 'STANDARD', enqueuedAt: now },
        update: { canceledAt: null, lane: supporter ? 'SUPPORTER' : undefined },
      });
      await promote(tx, roundId, now);
      const admitted = await tx.admissionLease.findUnique({ where: { accountId_roundId: { accountId, roundId } } });
      if (admitted) return { state: 'admitted' as const, expiresAt: admitted.expiresAt.toISOString() };
      const position = await tx.admissionTicket.count({ where: { roundId, canceledAt: null, admittedAt: null, enqueuedAt: { lt: ticket.enqueuedAt } } }) + 1;
      return { state: 'queued' as const, position, lane: ticket.lane as Lane, enqueuedAt: ticket.enqueuedAt.toISOString() };
    });
  },

  async status(db: PrismaClient, accountId: string, roundId: string, now = new Date()) {
    return serializable(db, async (tx) => {
      const current = await settings(tx, roundId);
      if (!activeSettings(current)) return { state: 'disabled' as const };
      await clearExpired(tx, roundId, now);
      await promote(tx, roundId, now);
      const lease = await tx.admissionLease.findUnique({ where: { accountId_roundId: { accountId, roundId } } });
      if (lease) return { state: 'admitted' as const, expiresAt: lease.expiresAt.toISOString() };
      const ticket = await tx.admissionTicket.findUnique({ where: { accountId_roundId: { accountId, roundId } } });
      if (!ticket) return { state: 'not-queued' as const };
      const ahead = await tx.admissionTicket.count({ where: { roundId, canceledAt: null, admittedAt: null, enqueuedAt: { lt: ticket.enqueuedAt } } });
      return { state: 'queued' as const, position: ahead + 1, lane: ticket.lane as Lane, enqueuedAt: ticket.enqueuedAt.toISOString() };
    });
  },

  async renew(db: PrismaClient, accountId: string, roundId: string, now = new Date()) {
    const current = await settings(db, roundId);
    if (!activeSettings(current)) return { state: 'disabled' as const };
    const lease = await db.admissionLease.updateMany({ where: { accountId, roundId, expiresAt: { gt: now } }, data: { renewedAt: now, expiresAt: new Date(now.getTime() + env.admission.leaseMs) } });
    if (!lease.count) {
      await db.admissionSettings.update({ where: { roundId }, data: { renewalFailures: { increment: 1 }, lastRenewalFailureAt: now } });
      throw AppError.conflict('ADMISSION_LEASE_EXPIRED', 'Your game admission expired. Rejoin the waiting room.');
    }
    const next = await db.admissionLease.findUniqueOrThrow({ where: { accountId_roundId: { accountId, roundId } } });
    return { state: 'admitted' as const, expiresAt: next.expiresAt.toISOString() };
  },

  async leave(db: PrismaClient, accountId: string, roundId: string): Promise<void> {
    await db.$transaction([
      db.admissionLease.deleteMany({ where: { accountId, roundId } }),
      db.admissionTicket.deleteMany({ where: { accountId, roundId } }),
    ]);
  },

  async requireAdmission(db: PrismaClient, accountId: string, roundId: string, now = new Date()): Promise<void> {
    const current = await settings(db, roundId);
    if (!activeSettings(current)) return;
    const lease = await db.admissionLease.findUnique({ where: { accountId_roundId: { accountId, roundId } } });
    if (!lease || lease.expiresAt <= now) throw new AppError(423, 'ADMISSION_REQUIRED', 'The game is at capacity. Join the waiting room to continue.');
    if (lease.expiresAt.getTime() - now.getTime() < env.admission.leaseMs / 2) {
      await db.admissionLease.updateMany({ where: { accountId, roundId, expiresAt: { gt: now } }, data: { renewedAt: now, expiresAt: new Date(now.getTime() + env.admission.leaseMs) } });
    }
  },

  async adminSnapshot(db: PrismaClient, roundId: string, now = new Date()) {
    const current = await settings(db, roundId);
    const staleLeases = await db.admissionLease.count({ where: { roundId, expiresAt: { lte: now } } });
    await clearExpired(db, roundId, now);
    const [admitted, queued, supporter, standard, oldest] = await Promise.all([
      db.admissionLease.count({ where: { roundId, expiresAt: { gt: now } } }),
      db.admissionTicket.count({ where: { roundId, canceledAt: null, admittedAt: null } }),
      db.admissionTicket.count({ where: { roundId, lane: 'SUPPORTER', canceledAt: null, admittedAt: null } }),
      db.admissionTicket.count({ where: { roundId, lane: 'STANDARD', canceledAt: null, admittedAt: null } }),
      db.admissionTicket.findFirst({ where: { roundId, canceledAt: null, admittedAt: null }, orderBy: { enqueuedAt: 'asc' }, select: { enqueuedAt: true } }),
    ]);
    return { roundId, settings: current, admitted, queued, supporter, standard, staleLeases, failedRenewals: current.renewalFailures, lastRenewalFailureAt: current.lastRenewalFailureAt?.toISOString() ?? null, lastPromotionAt: current.lastPromotionAt?.toISOString() ?? null, oldestTicketAt: oldest?.enqueuedAt.toISOString() ?? null };
  },

  async configure(db: PrismaClient, roundId: string, input: { enabled?: boolean; supporterPriority?: boolean; capacity?: number | null }) {
    return db.admissionSettings.upsert({ where: { roundId }, create: { roundId, ...input }, update: input });
  },
};
