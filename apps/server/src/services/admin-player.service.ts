import type { PrismaClient } from '@prisma/client';
import type { AdminPlayerBattlesDto, AdminPlayerDto } from '@streets/shared';
import { loadRulesetForRound } from '@streets/rules-engine';
import { toActivityDto } from '../game/dto.js';
import { AppError } from '../utils/errors.js';
import { ActivityService } from './activity.service.js';
import { CombatService } from './combat.service.js';

const iso = (date: Date | null) => date?.toISOString() ?? null;

/**
 * Read-only player state for disputes. It never settles the player, so opening
 * the inspector cannot regenerate turns or change anything the player sees.
 */
export const AdminPlayerService = {
  async inspect(prisma: PrismaClient, roundPlayerId: string, now = new Date()): Promise<AdminPlayerDto> {
    const player = await prisma.roundPlayer.findUnique({
      where: { id: roundPlayerId },
      include: {
        account: { select: { id: true, username: true, isActive: true } },
        round: { select: { id: true, name: true, status: true, rulesetId: true, rulesetVersion: true } },
        city: { select: { name: true } },
        reputation: { orderBy: { trader: 'asc' } },
        combatInjuries: { where: { treatedAt: null, recoverAt: { gt: now } }, orderBy: { recoverAt: 'asc' } },
      },
    });
    if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player does not exist.');

    const [activity, observing, observedBy] = await Promise.all([
      ActivityService.recent(prisma, player.id, 50),
      prisma.combatIntel.count({ where: { observerId: player.id, expiresAt: { gt: now } } }),
      prisma.combatIntel.count({ where: { targetId: player.id, expiresAt: { gt: now } } }),
    ]);

    return {
      roundPlayerId: player.id,
      account: player.account,
      round: { id: player.round.id, name: player.round.name, status: player.round.status, rulesetVersion: player.round.rulesetVersion },
      publicPimpId: player.publicPimpId,
      displayName: player.displayName,
      city: player.city.name,
      netWorthCents: Number(player.netWorthCents),
      cashCents: Number(player.cashCents),
      turns: player.turns,
      turnCap: loadRulesetForRound(player.round).turns.cap,
      live: player.round.status === 'ACTIVE' || player.round.status === 'REGISTRATION',
      lastTurnCalculationAt: player.lastTurnCalculationAt.toISOString(),
      lastActiveAt: player.lastActiveAt.toISOString(),
      payoutPercent: player.payoutPercent,
      crew: { whores: player.whores, thugs: player.thugs, woundedThugs: player.woundedThugs, lowRiders: player.lowRiders },
      supplies: { condoms: player.condoms, medicine: player.medicine, crack: player.crack, beer: player.beer },
      weapons: { pistols: player.pistols, shotguns: player.shotguns, tek9s: player.tek9s, ak47s: player.ak47s },
      unlocks: { shotgun: player.shotgunUnlocked, tek9: player.tek9Unlocked, ak47: player.ak47Unlocked },
      happiness: { whores: player.whoreHappiness, thugs: player.thugHappiness },
      ranks: { national: player.nationalRank, local: player.localRank },
      timers: {
        raidProtectedUntil: iso(player.raidProtectedUntil),
        raidCooldownUntil: iso(player.raidCooldownUntil),
        lastRaidedAt: iso(player.lastRaidedAt),
        driveByProtectedUntil: iso(player.driveByProtectedUntil),
        driveByCooldownUntil: iso(player.driveByCooldownUntil),
        lastDrivenByAt: iso(player.lastDrivenByAt),
      },
      hideout: {
        safeRoom: player.hideoutSafeRoomLevel,
        lookouts: player.hideoutLookoutsLevel,
        workshop: player.hideoutWorkshopLevel,
        backOffice: player.hideoutBackOfficeLevel,
      },
      reputation: player.reputation.map((row) => ({ trader: row.trader, points: row.points, questDone: Boolean(row.questDoneAt) })),
      injuries: player.combatInjuries.map((injury) => ({
        id: injury.id,
        thugs: injury.thugs,
        recoverAt: injury.recoverAt.toISOString(),
        battleId: injury.battleId,
      })),
      intel: { observing, observedBy },
      activity: activity.map(toActivityDto),
    };
  },

  /** The player's own battle reports, newest first, 25 a page. */
  async battles(prisma: PrismaClient, roundPlayerId: string, before?: string): Promise<AdminPlayerBattlesDto> {
    const exists = await prisma.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { id: true } });
    if (!exists) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player does not exist.');
    return CombatService.reports(prisma, roundPlayerId, before);
  },
};
