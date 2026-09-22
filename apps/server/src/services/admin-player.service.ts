import type { PrismaClient } from '@prisma/client';
import type { AdminPlayerBattlesDto, AdminPlayerDto, AdminPlayerSearchDto } from '@streets/shared';
import { loadRulesetForRound, productEconomy } from '@streets/rules-engine';
import { toActivityDto } from '../game/dto.js';
import { AppError } from '../utils/errors.js';
import { ActivityService } from './activity.service.js';
import { CombatService } from './combat.service.js';
import { ProductInventoryService, productKeys } from './product-inventory.service.js';

const iso = (date: Date | null) => date?.toISOString() ?? null;

/**
 * Read-only player state for disputes. It never settles the player, so opening
 * the inspector cannot regenerate turns or change anything the player sees.
 */
async function adminProducts(prisma: PrismaClient, roundPlayerId: string, ruleset: ReturnType<typeof loadRulesetForRound>) {
  if (!ruleset.products) return [];
  const inventory = await ProductInventoryService.read(prisma, roundPlayerId, ruleset);
  return productKeys(ruleset).map((key) => {
    const quantity = inventory[key] ?? 0;
    const unit = !ruleset.productEconomy ? null : key === 'CRACK' ? ruleset.economy.netWorth.perCrackCents : productEconomy(ruleset, key)?.netWorthCents ?? 0;
    return { key, name: ruleset.products![key]!.name, quantity, ...(unit === null ? {} : { valueCents: quantity * unit }) };
  });
}

export const AdminPlayerService = {
  /**
   * Finds a player the way a dispute names one: by pimp name or public id,
   * with the account only as a fallback. Disputes rarely arrive with an
   * account attached, so this is the way into the inspector.
   */
  async search(
    prisma: PrismaClient,
    input: { query: string; roundId?: string | undefined; limit?: number | undefined },
  ): Promise<AdminPlayerSearchDto> {
    const query = input.query.trim();
    if (query.length < 1) throw AppError.badRequest('PLAYER_SEARCH_EMPTY', 'Type a pimp name or public id to search for.');
    const limit = input.limit ?? 25;
    const publicPimpId = /^#?\d{1,9}$/.test(query) ? Number(query.replace('#', '')) : null;

    const rows = await prisma.roundPlayer.findMany({
      where: {
        ...(input.roundId ? { roundId: input.roundId } : {}),
        OR: [
          { displayName: { contains: query, mode: 'insensitive' } },
          ...(publicPimpId === null ? [] : [{ publicPimpId }]),
          { account: { usernameNormalized: { contains: query.toLowerCase() } } },
          { id: query },
        ],
      },
      include: {
        account: { select: { id: true, username: true, isActive: true, suspendedUntil: true } },
        round: { select: { id: true, name: true, status: true } },
        city: { select: { name: true } },
      },
      // Live rounds first, then the newest season, then the biggest name in it.
      orderBy: [{ round: { startsAt: 'desc' } }, { netWorthCents: 'desc' }],
      take: limit + 1,
    });

    const now = Date.now();
    const live = (status: string) => (status === 'ACTIVE' ? 0 : status === 'REGISTRATION' ? 1 : 2);
    const found = rows.slice(0, limit).sort((a, b) => live(a.round.status) - live(b.round.status));

    return {
      players: found.map((player) => ({
        roundPlayerId: player.id,
        displayName: player.displayName,
        publicPimpId: player.publicPimpId,
        roundId: player.round.id,
        roundName: player.round.name,
        roundStatus: player.round.status,
        city: player.city.name,
        netWorthCents: Number(player.netWorthCents),
        nationalRank: player.nationalRank,
        lastActiveAt: player.lastActiveAt.toISOString(),
        account: {
          id: player.account.id,
          username: player.account.username,
          isActive: player.account.isActive,
          suspended: Boolean(player.account.suspendedUntil && player.account.suspendedUntil.getTime() > now),
        },
      })),
      truncated: rows.length > limit,
    };
  },

  async inspect(prisma: PrismaClient, roundPlayerId: string, now = new Date()): Promise<AdminPlayerDto> {
    const player = await prisma.roundPlayer.findUnique({
      where: { id: roundPlayerId },
      include: {
        account: { select: { id: true, username: true, isActive: true } },
        round: { select: { id: true, name: true, status: true, rulesetId: true, rulesetVersion: true } },
        city: { select: { name: true } },
        reputation: { orderBy: { trader: 'asc' } },
        permanentUnlocks: { orderBy: { awardedAt: 'asc' } },
        favorInventory: { orderBy: [{ updatedAt: 'desc' }, { key: 'asc' }] },
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
      products: await adminProducts(prisma, player.id, loadRulesetForRound(player.round)),
      weapons: { pistols: player.pistols, shotguns: player.shotguns, tek9s: player.tek9s, ak47s: player.ak47s },
      unlocks: {
        shotgun: player.shotgunUnlocked,
        tek9: player.tek9Unlocked,
        ak47: player.ak47Unlocked,
        permanent: player.permanentUnlocks.map((unlock) => ({
          key: unlock.key,
          sourceQuestKey: unlock.sourceQuestKey,
          awardedAt: unlock.awardedAt.toISOString(),
        })),
      },
      favors: player.favorInventory.map((favor) => ({
        key: favor.key,
        quantity: favor.quantity,
        totalGranted: favor.totalGranted,
        lastSourceQuestKey: favor.lastSourceQuestKey,
        updatedAt: favor.updatedAt.toISOString(),
      })),
      happiness: { whores: player.whoreHappiness, thugs: player.thugHappiness },
      heat: loadRulesetForRound(player.round).heat ? player.heat : null,
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
      reputation: player.reputation.map((row) => ({ trader: row.trader, points: row.points, legacyFavorDone: Boolean(row.questDoneAt) })),
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
