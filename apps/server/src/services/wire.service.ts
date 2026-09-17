import type { AllianceWirePost, PrismaClient, RoundPlayer } from '@prisma/client';
import {
  WIRE_COOLDOWN_SECONDS,
  WIRE_PAGE_SIZE,
  wirePostSchema,
  type AdminWireDto,
  type AllianceWireDto,
  type WirePostDto,
} from '@streets/shared';
import { loadRulesetForRound } from '@streets/rules-engine';
import { lockRoundPlayer } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';

type Author = Pick<RoundPlayer, 'id' | 'publicPimpId' | 'displayName'>;

function roundOpen(round: { status: string; endsAt: Date }, now: Date): boolean {
  return (round.status === 'ACTIVE' || round.status === 'REGISTRATION') && round.endsAt > now;
}

/** The wire belongs to the alliance's current members only; anyone who left loses it at once. */
async function membership(prisma: PrismaClient, playerId: string) {
  const player = await prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId }, include: { round: true, alliance: true } });
  if (!loadRulesetForRound(player.round).alliances) throw AppError.conflict('ALLIANCES_DISABLED', 'Alliances are not part of this round.');
  if (!player.alliance || player.alliance.disbandedAt) throw AppError.conflict('NOT_IN_ALLIANCE', 'Join an alliance to read its wire.');
  return { player, alliance: player.alliance, round: player.round };
}

function toPostDto(post: AllianceWirePost & { author: Author }, viewerId: string, viewerLeads: boolean): WirePostDto {
  const isYours = post.authorId === viewerId;
  return {
    id: post.id,
    author: { publicPimpId: post.author.publicPimpId, displayName: post.author.displayName },
    body: post.body,
    createdAt: post.createdAt.toISOString(),
    canRemove: isYours || viewerLeads,
    isYours,
  };
}

export const WireService = {
  async list(prisma: PrismaClient, playerId: string, before?: string): Promise<AllianceWireDto> {
    const { player, alliance, round } = await membership(prisma, playerId);
    const now = new Date();
    const cursor = before ? await prisma.allianceWirePost.findFirst({ where: { id: before, allianceId: alliance.id } }) : null;
    if (before && !cursor) throw AppError.notFound('WIRE_POST_NOT_FOUND', 'That part of the wire is no longer there.');
    const [rows, last] = await Promise.all([
      prisma.allianceWirePost.findMany({
        where: {
          allianceId: alliance.id,
          removedAt: null,
          ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
        },
        include: { author: { select: { id: true, publicPimpId: true, displayName: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: WIRE_PAGE_SIZE + 1,
      }),
      prisma.allianceWirePost.findFirst({ where: { authorId: player.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);
    const leads = alliance.leaderId === player.id;
    const cooldownUntil = last ? new Date(last.createdAt.getTime() + WIRE_COOLDOWN_SECONDS * 1000) : null;
    return {
      posts: rows.slice(0, WIRE_PAGE_SIZE).map((row) => toPostDto(row, player.id, leads)),
      nextBefore: rows.length > WIRE_PAGE_SIZE ? rows[WIRE_PAGE_SIZE - 1]!.id : null,
      cooldownUntil: cooldownUntil && cooldownUntil > now ? cooldownUntil.toISOString() : null,
      roundOpen: roundOpen(round, now),
    };
  },

  /** The author's row is locked while the cooldown is checked, so two quick posts cannot both land. */
  async post(prisma: PrismaClient, playerId: string, rawInput: unknown): Promise<AllianceWireDto> {
    const input = wirePostSchema.parse(rawInput);
    const { round } = await membership(prisma, playerId);
    if (!roundOpen(round, new Date())) throw AppError.conflict('ROUND_NOT_PLAYABLE', `${round.name} is closed. The wire is read-only now.`);
    await prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, playerId);
      const me = await tx.roundPlayer.findUniqueOrThrow({ where: { id: playerId }, include: { alliance: true } });
      if (!me.alliance || me.alliance.disbandedAt) throw AppError.conflict('NOT_IN_ALLIANCE', 'Join an alliance to post on its wire.');
      const now = new Date();
      const last = await tx.allianceWirePost.findFirst({ where: { authorId: me.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      if (last && now.getTime() - last.createdAt.getTime() < WIRE_COOLDOWN_SECONDS * 1000) {
        throw AppError.conflict('WIRE_COOLDOWN', `Give it ${WIRE_COOLDOWN_SECONDS} seconds between posts.`);
      }
      await tx.allianceWirePost.create({ data: { allianceId: me.alliance.id, authorId: me.id, body: input.body, createdAt: now } });
    });
    return WireService.list(prisma, playerId);
  },

  /** Authors remove their own posts; the leader can remove any post on their alliance's wire. */
  async remove(prisma: PrismaClient, playerId: string, postId: string): Promise<AllianceWireDto> {
    const { player, alliance } = await membership(prisma, playerId);
    const post = await prisma.allianceWirePost.findFirst({ where: { id: postId, allianceId: alliance.id, removedAt: null } });
    if (!post) throw AppError.notFound('WIRE_POST_NOT_FOUND', 'That post is already gone.');
    const role = post.authorId === player.id ? 'author' : alliance.leaderId === player.id ? 'leader' : null;
    if (!role) throw AppError.forbidden('Only the author or the alliance leader can remove that post.');
    await prisma.allianceWirePost.updateMany({
      where: { id: post.id, removedAt: null },
      data: { removedAt: new Date(), removedByName: player.displayName, removedByRole: role },
    });
    return WireService.list(prisma, playerId);
  },

  /** Admins see removed posts too, with who removed them and why. */
  async adminList(prisma: PrismaClient, allianceId: string): Promise<AdminWireDto> {
    const alliance = await prisma.alliance.findUnique({ where: { id: allianceId } });
    if (!alliance) throw AppError.notFound('ALLIANCE_NOT_FOUND', 'That alliance does not exist.');
    const posts = await prisma.allianceWirePost.findMany({
      where: { allianceId },
      include: { author: { select: { id: true, publicPimpId: true, displayName: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    return {
      alliance: { name: alliance.name, tag: alliance.tag },
      posts: posts.map((post) => ({
        id: post.id,
        author: { publicPimpId: post.author.publicPimpId, displayName: post.author.displayName, roundPlayerId: post.author.id },
        body: post.body,
        createdAt: post.createdAt.toISOString(),
        removedAt: post.removedAt?.toISOString() ?? null,
        removedByName: post.removedByName,
        removedByRole: post.removedByRole as 'author' | 'leader' | 'admin' | null,
        removedReason: post.removedReason,
      })),
    };
  },

  async adminRemove(prisma: PrismaClient, actor: AuditActor, postId: string, reason: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const post = await tx.allianceWirePost.findUnique({ where: { id: postId } });
      if (!post) throw AppError.notFound('WIRE_POST_NOT_FOUND', 'That post does not exist.');
      if (post.removedAt) throw AppError.conflict('WIRE_POST_REMOVED', 'That post was already removed.');
      await tx.allianceWirePost.update({ where: { id: postId }, data: { removedAt: new Date(), removedByName: actor.username, removedByRole: 'admin', removedReason: reason } });
      await AdminAuditService.record(tx, actor, { action: 'wire.remove', targetType: 'wire-post', targetId: postId, reason,
        before: { allianceId: post.allianceId, authorId: post.authorId, body: post.body, createdAt: post.createdAt }, after: { removed: true } });
    });
  },
};
