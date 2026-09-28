import type { Prisma, PrismaClient } from '@prisma/client';
import { equipCombatSquad, loadRulesetForRound, type Ruleset } from '@streets/rules-engine';
import {
  CONTACTS_MAX,
  addContactSchema,
  updateContactKindSchema,
  updateContactSchema,
  type BattleReportDto,
  type BlockedRolodexDto,
  type CombatIntelReportDto,
  type ContactDto,
  type ContactIntelDto,
  type ContactKindDto,
  type ContactLookupDto,
  type ContactsDto,
} from '@streets/shared';
import { lockRoundPlayer } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { fitThugs } from './action.service.js';
import { allianceTagDto, sharedRevengeScope } from './alliance.service.js';

const targetInclude = {
  target: {
    include: {
      city: { select: { name: true } },
      alliance: { select: { name: true, tag: true } },
      account: { select: { isActive: true } },
    },
  },
} as const;

type ContactRow = Prisma.PlayerContactGetPayload<{ include: typeof targetInclude }>;
type ContactOwner = {
  id: string;
  roundId: string;
  accountId: string;
  allianceId: string | null;
  allianceJoinedAt: Date | null;
  thugs: number;
  woundedThugs: number;
  thugHappiness: number;
  pistols: number;
  shotguns: number;
  tek9s: number;
  ak47s: number;
  round: { id: string; rulesetId: string; rulesetVersion: string };
};

function contactKind(value: string): ContactKindDto {
  return value === 'ENEMY' ? 'ENEMY' : 'CONTACT';
}

function emptyIntel(): ContactIntelDto {
  return {
    payback: { available: false, until: null, source: null },
    sharedAlliance: false,
    lastBattle: null,
    lastRecon: null,
    turf: { lastAt: null, blocksWon: 0, blocksLost: 0 },
  };
}

function ownerStrength(owner: ContactOwner, ruleset: Ruleset): number | null {
  const model = ruleset.combat;
  if (!model) return null;
  const fit = fitThugs(owner);
  return equipCombatSquad({
    thugs: fit,
    thugHappiness: 100,
    weapons: { PISTOL: owner.pistols, SHOTGUN: owner.shotguns, TEK9: owner.tek9s, AK47: owner.ak47s },
  }, Math.min(fit, model.squadCap), model).strength;
}

function strengthBand(
  targetStrength: number,
  ownStrength: number | null,
  ruleset: Ruleset,
): NonNullable<ContactIntelDto['lastRecon']>['strengthBand'] {
  const variance = ruleset.combat?.strength.variance;
  if (!ownStrength || !variance) return 'Unknown';
  if (targetStrength < ownStrength * (1 - variance)) return 'Weaker';
  if (targetStrength > ownStrength * (1 + variance)) return 'Stronger';
  return 'Comparable';
}

function battleSummary(row: {
  attackerId: string;
  attackerReport: Prisma.JsonValue;
  defenderReport: Prisma.JsonValue;
  createdAt: Date;
}, ownerId: string): ContactIntelDto['lastBattle'] {
  const report = (row.attackerId === ownerId ? row.attackerReport : row.defenderReport) as unknown as Partial<BattleReportDto>;
  return {
    kind: report.kind ?? 'RAID',
    at: (typeof report.createdAt === 'string' ? report.createdAt : row.createdAt.toISOString()),
    role: report.role ?? (row.attackerId === ownerId ? 'ATTACKER' : 'DEFENDER'),
    won: Boolean(report.won),
    cashChangeCents: Number(report.cashChangeCents ?? 0),
    yourWounds: Number(report.yourWounds ?? 0),
    opponentWounds: Number(report.opponentWounds ?? 0),
  };
}

function reconSummary(
  row: { report: Prisma.JsonValue; expiresAt: Date },
  ownStrength: number | null,
  ruleset: Ruleset,
): ContactIntelDto['lastRecon'] {
  const report = row.report as unknown as Partial<CombatIntelReportDto>;
  if (!report.createdAt || !report.expiresAt || typeof report.strength !== 'number') return null;
  return {
    at: report.createdAt,
    expiresAt: report.expiresAt,
    strengthBand: strengthBand(report.strength, ownStrength, ruleset),
    strength: report.strength,
    cashBand: report.cashBand?.label ?? 'Unknown',
  };
}

async function relationshipIntel(
  prisma: PrismaClient,
  owner: ContactOwner,
  targetIds: string[],
): Promise<Map<string, ContactIntelDto>> {
  const intel = new Map(targetIds.map((id) => [id, emptyIntel()]));
  if (!targetIds.length) return intel;

  const now = new Date();
  const ruleset = loadRulesetForRound(owner.round);
  const ownStrength = ownerStrength(owner, ruleset);
  const revengeHours = ruleset.combat?.strategy?.retaliation.revengeHours ?? 0;
  const revengeSince = revengeHours > 0 ? new Date(now.getTime() - revengeHours * 3_600_000) : null;
  const [battles, recons, pushes, revengeRows] = await Promise.all([
    prisma.raidBattle.findMany({
      where: {
        voidedAt: null,
        OR: [
          { attackerId: owner.id, defenderId: { in: targetIds } },
          { defenderId: owner.id, attackerId: { in: targetIds } },
        ],
      },
      select: {
        attackerId: true,
        defenderId: true,
        attackerReport: true,
        defenderReport: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.max(50, targetIds.length * 5),
    }),
    prisma.combatIntel.findMany({
      where: {
        observerId: owner.id,
        targetId: { in: targetIds },
        expiresAt: { gt: now },
      },
      select: { targetId: true, report: true, expiresAt: true },
    }),
    prisma.turfPush.findMany({
      where: {
        status: 'LANDED',
        settledAt: { not: null },
        OR: [
          { attackerId: owner.id, defenderId: { in: targetIds } },
          { defenderId: owner.id, attackerId: { in: targetIds } },
        ],
      },
      select: {
        attackerId: true,
        defenderId: true,
        captured: true,
        settledAt: true,
      },
      orderBy: [{ settledAt: 'desc' }, { id: 'desc' }],
      take: Math.max(50, targetIds.length * 10),
    }),
    revengeSince
      ? prisma.raidBattle.findMany({
          where: {
            OR: sharedRevengeScope(owner),
            attackerId: { in: targetIds },
            createdAt: { gte: revengeSince },
            voidedAt: null,
          },
          select: { attackerId: true, defenderId: true, createdAt: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: Math.max(50, targetIds.length * 3),
        })
      : Promise.resolve([]),
  ]);

  for (const battle of battles) {
    const targetId = battle.attackerId === owner.id ? battle.defenderId : battle.attackerId;
    const entry = intel.get(targetId);
    if (entry && !entry.lastBattle) entry.lastBattle = battleSummary(battle, owner.id);
  }

  for (const recon of recons) {
    const entry = intel.get(recon.targetId);
    const summary = reconSummary(recon, ownStrength, ruleset);
    if (entry && summary) entry.lastRecon = summary;
  }

  for (const revenge of revengeRows) {
    const entry = intel.get(revenge.attackerId);
    if (!entry || entry.payback.available) continue;
    const until = new Date(revenge.createdAt.getTime() + revengeHours * 3_600_000);
    if (until <= now) continue;
    entry.payback = {
      available: true,
      until: until.toISOString(),
      source: revenge.defenderId === owner.id ? 'direct' : 'alliance',
    };
  }

  for (const push of pushes) {
    const targetId = push.attackerId === owner.id ? push.defenderId : push.attackerId;
    const entry = intel.get(targetId);
    if (!entry) continue;
    if (push.settledAt && (!entry.turf.lastAt || push.settledAt > new Date(entry.turf.lastAt))) {
      entry.turf.lastAt = push.settledAt.toISOString();
    }
    if (push.captured) {
      if (push.attackerId === owner.id) entry.turf.blocksWon += 1;
      else entry.turf.blocksLost += 1;
    }
  }

  return intel;
}

async function blockedTargets(
  prisma: PrismaClient,
  owner: ContactOwner,
  contactTargetIds = new Set<string>(),
): Promise<{ blockedAccounts: Set<string>; blocked: BlockedRolodexDto[] }> {
  const rows = await prisma.playerBlock.findMany({
    where: {
      blockerAccountId: owner.accountId,
      blocked: {
        isActive: true,
        roundPlayers: { some: { roundId: owner.roundId } },
      },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      createdAt: true,
      blockedAccountId: true,
      blocked: {
        select: {
          roundPlayers: {
            where: { roundId: owner.roundId },
            take: 1,
            include: {
              alliance: { select: { name: true, tag: true } },
            },
          },
        },
      },
    },
  });

  const blockedAccounts = new Set(rows.map((row) => row.blockedAccountId));
  const blocked = rows.flatMap((row): BlockedRolodexDto[] => {
    const player = row.blocked.roundPlayers[0];
    return player ? [{
      publicPimpId: player.publicPimpId,
      displayName: player.displayName,
      alliance: allianceTagDto(player.alliance),
      blockedAt: row.createdAt.toISOString(),
      isContact: contactTargetIds.has(player.id),
    }] : [];
  });

  return { blockedAccounts, blocked };
}

async function withStanding(prisma: PrismaClient, rows: Array<{
  kind: string;
  note: string;
  createdAt: Date;
  target: { id: string; accountId: string; allianceId: string | null; roundId: string; publicPimpId: number; displayName: string; netWorthCents: bigint; lastActiveAt: Date;
    city: { name: string }; alliance: { name: string; tag: string } | null; account: { isActive: boolean } };
}>, owner: ContactOwner, blockedAccounts: Set<string>): Promise<ContactDto[]> {
  const targetIds = rows.map((row) => row.target.id);
  const intel = await relationshipIntel(prisma, owner, targetIds);
  const ahead = await Promise.all(rows.map((row) => row.target.account.isActive
    ? prisma.roundPlayer.count({ where: { roundId: row.target.roundId, netWorthCents: { gt: row.target.netWorthCents }, account: { isActive: true } } })
    : Promise.resolve(0)));
  return rows.map((row, index) => {
    const earnedIntel = intel.get(row.target.id) ?? emptyIntel();
    earnedIntel.sharedAlliance = Boolean(owner.allianceId && row.target.allianceId === owner.allianceId);
    return {
    kind: contactKind(row.kind),
    publicPimpId: row.target.publicPimpId,
    displayName: row.target.displayName,
    alliance: row.target.account.isActive ? allianceTagDto(row.target.alliance) : null,
    categories: [
      contactKind(row.kind),
      ...(owner.allianceId && row.target.allianceId === owner.allianceId ? ['ALLIANCE' as const] : []),
      ...(blockedAccounts.has(row.target.accountId) ? ['BLOCKED' as const] : []),
    ],
    blocked: blockedAccounts.has(row.target.accountId),
    note: row.note,
    addedAt: row.createdAt.toISOString(),
    intel: earnedIntel,
    // Only what anyone could read off rankings and profiles. Never private intel.
    standing: row.target.account.isActive ? {
      netWorthCents: Number(row.target.netWorthCents),
      nationalRank: ahead[index]! + 1,
      city: row.target.city.name,
      lastActiveAt: row.target.lastActiveAt.toISOString(),
    } : null,
  };
  });
}

async function findTarget(prisma: PrismaClient, ownerId: string, publicPimpId: number) {
  const owner = await prisma.roundPlayer.findUniqueOrThrow({ where: { id: ownerId }, include: { round: { select: { id: true, rulesetId: true, rulesetVersion: true } } } });
  const target = await prisma.roundPlayer.findFirst({ where: { roundId: owner.roundId, publicPimpId }, select: { id: true, account: { select: { isActive: true } } } });
  if (!target) throw AppError.notFound('TARGET_NOT_FOUND', 'That player is not in this round.');
  return { owner, target };
}

function counts(contacts: ContactDto[], blocked: BlockedRolodexDto[]): ContactsDto['counts'] {
  return {
    ALL: contacts.length,
    CONTACT: contacts.filter((contact) => contact.kind === 'CONTACT').length,
    ENEMY: contacts.filter((contact) => contact.kind === 'ENEMY').length,
    ALLIANCE: contacts.filter((contact) => contact.categories.includes('ALLIANCE')).length,
    BLOCKED: blocked.length,
  };
}

async function dto(prisma: PrismaClient, owner: ContactOwner, rows: ContactRow[]): Promise<ContactsDto> {
  const { blockedAccounts, blocked } = await blockedTargets(
    prisma,
    owner,
    new Set(rows.map((row) => row.target.id)),
  );
  const contacts = await withStanding(prisma, rows, owner, blockedAccounts);
  return { contacts, blocked, counts: counts(contacts, blocked), max: CONTACTS_MAX };
}

/** 0.3.0-D. A private rolodex per round player. Nobody else can see who you track or what you wrote. */
export const ContactsService = {
  async list(prisma: PrismaClient, ownerId: string): Promise<ContactsDto> {
    const owner = await prisma.roundPlayer.findUniqueOrThrow({ where: { id: ownerId }, include: { round: { select: { id: true, rulesetId: true, rulesetVersion: true } } } });
    const rows = await prisma.playerContact.findMany({ where: { ownerId }, include: targetInclude, orderBy: { updatedAt: 'desc' } });
    return dto(prisma, owner, rows);
  },

  async lookup(prisma: PrismaClient, ownerId: string, publicPimpId: number): Promise<ContactLookupDto> {
    const { owner, target } = await findTarget(prisma, ownerId, publicPimpId);
    const [row, count] = await Promise.all([
      prisma.playerContact.findUnique({ where: { ownerId_targetId: { ownerId: owner.id, targetId: target.id } }, include: targetInclude }),
      prisma.playerContact.count({ where: { ownerId } }),
    ]);
    return {
      contact: row ? (await dto(prisma, owner, [row])).contacts[0]! : null,
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
        await tx.playerContact.update({ where: { id: existing.id }, data: { kind: input.kind, ...(input.note !== undefined ? { note: input.note } : {}) } });
        return;
      }
      if (await tx.playerContact.count({ where: { ownerId: owner.id } }) >= CONTACTS_MAX) {
        throw AppError.conflict('CONTACTS_FULL', `Your contacts are full (${CONTACTS_MAX}). Remove someone first.`);
      }
      await tx.playerContact.create({ data: { ownerId: owner.id, targetId: target.id, kind: input.kind, note: input.note ?? '' } });
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

  async updateKind(prisma: PrismaClient, ownerId: string, publicPimpId: number, rawInput: unknown): Promise<ContactsDto> {
    const input = updateContactKindSchema.parse(rawInput);
    const { owner, target } = await findTarget(prisma, ownerId, publicPimpId);
    const updated = await prisma.playerContact.updateMany({ where: { ownerId: owner.id, targetId: target.id }, data: { kind: input.kind } });
    if (!updated.count) throw AppError.notFound('CONTACT_NOT_FOUND', 'That player is not in your contacts.');
    return ContactsService.list(prisma, ownerId);
  },

  async remove(prisma: PrismaClient, ownerId: string, publicPimpId: number): Promise<ContactsDto> {
    const { owner, target } = await findTarget(prisma, ownerId, publicPimpId);
    await prisma.playerContact.deleteMany({ where: { ownerId: owner.id, targetId: target.id } });
    return ContactsService.list(prisma, ownerId);
  },
};
