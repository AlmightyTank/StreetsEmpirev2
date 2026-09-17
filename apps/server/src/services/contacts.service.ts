import type { PrismaClient } from '@prisma/client';
import {
  CONTACTS_MAX,
  addContactSchema,
  updateContactSchema,
  type ContactDto,
  type ContactLookupDto,
  type ContactsDto,
} from '@streets/shared';
import { lockRoundPlayer } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { allianceTagDto } from './alliance.service.js';

const targetInclude = {
  target: {
    include: {
      city: { select: { name: true } },
      alliance: { select: { name: true, tag: true } },
      account: { select: { isActive: true } },
    },
  },
} as const;

async function withStanding(prisma: PrismaClient, rows: Array<{
  note: string;
  createdAt: Date;
  target: { roundId: string; publicPimpId: number; displayName: string; netWorthCents: bigint; lastActiveAt: Date;
    city: { name: string }; alliance: { name: string; tag: string } | null; account: { isActive: boolean } };
}>): Promise<ContactDto[]> {
  const ahead = await Promise.all(rows.map((row) => row.target.account.isActive
    ? prisma.roundPlayer.count({ where: { roundId: row.target.roundId, netWorthCents: { gt: row.target.netWorthCents }, account: { isActive: true } } })
    : Promise.resolve(0)));
  return rows.map((row, index) => ({
    publicPimpId: row.target.publicPimpId,
    displayName: row.target.displayName,
    alliance: row.target.account.isActive ? allianceTagDto(row.target.alliance) : null,
    note: row.note,
    addedAt: row.createdAt.toISOString(),
    // Only what anyone could read off rankings and profiles. Never private intel.
    standing: row.target.account.isActive ? {
      netWorthCents: Number(row.target.netWorthCents),
      nationalRank: ahead[index]! + 1,
      city: row.target.city.name,
      lastActiveAt: row.target.lastActiveAt.toISOString(),
    } : null,
  }));
}

async function findTarget(prisma: PrismaClient, ownerId: string, publicPimpId: number) {
  const owner = await prisma.roundPlayer.findUniqueOrThrow({ where: { id: ownerId }, select: { id: true, roundId: true } });
  const target = await prisma.roundPlayer.findFirst({ where: { roundId: owner.roundId, publicPimpId }, select: { id: true, account: { select: { isActive: true } } } });
  if (!target) throw AppError.notFound('TARGET_NOT_FOUND', 'That player is not in this round.');
  return { owner, target };
}

/** 0.3.0-D. A private rolodex per round player. Nobody else can see who you track or what you wrote. */
export const ContactsService = {
  async list(prisma: PrismaClient, ownerId: string): Promise<ContactsDto> {
    const rows = await prisma.playerContact.findMany({ where: { ownerId }, include: targetInclude, orderBy: { updatedAt: 'desc' } });
    return { contacts: await withStanding(prisma, rows), max: CONTACTS_MAX };
  },

  async lookup(prisma: PrismaClient, ownerId: string, publicPimpId: number): Promise<ContactLookupDto> {
    const { owner, target } = await findTarget(prisma, ownerId, publicPimpId);
    const [row, count] = await Promise.all([
      prisma.playerContact.findUnique({ where: { ownerId_targetId: { ownerId: owner.id, targetId: target.id } }, include: targetInclude }),
      prisma.playerContact.count({ where: { ownerId } }),
    ]);
    return {
      contact: row ? (await withStanding(prisma, [row]))[0]! : null,
      isYou: target.id === owner.id,
      full: count >= CONTACTS_MAX,
    };
  },

  /** Adding someone already in the rolodex just updates the note. The cap is checked under the owner's lock. */
  async add(prisma: PrismaClient, ownerId: string, rawInput: unknown): Promise<ContactsDto> {
    const input = addContactSchema.parse(rawInput);
    const { owner, target } = await findTarget(prisma, ownerId, input.targetPublicPimpId);
    if (target.id === owner.id) throw AppError.badRequest('INVALID_TARGET', 'You cannot add yourself to your contacts.');
    if (!target.account.isActive) throw AppError.notFound('TARGET_NOT_FOUND', 'That player is not in this round.');
    await prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, owner.id);
      const existing = await tx.playerContact.findUnique({ where: { ownerId_targetId: { ownerId: owner.id, targetId: target.id } } });
      if (existing) {
        if (input.note !== undefined) await tx.playerContact.update({ where: { id: existing.id }, data: { note: input.note } });
        return;
      }
      if (await tx.playerContact.count({ where: { ownerId: owner.id } }) >= CONTACTS_MAX) {
        throw AppError.conflict('CONTACTS_FULL', `Your contacts are full (${CONTACTS_MAX}). Remove someone first.`);
      }
      await tx.playerContact.create({ data: { ownerId: owner.id, targetId: target.id, note: input.note ?? '' } });
    });
    return ContactsService.list(prisma, ownerId);
  },

  async updateNote(prisma: PrismaClient, ownerId: string, publicPimpId: number, rawInput: unknown): Promise<ContactsDto> {
    const input = updateContactSchema.parse(rawInput);
    const { owner, target } = await findTarget(prisma, ownerId, publicPimpId);
    const updated = await prisma.playerContact.updateMany({ where: { ownerId: owner.id, targetId: target.id }, data: { note: input.note } });
    if (!updated.count) throw AppError.notFound('CONTACT_NOT_FOUND', 'That player is not in your contacts.');
    return ContactsService.list(prisma, ownerId);
  },

  async remove(prisma: PrismaClient, ownerId: string, publicPimpId: number): Promise<ContactsDto> {
    const { owner, target } = await findTarget(prisma, ownerId, publicPimpId);
    await prisma.playerContact.deleteMany({ where: { ownerId: owner.id, targetId: target.id } });
    return ContactsService.list(prisma, ownerId);
  },
};
