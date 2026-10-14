import type { PrismaClient } from '@prisma/client';
import type { SupporterPollDto, SupporterPollOptionDto, SupporterPollStageInput, SupporterPollsDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { SupporterService } from './supporter.service.js';

interface PollOption {
  key: string;
  label: string;
  description?: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

function options(value: unknown): PollOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    return typeof row.key === 'string' && row.key && typeof row.label === 'string' && row.label
      ? [{ key: row.key, label: row.label, description: typeof row.description === 'string' ? row.description : null }]
      : [];
  });
}

function pollDto(row: {
  id: string;
  title: string;
  description: string | null;
  options: unknown;
  opensAt: Date;
  closesAt: Date | null;
  votes?: { accountId?: string; optionKey: string }[];
}, accountId: string, includeCounts = false): SupporterPollDto {
  const counts = new Map<string, number>();
  for (const vote of row.votes ?? []) counts.set(vote.optionKey, (counts.get(vote.optionKey) ?? 0) + 1);
  const myVote = row.votes?.find((vote) => vote.accountId === accountId)?.optionKey ?? null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    opensAt: row.opensAt.toISOString(),
    closesAt: row.closesAt?.toISOString() ?? null,
    myVote,
    options: options(row.options).map((option): SupporterPollOptionDto => ({
      key: option.key,
      label: option.label,
      description: option.description ?? null,
      ...(includeCounts ? { votes: counts.get(option.key) ?? 0 } : {}),
    })),
  };
}

async function activePoll(prisma: PrismaClient | Db, accountId: string, now: Date) {
  return prisma.supporterPoll.findFirst({
    where: {
      status: 'open',
      opensAt: { lte: now },
      OR: [{ closesAt: null }, { closesAt: { gt: now } }],
    },
    orderBy: [{ closesAt: 'asc' }, { createdAt: 'desc' }],
    include: { votes: { where: { accountId }, select: { accountId: true, optionKey: true } } },
  });
}

export const SupporterPollService = {
  async list(prisma: PrismaClient, accountId: string, now = new Date()): Promise<SupporterPollsDto> {
    const hasRewards = (await SupporterService.since(prisma, accountId)) !== null;
    if (!hasRewards) return { hasRewards, poll: null };
    const poll = await activePoll(prisma, accountId, now);
    return { hasRewards, poll: poll ? pollDto(poll, accountId) : null };
  },

  async stage(prisma: PrismaClient, actor: { id: string; username: string }, input: SupporterPollStageInput): Promise<SupporterPollDto> {
    if (input.options.length < 2) throw AppError.badRequest('POLL_OPTIONS_REQUIRED', 'Supporter polls need at least two options.');
    const keys = new Set(input.options.map((option) => option.key));
    if (keys.size !== input.options.length) throw AppError.badRequest('POLL_OPTION_KEYS_DUPLICATE', 'Supporter poll option keys must be unique.');
    const row = await prisma.supporterPoll.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        options: input.options.map((option) => ({ key: option.key, label: option.label, description: option.description ?? null })),
        opensAt: input.opensAt ? new Date(input.opensAt) : new Date(),
        closesAt: input.closesAt ? new Date(input.closesAt) : null,
        status: 'open',
      },
      include: { votes: true },
    });
    await prisma.adminAuditLog.create({
      data: {
        actorAccountId: actor.id,
        actorUsername: actor.username,
        action: 'supporter.poll.stage',
        targetType: 'supporter_poll',
        targetId: row.id,
        reason: input.title,
        after: { options: input.options.map((option) => option.key) },
      },
    });
    return pollDto(row, actor.id, true);
  },

  async vote(prisma: PrismaClient, accountId: string, pollId: string, optionKey: string, now = new Date()): Promise<SupporterPollsDto> {
    if (!(await SupporterService.since(prisma, accountId))) throw AppError.conflict('SUPPORTER_ONLY', 'Supporter votes are for supporters.');
    const poll = await prisma.supporterPoll.findFirst({
      where: { id: pollId, status: 'open', opensAt: { lte: now }, OR: [{ closesAt: null }, { closesAt: { gt: now } }] },
      include: { votes: { where: { accountId }, select: { accountId: true, optionKey: true } } },
    });
    if (!poll) throw AppError.notFound('POLL_NOT_FOUND', 'That supporter poll is not open.');
    if (!options(poll.options).some((option) => option.key === optionKey)) throw AppError.badRequest('POLL_OPTION_NOT_FOUND', 'That poll option does not exist.');
    try {
      await prisma.supporterVote.create({ data: { pollId, accountId, optionKey } });
    } catch (error) {
      if (isUniqueViolation(error)) throw AppError.conflict('ALREADY_VOTED', 'You already voted in this supporter poll.');
      throw error;
    }
    return SupporterPollService.list(prisma, accountId, now);
  },
};
