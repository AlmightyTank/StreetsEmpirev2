import type { Prisma, RoundPlayer } from '@prisma/client';
import type { Ruleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { toState } from './action.service.js';
import { hideoutCatalog } from './hideout.service.js';
import { createPlayerActivity } from './in-app-notification.service.js';

/**
 * Bell notices the player would otherwise have to go looking for: a hideout room
 * they can now afford and build, and cosmetics newly added to their account.
 * Both run on settle, so they land whether the player is acting or just looking.
 */

const COSMETIC_BATCH = 20;

function readyAlerts(value: Prisma.JsonValue): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, level]) => typeof level === 'number')) as Record<string, number>;
}

export const HideoutAlertService = {
  /**
   * Announces each room level once, the first time everything it needs (cash,
   * turns, components, progress gates) is in hand and no build is running.
   */
  async roomsReady(db: Db, player: RoundPlayer, ruleset: Ruleset): Promise<void> {
    if (!ruleset.hideout || player.hideoutBuildReadyAt) return;
    const [turfBlocksHeld, awayCars] = await Promise.all([
      ruleset.turf ? db.turf.count({ where: { roundId: player.roundId, holderId: player.id } }) : Promise.resolve(0),
      db.run.aggregate({ where: { roundPlayerId: player.id, status: 'ACTIVE' }, _sum: { lowRiders: true } }),
    ]);
    const lowRidersOwned = player.lowRiders + player.damagedLowRiders + player.disabledLowRiders + (awayCars._sum.lowRiders ?? 0);
    let rooms;
    try {
      rooms = hideoutCatalog(ruleset, toState(player), {}, { turfBlocksHeld, lowRidersOwned }).rooms;
    } catch {
      // A ruleset with a broken price table is reported by the hideout page itself.
      return;
    }
    const announced = readyAlerts(player.hideoutReadyAlerts);
    const ready = rooms.filter((room) => room.canUpgrade && announced[room.key] !== room.level + 1);
    if (!ready.length) return;
    for (const room of ready) announced[room.key] = room.level + 1;
    await db.roundPlayer.update({ where: { id: player.id }, data: { hideoutReadyAlerts: announced } });
    await createPlayerActivity(db, player.id, 'HIDEOUT_ROOM_READY', {
      rooms: ready.map((room) => ({ room: room.key, name: room.name, level: room.level + 1, buildMinutes: room.nextBuildMinutes ?? 0 })),
    });
  },

  /** One notice for every cosmetic awarded to the account since the last one (or since joining the round). */
  async cosmeticsUnlocked(db: Db, player: RoundPlayer): Promise<void> {
    const since = player.cosmeticsAlertedAt ?? player.createdAt;
    const unlocks = await db.accountCosmeticUnlock.findMany({
      where: { accountId: player.accountId, awardedAt: { gt: since } },
      orderBy: { awardedAt: 'asc' },
      take: COSMETIC_BATCH,
      select: { key: true, kind: true, title: true, description: true, rarity: true, awardedAt: true },
    });
    if (!unlocks.length) return;
    const latest = unlocks[unlocks.length - 1]!.awardedAt;
    const claimed = await db.roundPlayer.updateMany({
      where: { id: player.id, cosmeticsAlertedAt: player.cosmeticsAlertedAt },
      data: { cosmeticsAlertedAt: latest },
    });
    if (!claimed.count) return;
    await createPlayerActivity(db, player.id, 'COSMETIC_UNLOCKED', {
      items: unlocks.map(({ key, kind, title, description, rarity }) => ({ key, kind, title, description, rarity })),
    });
  },

  async afterSettle(db: Db, player: RoundPlayer, ruleset: Ruleset): Promise<void> {
    await HideoutAlertService.cosmeticsUnlocked(db, player);
    await HideoutAlertService.roomsReady(db, player, ruleset);
  },
};
