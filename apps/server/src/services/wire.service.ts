import type { AllianceWirePost, PrismaClient, Round, RoundPlayer } from '@prisma/client';
import {
  WIRE_COOLDOWN_SECONDS,
  WIRE_PAGE_SIZE,
  wirePostSchema,
  wirePinSchema,
  type AllianceCoordinationCardDto,
  type AdminWireDto,
  type AllianceWireDto,
  type WirePostDto,
} from '@streets/shared';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { DistrictKey } from '@streets/rulesets';
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
  const kind = post.kind === 'ANNOUNCEMENT' ? 'ANNOUNCEMENT' : 'MESSAGE';
  return {
    id: post.id,
    author: { publicPimpId: post.author.publicPimpId, displayName: post.author.displayName },
    body: post.body,
    kind,
    pinned: post.pinned,
    createdAt: post.createdAt.toISOString(),
    canRemove: isYours || viewerLeads,
    canPin: viewerLeads && kind === 'ANNOUNCEMENT',
    isYours,
  };
}

const cityName = (ruleset: ReturnType<typeof loadRulesetForRound>, slug: string) => ruleset.cities?.[slug]?.name ?? slug;
const districtName = (ruleset: ReturnType<typeof loadRulesetForRound>, city: string, district: string) =>
  ruleset.cities?.[city]?.districts?.[district as DistrictKey]?.name
  ?? ruleset.districts[district as DistrictKey]?.name
  ?? district;
const turfHref = (city: string) => `/game/turf?city=${encodeURIComponent(city)}`;

async function coordinationCards(prisma: PrismaClient, player: RoundPlayer & { round: Round }, alliance: { id: string; description: string; recruitmentStatus: string }, now: Date): Promise<AllianceCoordinationCardDto[]> {
  const ruleset = loadRulesetForRound(player.round);
  const cards: AllianceCoordinationCardDto[] = [];

  if (alliance.recruitmentStatus !== 'CLOSED') {
    cards.push({
      id: `recruitment:${alliance.id}`,
      kind: 'RECRUITMENT',
      title: alliance.recruitmentStatus === 'OPEN' ? 'Recruitment open' : 'Recruitment by invite',
      detail: alliance.description.trim() || 'Leadership has not posted a crew description yet.',
      at: now.toISOString(),
      actionLabel: 'Open alliance',
      href: '/game/alliance',
      tone: alliance.recruitmentStatus === 'OPEN' ? 'good' : 'info',
    });
  }

  if (ruleset.combat && ruleset.alliances?.sharedIntel) {
    const intel = await prisma.combatIntel.findMany({
      where: {
        expiresAt: { gt: now },
        observerId: { not: player.id },
        observer: { allianceId: alliance.id },
      },
      include: {
        observer: { select: { displayName: true } },
        target: { select: { publicPimpId: true, displayName: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
    });
    for (const row of intel) {
      cards.push({
        id: `intel:${row.id}`,
        kind: 'SHARED_RECON',
        title: `Shared recon: ${row.target.displayName}`,
        detail: `${row.observer.displayName} has a fresh report on #${row.target.publicPimpId}.`,
        at: row.createdAt.toISOString(),
        actionLabel: 'Open combat',
        href: '/game/combat',
        tone: 'info',
      });
    }
  }

  if (ruleset.turf?.wars) {
    const pushes = await prisma.turfPush.findMany({
      where: {
        roundId: player.roundId,
        status: 'PENDING',
        landsAt: { gt: now },
        OR: [
          { defenderAllianceId: alliance.id, alliesCalledAt: { not: null } },
          { attackerAllianceId: alliance.id },
        ],
      },
      include: {
        turf: { include: { city: { select: { slug: true, name: true } } } },
        attacker: { select: { displayName: true } },
        defender: { select: { displayName: true } },
        backups: { select: { kind: true, thugs: true } },
      },
      orderBy: [{ landsAt: 'asc' }, { id: 'asc' }],
      take: 5,
    });
    for (const push of pushes) {
      const defending = push.defenderAllianceId === alliance.id;
      const allyCommitted = push.backups.filter((backup) => backup.kind === 'ALLY').reduce((sum, backup) => sum + backup.thugs, 0);
      cards.push({
        id: `turf:${push.id}`,
        kind: defending ? 'REINFORCEMENT_REQUEST' : 'TURF_ACTIVITY',
        title: `${push.turf.city.name} ${districtName(ruleset, push.turf.city.slug, push.turf.district)} ${defending ? 'under attack' : 'push underway'}`,
        detail: defending
          ? `Push lands ${push.landsAt.toLocaleTimeString()}. ${push.turf.cornerThugs + allyCommitted} defenders committed.`
          : `${push.attacker.displayName} is pushing ${push.defender.displayName}; ${push.squad} attackers committed.`,
        at: push.landsAt.toISOString(),
        actionLabel: defending ? 'Send reinforcements' : 'Open turf',
        href: turfHref(push.turf.city.slug),
        tone: defending ? 'warn' : 'info',
      });
    }
  }

  const convoyCalls = await prisma.convoyTail.findMany({
    where: {
      status: 'PENDING',
      landsAt: { gt: now },
      alliesCalledAt: { not: null },
      owner: { allianceId: alliance.id },
    },
    include: {
      owner: { select: { displayName: true } },
      attacker: { select: { displayName: true } },
      backups: { select: { kind: true, thugs: true } },
    },
    orderBy: [{ landsAt: 'asc' }, { id: 'asc' }],
    take: 4,
  });
  for (const tail of convoyCalls) {
    const allyBackup = tail.backups.filter((backup) => backup.kind === 'ALLY').reduce((sum, backup) => sum + backup.thugs, 0);
    cards.push({
      id: `convoy:${tail.id}`,
      kind: 'CONVOY_SIGHTING',
      title: `${cityName(ruleset, tail.city)} convoy call`,
      detail: `${tail.owner.displayName} called help against ${tail.attacker.displayName}; ${allyBackup} ally backup committed.`,
      at: tail.landsAt.toISOString(),
      actionLabel: 'Open convoys',
      href: '/game/convoys',
      tone: 'warn',
    });
  }

  const controls = await prisma.turfControlEvent.findMany({
    where: {
      roundId: player.roundId,
      happenedAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
      OR: [{ previousAllianceId: alliance.id }, { nextAllianceId: alliance.id }],
    },
    include: { city: { select: { slug: true, name: true } } },
    orderBy: [{ happenedAt: 'desc' }, { id: 'desc' }],
    take: 4,
  });
  for (const control of controls) {
    const won = control.nextAllianceId === alliance.id;
    cards.push({
      id: `control:${control.id}`,
      kind: 'CITY_CONTROL',
      title: `${control.city.name} control ${won ? 'gained' : 'lost'}`,
      detail: won
        ? `Your alliance controls ${control.nextBlocksHeld}/${control.blocksTotal} blocks.`
        : `${control.nextAllianceTag ? `[${control.nextAllianceTag}] ` : 'No alliance '}now controls the city.`,
      at: control.happenedAt.toISOString(),
      actionLabel: 'Open city',
      href: turfHref(control.city.slug),
      tone: won ? 'good' : 'warn',
    });
  }

  return cards
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime() || a.id.localeCompare(b.id))
    .slice(0, 12);
}

export const WireService = {
  async list(prisma: PrismaClient, playerId: string, before?: string): Promise<AllianceWireDto> {
    const { player, alliance, round } = await membership(prisma, playerId);
    const now = new Date();
    const cursor = before ? await prisma.allianceWirePost.findFirst({ where: { id: before, allianceId: alliance.id } }) : null;
    if (before && !cursor) throw AppError.notFound('WIRE_POST_NOT_FOUND', 'That part of the wire is no longer there.');
    const leads = alliance.leaderId === player.id;
    const [rows, last, pinned, cards] = await Promise.all([
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
      prisma.allianceWirePost.findFirst({
        where: { allianceId: alliance.id, removedAt: null, kind: 'ANNOUNCEMENT', pinned: true },
        include: { author: { select: { id: true, publicPimpId: true, displayName: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      coordinationCards(prisma, player, alliance, now),
    ]);
    const cooldownUntil = last ? new Date(last.createdAt.getTime() + WIRE_COOLDOWN_SECONDS * 1000) : null;
    return {
      pinnedAnnouncement: pinned ? toPostDto(pinned, player.id, leads) : null,
      cards,
      posts: rows.slice(0, WIRE_PAGE_SIZE).map((row) => toPostDto(row, player.id, leads)),
      nextBefore: rows.length > WIRE_PAGE_SIZE ? rows[WIRE_PAGE_SIZE - 1]!.id : null,
      cooldownUntil: cooldownUntil && cooldownUntil > now ? cooldownUntil.toISOString() : null,
      canPostAnnouncement: leads,
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
      const leads = me.alliance.leaderId === me.id;
      if (input.kind === 'ANNOUNCEMENT' && !leads) throw AppError.forbidden('Only the alliance leader can post announcements.');
      if (input.pinned && input.kind !== 'ANNOUNCEMENT') throw AppError.badRequest('PINNED_MESSAGE', 'Only announcements can be pinned.');
      if (input.pinned) {
        await tx.allianceWirePost.updateMany({ where: { allianceId: me.alliance.id, kind: 'ANNOUNCEMENT', pinned: true }, data: { pinned: false } });
      }
      await tx.allianceWirePost.create({
        data: {
          allianceId: me.alliance.id,
          authorId: me.id,
          body: input.body,
          kind: input.kind,
          pinned: input.pinned,
          createdAt: now,
        },
      });
    });
    return WireService.list(prisma, playerId);
  },

  async pin(prisma: PrismaClient, playerId: string, postId: string, rawInput: unknown): Promise<AllianceWireDto> {
    const input = wirePinSchema.parse(rawInput);
    const { player, alliance, round } = await membership(prisma, playerId);
    if (!roundOpen(round, new Date())) throw AppError.conflict('ROUND_NOT_PLAYABLE', `${round.name} is closed. The wire is read-only now.`);
    if (alliance.leaderId !== player.id) throw AppError.forbidden('Only the alliance leader can pin announcements.');
    await prisma.$transaction(async (tx) => {
      const post = await tx.allianceWirePost.findFirst({ where: { id: postId, allianceId: alliance.id, removedAt: null } });
      if (!post) throw AppError.notFound('WIRE_POST_NOT_FOUND', 'That post is already gone.');
      if (post.kind !== 'ANNOUNCEMENT') throw AppError.badRequest('WIRE_NOT_ANNOUNCEMENT', 'Only announcements can be pinned.');
      if (input.pinned) {
        await tx.allianceWirePost.updateMany({ where: { allianceId: alliance.id, kind: 'ANNOUNCEMENT', pinned: true, id: { not: post.id } }, data: { pinned: false } });
      }
      await tx.allianceWirePost.update({ where: { id: post.id }, data: { pinned: input.pinned } });
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
        kind: post.kind === 'ANNOUNCEMENT' ? 'ANNOUNCEMENT' : 'MESSAGE',
        pinned: post.pinned,
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
