import type { PrismaClient, Round } from '@prisma/client';
import type { CrewEarnedNicknameDto, CrewLegendArchiveDto } from '@streets/shared';
import { loadRulesetForRound, type Ruleset } from '@streets/rules-engine';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { crewLoyaltyEnabled } from './crew-loyalty.service.js';
import { crewMemberName, crewMemberTraits } from './crew-profile.js';

export const CREW_LEGEND_MEMENTO_KEY = 'crew-legend-memento-v1';
export const CREW_LEGEND_MEMENTO_ART = '/assets/crew/legend-memento.svg';
export const CREW_LEGEND_MIN_LOYALTY = 25;
export const CREW_LEGEND_MAX_PER_PLAYER = 3;

export const CREW_NICKNAME_CATALOG = [
  { key: 'CORNER_KEEPER', label: 'Corner Keeper', source: 'DEFENSE_HELD', count: 3 },
  { key: 'ROAD_VETERAN', label: 'Road Veteran', source: 'TRAVEL_COMPLETED', count: 3 },
  { key: 'SHIFT_ANCHOR', label: 'Shift Anchor', source: 'DEALER_SHIFT', count: 3 },
  { key: 'STREET_REGULAR', label: 'Street Regular', source: 'JOB_COMPLETED', count: 5 },
] as const;

export type CrewNicknameKey = typeof CREW_NICKNAME_CATALOG[number]['key'] | 'TRUSTED_HAND';

type Receipt = { source: string; points: number };
type CrewProof = { loyaltyPoints: number; receipts: readonly Receipt[]; suppressed?: boolean };

export function eligibleCrewNicknames(input: CrewProof): CrewEarnedNicknameDto[] {
  if (input.suppressed) return [];
  const counts = new Map<string, number>();
  for (const receipt of input.receipts) {
    if (receipt.points > 0) counts.set(receipt.source, (counts.get(receipt.source) ?? 0) + 1);
  }
  const earned: CrewEarnedNicknameDto[] = CREW_NICKNAME_CATALOG
    .filter((item) => (counts.get(item.source) ?? 0) >= item.count)
    .map((item) => ({ key: item.key, label: item.label, proof: `${item.count} verified ${item.source.toLowerCase().replaceAll('_', ' ')} operations` }));
  if (input.loyaltyPoints >= 50) earned.push({ key: 'TRUSTED_HAND', label: 'Trusted Hand', proof: '50 earned loyalty points' });
  return earned;
}

export function selectedCrewNickname(proof: CrewProof & { nicknameKey?: string | null }): CrewEarnedNicknameDto | null {
  const options = eligibleCrewNicknames(proof);
  return options.find((option) => option.key === proof.nicknameKey) ?? options[0] ?? null;
}

/** All mutations operate on private, round-owned members, never on aggregates. */
export const CrewLegendService = {
  async select(prisma: PrismaClient, roundPlayerId: string, ruleset: Ruleset, input: { memberId: string; nicknameKey: string | null }): Promise<void> {
    if (!crewLoyaltyEnabled(ruleset)) throw AppError.conflict('CREW_LEGENDS_DISABLED', 'This round has no earned crew legends.');
    await prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const member = await tx.crewMember.findFirst({
        where: { id: input.memberId, roundPlayerId },
        select: { id: true, nicknameSuppressed: true, status: true, loyaltyPoints: true },
      });
      if (!member) throw AppError.notFound('CREW_MEMBER_NOT_FOUND', 'That member does not belong to your crew.');
      if (member.nicknameSuppressed) throw AppError.conflict('CREW_NICKNAME_MODERATED', 'This member\'s nickname was disabled by staff.');
      if (member.status === 'RELEASED') throw AppError.conflict('CREW_MEMBER_RELEASED', 'Released crew members cannot change nicknames.');
      if (input.nicknameKey !== null) {
        const receipts = await tx.crewLoyaltyEntry.findMany({ where: { roundPlayerId, memberId: member.id, points: { gt: 0 } }, select: { source: true, points: true } });
        if (!eligibleCrewNicknames({ loyaltyPoints: member.loyaltyPoints, receipts }).some((option) => option.key === input.nicknameKey)) {
          throw AppError.conflict('CREW_NICKNAME_NOT_EARNED', 'Finish verified operations before choosing this nickname.');
        }
      }
      await tx.crewMember.update({ where: { id: member.id }, data: { nicknameKey: input.nicknameKey } });
    });
  },

  /** Freeze the top three evidenced biographies per player, once, inside season close. */
  async snapshotAtClose(tx: Db, round: Round, at: Date): Promise<number> {
    if (!crewLoyaltyEnabled(loadRulesetForRound(round))) return 0;
    const players = await tx.roundPlayer.findMany({
      where: { roundId: round.id, account: { isActive: true } },
      select: { id: true, accountId: true },
    });
    let archived = 0;
    for (const player of players) {
      let awardedForPlayer = 0;
      let gotLegend = false;
      for (let skip = 0; awardedForPlayer < CREW_LEGEND_MAX_PER_PLAYER; skip += 100) {
      // Page through all qualifying loyalty totals. Nickname proof MUST be
      // evaluated before consuming one of the three memorial slots.
      const members = await tx.crewMember.findMany({
        where: { roundPlayerId: player.id, loyaltyPoints: { gte: CREW_LEGEND_MIN_LOYALTY }, nicknameSuppressed: false },
        orderBy: [{ loyaltyPoints: 'desc' }, { experiencePoints: 'desc' }, { serial: 'asc' }],
        take: 100,
        skip,
        select: {
          id: true, role: true, serial: true, status: true, nicknameKey: true, loyaltyPoints: true,
          experiencePoints: true, joinedAt: true, loyaltyEntries: { where: { points: { gt: 0 } }, select: { source: true, points: true } },
        },
      });
      if (!members.length) break;
      for (const member of members) {
        const nickname = selectedCrewNickname({ loyaltyPoints: member.loyaltyPoints, receipts: member.loyaltyEntries, nicknameKey: member.nicknameKey });
        if (!nickname) continue;
        const count = await tx.crewLegendArchive.createMany({
          data: [{
            accountId: player.accountId, sourceRoundId: round.id, roundName: round.name,
            sourceMemberId: member.id, role: member.role, serial: member.serial,
            memberName: crewMemberName(member.role, member.serial),
            nicknameKey: nickname.key, nicknameLabel: nickname.label,
            proof: nickname.proof, trait: crewMemberTraits(member.role, member.serial)[0] ?? 'Steady',
            loyaltyPoints: member.loyaltyPoints, experiencePoints: member.experiencePoints,
            finalStatus: member.status, joinedAt: member.joinedAt, archivedAt: at,
            artworkKey: CREW_LEGEND_MEMENTO_KEY,
          }], skipDuplicates: true,
        });
        archived += count.count;
        gotLegend = true;
        awardedForPlayer++;
        if (awardedForPlayer >= CREW_LEGEND_MAX_PER_PLAYER) break;
      }
      if (members.length < 100) break;
      }
      if (gotLegend) {
        await tx.accountCosmeticUnlock.upsert({
          where: { accountId_key: { accountId: player.accountId, key: CREW_LEGEND_MEMENTO_KEY } },
          create: {
            accountId: player.accountId, key: CREW_LEGEND_MEMENTO_KEY,
            kind: 'CREW_MEMENTO', title: 'Crew Legends Memento',
            description: 'A permanently collected illustrated remembrance of a proven round crew legend. Cosmetic only.',
            rarity: 'RARE', styleKey: 'crew-legend-memento',
            sourceQuestKey: `crew-legend:${round.id}`, sourceRulesetId: round.rulesetId,
            sourceRulesetVersion: round.rulesetVersion, awardedAt: at,
          }, update: {},
        });
      }
    }
    return archived;
  },

  async archive(prisma: PrismaClient, accountId: string, roundId?: string): Promise<CrewLegendArchiveDto[]> {
    const rows = await prisma.crewLegendArchive.findMany({
      where: { accountId, suppressedAt: null, ...(roundId ? { sourceRoundId: roundId } : {}) },
      orderBy: [{ archivedAt: 'desc' }, { loyaltyPoints: 'desc' }, { id: 'asc' }],
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id, roundId: row.sourceRoundId, roundName: row.roundName, memberName: row.memberName,
      role: row.role, serial: row.serial, nickname: row.nicknameLabel, proof: row.proof,
      trait: row.trait, loyaltyPoints: row.loyaltyPoints, experiencePoints: row.experiencePoints,
      finalStatus: row.finalStatus, joinedAt: row.joinedAt.toISOString(), archivedAt: row.archivedAt.toISOString(),
      artworkUrl: CREW_LEGEND_MEMENTO_ART,
    }));
  },
};
