import { Prisma, type Alliance, type PrismaClient, type Round, type RoundPlayer } from '@prisma/client';
import { loadRulesetForRound, type Ruleset } from '@streets/rules-engine';
import {
  allianceInviteAnswerSchema,
  alliancePlayerSchema,
  allianceForumPostSchema,
  createAllianceSchema,
  type AdminAlliancesDto,
  type AllianceDetailDto,
  type AllianceEventDto,
  type AllianceEventType,
  type AllianceRankingsDto,
  type AllianceTagDto,
  type MyAllianceDto,
} from '@streets/shared';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { queueAllianceRoleResync } from './discord-resync.service.js';
import { forumDiscussionUrl, postRecruitmentThread, updateForumDiscussion } from './forum-news.service.js';
import {
  recordTerritoryControlChange,
  territoryControlForCity,
  type CityControl,
} from './turf-territory.service.js';

type AllianceRules = NonNullable<Ruleset['alliances']>;

type AllianceSide = Pick<RoundPlayer, 'allianceId' | 'formerAllianceId' | 'allianceCooldownUntil'>;

export type AllianceRelation = 'ALLY' | 'FORMER_ALLY' | null;

/** The alliances a player still counts as part of: the current one, and the one they left while its cooldown runs. */
function allianceIds(player: AllianceSide, now: Date): string[] {
  const ids: string[] = [];
  if (player.allianceId) ids.push(player.allianceId);
  if (player.formerAllianceId && player.allianceCooldownUntil && player.allianceCooldownUntil > now) ids.push(player.formerAllianceId);
  return ids;
}

/**
 * Allies never hit each other. Neither do a player and the alliance they left
 * until the cooldown passes, which is what stops an alliance dropping a member
 * just to raid them.
 */
export function allianceRelation(a: AllianceSide, b: AllianceSide, now: Date): AllianceRelation {
  if (a.allianceId && a.allianceId === b.allianceId) return 'ALLY';
  const theirs = allianceIds(b, now);
  return allianceIds(a, now).some((id) => theirs.includes(id)) ? 'FORMER_ALLY' : null;
}

/** The player-facing block for every attack form and recon. Revenge never overrides it. */
export function allianceTargetBlock(a: AllianceSide, b: AllianceSide, now: Date): string | null {
  const relation = allianceRelation(a, b, now);
  if (relation === 'ALLY') return 'They are in your alliance.';
  if (relation === 'FORMER_ALLY') return 'You were allies too recently. Wait for the alliance cooldown to pass.';
  return null;
}

/** Shared revenge: hits on your alliance since you joined it count as hits on you. */
export function sharedRevengeScope(player: Pick<RoundPlayer, 'id' | 'allianceId' | 'allianceJoinedAt'>): Prisma.RaidBattleWhereInput[] {
  const scopes: Prisma.RaidBattleWhereInput[] = [{ defenderId: player.id }];
  if (player.allianceId && player.allianceJoinedAt) {
    scopes.push({ defenderAllianceId: player.allianceId, createdAt: { gte: player.allianceJoinedAt } });
  }
  return scopes;
}

export function normalizeAllianceName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function waitText(until: Date, now: Date): string {
  const minutes = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function tagDto(alliance: Pick<Alliance, 'name' | 'tag'> | null | undefined): AllianceTagDto | null {
  return alliance ? { name: alliance.name, tag: alliance.tag } : null;
}

export { tagDto as allianceTagDto };

function roundOpen(round: Round, now: Date): boolean {
  return (round.status === 'ACTIVE' || round.status === 'REGISTRATION') && round.endsAt > now;
}

function rulesFor(round: Round): { ruleset: Ruleset; rules: AllianceRules | null } {
  const ruleset = loadRulesetForRound(round);
  return { ruleset, rules: ruleset.alliances ?? null };
}

function requireRules(round: Round, now: Date): AllianceRules {
  const { rules } = rulesFor(round);
  if (!rules) throw AppError.conflict('ALLIANCES_DISABLED', 'Alliances are not part of this round.');
  if (!roundOpen(round, now)) throw AppError.conflict('ROUND_NOT_PLAYABLE', `${round.name} is closed. Alliances can no longer change.`);
  return rules;
}

async function lockAlliance(db: Db, allianceId: string): Promise<Alliance> {
  await db.$queryRaw`SELECT id FROM "Alliance" WHERE id = ${allianceId} FOR UPDATE`;
  return db.alliance.findUniqueOrThrow({ where: { id: allianceId } });
}

async function event(db: Db, allianceId: string, type: AllianceEventType, actorName: string | null, subjectName: string | null = null, detail: string | null = null): Promise<void> {
  await db.allianceEvent.create({ data: { allianceId, type, actorName, subjectName, detail } });
}

async function territoryBeforeForPlayers(
  tx: Db,
  roundId: string,
  playerIds: string[],
  ruleset: Ruleset,
): Promise<Map<string, CityControl | null>> {
  if (!ruleset.turf?.territory || !playerIds.length) return new Map();
  const rows = await tx.turf.findMany({
    where: { roundId, holderId: { in: playerIds } },
    select: { cityId: true },
  });
  const cityIds = [...new Set(rows.map((row) => row.cityId))].sort();
  const before = new Map<string, CityControl | null>();
  for (const cityId of cityIds) {
    before.set(cityId, await territoryControlForCity(tx, roundId, cityId, ruleset));
  }
  return before;
}

async function recordTerritoryCities(
  tx: Db,
  roundId: string,
  ruleset: Ruleset,
  before: Map<string, CityControl | null>,
  at: Date,
): Promise<void> {
  for (const [cityId, control] of before) {
    await recordTerritoryControlChange(tx, { roundId, cityId, ruleset, before: control, at });
  }
}

function cooldownData(allianceId: string, rules: Pick<AllianceRules, 'leaveCooldownHours'>, now: Date) {
  return {
    allianceId: null,
    allianceJoinedAt: null,
    formerAllianceId: allianceId,
    allianceCooldownUntil: new Date(now.getTime() + rules.leaveCooldownHours * 3_600_000),
  };
}

/** A disbanded alliance frees its name and tag for somebody else. */
async function disbandInTransaction(tx: Db, alliance: Alliance, rules: Pick<AllianceRules, 'leaveCooldownHours'>, now: Date, actorName: string | null, reason: string | null): Promise<void> {
  const members = await tx.roundPlayer.findMany({ where: { allianceId: alliance.id }, select: { id: true } });
  for (const { id } of members.sort((a, b) => a.id.localeCompare(b.id))) await lockRoundPlayer(tx, id);
  await tx.roundPlayer.updateMany({ where: { allianceId: alliance.id }, data: cooldownData(alliance.id, rules, now) });
  await tx.allianceInvite.deleteMany({ where: { allianceId: alliance.id } });
  await tx.alliance.update({ where: { id: alliance.id }, data: {
    disbandedAt: now, disbandReason: reason,
    nameNormalized: `${alliance.nameNormalized}#${alliance.id}`,
    tagNormalized: `${alliance.tagNormalized}#${alliance.id}`,
  } });
  await event(tx, alliance.id, 'DISBANDED', actorName, null, reason);
  await queueAllianceRoleResync(tx, 'all');
}

function recruitmentTitle(alliance: Pick<Alliance, 'name' | 'tag'>, disbanded = false): string {
  return disbanded ? `[${alliance.tag}] ${alliance.name} (disbanded)` : `[${alliance.tag}] ${alliance.name} is recruiting`;
}

/** Keep the recruitment thread honest after a rename or disband. Best effort, after the change commits. */
async function syncForumThread(prisma: PrismaClient, allianceId: string): Promise<void> {
  const alliance = await prisma.alliance.findUnique({ where: { id: allianceId } });
  if (!alliance?.forumDiscussionId || !env.forum.recruitment.enabled) return;
  const disbanded = Boolean(alliance.disbandedAt);
  const error = await updateForumDiscussion(alliance.forumDiscussionId, { title: recruitmentTitle(alliance, disbanded), ...(disbanded ? { isLocked: true } : {}) });
  await prisma.alliance.update({ where: { id: allianceId }, data: { forumError: error } });
}

interface Standing {
  allianceId: string;
  combinedNetWorthCents: bigint;
  activeMembers: number;
  memberCount: number;
  rank: number;
}

/** Live alliance standings for a round: combined net worth of active members, ties share a rank. */
async function standings(db: Db | PrismaClient, roundId: string): Promise<{ alliances: Alliance[]; byId: Map<string, Standing> }> {
  const alliances = await db.alliance.findMany({ where: { roundId, disbandedAt: null }, orderBy: { createdAt: 'asc' } });
  const members = alliances.length
    ? await db.roundPlayer.findMany({
        where: { roundId, allianceId: { in: alliances.map((alliance) => alliance.id) } },
        select: { allianceId: true, netWorthCents: true, account: { select: { isActive: true } } },
      })
    : [];
  const totals = new Map<string, Standing>(alliances.map((alliance) => [alliance.id, { allianceId: alliance.id, combinedNetWorthCents: 0n, activeMembers: 0, memberCount: 0, rank: 0 }]));
  for (const member of members) {
    const total = totals.get(member.allianceId!);
    if (!total) continue;
    total.memberCount += 1;
    if (member.account.isActive) {
      total.activeMembers += 1;
      total.combinedNetWorthCents += member.netWorthCents;
    }
  }
  const order = alliances.map((alliance) => totals.get(alliance.id)!)
    .sort((a, b) => (a.combinedNetWorthCents === b.combinedNetWorthCents ? 0 : a.combinedNetWorthCents > b.combinedNetWorthCents ? -1 : 1));
  let previous: bigint | null = null;
  order.forEach((standing, index) => {
    standing.rank = previous !== null && standing.combinedNetWorthCents === previous ? order[index - 1]!.rank : index + 1;
    previous = standing.combinedNetWorthCents;
  });
  const sorted = new Map(order.map((standing) => [standing.allianceId, standing]));
  return { alliances: order.map((standing) => alliances.find((alliance) => alliance.id === standing.allianceId)!), byId: sorted };
}

async function detail(db: Db | PrismaClient, alliance: Alliance, standing: Standing, rules: AllianceRules, viewer: Pick<RoundPlayer, 'id' | 'allianceId'>): Promise<AllianceDetailDto> {
  const members = await db.roundPlayer.findMany({
    where: { allianceId: alliance.id, account: { isActive: true } },
    orderBy: [{ netWorthCents: 'desc' }, { publicPimpId: 'asc' }],
  });
  const ranks = await Promise.all(members.map((member) => db.roundPlayer.count({
    where: { roundId: alliance.roundId, netWorthCents: { gt: member.netWorthCents }, account: { isActive: true } },
  })));
  const leader = members.find((member) => member.id === alliance.leaderId);
  return {
    name: alliance.name,
    tag: alliance.tag,
    rank: standing.rank,
    combinedNetWorthCents: Number(standing.combinedNetWorthCents),
    memberCount: standing.memberCount,
    maxMembers: rules.maxMembers,
    leader: leader ? { publicPimpId: leader.publicPimpId, displayName: leader.displayName } : null,
    members: members.map((member, index) => ({
      publicPimpId: member.publicPimpId,
      displayName: member.displayName,
      netWorthCents: Number(member.netWorthCents),
      nationalRank: ranks[index]! + 1,
      isLeader: member.id === alliance.leaderId,
      isYou: member.id === viewer.id,
      joinedAt: (member.allianceJoinedAt ?? alliance.createdAt).toISOString(),
    })),
    foundedAt: alliance.createdAt.toISOString(),
    isYours: viewer.allianceId === alliance.id,
    forumUrl: alliance.forumDiscussionId ? forumDiscussionUrl(alliance.forumDiscussionId) : null,
  };
}

function toEventDto(row: { type: string; actorName: string | null; subjectName: string | null; detail: string | null; createdAt: Date }): AllianceEventDto {
  return { type: row.type as AllianceEventType, actorName: row.actorName, subjectName: row.subjectName, detail: row.detail, createdAt: row.createdAt.toISOString() };
}

async function loadPlayer(prisma: PrismaClient, playerId: string) {
  return prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId }, include: { round: true } });
}

/** Resolve a target by public pimp id inside the actor's round. */
async function findTarget(db: Db | PrismaClient, roundId: string, publicPimpId: number) {
  const target = await db.roundPlayer.findFirst({ where: { roundId, publicPimpId, account: { isActive: true } } });
  if (!target) throw AppError.notFound('TARGET_NOT_FOUND', 'That player is not in this round.');
  return target;
}

/**
 * Run a membership change for the actor's current alliance. The alliance row is
 * locked first, then players in id order; combat never locks alliances, so the
 * two cannot deadlock. If the actor's alliance changed while waiting, the
 * request is refused instead of acting on the wrong crew.
 */
async function withOwnAlliance<T>(prisma: PrismaClient, playerId: string, fn: (ctx: { tx: Db; alliance: Alliance; me: RoundPlayer; rules: AllianceRules; now: Date; round: Round }) => Promise<T>, extraLockIds: string[] = []): Promise<T> {
  const player = await loadPlayer(prisma, playerId);
  const rules = requireRules(player.round, new Date());
  if (!player.allianceId) throw AppError.conflict('NOT_IN_ALLIANCE', 'You are not in an alliance.');
  const allianceId = player.allianceId;
  return prisma.$transaction(async (tx) => {
    const alliance = await lockAlliance(tx, allianceId);
    for (const id of [...new Set([playerId, ...extraLockIds])].sort()) await lockRoundPlayer(tx, id);
    const me = await tx.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    if (me.allianceId !== alliance.id || alliance.disbandedAt) throw AppError.conflict('ALLIANCE_CHANGED', 'Your alliance changed while that was on its way. Refresh and try again.');
    const now = new Date();
    return fn({ tx, alliance, me, rules, now, round: player.round });
  }, { timeout: 15_000, maxWait: 10_000 });
}

function requireLeader(alliance: Alliance, me: RoundPlayer, what: string): void {
  if (alliance.leaderId !== me.id) throw AppError.forbidden(`Only the alliance leader can ${what}.`);
}

function uniqueViolation(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return null;
  const target = String((error.meta as { target?: unknown } | undefined)?.target ?? '');
  if (target.includes('tag')) return 'That tag is already taken in this round.';
  if (target.includes('name')) return 'That alliance name is already taken in this round.';
  return 'That alliance name or tag is already taken in this round.';
}

export const AllianceService = {
  async mine(prisma: PrismaClient, playerId: string): Promise<MyAllianceDto> {
    const player = await loadPlayer(prisma, playerId);
    const now = new Date();
    const { rules } = rulesFor(player.round);
    const open = roundOpen(player.round, now);
    const empty: MyAllianceDto = { enabled: Boolean(rules), rules, alliance: null, isLeader: false, outgoingInvites: [], events: [], incomingInvites: [], cooldownUntil: null, formerAlliance: null, roundOpen: open,
      forum: { enabled: env.forum.recruitment.enabled, error: null } };
    if (!rules) return empty;

    const cooling = player.allianceCooldownUntil && player.allianceCooldownUntil > now ? player.allianceCooldownUntil : null;
    const [former, incoming] = await Promise.all([
      cooling && player.formerAllianceId ? prisma.alliance.findUnique({ where: { id: player.formerAllianceId } }) : null,
      player.allianceId ? [] : prisma.allianceInvite.findMany({
        where: { inviteeId: player.id, expiresAt: { gt: now }, alliance: { disbandedAt: null } },
        include: { alliance: { include: { _count: { select: { members: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const base: MyAllianceDto = {
      ...empty,
      cooldownUntil: cooling?.toISOString() ?? null,
      formerAlliance: tagDto(former),
      incomingInvites: incoming.map((invite) => ({
        name: invite.alliance.name, tag: invite.alliance.tag, invitedByName: invite.invitedByName,
        memberCount: invite.alliance._count.members, expiresAt: invite.expiresAt.toISOString(),
      })),
    };
    if (!player.allianceId) return base;

    const { alliances, byId } = await standings(prisma, player.roundId);
    const alliance = alliances.find((row) => row.id === player.allianceId);
    if (!alliance) return base;
    const isLeader = alliance.leaderId === player.id;
    const [allianceDetail, outgoing, events] = await Promise.all([
      detail(prisma, alliance, byId.get(alliance.id)!, rules, player),
      isLeader ? prisma.allianceInvite.findMany({ where: { allianceId: alliance.id, expiresAt: { gt: now } }, include: { invitee: true }, orderBy: { createdAt: 'desc' } }) : [],
      prisma.allianceEvent.findMany({ where: { allianceId: alliance.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    ]);
    return {
      ...base,
      alliance: allianceDetail,
      isLeader,
      outgoingInvites: outgoing.map((invite) => ({ publicPimpId: invite.invitee.publicPimpId, displayName: invite.invitee.displayName, invitedByName: invite.invitedByName, expiresAt: invite.expiresAt.toISOString() })),
      events: events.map(toEventDto),
      forum: { enabled: env.forum.recruitment.enabled, error: isLeader ? alliance.forumError : null },
    };
  },

  async rankings(prisma: PrismaClient, player: Pick<RoundPlayer, 'roundId' | 'allianceId'> & { round: Round }, limit: number): Promise<AllianceRankingsDto> {
    if (!rulesFor(player.round).rules) return { enabled: false, alliances: [] };
    const { alliances, byId } = await standings(prisma, player.roundId);
    return {
      enabled: true,
      alliances: alliances.slice(0, limit).map((alliance) => {
        const standing = byId.get(alliance.id)!;
        return { name: alliance.name, tag: alliance.tag, rank: standing.rank, combinedNetWorthCents: Number(standing.combinedNetWorthCents), memberCount: standing.memberCount, isYours: player.allianceId === alliance.id };
      }),
    };
  },

  async publicDetail(prisma: PrismaClient, player: RoundPlayer & { round: Round }, tag: string): Promise<AllianceDetailDto> {
    const { rules } = rulesFor(player.round);
    if (!rules) throw AppError.notFound('ALLIANCE_NOT_FOUND', 'Alliances are not part of this round.');
    const { alliances, byId } = await standings(prisma, player.roundId);
    const alliance = alliances.find((row) => row.tagNormalized === tag.trim().toLowerCase());
    if (!alliance) throw AppError.notFound('ALLIANCE_NOT_FOUND', 'No alliance with that tag is running in this round.');
    return detail(prisma, alliance, byId.get(alliance.id)!, rules, player);
  },

  async create(prisma: PrismaClient, playerId: string, rawInput: unknown): Promise<MyAllianceDto> {
    const input = createAllianceSchema.parse(rawInput);
    const player = await loadPlayer(prisma, playerId);
    requireRules(player.round, new Date());
    const name = input.name.trim().replace(/\s+/g, ' ');
    const tag = input.tag.trim().toUpperCase();
    try {
      await prisma.$transaction(async (tx) => {
        await lockRoundPlayer(tx, playerId);
        const me = await tx.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
        const now = new Date();
        if (me.allianceId) throw AppError.conflict('ALREADY_IN_ALLIANCE', 'Leave your alliance before founding another.');
        if (me.allianceCooldownUntil && me.allianceCooldownUntil > now) {
          throw AppError.conflict('ALLIANCE_COOLDOWN', `You left an alliance recently. You can found or join one in ${waitText(me.allianceCooldownUntil, now)}.`);
        }
        const base = loadRulesetForRound(player.round);
        const territoryBefore = await territoryBeforeForPlayers(tx, me.roundId, [me.id], base);
        const alliance = await tx.alliance.create({ data: {
          roundId: me.roundId, name, nameNormalized: normalizeAllianceName(name), tag, tagNormalized: tag.toLowerCase(), leaderId: me.id,
        } });
        await tx.roundPlayer.update({ where: { id: me.id }, data: { allianceId: alliance.id, allianceJoinedAt: now } });
        await recordTerritoryCities(tx, me.roundId, base, territoryBefore, now);
        await tx.allianceInvite.deleteMany({ where: { inviteeId: me.id } });
        await event(tx, alliance.id, 'FOUNDED', me.displayName);
        await queueAllianceRoleResync(tx, { accountIds: [me.accountId] });
      }, { timeout: 15_000, maxWait: 10_000 });
    } catch (error) {
      const message = uniqueViolation(error);
      if (message) throw AppError.conflict('ALLIANCE_NAME_TAKEN', message);
      throw error;
    }
    return AllianceService.mine(prisma, playerId);
  },

  async invite(prisma: PrismaClient, playerId: string, rawInput: unknown): Promise<MyAllianceDto> {
    const input = alliancePlayerSchema.parse(rawInput);
    const player = await loadPlayer(prisma, playerId);
    const target = await findTarget(prisma, player.roundId, input.targetPublicPimpId);
    if (target.id === playerId) throw AppError.badRequest('INVALID_TARGET', 'You are already in your own alliance.');
    await withOwnAlliance(prisma, playerId, async ({ tx, alliance, me, rules, now }) => {
      requireLeader(alliance, me, 'invite players');
      const current = await tx.roundPlayer.findUniqueOrThrow({ where: { id: target.id } });
      if (current.allianceId === alliance.id) throw AppError.conflict('ALREADY_MEMBER', `${current.displayName} is already in ${alliance.name}.`);
      await tx.allianceInvite.deleteMany({ where: { allianceId: alliance.id, expiresAt: { lte: now } } });
      const pending = await tx.allianceInvite.count({ where: { allianceId: alliance.id, inviteeId: { not: target.id } } });
      if (pending >= rules.maxPendingInvites) throw AppError.conflict('TOO_MANY_INVITES', `${alliance.name} already has ${rules.maxPendingInvites} invites out. Revoke one first.`);
      const expiresAt = new Date(now.getTime() + rules.inviteExpiresHours * 3_600_000);
      await tx.allianceInvite.upsert({
        where: { allianceId_inviteeId: { allianceId: alliance.id, inviteeId: target.id } },
        create: { allianceId: alliance.id, inviteeId: target.id, invitedByName: me.displayName, expiresAt },
        update: { invitedByName: me.displayName, expiresAt, createdAt: now },
      });
      await event(tx, alliance.id, 'INVITED', me.displayName, current.displayName);
    }, [target.id]);
    return AllianceService.mine(prisma, playerId);
  },

  async revokeInvite(prisma: PrismaClient, playerId: string, rawInput: unknown): Promise<MyAllianceDto> {
    const input = alliancePlayerSchema.parse(rawInput);
    const player = await loadPlayer(prisma, playerId);
    const target = await findTarget(prisma, player.roundId, input.targetPublicPimpId);
    await withOwnAlliance(prisma, playerId, async ({ tx, alliance, me }) => {
      requireLeader(alliance, me, 'revoke invites');
      await tx.allianceInvite.deleteMany({ where: { allianceId: alliance.id, inviteeId: target.id } });
    });
    return AllianceService.mine(prisma, playerId);
  },

  /** The cap is checked with the alliance row locked, so two players accepting at once cannot both take the last seat. */
  async accept(prisma: PrismaClient, playerId: string, rawInput: unknown): Promise<MyAllianceDto> {
    const input = allianceInviteAnswerSchema.parse(rawInput);
    const player = await loadPlayer(prisma, playerId);
    const rules = requireRules(player.round, new Date());
    const found = await prisma.alliance.findUnique({ where: { roundId_tagNormalized: { roundId: player.roundId, tagNormalized: input.tag.toLowerCase() } } });
    if (!found) throw AppError.notFound('INVITE_NOT_FOUND', 'That invite is no longer open.');
    await prisma.$transaction(async (tx) => {
      const alliance = await lockAlliance(tx, found.id);
      await lockRoundPlayer(tx, playerId);
      const me = await tx.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
      const now = new Date();
      const invite = await tx.allianceInvite.findUnique({ where: { allianceId_inviteeId: { allianceId: alliance.id, inviteeId: me.id } } });
      if (!invite || invite.expiresAt <= now || alliance.disbandedAt) throw AppError.notFound('INVITE_NOT_FOUND', 'That invite is no longer open.');
      if (me.allianceId) throw AppError.conflict('ALREADY_IN_ALLIANCE', 'Leave your alliance before joining another.');
      if (me.allianceCooldownUntil && me.allianceCooldownUntil > now) {
        throw AppError.conflict('ALLIANCE_COOLDOWN', `You left an alliance recently. You can join one in ${waitText(me.allianceCooldownUntil, now)}.`);
      }
      const members = await tx.roundPlayer.count({ where: { allianceId: alliance.id } });
      if (members >= rules.maxMembers) throw AppError.conflict('ALLIANCE_FULL', `${alliance.name} is full (${rules.maxMembers} members).`);
      const base = loadRulesetForRound(player.round);
      const territoryBefore = await territoryBeforeForPlayers(tx, me.roundId, [me.id], base);
      await tx.roundPlayer.update({ where: { id: me.id }, data: { allianceId: alliance.id, allianceJoinedAt: now } });
      await recordTerritoryCities(tx, me.roundId, base, territoryBefore, now);
      await tx.allianceInvite.deleteMany({ where: { inviteeId: me.id } });
      await event(tx, alliance.id, 'JOINED', me.displayName);
      await queueAllianceRoleResync(tx, { accountIds: [me.accountId] });
    }, { timeout: 15_000, maxWait: 10_000 });
    return AllianceService.mine(prisma, playerId);
  },

  async decline(prisma: PrismaClient, playerId: string, rawInput: unknown): Promise<MyAllianceDto> {
    const input = allianceInviteAnswerSchema.parse(rawInput);
    const player = await loadPlayer(prisma, playerId);
    await prisma.allianceInvite.deleteMany({ where: { inviteeId: player.id, alliance: { roundId: player.roundId, tagNormalized: input.tag.toLowerCase() } } });
    return AllianceService.mine(prisma, playerId);
  },

  async leave(prisma: PrismaClient, playerId: string): Promise<MyAllianceDto> {
    const left = await withOwnAlliance(prisma, playerId, async ({ tx, alliance, me, rules, now, round }) => {
      const others = await tx.roundPlayer.count({ where: { allianceId: alliance.id, id: { not: me.id } } });
      if (alliance.leaderId === me.id && others > 0) throw AppError.conflict('LEADER_MUST_HAND_OVER', 'Hand leadership to another member before you leave.');
      const base = loadRulesetForRound(round);
      const territoryBefore = await territoryBeforeForPlayers(tx, me.roundId, [me.id], base);
      await tx.roundPlayer.update({ where: { id: me.id }, data: cooldownData(alliance.id, rules, now) });
      await event(tx, alliance.id, 'LEFT', me.displayName);
      await queueAllianceRoleResync(tx, { accountIds: [me.accountId] });
      if (others === 0) await disbandInTransaction(tx, alliance, rules, now, me.displayName, null);
      await recordTerritoryCities(tx, me.roundId, base, territoryBefore, now);
      return { allianceId: alliance.id, disbanded: others === 0 };
    });
    if (left.disbanded) await syncForumThread(prisma, left.allianceId);
    return AllianceService.mine(prisma, playerId);
  },

  async kick(prisma: PrismaClient, playerId: string, rawInput: unknown): Promise<MyAllianceDto> {
    const input = alliancePlayerSchema.parse(rawInput);
    const player = await loadPlayer(prisma, playerId);
    const target = await prisma.roundPlayer.findFirst({ where: { roundId: player.roundId, publicPimpId: input.targetPublicPimpId } });
    if (!target) throw AppError.notFound('TARGET_NOT_FOUND', 'That player is not in this round.');
    if (target.id === playerId) throw AppError.badRequest('INVALID_TARGET', 'Leave the alliance instead of kicking yourself.');
    await withOwnAlliance(prisma, playerId, async ({ tx, alliance, me, rules, now, round }) => {
      requireLeader(alliance, me, 'kick members');
      const current = await tx.roundPlayer.findUniqueOrThrow({ where: { id: target.id } });
      if (current.allianceId !== alliance.id) throw AppError.conflict('NOT_A_MEMBER', `${current.displayName} is not in ${alliance.name}.`);
      const base = loadRulesetForRound(round);
      const territoryBefore = await territoryBeforeForPlayers(tx, current.roundId, [current.id], base);
      await tx.roundPlayer.update({ where: { id: current.id }, data: cooldownData(alliance.id, rules, now) });
      await recordTerritoryCities(tx, current.roundId, base, territoryBefore, now);
      await event(tx, alliance.id, 'KICKED', me.displayName, current.displayName);
      await queueAllianceRoleResync(tx, { accountIds: [current.accountId] });
    }, [target.id]);
    return AllianceService.mine(prisma, playerId);
  },

  async transferLeadership(prisma: PrismaClient, playerId: string, rawInput: unknown): Promise<MyAllianceDto> {
    const input = alliancePlayerSchema.parse(rawInput);
    const player = await loadPlayer(prisma, playerId);
    const target = await findTarget(prisma, player.roundId, input.targetPublicPimpId);
    if (target.id === playerId) throw AppError.badRequest('INVALID_TARGET', 'You already lead this alliance.');
    await withOwnAlliance(prisma, playerId, async ({ tx, alliance, me }) => {
      requireLeader(alliance, me, 'hand over leadership');
      const current = await tx.roundPlayer.findUniqueOrThrow({ where: { id: target.id } });
      if (current.allianceId !== alliance.id) throw AppError.conflict('NOT_A_MEMBER', `${current.displayName} is not in ${alliance.name}.`);
      await tx.alliance.update({ where: { id: alliance.id }, data: { leaderId: current.id } });
      await event(tx, alliance.id, 'LEADER', me.displayName, current.displayName);
    }, [target.id]);
    return AllianceService.mine(prisma, playerId);
  },

  /**
   * One recruitment thread per alliance, posted by the leader into the forum's
   * recruitment tag. The alliance row is claimed under its lock before the forum
   * is called, so a double click or two tabs cannot open two threads.
   */
  async postForumThread(prisma: PrismaClient, playerId: string, rawInput: unknown): Promise<MyAllianceDto> {
    const input = allianceForumPostSchema.parse(rawInput);
    if (!env.forum.recruitment.enabled) throw AppError.conflict('FORUM_RECRUITMENT_DISABLED', 'Forum recruitment is not set up on this server.');
    const claim = await withOwnAlliance(prisma, playerId, async ({ tx, alliance, me, rules, now, round }) => {
      requireLeader(alliance, me, 'post a recruitment thread');
      if (alliance.forumDiscussionId) throw AppError.conflict('FORUM_THREAD_EXISTS', `${alliance.name} already has a recruitment thread.`);
      if (alliance.forumPostStartedAt && now.getTime() - alliance.forumPostStartedAt.getTime() < 60_000) {
        throw AppError.conflict('FORUM_THREAD_POSTING', 'Your recruitment thread is already on its way.');
      }
      await tx.alliance.update({ where: { id: alliance.id }, data: { forumPostStartedAt: now, forumError: null } });
      const members = await tx.roundPlayer.count({ where: { allianceId: alliance.id } });
      return { alliance, leaderName: me.displayName, members, maxMembers: rules.maxMembers, roundName: round.name };
    });
    const { alliance } = claim;
    const url = `${env.frontendOrigin}/game/alliances/${encodeURIComponent(alliance.tag)}`;
    const body = [
      `**[${alliance.tag}] ${alliance.name}** is recruiting in ${claim.roundName}.`,
      ...(input.pitch ? ['', input.pitch] : []),
      '',
      `Led by ${claim.leaderName} · ${claim.members}/${claim.maxMembers} members.`,
      '',
      `Alliance page: ${url}`,
      'Invites go out by pimp number, so reply with yours.',
    ].join('\n');
    const result = await postRecruitmentThread({ title: recruitmentTitle(alliance), body });
    await prisma.alliance.update({ where: { id: alliance.id }, data: result.ok
      ? { forumDiscussionId: result.discussionId, forumError: null }
      : { forumPostStartedAt: null, forumError: result.error } });
    if (!result.ok) throw AppError.conflict('FORUM_POST_FAILED', `The forum did not take the thread: ${result.error} Try again shortly.`);
    return AllianceService.mine(prisma, playerId);
  },

  // Admin moderation. Every change writes an audit record in the same transaction.

  async adminList(prisma: PrismaClient, roundId: string): Promise<AdminAlliancesDto> {
    const round = await prisma.round.findUnique({ where: { id: roundId } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    const { rules } = rulesFor(round);
    const [rows, { byId }] = await Promise.all([
      prisma.alliance.findMany({ where: { roundId }, orderBy: [{ disbandedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }] }),
      standings(prisma, roundId),
    ]);
    const leaders = await prisma.roundPlayer.findMany({ where: { id: { in: rows.map((row) => row.leaderId) } }, select: { id: true, publicPimpId: true, displayName: true } });
    return {
      roundId,
      enabled: Boolean(rules),
      alliances: rows.map((row) => {
        const standing = byId.get(row.id);
        const leader = leaders.find((candidate) => candidate.id === row.leaderId);
        return {
          id: row.id, name: row.name, tag: row.tag,
          memberCount: standing?.memberCount ?? 0,
          combinedNetWorthCents: Number(standing?.combinedNetWorthCents ?? 0n),
          leader: leader ? { publicPimpId: leader.publicPimpId, displayName: leader.displayName, roundPlayerId: leader.id } : null,
          createdAt: row.createdAt.toISOString(),
          disbandedAt: row.disbandedAt?.toISOString() ?? null,
          disbandReason: row.disbandReason,
          forumUrl: row.forumDiscussionId ? forumDiscussionUrl(row.forumDiscussionId) : null,
        };
      }),
    };
  },

  /** Renaming is moderation, so it works on closed rounds too; it changes nothing a standing depends on. */
  async adminRename(prisma: PrismaClient, actor: AuditActor, allianceId: string, input: { reason: string; name?: string | undefined; tag?: string | undefined }): Promise<void> {
    const name = input.name === undefined ? undefined : createAllianceSchema.shape.name.parse(input.name).replace(/\s+/g, ' ');
    const tag = input.tag === undefined ? undefined : createAllianceSchema.shape.tag.parse(input.tag).toUpperCase();
    if (name === undefined && tag === undefined) throw AppError.badRequest('NOTHING_TO_CHANGE', 'Give a new name, a new tag, or both.');
    try {
      await prisma.$transaction(async (tx) => {
        const before = await lockAlliance(tx, allianceId).catch(() => { throw AppError.notFound('ALLIANCE_NOT_FOUND', 'That alliance does not exist.'); });
        if (before.disbandedAt) throw AppError.conflict('ALLIANCE_DISBANDED', 'That alliance has already disbanded.');
        const after = await tx.alliance.update({ where: { id: allianceId }, data: {
          ...(name !== undefined ? { name, nameNormalized: normalizeAllianceName(name) } : {}),
          ...(tag !== undefined ? { tag, tagNormalized: tag.toLowerCase() } : {}),
        } });
        await event(tx, allianceId, 'RENAMED', 'An admin', null, `[${before.tag}] ${before.name} -> [${after.tag}] ${after.name}`);
        await AdminAuditService.record(tx, actor, { action: 'alliance.rename', targetType: 'alliance', targetId: allianceId, reason: input.reason,
          before: { name: before.name, tag: before.tag }, after: { name: after.name, tag: after.tag } });
        // A new tag means a new Discord role; a full resync also retires the old one.
        if (after.tag !== before.tag) await queueAllianceRoleResync(tx, 'all');
      });
      await syncForumThread(prisma, allianceId);
    } catch (error) {
      const message = uniqueViolation(error);
      if (message) throw AppError.conflict('ALLIANCE_NAME_TAKEN', message);
      throw error;
    }
  },

  /** Members leave with the normal cooldown, so a disband cannot be used to raid them. */
  async adminDisband(prisma: PrismaClient, actor: AuditActor, allianceId: string, reason: string): Promise<void> {
    const found = await prisma.alliance.findUnique({ where: { id: allianceId }, include: { round: true } });
    if (!found) throw AppError.notFound('ALLIANCE_NOT_FOUND', 'That alliance does not exist.');
    const now = new Date();
    if (!roundOpen(found.round, now)) throw AppError.conflict('ROUND_NOT_PLAYABLE', `${found.round.name} is closed. Its alliances can no longer change.`);
    const rules = rulesFor(found.round).rules ?? { leaveCooldownHours: 0 };
    await prisma.$transaction(async (tx) => {
      const alliance = await lockAlliance(tx, allianceId);
      if (alliance.disbandedAt) throw AppError.conflict('ALLIANCE_DISBANDED', 'That alliance has already disbanded.');
      const members = await tx.roundPlayer.findMany({ where: { allianceId }, select: { publicPimpId: true, displayName: true } });
      await disbandInTransaction(tx, alliance, rules, new Date(), 'An admin', reason);
      await AdminAuditService.record(tx, actor, { action: 'alliance.disband', targetType: 'alliance', targetId: allianceId, reason,
        before: { name: alliance.name, tag: alliance.tag, leaderId: alliance.leaderId, members }, after: { disbanded: true } });
    }, { timeout: 15_000, maxWait: 10_000 });
    await syncForumThread(prisma, allianceId);
  },
};
